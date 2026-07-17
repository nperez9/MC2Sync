/**
 * Diagnostic script: compare a known-good PS2 memory card with a merged one.
 * Dumps superblock, IFC, FAT, root directory, and save directory structures.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAGE_SIZE = 512;
const SPARE_SIZE = 16;
const RAW_PAGE_SIZE = PAGE_SIZE + SPARE_SIZE; // 528
const PAGES_PER_CLUSTER = 2;
const CLUSTER_SIZE = PAGE_SIZE * PAGES_PER_CLUSTER; // 1024
const DIR_ENTRY_SIZE = 512;
const FAT_CHAIN_END = 0xFFFFFFFF;
const TOTAL_CLUSTERS = 8192;

function readPageData(buffer: Buffer, pageIndex: number): Buffer {
  const offset = pageIndex * RAW_PAGE_SIZE;
  return buffer.subarray(offset, offset + PAGE_SIZE);
}

function readClusterRaw(buffer: Buffer, clusterIndex: number): Buffer {
  const page0 = clusterIndex * PAGES_PER_CLUSTER;
  const result = Buffer.alloc(CLUSTER_SIZE);
  readPageData(buffer, page0).copy(result, 0);
  readPageData(buffer, page0 + 1).copy(result, PAGE_SIZE);
  return result;
}

function readAllocCluster(buffer: Buffer, allocIdx: number, allocOffset: number): Buffer {
  return readClusterRaw(buffer, allocOffset + allocIdx);
}

function parseSuperblock(buffer: Buffer) {
  const page0 = readPageData(buffer, 0);
  const magic = page0.subarray(0, 28).toString('ascii').replace(/\0+$/, '');
  const version = page0.subarray(0x1c, 0x24).toString('ascii').replace(/\0+$/, '');
  const view = new DataView(page0.buffer, page0.byteOffset, page0.byteLength);
  
  return {
    magic,
    version,
    pageLen: view.getUint16(0x28, true),
    pagesPerCluster: view.getUint16(0x2a, true),
    pagesPerBlock: view.getUint16(0x2c, true),
    clustersPerCard: view.getUint32(0x30, true),
    allocOffset: view.getUint32(0x34, true),
    allocEnd: view.getUint32(0x38, true),
    rootdirCluster: view.getUint32(0x3c, true),
    backupBlock1: view.getUint32(0x40, true),
    backupBlock2: view.getUint32(0x44, true),
    cardType: view.getUint32(0x48, true),
    cardFlags: view.getUint32(0x4c, true),
    ifcList: Array.from({ length: 32 }, (_, i) => view.getUint32(0x50 + i * 4, true)),
  };
}

function parseFAT(buffer: Buffer, sb: ReturnType<typeof parseSuperblock>) {
  const fat = new Uint32Array(sb.allocEnd - sb.allocOffset).fill(FAT_CHAIN_END);
  const entriesPerCluster = CLUSTER_SIZE / 4; // 256
  
  for (let i = 0; i < sb.ifcList.length; i++) {
    const ifcCluster = sb.ifcList[i]!;
    if (ifcCluster === FAT_CHAIN_END || ifcCluster >= TOTAL_CLUSTERS) continue;
    
    const indirectData = readClusterRaw(buffer, ifcCluster);
    const indirectView = new DataView(indirectData.buffer, indirectData.byteOffset, indirectData.byteLength);
    
    for (let j = 0; j < entriesPerCluster; j++) {
      const fatClusterIndex = indirectView.getUint32(j * 4, true);
      if (fatClusterIndex === FAT_CHAIN_END || fatClusterIndex >= TOTAL_CLUSTERS) continue;
      
      const fatData = readClusterRaw(buffer, fatClusterIndex);
      const fatView = new DataView(fatData.buffer, fatData.byteOffset, fatData.byteLength);
      
      const fatOffset = (i * entriesPerCluster + j) * entriesPerCluster;
      for (let k = 0; k < entriesPerCluster; k++) {
        const idx = fatOffset + k;
        if (idx >= fat.length) break;
        fat[idx] = fatView.getUint32(k * 4, true);
      }
    }
  }
  return fat;
}

function followChain(fat: Uint32Array, first: number, maxLen = 200): number[] {
  const chain: number[] = [];
  let current = first;
  const visited = new Set<number>();
  while (chain.length < maxLen) {
    if (current === FAT_CHAIN_END || current >= fat.length) break;
    const masked = current & 0x7FFFFFFF;
    if (masked === 0x7FFFFFFF) break;
    if (visited.has(current)) { chain.push(-1); break; } // cycle
    visited.add(current);
    chain.push(current);
    const next = fat[current]!;
    if (next === FAT_CHAIN_END || (next & 0x7FFFFFFF) === 0x7FFFFFFF) break;
    current = next & 0x7FFFFFFF;
  }
  return chain;
}

function parseDirEntry(data: Buffer, offset: number) {
  const view = new DataView(data.buffer, data.byteOffset + offset, DIR_ENTRY_SIZE);
  const mode = view.getUint32(0x00, true);
  const length = view.getUint32(0x04, true);
  const firstCluster = view.getUint32(0x10, true);
  
  let name = '';
  for (let i = 0; i < 32; i++) {
    const c = data[data.byteOffset + offset + 0x40 + i]!;
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  
  return {
    mode: `0x${mode.toString(16).padStart(8, '0')}`,
    modeFlags: {
      exists: !!(mode & 0x8000),
      isDir: !!(mode & 0x0020),
      isFile: !!(mode & 0x0010),
      read: !!(mode & 0x0001),
      write: !!(mode & 0x0002),
      exec: !!(mode & 0x0004),
      extra: `0x${(mode & ~0x8037).toString(16)}`,
    },
    length,
    firstCluster,
    name,
    // Timestamps
    created_raw: Array.from(data.subarray(data.byteOffset + offset + 0x08, data.byteOffset + offset + 0x10)).map(b => b.toString(16).padStart(2, '0')).join(' '),
    modified_raw: Array.from(data.subarray(data.byteOffset + offset + 0x18, data.byteOffset + offset + 0x20)).map(b => b.toString(16).padStart(2, '0')).join(' '),
  };
}

function analyzeCard(filePath: string, label: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${label}: ${filePath}`);
  console.log(`${'='.repeat(80)}`);
  
  const buffer = readFileSync(filePath);
  console.log(`  File size: ${buffer.length} bytes (expected: 8650752)`);
  
  // Superblock
  const sb = parseSuperblock(buffer);
  console.log(`\n  ── Superblock ──`);
  console.log(`  magic:           "${sb.magic}"`);
  console.log(`  version:         "${sb.version}"`);
  console.log(`  pageLen:         ${sb.pageLen}`);
  console.log(`  pagesPerCluster: ${sb.pagesPerCluster}`);
  console.log(`  pagesPerBlock:   ${sb.pagesPerBlock}`);
  console.log(`  clustersPerCard: ${sb.clustersPerCard}`);
  console.log(`  allocOffset:     ${sb.allocOffset}`);
  console.log(`  allocEnd:        ${sb.allocEnd}`);
  console.log(`  rootdirCluster:  ${sb.rootdirCluster}`);
  console.log(`  backupBlock1:    ${sb.backupBlock1}`);
  console.log(`  backupBlock2:    ${sb.backupBlock2}`);
  console.log(`  cardType:        0x${sb.cardType.toString(16)}`);
  console.log(`  cardFlags:       0x${sb.cardFlags.toString(16)}`);
  
  const nonEmptyIfc = sb.ifcList.filter(v => v !== FAT_CHAIN_END && v < TOTAL_CLUSTERS);
  console.log(`  ifcList[used]:   [${nonEmptyIfc.join(', ')}]`);
  
  // IFC cluster dump
  console.log(`\n  ── IFC Cluster (abs=${sb.ifcList[0]}) ──`);
  if (sb.ifcList[0] !== undefined && sb.ifcList[0] !== FAT_CHAIN_END) {
    const ifcData = readClusterRaw(buffer, sb.ifcList[0]);
    const ifcView = new DataView(ifcData.buffer, ifcData.byteOffset, ifcData.byteLength);
    const ifcEntries: string[] = [];
    for (let i = 0; i < 8; i++) {
      const v = ifcView.getUint32(i * 4, true);
      ifcEntries.push(v === FAT_CHAIN_END ? 'END' : String(v));
    }
    console.log(`  entries[0..7]:   [${ifcEntries.join(', ')}]`);
  }
  
  // FAT
  const fat = parseFAT(buffer, sb);
  const usedClusters = Array.from(fat).filter(v => v !== FAT_CHAIN_END).length;
  console.log(`\n  ── FAT ──`);
  console.log(`  total entries:   ${fat.length}`);
  console.log(`  used entries:    ${usedClusters}`);
  console.log(`  first 20:        [${Array.from(fat.subarray(0, 20)).map(v => v === FAT_CHAIN_END ? 'END' : `${v & 0x7FFFFFFF}`).join(', ')}]`);
  
  // Root directory
  console.log(`\n  ── Root Directory (alloc cluster ${sb.rootdirCluster}) ──`);
  const rootChain = followChain(fat, sb.rootdirCluster);
  console.log(`  chain:           [${rootChain.join(' → ')}]`);
  
  for (let ci = 0; ci < rootChain.length; ci++) {
    const clusterIdx = rootChain[ci]!;
    const clusterData = readAllocCluster(buffer, clusterIdx, sb.allocOffset);
    const entriesPerCluster = CLUSTER_SIZE / DIR_ENTRY_SIZE;
    
    for (let ei = 0; ei < entriesPerCluster; ei++) {
      const entry = parseDirEntry(clusterData, ei * DIR_ENTRY_SIZE);
      if (!entry.modeFlags.exists) continue;
      
      const globalIdx = ci * entriesPerCluster + ei;
      const typeStr = entry.modeFlags.isDir ? 'DIR' : entry.modeFlags.isFile ? 'FILE' : '???';
      console.log(`\n  [rootEntry ${globalIdx}] name="${entry.name}" type=${typeStr} mode=${entry.mode} length=${entry.length} firstCluster=${entry.firstCluster}`);
      console.log(`    extra mode bits: ${entry.modeFlags.extra}`);
      console.log(`    created:  ${entry.created_raw}`);
      console.log(`    modified: ${entry.modified_raw}`);
      
      // If it's a save directory (not . or ..), dump its entries too
      if (entry.modeFlags.isDir && entry.name !== '.' && entry.name !== '..') {
        const saveChain = followChain(fat, entry.firstCluster);
        console.log(`    save dir chain: [${saveChain.join(' → ')}]`);
        
        for (let sci = 0; sci < saveChain.length; sci++) {
          const scIdx = saveChain[sci]!;
          const scData = readAllocCluster(buffer, scIdx, sb.allocOffset);
          
          for (let sei = 0; sei < entriesPerCluster; sei++) {
            const sEntry = parseDirEntry(scData, sei * DIR_ENTRY_SIZE);
            if (!sEntry.modeFlags.exists) continue;
            
            const sGlobal = sci * entriesPerCluster + sei;
            const sType = sEntry.modeFlags.isDir ? 'DIR' : sEntry.modeFlags.isFile ? 'FILE' : '???';
            console.log(`      [saveEntry ${sGlobal}] name="${sEntry.name}" type=${sType} mode=${sEntry.mode} length=${sEntry.length} firstCluster=${sEntry.firstCluster}`);
            
            if (sEntry.modeFlags.isFile && sEntry.length > 0) {
              const fileChain = followChain(fat, sEntry.firstCluster);
              console.log(`        file chain: [${fileChain.join(' → ')}] (${fileChain.length} clusters = ${fileChain.length * CLUSTER_SIZE} bytes for ${sEntry.length} byte file)`);
            }
          }
        }
      }
    }
  }
  
  // Superblock raw hex dump of first 0xD0 bytes
  console.log(`\n  ── Superblock Raw (first 0xD0 bytes) ──`);
  const page0 = readPageData(buffer, 0);
  for (let row = 0; row < 0xD0; row += 16) {
    const hex = Array.from(page0.subarray(row, row + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  0x${row.toString(16).padStart(4, '0')}: ${hex}`);
  }
  
  return { sb, fat };
}

// Run
const good = resolve('public/demo/NFS_MW.ps2');
const merged = resolve('public/demo/merged_card.ps2');

const goodResult = analyzeCard(good, 'GOOD CARD (NFS_MW.ps2)');
const mergedResult = analyzeCard(merged, 'MERGED CARD (merged_card.ps2)');

// Compare superblock fields
console.log(`\n${'='.repeat(80)}`);
console.log('  COMPARISON');
console.log(`${'='.repeat(80)}`);

const fields = ['magic','version','pageLen','pagesPerCluster','pagesPerBlock','clustersPerCard','allocOffset','allocEnd','rootdirCluster','backupBlock1','backupBlock2','cardType','cardFlags'] as const;
for (const f of fields) {
  const g = (goodResult.sb as any)[f];
  const m = (mergedResult.sb as any)[f];
  const match = g === m ? '✅' : '❌';
  console.log(`  ${match} ${f.padEnd(20)} good=${JSON.stringify(g)}  merged=${JSON.stringify(m)}`);
}
