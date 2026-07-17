import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAGE_SIZE = 512;
const RAW_PAGE_SIZE = 528;

function readPage(buf: Buffer, idx: number) { return buf.subarray(idx * RAW_PAGE_SIZE, idx * RAW_PAGE_SIZE + PAGE_SIZE); }

const good = readFileSync(resolve('public/demo/NFS_MW.ps2'));
const merged = readFileSync(resolve('public/demo/test_merged.ps2'));

const gp = readPage(good, 0);
const mp = readPage(merged, 0);

console.log('=== SUPERBLOCK COMPARISON (good vs new-merged) ===');
const gv = new DataView(gp.buffer, gp.byteOffset, gp.byteLength);
const mv = new DataView(mp.buffer, mp.byteOffset, mp.byteLength);

const checks: [string, number, 'u8'|'u16'|'u32'][] = [
  ['pageLen', 0x28, 'u16'],
  ['pagesPerCluster', 0x2a, 'u16'],
  ['pagesPerBlock', 0x2c, 'u16'],
  ['byte_0x2f', 0x2f, 'u8'],
  ['clustersPerCard', 0x30, 'u32'],
  ['allocOffset', 0x34, 'u32'],
  ['allocEnd', 0x38, 'u32'],
  ['rootdirCluster', 0x3c, 'u32'],
  ['backupBlock1', 0x40, 'u32'],
  ['backupBlock2', 0x44, 'u32'],
  ['cardType', 0x48, 'u32'],
  ['cardFlags', 0x4c, 'u32'],
  ['ifcList[0]', 0x50, 'u32'],
  ['ifcList[1]', 0x54, 'u32'],
];

// Check magic (bytes 0-27)
const gMagic = gp.subarray(0, 28).toString().replace(/\0+$/g, '');
const mMagic = mp.subarray(0, 28).toString().replace(/\0+$/g, '');
const magicMatch = Buffer.compare(gp.subarray(0, 28), mp.subarray(0, 28)) === 0;
console.log(`${magicMatch ? '✅' : '❌'} magic                good="${gMagic}"  merged="${mMagic}"`);

for (const [name, off, type] of checks) {
  let g: number, m: number;
  if (type === 'u8')  { g = gp[off]!; m = mp[off]!; }
  else if (type === 'u16') { g = gv.getUint16(off, true); m = mv.getUint16(off, true); }
  else { g = gv.getUint32(off, true); m = mv.getUint32(off, true); }
  const match = g === m ? '✅' : '❌';
  console.log(`${match} ${name.padEnd(20)} good=${g}  merged=${m}`);
}

// Full page byte diff
let diffCount = 0;
for (let i = 0; i < PAGE_SIZE; i++) {
  if (gp[i] !== mp[i]) diffCount++;
}
console.log(`\nTotal differing bytes in superblock page: ${diffCount}/${PAGE_SIZE}`);
