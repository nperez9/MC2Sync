/**
 * PS2 Memory Card Binary Parser
 * Pure functional TypeScript port of ps2mc-parser.js
 *
 * File structure:
 * - 16,384 pages total
 * - Raw page in file: 528 bytes (512 data + 16 spare/ECC)
 * - Cluster: 2 pages = 1024 bytes of data
 * - All multi-byte values are LITTLE ENDIAN
 */

import {
  type DirectoryEntry,
  type MemoryCard,
  type ParseError,
  type Result,
  type SaveEntry,
  type SaveFile,
  type Superblock,
  type Timestamp,
  err,
  ok,
} from './types';
import { lookupGame, getRegion } from './game-database';
import { parseIcon } from './ps2-icon-parser';

// ─── Constants ───────────────────────────────────────────────────────────────

export const EXPECTED_FILE_SIZE = 8_650_752;
export const PAGE_SIZE = 512;
export const SPARE_SIZE = 16;
export const RAW_PAGE_SIZE = PAGE_SIZE + SPARE_SIZE; // 528
export const PAGES_PER_CLUSTER = 2;
export const CLUSTER_SIZE = PAGE_SIZE * PAGES_PER_CLUSTER; // 1024
export const TOTAL_PAGES = 16_384;
export const TOTAL_CLUSTERS = 8_192;
export const DIR_ENTRY_SIZE = 512;

// Mode flags
export const DF_EXISTS    = 0x8000;
export const DF_DIRECTORY = 0x0020;
export const DF_FILE      = 0x0010;
export const DF_READ      = 0x0001;
export const DF_WRITE     = 0x0002;
export const DF_EXECUTE   = 0x0004;

export const FAT_CHAIN_END        = 0xffff_ffff;
export const FAT_CHAIN_END_MASKED = 0x7fff_ffff;

const MAGIC_STRING = 'Sony PS2 Memory Card Format';

// ─── Low-level binary helpers ─────────────────────────────────────────────────

/**
 * Read a single page's data (512 bytes) from the raw card buffer.
 * Page N starts at offset N * 528; we read 512 bytes and skip the 16-byte spare.
 */
export const readPageData = (buffer: ArrayBuffer, pageIndex: number): Uint8Array => {
  const offset = pageIndex * RAW_PAGE_SIZE;
  return new Uint8Array(buffer, offset, PAGE_SIZE);
};

/**
 * Read a cluster's data (1024 bytes) from the raw card buffer.
 * Cluster N = pages N*2 and N*2+1, data portions concatenated.
 */
export const readClusterDataRaw = (buffer: ArrayBuffer, clusterIndex: number): Uint8Array => {
  const page0 = clusterIndex * PAGES_PER_CLUSTER;
  const result = new Uint8Array(CLUSTER_SIZE);
  result.set(readPageData(buffer, page0), 0);
  result.set(readPageData(buffer, page0 + 1), PAGE_SIZE);
  return result;
};

/**
 * Read data from an allocatable cluster index.
 * Absolute cluster = allocOffset + allocatableIndex
 */
export const readAllocatableCluster = (
  buffer: ArrayBuffer,
  allocatableIndex: number,
  allocOffset: number,
): Uint8Array => readClusterDataRaw(buffer, allocOffset + allocatableIndex);

// ─── Timestamp ───────────────────────────────────────────────────────────────

/**
 * Parse a PS2 timestamp from 8 bytes.
 * Format: [unused, seconds, minutes, hours, day, month, year_lo, year_hi]
 */
export const parseTimestamp = (view: DataView, offset: number): Timestamp => {
  const seconds = view.getUint8(offset + 1);
  const minutes = view.getUint8(offset + 2);
  const hours   = view.getUint8(offset + 3);
  const day     = view.getUint8(offset + 4);
  const month   = view.getUint8(offset + 5);
  const yearLo  = view.getUint8(offset + 6);
  const yearHi  = view.getUint8(offset + 7);
  const year    = yearLo | (yearHi << 8);

  return {
    seconds,
    minutes,
    hours,
    day,
    month: month === 0 ? 0 : month - 1, // PS2 is 1-based, we store 0-based
    year,
  };
};

export const timestampToDate = (ts: Timestamp): Date =>
  ts.year === 0 && ts.month === 0 && ts.day === 0
    ? new Date(0)
    : new Date(ts.year, ts.month, ts.day, ts.hours, ts.minutes, ts.seconds);

// ─── Directory Entry ─────────────────────────────────────────────────────────

/**
 * Parse a directory entry from 512 bytes of cluster data.
 */
export const parseDirectoryEntry = (data: Uint8Array): DirectoryEntry => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const mode         = view.getUint32(0x00, true);
  const length       = view.getUint32(0x04, true);
  const created      = parseTimestamp(view, 0x08);
  const firstCluster = view.getUint32(0x10, true);
  const modified     = parseTimestamp(view, 0x18);

  // Read name: null-terminated, up to 32 bytes at offset 0x40
  let name = '';
  for (let i = 0; i < 32; i++) {
    const ch = data[0x40 + i];
    if (ch === undefined || ch === 0) break;
    name += String.fromCharCode(ch);
  }

  return {
    mode,
    length,
    created,
    firstCluster,
    modified,
    name,
    isDirectory: (mode & DF_DIRECTORY) !== 0,
    isFile:      (mode & DF_FILE) !== 0,
    exists:      (mode & DF_EXISTS) !== 0,
  };
};

// ─── Superblock ───────────────────────────────────────────────────────────────

const readAsciiString = (data: Uint8Array, start: number, maxLen: number): string => {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const ch = data[start + i];
    if (ch === undefined || ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
};

export const parseSuperblock = (buffer: ArrayBuffer): Superblock => {
  const pageData = readPageData(buffer, 0);
  const view = new DataView(pageData.buffer, pageData.byteOffset, pageData.byteLength);

  const magic   = readAsciiString(pageData, 0x00, 28);
  const version = readAsciiString(pageData, 0x1c, 12);

  const pageLen         = view.getUint16(0x28, true);
  const pagesPerCluster = view.getUint16(0x2a, true);
  const pagesPerBlock   = view.getUint16(0x2c, true);
  const clustersPerCard = view.getUint32(0x30, true);
  const allocOffset     = view.getUint32(0x34, true);
  const allocEnd        = view.getUint32(0x38, true);
  const rootdirCluster  = view.getUint32(0x3c, true);
  const backupBlock1    = view.getUint32(0x40, true);
  const backupBlock2    = view.getUint32(0x44, true);

  const ifcList: number[] = [];
  for (let i = 0; i < 32; i++) {
    ifcList.push(view.getUint32(0x50 + i * 4, true));
  }

  return {
    magic,
    version,
    pageLen,
    pagesPerCluster,
    pagesPerBlock,
    clustersPerCard,
    allocOffset,
    allocEnd,
    rootdirCluster,
    backupBlock1,
    backupBlock2,
    ifcList,
  };
};

// ─── FAT ──────────────────────────────────────────────────────────────────────

/**
 * Build the complete FAT array using double-indirect indexing.
 *
 * 1. ifcList[i] → absolute cluster index of an indirect FAT cluster
 * 2. Each indirect cluster has 256 uint32 entries → absolute cluster indices of FAT clusters
 * 3. Each FAT cluster has 256 uint32 entries → FAT values for allocatable clusters
 */
export const buildFAT = (buffer: ArrayBuffer, superblock: Superblock): Uint32Array => {
  const fat = new Uint32Array(TOTAL_CLUSTERS).fill(FAT_CHAIN_END);
  const entriesPerCluster = CLUSTER_SIZE / 4; // 256

  for (let i = 0; i < superblock.ifcList.length; i++) {
    const ifcCluster = superblock.ifcList[i];
    if (ifcCluster === undefined || ifcCluster === FAT_CHAIN_END || ifcCluster >= TOTAL_CLUSTERS) continue;

    const indirectData = readClusterDataRaw(buffer, ifcCluster);
    const indirectView = new DataView(indirectData.buffer, indirectData.byteOffset, indirectData.byteLength);

    for (let j = 0; j < entriesPerCluster; j++) {
      const fatClusterIndex = indirectView.getUint32(j * 4, true);
      if (fatClusterIndex === FAT_CHAIN_END || fatClusterIndex >= TOTAL_CLUSTERS) continue;

      const fatData = readClusterDataRaw(buffer, fatClusterIndex);
      const fatView = new DataView(fatData.buffer, fatData.byteOffset, fatData.byteLength);

      for (let k = 0; k < entriesPerCluster; k++) {
        const fatIndex = i * entriesPerCluster * entriesPerCluster + j * entriesPerCluster + k;
        if (fatIndex < TOTAL_CLUSTERS) {
          fat[fatIndex] = fatView.getUint32(k * 4, true);
        }
      }
    }
  }

  return fat;
};

/**
 * Follow a cluster chain through the FAT, returning all allocatable cluster indices.
 */
export const followClusterChain = (fat: Uint32Array, firstCluster: number): number[] => {
  const chain: number[] = [];
  let current = firstCluster;
  const visited = new Set<number>();

  for (;;) {
    if (current === FAT_CHAIN_END || current >= fat.length) break;
    const masked = current & FAT_CHAIN_END_MASKED;
    if (masked === FAT_CHAIN_END_MASKED) break;
    if (visited.has(current)) break; // cycle guard

    visited.add(current);
    chain.push(current);

    const next = fat[current];
    if (next === undefined || next === FAT_CHAIN_END) break;
    const nextMasked = next & FAT_CHAIN_END_MASKED;
    if (nextMasked === FAT_CHAIN_END_MASKED) break;

    current = nextMasked;
  }

  return chain;
};

// ─── Data Reading ─────────────────────────────────────────────────────────────

const readFileData = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  allocOffset: number,
  entry: { firstCluster: number; length: number },
): Uint8Array => {
  const chain = followClusterChain(fat, entry.firstCluster);
  const raw = new Uint8Array(chain.length * CLUSTER_SIZE);

  for (let i = 0; i < chain.length; i++) {
    const clusterIdx = chain[i];
    if (clusterIdx === undefined) continue;
    raw.set(readAllocatableCluster(buffer, clusterIdx, allocOffset), i * CLUSTER_SIZE);
  }

  return raw.length > entry.length ? raw.slice(0, entry.length) : raw;
};

const readDirectoryEntries = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  allocOffset: number,
  dirEntry: { firstCluster: number; length: number },
): DirectoryEntry[] => {
  const chain = followClusterChain(fat, dirEntry.firstCluster);
  const entriesPerCluster = CLUSTER_SIZE / DIR_ENTRY_SIZE; // 2
  const entries: DirectoryEntry[] = [];

  for (const clusterIdx of chain) {
    if (entries.length >= dirEntry.length) break;
    const clusterData = readAllocatableCluster(buffer, clusterIdx, allocOffset);

    for (let j = 0; j < entriesPerCluster; j++) {
      if (entries.length >= dirEntry.length) break;
      const entryData = clusterData.slice(j * DIR_ENTRY_SIZE, (j + 1) * DIR_ENTRY_SIZE);
      entries.push(parseDirectoryEntry(entryData));
    }
  }

  return entries;
};

// ─── Icon helpers (browser-only, Canvas API) ─────────────────────────────────

const extractIconDataUrl = (fileData: Uint8Array): string | null => {
  if (typeof document === 'undefined') return null;
  try {
    const result = parseIcon(fileData);
    if (!result.ok || result.value.shapes.length === 0) return null;
    const icon = result.value;
    const shape = icon.shapes[0];
    if (shape === undefined) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(128, 128);
    imageData.data.set(icon.textureData);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

// ─── Save Parsing ─────────────────────────────────────────────────────────────

const extractGameTitle = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  allocOffset: number,
  iconSysFile: { firstCluster: number; length: number },
): string | null => {
  try {
    const sysData = readFileData(buffer, fat, allocOffset, iconSysFile);
    if (sysData.byteLength < 0xc0 + 68) return null;
    const titleBytes = sysData.slice(0xc0, 0xc0 + 68);
    let endIdx = titleBytes.indexOf(0);
    if (endIdx === -1) endIdx = titleBytes.length;
    const decoder = new TextDecoder('shift-jis');
    const title = decoder.decode(titleBytes.slice(0, endIdx));
    return title.replace(/[\n\r]/g, ' ').replace(/\0/g, '').trim() || null;
  } catch {
    return null;
  }
};

const parseSaveEntry = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  allocOffset: number,
  saveDir: DirectoryEntry,
): SaveEntry => {
  const files: SaveFile[] = [];
  let totalSize = 0;
  let gameTitle: string | null = null;
  let iconDataUrl: string | null = null;
  let parsedIconData = null;

  try {
    const dirEntries = readDirectoryEntries(buffer, fat, allocOffset, {
      firstCluster: saveDir.firstCluster,
      length: saveDir.length,
    });

    for (const entry of dirEntries) {
      if (!entry.exists || entry.name === '.' || entry.name === '..') continue;
      if (!entry.isFile) continue;

      const file: SaveFile = {
        name: entry.name,
        size: entry.length,
        created: entry.created,
        modified: entry.modified,
        firstCluster: entry.firstCluster,
      };
      files.push(file);
      totalSize += entry.length;

      const lowerName = entry.name.toLowerCase();

      if (lowerName === 'icon.sys') {
        gameTitle = extractGameTitle(buffer, fat, allocOffset, {
          firstCluster: entry.firstCluster,
          length: entry.length,
        });
      }

      if ((lowerName === 'icon.icn' || lowerName.endsWith('.icn') || lowerName.endsWith('.ico'))
        && iconDataUrl === null) {
        try {
          const fileData = readFileData(buffer, fat, allocOffset, {
            firstCluster: entry.firstCluster,
            length: entry.length,
          });
          const result = parseIcon(fileData);
          if (result.ok) {
            parsedIconData = result.value;
            iconDataUrl = extractIconDataUrl(fileData);
          }
        } catch {
          // Non-fatal: icon is optional
        }
      }
    }
  } catch {
    // Non-fatal: return what we have
  }

  const gameInfo = lookupGame(saveDir.name);
  const region   = getRegion(saveDir.name);

  return {
    directoryName:  saveDir.name,
    gameTitle:      gameTitle ?? gameInfo?.title ?? saveDir.name,
    gameTitleAscii: gameInfo?.title ?? saveDir.name,
    gameId:         saveDir.name,
    region,
    totalSize,
    created:        saveDir.created,
    modified:       saveDir.modified,
    firstCluster:   saveDir.firstCluster,
    files,
    iconDataUrl,
    parsedIcon:     parsedIconData,
  };
};

// ─── Space Calculation ────────────────────────────────────────────────────────

const calculateSpace = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  superblock: Superblock,
  saveDirs: DirectoryEntry[],
): { totalClusters: number; usedClusters: number; freeClusters: number } => {
  const totalClusters = superblock.allocEnd - superblock.allocOffset;
  let usedClusters = 0;

  usedClusters += followClusterChain(fat, superblock.rootdirCluster).length;

  for (const save of saveDirs) {
    usedClusters += followClusterChain(fat, save.firstCluster).length;

    try {
      const entries = readDirectoryEntries(buffer, fat, superblock.allocOffset, {
        firstCluster: save.firstCluster,
        length: save.length,
      });
      for (const entry of entries) {
        if (!entry.exists || entry.name === '.' || entry.name === '..') continue;
        if (entry.isFile) {
          usedClusters += followClusterChain(fat, entry.firstCluster).length;
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    totalClusters,
    usedClusters,
    freeClusters: Math.max(0, totalClusters - usedClusters),
  };
};

// ─── Root Directory ───────────────────────────────────────────────────────────

const parseRootDirectory = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  superblock: Superblock,
): DirectoryEntry[] => {
  const rootCluster = superblock.rootdirCluster;
  const firstClusterData = readAllocatableCluster(buffer, rootCluster, superblock.allocOffset);
  const dotEntry = parseDirectoryEntry(firstClusterData.slice(0, DIR_ENTRY_SIZE));

  const allEntries = readDirectoryEntries(buffer, fat, superblock.allocOffset, {
    firstCluster: rootCluster,
    length: dotEntry.length,
  });

  return allEntries.filter(e => e.exists && e.name !== '.' && e.name !== '..' && e.isDirectory);
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a PS2 memory card from an ArrayBuffer.
 * Returns a Result<MemoryCard, ParseError>.
 */
export const parseMemoryCard = (
  buffer: ArrayBuffer,
  fileName: string,
): Result<MemoryCard, ParseError> => {
  if (buffer.byteLength !== EXPECTED_FILE_SIZE) {
    return err({
      kind: 'INVALID_SIZE',
      expected: EXPECTED_FILE_SIZE,
      actual: buffer.byteLength,
    });
  }

  const superblock = parseSuperblock(buffer);

  if (!superblock.magic.startsWith(MAGIC_STRING)) {
    return err({ kind: 'INVALID_MAGIC', actual: superblock.magic });
  }

  const fat      = buildFAT(buffer, superblock);
  const saveDirs = parseRootDirectory(buffer, fat, superblock);
  const saves    = saveDirs.map(dir => parseSaveEntry(buffer, fat, superblock.allocOffset, dir));
  const space    = calculateSpace(buffer, fat, superblock, saveDirs);

  return ok({
    fileName,
    superblock,
    fat,
    saves,
    rawBuffer: buffer,
    ...space,
  });
};
