import { readFileSync } from 'fs';
import { resolve } from 'path';

const P = 512, S = 16, R = 528;
function rp(buf: Buffer, n: number) { return buf.subarray(n * R, n * R + P); }
function rc(buf: Buffer, n: number) { const r = Buffer.alloc(1024); rp(buf, n * 2).copy(r, 0); rp(buf, n * 2 + 1).copy(r, P); return r; }

const merged = readFileSync(resolve('public/demo/test_merged.ps2'));
const ifc = rc(merged, 8);
const dv = new DataView(ifc.buffer, ifc.byteOffset, ifc.byteLength);
const fc0 = dv.getUint32(0, true);
console.log(`IFC[0] = ${fc0}`);

const fat = rc(merged, fc0);
const fv = new DataView(fat.buffer, fat.byteOffset, fat.byteLength);
console.log('\nFAT entries [0..30]:');
for (let i = 0; i < 30; i++) {
  const v = fv.getUint32(i * 4, true);
  const label = v === 0xFFFFFFFF ? 'CHAIN_END' : v === 0x7FFFFFFF ? 'FREE' : (v & 0x80000000) ? `ALLOC -> ${v & 0x7FFFFFFF}` : `??? 0x${v.toString(16)}`;
  console.log(`  [${i}] = 0x${v.toString(16).padStart(8, '0')} (${label})`);
}
