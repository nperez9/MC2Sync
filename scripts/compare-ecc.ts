/**
 * Compare ECC spare bytes between good and merged cards.
 * Also re-calculate what the ECC should be for the merged card.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAGE_SIZE = 512;
const SPARE_SIZE = 16;
const RAW_PAGE_SIZE = PAGE_SIZE + SPARE_SIZE; // 528

// Hamming ECC tables (ported from pymemcard/ps2mc_ecc.py)
function parityb(a: number): number {
  a = (a ^ (a >> 1));
  a = (a ^ (a >> 2));
  a = (a ^ (a >> 4));
  return a & 1;
}

const parityTable: number[] = [];
const cpmasks = [0x55, 0x33, 0x0F, 0x00, 0xAA, 0xCC, 0xF0];
const columnParityMasks: number[] = [];

for (let b = 0; b < 256; b++) {
  parityTable[b] = parityb(b);
  let mask = 0;
  for (let i = 0; i < cpmasks.length; i++) {
    mask |= parityTable[b & cpmasks[i]!]! << i;
  }
  columnParityMasks[b] = mask;
}

function eccCalculate128(data: Uint8Array, offset: number): [number, number, number] {
  let columnParity = 0x77;
  let lineParity0 = 0x7F;
  let lineParity1 = 0x7F;
  
  for (let i = 0; i < 128; i++) {
    const b = data[offset + i]!;
    columnParity ^= columnParityMasks[b]!;
    if (parityTable[b]) {
      lineParity0 ^= ~i & 0x7F;
      lineParity1 ^= i;
    }
  }
  return [columnParity, lineParity0 & 0x7F, lineParity1];
}

function eccCalculatePage(page: Uint8Array): number[] {
  // 512 / 128 = 4 chunks, each produces 3 bytes of ECC
  const ecc: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = eccCalculate128(page, i * 128);
    ecc.push(a, b, c);
  }
  return ecc; // 12 bytes of ECC data
}

// Read files
const good = readFileSync(resolve('public/demo/NFS_MW.ps2'));
const merged = readFileSync(resolve('public/demo/test_merged.ps2'));

console.log('=== ECC SPARE COMPARISON ===\n');

// Check a few pages: page 0 (superblock), and some data pages
const pagesToCheck = [0, 1, 2, 82, 83, 84, 85]; // page 82-83 = cluster 41 = first alloc cluster with allocOffset=41

for (const pageIdx of pagesToCheck) {
  const gPageStart = pageIdx * RAW_PAGE_SIZE;
  const mPageStart = pageIdx * RAW_PAGE_SIZE;
  
  const gPage = good.subarray(gPageStart, gPageStart + PAGE_SIZE);
  const gSpare = good.subarray(gPageStart + PAGE_SIZE, gPageStart + RAW_PAGE_SIZE);
  
  const mPage = merged.subarray(mPageStart, mPageStart + PAGE_SIZE);
  const mSpare = merged.subarray(mPageStart + PAGE_SIZE, mPageStart + RAW_PAGE_SIZE);
  
  // Calculate expected ECC for good page
  const gExpectedEcc = eccCalculatePage(new Uint8Array(gPage));
  const mExpectedEcc = eccCalculatePage(new Uint8Array(mPage));
  
  const gSpareHex = Array.from(gSpare).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const mSpareHex = Array.from(mSpare).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const gExpHex = gExpectedEcc.map(b => b.toString(16).padStart(2, '0')).join(' ');
  const mExpHex = mExpectedEcc.map(b => b.toString(16).padStart(2, '0')).join(' ');
  
  const gSpareAllZero = gSpare.every(b => b === 0);
  const mSpareAllZero = mSpare.every(b => b === 0);
  
  console.log(`Page ${pageIdx}:`);
  console.log(`  Good:   spare=[${gSpareHex}] ${gSpareAllZero ? '(ALL ZERO)' : ''}`);
  console.log(`  Merged: spare=[${mSpareHex}] ${mSpareAllZero ? '(ALL ZERO)' : ''}`);
  console.log(`  Good expected ECC:   [${gExpHex}]`);
  console.log(`  Merged expected ECC: [${mExpHex}]`);
  
  // Check if good card's spare matches ECC
  const gEccBytes = gSpare.subarray(0, 12);
  const gMatch = gEccBytes.every((b, i) => b === gExpectedEcc[i]);
  console.log(`  Good spare matches computed ECC: ${gMatch ? '✅' : '❌'}`);
  console.log('');
}

// Count how many pages in good card have non-zero spare
let goodNonZeroSpare = 0;
let mergedNonZeroSpare = 0;
const totalPages = 16384;
for (let p = 0; p < totalPages; p++) {
  const gS = good.subarray(p * RAW_PAGE_SIZE + PAGE_SIZE, p * RAW_PAGE_SIZE + RAW_PAGE_SIZE);
  const mS = merged.subarray(p * RAW_PAGE_SIZE + PAGE_SIZE, p * RAW_PAGE_SIZE + RAW_PAGE_SIZE);
  if (!gS.every(b => b === 0)) goodNonZeroSpare++;
  if (!mS.every(b => b === 0)) mergedNonZeroSpare++;
}
console.log(`Pages with non-zero spare: good=${goodNonZeroSpare}, merged=${mergedNonZeroSpare}`);
