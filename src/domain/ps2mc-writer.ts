/**
 * PS2 Memory Card Writer — pure functional TypeScript.
 *
 * createBlankCard()  — builds a valid empty PS2 memory card ArrayBuffer.
 * buildMergedCard()  — copies saves from source cards into a new card.
 *
 * Strategy: buildMergedCard copies the superblock from the first source card
 * verbatim (so every geometry, flag, and undocumented byte matches what a real
 * PS2 BIOS wrote), then builds a fresh IFC/FAT and root directory on top of
 * the source card's allocOffset layout, copying save cluster data as-is.
 */

import {
  type MergeAction,
  type MergeError,
  type MemoryCard,
  type Result,
  ok,
  err,
} from './types';
import {
  EXPECTED_FILE_SIZE,
  PAGE_SIZE,
  SPARE_SIZE,
  RAW_PAGE_SIZE,
  PAGES_PER_CLUSTER,
  CLUSTER_SIZE,
  TOTAL_CLUSTERS,
  TOTAL_PAGES,
  DIR_ENTRY_SIZE,
  DF_EXISTS,
  DF_DIRECTORY,
  DF_FILE,
  DF_READ,
  DF_WRITE,
  DF_EXECUTE,
  FAT_CHAIN_END,
  followClusterChain,
  readAllocatableCluster,
  readPageData,
} from './ps2mc-parser';

// ─── ECC (Hamming code) — ported from pymemcard/ps2mc_ecc.py ─────────────────
// PCSX2 validates these codes in the 16-byte spare area of every page.
// Each 128-byte chunk produces 3 bytes of ECC. A 512-byte page has 4 chunks = 12 bytes.
// The remaining 4 bytes of the 16-byte spare are zero-padded.

const _parityb = (a: number): number => {
  a = (a ^ (a >> 1));
  a = (a ^ (a >> 2));
  a = (a ^ (a >> 4));
  return a & 1;
};

const _cpmasks = [0x55, 0x33, 0x0F, 0x00, 0xAA, 0xCC, 0xF0] as const;

// Pre-compute lookup tables
const _parityTable = new Uint8Array(256);
const _columnParityMasks = new Uint8Array(256);
for (let b = 0; b < 256; b++) {
  _parityTable[b] = _parityb(b);
  let mask = 0;
  for (let i = 0; i < _cpmasks.length; i++) {
    mask |= _parityTable[b & _cpmasks[i]!]! << i;
  }
  _columnParityMasks[b] = mask;
}

/** Calculate 3-byte Hamming ECC for a 128-byte chunk. */
const eccCalculate128 = (data: Uint8Array, offset: number): [number, number, number] => {
  let cp = 0x77;
  let lp0 = 0x7F;
  let lp1 = 0x7F;
  for (let i = 0; i < 128; i++) {
    const b = data[offset + i]!;
    cp ^= _columnParityMasks[b]!;
    if (_parityTable[b]) {
      lp0 ^= ~i & 0x7F;
      lp1 ^= i;
    }
  }
  return [cp, lp0 & 0x7F, lp1];
};

/** Calculate 12 bytes of ECC for a 512-byte page (4 × 128-byte chunks). */
const eccCalculatePage = (page: Uint8Array): Uint8Array => {
  const ecc = new Uint8Array(12);
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = eccCalculate128(page, i * 128);
    ecc[i * 3]     = a;
    ecc[i * 3 + 1] = b;
    ecc[i * 3 + 2] = c;
  }
  return ecc;
};

// ─── Raw page addressing ──────────────────────────────────────────────────────

/**
 * Write 512 bytes of page data + 16 bytes of spare (12 ECC + 4 zero padding).
 */
const writePageData = (buffer: ArrayBuffer, pageIndex: number, data: Uint8Array): void => {
  const offset = pageIndex * RAW_PAGE_SIZE;
  // Write the 512 bytes of page data
  const dst = new Uint8Array(buffer, offset, PAGE_SIZE);
  dst.set(data.subarray(0, PAGE_SIZE));
  // Calculate and write ECC into the 16-byte spare area
  const ecc = eccCalculatePage(data);
  const spare = new Uint8Array(buffer, offset + PAGE_SIZE, SPARE_SIZE);
  spare.set(ecc);
  // Remaining 4 bytes (12..15) stay zero
};

const writeClusterDataRaw = (buffer: ArrayBuffer, clusterIndex: number, data: Uint8Array): void => {
  const page0 = clusterIndex * PAGES_PER_CLUSTER;
  writePageData(buffer, page0,     data.subarray(0, PAGE_SIZE));
  writePageData(buffer, page0 + 1, data.subarray(PAGE_SIZE, CLUSTER_SIZE));
};

const writeAllocatableCluster = (
  buffer: ArrayBuffer,
  allocatableIndex: number,
  allocOffset: number,
  data: Uint8Array,
): void => {
  writeClusterDataRaw(buffer, allocOffset + allocatableIndex, data);
};

// ─── FAT helpers ──────────────────────────────────────────────────────────────

const writeFATCluster = (buffer: ArrayBuffer, fatClusterAbs: number, fatData: Uint32Array): void => {
  const bytes = new Uint8Array(fatData.buffer, fatData.byteOffset, fatData.byteLength);
  writeClusterDataRaw(buffer, fatClusterAbs, bytes);
};

// ─── FAT constants ───────────────────────────────────────────────────────────
// Real PS2 cards OR 0x80000000 into every allocated FAT entry.
// Free clusters use 0x7FFFFFFF. Allocated chain end uses 0xFFFFFFFF.
const FAT_ALLOCATED_BIT = 0x80000000;
const FAT_FREE_CLUSTER  = 0x7FFFFFFF;

/** Build a FAT chain link: set allocated bit + next cluster index. */
const fatLink = (nextCluster: number): number => FAT_ALLOCATED_BIT | nextCluster;

// ─── Standalone blank card constants ──────────────────────────────────────────
// These match the geometry of a real PS2-formatted 8MB card.

const STANDALONE_IFC_CLUSTER  = 8;
const STANDALONE_FAT0_CLUSTER = 9;
const STANDALONE_ALLOC_OFFSET = 41;  // ← matches real PS2 BIOS (was 16, WRONG)
const STANDALONE_ALLOC_END    = 8135; // clustersPerCard minus overhead
const STANDALONE_ROOT_CLUSTER = 0;

// Magic is exactly 28 bytes including trailing space — PS2 BIOS does a byte compare.
const MAGIC   = 'Sony PS2 Memory Card Format '; // 28 chars (trailing space!)
const VERSION = '1.2.0.0';

// ─── Standalone blank card ────────────────────────────────────────────────────

/**
 * Create a valid, empty PS2 memory card ArrayBuffer (8,650,752 bytes).
 * The geometry matches a card formatted by the real PS2 BIOS.
 */
export const createBlankCard = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(EXPECTED_FILE_SIZE);

  const sb = new Uint8Array(PAGE_SIZE).fill(0);
  const sbView = new DataView(sb.buffer);

  // Magic + version
  for (let i = 0; i < MAGIC.length;   i++) sb[i]        = MAGIC.charCodeAt(i);
  for (let i = 0; i < VERSION.length; i++) sb[0x1c + i]  = VERSION.charCodeAt(i);

  sbView.setUint16(0x28, PAGE_SIZE,                 true); // pageLen
  sbView.setUint16(0x2a, PAGES_PER_CLUSTER,         true); // pagesPerCluster
  sbView.setUint16(0x2c, 16,                        true); // pagesPerBlock
  sb[0x2f] = 0xff;                                          // card-type flag byte
  sbView.setUint32(0x30, TOTAL_CLUSTERS,            true); // clustersPerCard
  sbView.setUint32(0x34, STANDALONE_ALLOC_OFFSET,   true); // allocOffset
  sbView.setUint32(0x38, STANDALONE_ALLOC_END,      true); // allocEnd
  sbView.setUint32(0x3c, STANDALONE_ROOT_CLUSTER,   true); // rootdirCluster

  const totalBlocks = TOTAL_PAGES / 16;
  sbView.setUint32(0x40, totalBlocks - 1, true); // backupBlock1 = 1023
  sbView.setUint32(0x44, totalBlocks - 2, true); // backupBlock2 = 1022

  // IFC list — first entry = IFC cluster, rest = 0 (NOT 0xFFFFFFFF!)
  sbView.setUint32(0x50, STANDALONE_IFC_CLUSTER, true);
  // Remaining 31 entries stay 0x00000000 (already zeroed from fill)

  writePageData(buffer, 0, sb);

  // ── IFC cluster — zero-filled, first entry → FAT0 ────────────────────────
  const ifcData = new Uint8Array(CLUSTER_SIZE).fill(0x00);
  const ifcView = new DataView(ifcData.buffer);
  ifcView.setUint32(0, STANDALONE_FAT0_CLUSTER, true);
  writeClusterDataRaw(buffer, STANDALONE_IFC_CLUSTER, ifcData);

  // ── FAT cluster 0 ────────────────────────────────────────────────────────
  const fatData = new Uint32Array(CLUSTER_SIZE / 4).fill(FAT_CHAIN_END);
  fatData[STANDALONE_ROOT_CLUSTER] = FAT_CHAIN_END;
  writeFATCluster(buffer, STANDALONE_FAT0_CLUSTER, fatData);

  // ── Root directory ────────────────────────────────────────────────────────
  const rootData = new Uint8Array(CLUSTER_SIZE).fill(0);
  const rootView = new DataView(rootData.buffer);
  const dirMode  = DF_EXISTS | DF_DIRECTORY | DF_READ | DF_WRITE | DF_EXECUTE;

  rootView.setUint32(0x00, dirMode,                 true);
  rootView.setUint32(0x04, 2,                       true);
  rootView.setUint32(0x10, STANDALONE_ROOT_CLUSTER,  true);
  rootData[0x40] = '.'.charCodeAt(0);

  rootView.setUint32(DIR_ENTRY_SIZE + 0x00, dirMode,                true);
  rootView.setUint32(DIR_ENTRY_SIZE + 0x04, 0,                      true);
  rootView.setUint32(DIR_ENTRY_SIZE + 0x10, STANDALONE_ROOT_CLUSTER, true);
  rootData[DIR_ENTRY_SIZE + 0x40] = '.'.charCodeAt(0);
  rootData[DIR_ENTRY_SIZE + 0x41] = '.'.charCodeAt(0);

  writeAllocatableCluster(buffer, STANDALONE_ROOT_CLUSTER, STANDALONE_ALLOC_OFFSET, rootData);

  return buffer;
};

// ─── Merge ────────────────────────────────────────────────────────────────────

const ENTRIES_PER_CLUSTER = CLUSTER_SIZE / DIR_ENTRY_SIZE; // = 2

/**
 * Read the superblock fields we need from a source card.
 */
const readRefSuperblock = (buffer: ArrayBuffer) => {
  const page0 = readPageData(buffer, 0);
  const view  = new DataView(page0.buffer, page0.byteOffset, page0.byteLength);
  return {
    allocOffset:  view.getUint32(0x34, true),
    allocEnd:     view.getUint32(0x38, true),
    rootCluster:  view.getUint32(0x3c, true),
    ifcCluster:   view.getUint32(0x50, true),
  };
};

/**
 * Create a blank card whose superblock is copied byte-for-byte from a
 * reference card (one of the source cards). This ensures every geometry
 * field, flag byte, and undocumented BIOS field is preserved.
 *
 * We then rebuild IFC, FAT cluster 0, and root directory on top of the
 * reference's allocOffset layout.
 */
const createBlankCardFromRef = (referenceBuffer: ArrayBuffer): { dest: ArrayBuffer; allocOffset: number; allocEnd: number; rootCluster: number; ifcCluster: number; fat0Cluster: number } => {
  const dest = new ArrayBuffer(EXPECTED_FILE_SIZE);

  // ── Stamp ECC on ALL pages first (blank page = all zeros) ─────────────────
  // A zeroed page has a fixed ECC; compute once, apply to all 16384 pages.
  const blankPage = new Uint8Array(PAGE_SIZE); // all zeros
  const blankEcc = eccCalculatePage(blankPage);
  for (let p = 0; p < TOTAL_PAGES; p++) {
    const spareOffset = p * RAW_PAGE_SIZE + PAGE_SIZE;
    const spare = new Uint8Array(dest, spareOffset, SPARE_SIZE);
    spare.set(blankEcc);
  }

  // ── Copy superblock page 0 verbatim from reference ────────────────────────
  const refPage0 = readPageData(referenceBuffer, 0);
  writePageData(dest, 0, new Uint8Array(refPage0));

  // Read the geometry values we need
  const ref = readRefSuperblock(referenceBuffer);

  // Figure out the FAT0 cluster from the IFC
  const refIfcData = new Uint8Array(CLUSTER_SIZE);
  const refIfcPage0 = readPageData(referenceBuffer, ref.ifcCluster * PAGES_PER_CLUSTER);
  const refIfcPage1 = readPageData(referenceBuffer, ref.ifcCluster * PAGES_PER_CLUSTER + 1);
  refIfcData.set(refIfcPage0, 0);
  refIfcData.set(refIfcPage1, PAGE_SIZE);
  const refIfcView = new DataView(refIfcData.buffer);
  const fat0Cluster = refIfcView.getUint32(0, true);

  // ── Rebuild IFC — zero-filled, first entry → fat0Cluster ──────────────────
  const ifcData = new Uint8Array(CLUSTER_SIZE).fill(0x00);
  const ifcView = new DataView(ifcData.buffer);
  ifcView.setUint32(0, fat0Cluster, true);
  writeClusterDataRaw(dest, ref.ifcCluster, ifcData);

  // ── FAT cluster 0 — free entries = 0x7FFFFFFF, root = chain end ──────────
  const fatData = new Uint32Array(CLUSTER_SIZE / 4).fill(FAT_FREE_CLUSTER);
  fatData[ref.rootCluster] = FAT_CHAIN_END;
  writeFATCluster(dest, fat0Cluster, fatData);

  // ── Root directory at ref.rootCluster ─────────────────────────────────────
  const rootData = new Uint8Array(CLUSTER_SIZE).fill(0);
  const rootView = new DataView(rootData.buffer);
  const dirMode  = DF_EXISTS | DF_DIRECTORY | DF_READ | DF_WRITE | DF_EXECUTE;

  rootView.setUint32(0x00, dirMode,            true);
  rootView.setUint32(0x04, 2,                  true);
  rootView.setUint32(0x10, ref.rootCluster,    true);
  rootData[0x40] = '.'.charCodeAt(0);

  rootView.setUint32(DIR_ENTRY_SIZE + 0x00, dirMode,         true);
  rootView.setUint32(DIR_ENTRY_SIZE + 0x04, 0,               true);
  rootView.setUint32(DIR_ENTRY_SIZE + 0x10, ref.rootCluster, true);
  rootData[DIR_ENTRY_SIZE + 0x40] = '.'.charCodeAt(0);
  rootData[DIR_ENTRY_SIZE + 0x41] = '.'.charCodeAt(0);

  writeAllocatableCluster(dest, ref.rootCluster, ref.allocOffset, rootData);

  return {
    dest,
    allocOffset: ref.allocOffset,
    allocEnd:    ref.allocEnd,
    rootCluster: ref.rootCluster,
    ifcCluster:  ref.ifcCluster,
    fat0Cluster,
  };
};

/**
 * Flush an in-memory FAT array to as many FAT clusters as needed.
 */
const flushFAT = (
  buffer: ArrayBuffer,
  fat: Uint32Array,
  ifcCluster: number,
  fat0Cluster: number,
): void => {
  const entriesPerFatCluster = CLUSTER_SIZE / 4; // 256
  const numFatClusters = Math.ceil(fat.length / entriesPerFatCluster);

  // Rebuild the IFC cluster — zero-filled, slots point to consecutive FAT clusters
  const ifcData = new Uint8Array(CLUSTER_SIZE).fill(0x00);
  const ifcView = new DataView(ifcData.buffer);

  for (let fc = 0; fc < numFatClusters; fc++) {
    const fatClusterAbs = fat0Cluster + fc;
    ifcView.setUint32(fc * 4, fatClusterAbs, true);

    const sliceStart = fc * entriesPerFatCluster;
    const sliceEnd   = Math.min(sliceStart + entriesPerFatCluster, fat.length);
    const fatSlice   = new Uint32Array(entriesPerFatCluster).fill(FAT_CHAIN_END);
    for (let i = 0; i < sliceEnd - sliceStart; i++) {
      fatSlice[i] = fat[sliceStart + i] ?? FAT_CHAIN_END;
    }
    writeFATCluster(buffer, fatClusterAbs, fatSlice);
  }

  writeClusterDataRaw(buffer, ifcCluster, ifcData);
};

/**
 * Build a merged PS2 memory card by copying saves verbatim from their source
 * cards into a fresh card whose superblock is copied from the first source.
 */
export const buildMergedCard = (
  actions: readonly MergeAction[],
  cards: readonly MemoryCard[],
): Result<ArrayBuffer, MergeError> => {
  // Use the first source card as the reference for superblock layout
  const refCard = cards[0];
  if (!refCard) return err({ kind: 'NO_SAVES' });

  const { dest, allocOffset, allocEnd, rootCluster, ifcCluster, fat0Cluster } =
    createBlankCardFromRef(refCard.rawBuffer);

  const allocatableClusters = allocEnd - allocOffset;
  // Initialize all entries as free (0x7FFFFFFF); allocated entries get 0x80000000 bit
  const fat = new Uint32Array(allocatableClusters).fill(FAT_FREE_CLUSTER);
  fat[rootCluster] = FAT_CHAIN_END; // root = allocated, chain end

  let nextFree = 1;
  const alloc = (): number | null => {
    // Skip cluster 0 (root dir) — it's already taken
    while (nextFree < allocatableClusters && nextFree === rootCluster) nextFree++;
    if (nextFree >= allocatableClusters) return null;
    return nextFree++;
  };

  // ── Root directory bookkeeping ────────────────────────────────────────────
  let rootDirClusters = [rootCluster];
  let rootEntryCount  = 2;

  const ensureRootCapacity = (): boolean => {
    const needed = Math.ceil((rootEntryCount + 1) / ENTRIES_PER_CLUSTER);
    while (rootDirClusters.length < needed) {
      const nc = alloc();
      if (nc === null) return false;
      const prev = rootDirClusters[rootDirClusters.length - 1]!;
      fat[prev] = fatLink(nc);
      fat[nc]   = FAT_CHAIN_END;
      rootDirClusters.push(nc);
      writeAllocatableCluster(dest, nc, allocOffset, new Uint8Array(CLUSTER_SIZE));
    }
    return true;
  };

  const writeRootEntry = (entryData: Uint8Array): boolean => {
    if (!ensureRootCapacity()) return false;
    const clusterIdx   = Math.floor(rootEntryCount / ENTRIES_PER_CLUSTER);
    const posInCluster = rootEntryCount % ENTRIES_PER_CLUSTER;
    const rc           = rootDirClusters[clusterIdx];
    if (rc === undefined) return false;

    const clusterData = readAllocatableCluster(dest, rc, allocOffset);
    const mutable     = new Uint8Array(clusterData.buffer.slice(0));
    mutable.set(entryData.subarray(0, DIR_ENTRY_SIZE), posInCluster * DIR_ENTRY_SIZE);
    writeAllocatableCluster(dest, rc, allocOffset, mutable);
    rootEntryCount++;
    return true;
  };

  // ── Copy each save ────────────────────────────────────────────────────────
  for (const action of actions) {
    if (action.type !== 'copy') continue;

    const srcCard = cards[action.sourceCardIndex];
    if (!srcCard) continue;

    const save      = action.save;
    const srcOffset = srcCard.superblock.allocOffset;
    const srcFat    = srcCard.fat;

    // 1. Read save directory cluster chain from source
    const srcDirChain = followClusterChain(srcFat, save.firstCluster);
    if (srcDirChain.length === 0) continue;

    // 2. Allocate dest clusters for the directory chain
    const destDirChain: number[] = [];
    for (let i = 0; i < srcDirChain.length; i++) {
      const nc = alloc();
      if (nc === null) return err({ kind: 'WRITE_ERROR', message: `Out of clusters for save dir "${save.directoryName}"` });
      destDirChain.push(nc);
    }
    for (let i = 0; i < destDirChain.length; i++) {
      fat[destDirChain[i]!] = i + 1 < destDirChain.length ? fatLink(destDirChain[i + 1]!) : FAT_CHAIN_END;
    }

    // 3. Copy directory cluster data verbatim
    for (let i = 0; i < srcDirChain.length; i++) {
      const srcCluster  = srcDirChain[i]!;
      const destCluster = destDirChain[i]!;
      const clusterData = readAllocatableCluster(srcCard.rawBuffer, srcCluster, srcOffset);
      writeAllocatableCluster(dest, destCluster, allocOffset, new Uint8Array(clusterData));
    }

    // 4. Copy each file's cluster data
    const fileNewFirstCluster = new Map<string, number>();
    for (const file of save.files) {
      const srcFileChain = followClusterChain(srcFat, file.firstCluster);

      const destFileChain: number[] = [];
      for (let i = 0; i < srcFileChain.length; i++) {
        const nc = alloc();
        if (nc === null) return err({ kind: 'WRITE_ERROR', message: `Out of clusters for file "${file.name}"` });
        destFileChain.push(nc);
      }
      for (let i = 0; i < destFileChain.length; i++) {
        fat[destFileChain[i]!] = i + 1 < destFileChain.length ? fatLink(destFileChain[i + 1]!) : FAT_CHAIN_END;
      }
      for (let i = 0; i < srcFileChain.length; i++) {
        const srcCluster  = srcFileChain[i]!;
        const destCluster = destFileChain[i]!;
        const clusterData = readAllocatableCluster(srcCard.rawBuffer, srcCluster, srcOffset);
        writeAllocatableCluster(dest, destCluster, allocOffset, new Uint8Array(clusterData));
      }
      if (destFileChain[0] !== undefined) {
        fileNewFirstCluster.set(file.name, destFileChain[0]);
      }
    }

    // 5. Patch directory clusters: fix '.' firstCluster and file entries' firstCluster
    for (let di = 0; di < destDirChain.length; di++) {
      const dc      = destDirChain[di]!;
      const rawData = readAllocatableCluster(dest, dc, allocOffset);
      const patched = new Uint8Array(rawData.buffer.slice(0));
      const pview   = new DataView(patched.buffer);

      if (di === 0 && destDirChain[0] !== undefined) {
        pview.setUint32(0x10, destDirChain[0], true);
      }

      for (let ei = 0; ei < ENTRIES_PER_CLUSTER; ei++) {
        const base   = ei * DIR_ENTRY_SIZE;
        const mode   = pview.getUint32(base + 0x00, true);
        const isFile = (mode & DF_EXISTS) !== 0 && (mode & DF_FILE) !== 0;
        if (!isFile) continue;

        let fname = '';
        for (let k = 0; k < 32; k++) {
          const c = patched[base + 0x40 + k];
          if (!c) break;
          fname += String.fromCharCode(c);
        }
        const newFirst = fileNewFirstCluster.get(fname);
        if (newFirst !== undefined) {
          pview.setUint32(base + 0x10, newFirst, true);
        }
      }

      writeAllocatableCluster(dest, dc, allocOffset, patched);
    }

    // 6. Write root directory entry for this save — copy from source verbatim, patch firstCluster
    // Read the original root entry from the source card to preserve timestamps, mode bits, etc.
    const srcRootChain = followClusterChain(srcFat, srcCard.superblock.rootdirCluster);
    let originalRootEntry: Uint8Array | null = null;

    // Find this save's entry in the source root directory
    for (let ci = 0; ci < srcRootChain.length && !originalRootEntry; ci++) {
      const cIdx = srcRootChain[ci]!;
      const cData = readAllocatableCluster(srcCard.rawBuffer, cIdx, srcOffset);
      for (let ei = 0; ei < ENTRIES_PER_CLUSTER; ei++) {
        const base = ei * DIR_ENTRY_SIZE;
        let entryName = '';
        for (let k = 0; k < 32; k++) {
          const c = cData[base + 0x40 + k];
          if (!c) break;
          entryName += String.fromCharCode(c);
        }
        if (entryName === save.directoryName) {
          originalRootEntry = new Uint8Array(DIR_ENTRY_SIZE);
          originalRootEntry.set(cData.subarray(base, base + DIR_ENTRY_SIZE));
          break;
        }
      }
    }

    if (originalRootEntry) {
      // Patch only the firstCluster field to point to the new dest dir cluster
      const entryView = new DataView(originalRootEntry.buffer);
      entryView.setUint32(0x10, destDirChain[0]!, true);
      if (!writeRootEntry(originalRootEntry)) {
        return err({ kind: 'WRITE_ERROR', message: 'Root directory full' });
      }
    } else {
      // Fallback: build root entry from scratch (shouldn't happen normally)
      const rootEntry = new Uint8Array(DIR_ENTRY_SIZE).fill(0);
      const rev       = new DataView(rootEntry.buffer);
      const saveMode  = DF_EXISTS | DF_DIRECTORY | DF_READ | DF_WRITE | DF_EXECUTE;
      rev.setUint32(0x00, saveMode, true);
      rev.setUint32(0x04, 2 + save.files.length, true);
      rev.setUint32(0x10, destDirChain[0]!, true);
      for (let i = 0; i < save.directoryName.length && i < 32; i++) {
        rootEntry[0x40 + i] = save.directoryName.charCodeAt(i);
      }
      if (!writeRootEntry(rootEntry)) {
        return err({ kind: 'WRITE_ERROR', message: 'Root directory full' });
      }
    }
  }

  // ── Update root dir '.' entry length ─────────────────────────────────────
  const rootCluster0 = readAllocatableCluster(dest, rootCluster, allocOffset);
  const patchedRoot  = new Uint8Array(rootCluster0.buffer.slice(0));
  new DataView(patchedRoot.buffer).setUint32(0x04, rootEntryCount, true);
  writeAllocatableCluster(dest, rootCluster, allocOffset, patchedRoot);

  // ── Flush FAT ─────────────────────────────────────────────────────────────
  flushFAT(dest, fat, ifcCluster, fat0Cluster);

  return ok(dest);
};
