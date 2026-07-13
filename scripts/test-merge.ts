/**
 * Generate a merged card from the two demo cards and dump diagnostics.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Import the domain functions
import { parseMemoryCard } from '../src/domain/ps2mc-parser';
import { compareSaves, generateMergePlan, executeMerge } from '../src/domain/ps2mc-sync';

const card1Path = resolve('public/demo/NFS_MW.ps2');
const card2Path = resolve('public/demo/merged_card.ps2'); // using the old merged as second source

const buf1 = readFileSync(card1Path);
const buf2 = readFileSync(card2Path);

const result1 = parseMemoryCard(buf1.buffer.slice(buf1.byteOffset, buf1.byteOffset + buf1.byteLength), 'NFS_MW.ps2');
const result2 = parseMemoryCard(buf2.buffer.slice(buf2.byteOffset, buf2.byteOffset + buf2.byteLength), 'merged_card.ps2');

if (!result1.ok) { console.error('Failed to parse card 1:', result1.error); process.exit(1); }
if (!result2.ok) { console.error('Failed to parse card 2:', result2.error); process.exit(1); }

console.log(`Card 1: ${result1.value.saves.length} saves, allocOffset=${result1.value.superblock.allocOffset}`);
console.log(`Card 2: ${result2.value.saves.length} saves, allocOffset=${result2.value.superblock.allocOffset}`);

const cards = [result1.value, result2.value];
const comparison = compareSaves(cards);
console.log(`\nComparison: ${comparison.uniqueCount} unique, ${comparison.duplicateCount} duplicates, ${comparison.conflictCount} conflicts`);

const planResult = generateMergePlan(cards);
if (!planResult.ok) { console.error('Merge plan failed:', planResult.error); process.exit(1); }

console.log(`\nMerge plan: ${planResult.value.actions.length} actions, willFit=${planResult.value.willFit}`);
for (const action of planResult.value.actions) {
  console.log(`  ${action.type} "${action.directoryName}" from card ${action.sourceCardIndex} — ${action.reason}`);
}

const mergeResult = executeMerge(planResult.value, cards);
if (!mergeResult.ok) { console.error('Merge failed:', mergeResult.error); process.exit(1); }

const outPath = resolve('public/demo/test_merged.ps2');
writeFileSync(outPath, Buffer.from(mergeResult.value));
console.log(`\n✅ Merged card written to ${outPath} (${mergeResult.value.byteLength} bytes)`);
console.log('\nRun diagnose-card.ts to compare against NFS_MW.ps2...');
