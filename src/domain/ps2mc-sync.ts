/**
 * PS2 Memory Card Sync — pure functional TypeScript port.
 *
 * Fixes from original:
 *  - Removed circular import (PS2MemoryCardWriter was imported but never used)
 *  - Works with MemoryCard value objects (no class methods)
 *  - Typed return types throughout
 *  - Timestamps compared as milliseconds instead of relying on Date object reference inequality
 */

import {
  type ComparisonResult,
  type MemoryCard,
  type MergeAction,
  type MergeError,
  type MergePlan,
  type MergeStrategy,
  type Result,
  type SaveComparison,
  type SaveEntry,
  err,
  ok,
} from './types';
import { timestampToDate } from './ps2mc-parser';
import { buildMergedCard } from './ps2mc-writer';
import { CLUSTER_SIZE } from './ps2mc-parser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable fingerprint for duplicate detection: sorted file {name, size} pairs */
const saveFingerprint = (save: SaveEntry): string =>
  JSON.stringify(
    [...save.files]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => ({ name: f.name, size: f.size })),
  );

// ─── Compare ──────────────────────────────────────────────────────────────────

/**
 * Compare saves across multiple memory cards.
 * - `unique`    — exists on exactly one card
 * - `duplicate` — same name AND same file-size fingerprint on ≥2 cards
 * - `conflict`  — same name, different content; recommended winner = most recent modified
 */
export const compareSaves = (cards: readonly MemoryCard[]): ComparisonResult => {
  // Build map: directoryName → [{cardIndex, save, fingerprint}]
  const saveMap = new Map<string, Array<{ cardIndex: number; save: SaveEntry; fingerprint: string }>>();

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    if (card === undefined) continue;
    for (const save of card.saves) {
      const existing = saveMap.get(save.directoryName) ?? [];
      existing.push({ cardIndex, save, fingerprint: saveFingerprint(save) });
      saveMap.set(save.directoryName, existing);
    }
  }

  const comparisons: SaveComparison[] = [];

  for (const [directoryName, entries] of saveMap) {
    const saves = entries.map(e => ({ cardIndex: e.cardIndex, save: e.save }));

    if (entries.length === 1) {
      comparisons.push({ directoryName, status: 'unique', saves, recommendedIndex: null });
      continue;
    }

    const firstFp = entries[0]?.fingerprint;
    const allSame = entries.every(e => e.fingerprint === firstFp);

    if (allSame) {
      comparisons.push({ directoryName, status: 'duplicate', saves, recommendedIndex: 0 });
    } else {
      // Find newest modified
      let bestIdx = 0;
      let bestTime = timestampToDate(entries[0]?.save.modified ?? { seconds: 0, minutes: 0, hours: 0, day: 0, month: 0, year: 0 }).getTime();
      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        if (entry === undefined) continue;
        const t = timestampToDate(entry.save.modified).getTime();
        if (t > bestTime) { bestTime = t; bestIdx = i; }
      }
      comparisons.push({ directoryName, status: 'conflict', saves, recommendedIndex: bestIdx });
    }
  }

  return {
    comparisons,
    uniqueCount:    comparisons.filter(c => c.status === 'unique').length,
    duplicateCount: comparisons.filter(c => c.status === 'duplicate').length,
    conflictCount:  comparisons.filter(c => c.status === 'conflict').length,
  };
};

// ─── Merge Plan ───────────────────────────────────────────────────────────────

const MAX_ALLOCATABLE_CLUSTERS = 8_176; // approximate usable clusters on a standard card

/**
 * Generate a merge plan from a comparison result.
 */
export const generateMergePlan = (
  cards: readonly MemoryCard[],
  strategy: MergeStrategy = 'newest',
): Result<MergePlan, MergeError> => {
  const comparison = compareSaves(cards);
  const actions: MergeAction[] = [];

  for (const cmp of comparison.comparisons) {
    switch (cmp.status) {
      case 'unique': {
        const entry = cmp.saves[0];
        if (entry === undefined) break;
        actions.push({
          type: 'copy',
          directoryName: cmp.directoryName,
          sourceCardIndex: entry.cardIndex,
          save: entry.save,
          reason: 'Unique — only exists on this card',
        });
        break;
      }

      case 'duplicate': {
        const entry = cmp.saves[0];
        if (entry === undefined) break;
        actions.push({
          type: 'copy',
          directoryName: cmp.directoryName,
          sourceCardIndex: entry.cardIndex,
          save: entry.save,
          reason: `Duplicate — identical across ${cmp.saves.length} cards`,
        });
        break;
      }

      case 'conflict': {
        let chosenIdx: number;

        if (strategy === 'largest') {
          let largestSize = -1;
          let largestI = 0;
          for (let i = 0; i < cmp.saves.length; i++) {
            const s = cmp.saves[i];
            if (s === undefined) continue;
            if (s.save.totalSize > largestSize) { largestSize = s.save.totalSize; largestI = i; }
          }
          chosenIdx = largestI;
        } else {
          // 'newest' or 'manual' both default to recommended (most recent)
          chosenIdx = cmp.recommendedIndex ?? 0;
        }

        const entry = cmp.saves[chosenIdx];
        if (entry === undefined) break;

        const reasonMap: Record<MergeStrategy, string> = {
          newest: 'Conflict resolved by newest modification date',
          largest: 'Conflict resolved by largest file size',
          manual: 'Conflict — defaulting to newest (manual resolution needed)',
        };

        actions.push({
          type: 'copy',
          directoryName: cmp.directoryName,
          sourceCardIndex: entry.cardIndex,
          save: entry.save,
          reason: reasonMap[strategy],
        });
        break;
      }
    }
  }

  if (actions.length === 0) {
    return err({ kind: 'NO_SAVES' });
  }

  // Estimate size: sum of all save total sizes, rounded up to cluster boundaries
  const estimatedClusters = actions.reduce((acc, a) => {
    const clustersNeeded = Math.ceil(a.save.totalSize / CLUSTER_SIZE);
    return acc + clustersNeeded + 1; // +1 for the directory cluster itself
  }, 0);

  const estimatedBytes = estimatedClusters * CLUSTER_SIZE;
  const willFit = estimatedClusters <= MAX_ALLOCATABLE_CLUSTERS;

  return ok({
    actions,
    totalSaves: actions.length,
    estimatedClusters,
    estimatedBytes,
    willFit,
  });
};

// ─── Execute Merge ────────────────────────────────────────────────────────────

/**
 * Execute a merge plan and return a new card ArrayBuffer.
 */
export const executeMerge = (
  plan: MergePlan,
  cards: readonly MemoryCard[],
): Result<ArrayBuffer, MergeError> => {
  if (!plan.willFit) {
    return err({
      kind: 'CAPACITY_EXCEEDED',
      required: plan.estimatedBytes,
      available: MAX_ALLOCATABLE_CLUSTERS * CLUSTER_SIZE,
    });
  }

  return buildMergedCard(plan.actions, cards);
};
