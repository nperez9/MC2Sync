/**
 * PS2 Memory Card Sync
 * Compare, merge, and synchronize saves across multiple PS2 memory cards.
 */

import { PS2MemoryCard } from './ps2mc-parser.js';
import { PS2MemoryCardWriter } from './ps2mc-writer.js';

/**
 * @typedef {Object} SaveComparison
 * @property {Array<{card: PS2MemoryCard, save: Object}>} unique - Saves that exist on only one card
 * @property {Array<{cards: PS2MemoryCard[], save: Object}>} duplicates - Identical saves across cards
 * @property {Array<{cards: PS2MemoryCard[], save: Object, winner: {card: PS2MemoryCard, save: Object}}>} conflicts - Same name, different content
 */

/**
 * @typedef {Object} MergePlan
 * @property {Array<{saveName: string, sourceCard: PS2MemoryCard, reason: string}>} saves - Saves to include
 * @property {number} estimatedSize - Estimated total size in bytes
 * @property {boolean} fitsOnCard - Whether all saves fit on a single card
 */

export class PS2MemoryCardSync {
  /**
   * Compare saves across multiple cards.
   *
   * Duplicate detection: Same directory name AND same total file sizes = duplicate.
   * Conflict detection: Same directory name, different content (different file sizes or different data).
   *
   * @param {PS2MemoryCard[]} cards - Array of parsed memory cards
   * @returns {SaveComparison} Comparison result
   */
  static compareSaves(cards) {
    if (!cards || cards.length === 0) {
      return { unique: [], duplicates: [], conflicts: [] };
    }

    // Build a map of save name -> [{card, saveEntry, totalSize, fileSizes}]
    const saveMap = new Map();

    for (const card of cards) {
      const saves = card.getSaveEntries();

      for (const save of saves) {
        const key = save.name;

        // Calculate total file sizes and individual file sizes for comparison
        const fileSizes = save.files
          .map(f => ({ name: f.name, size: f.size }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const totalSize = save.files.reduce((sum, f) => sum + f.size, 0);

        if (!saveMap.has(key)) {
          saveMap.set(key, []);
        }
        saveMap.get(key).push({
          card,
          save,
          totalSize,
          fileSizes,
          fileSizeFingerprint: JSON.stringify(fileSizes),
        });
      }
    }

    const unique = [];
    const duplicates = [];
    const conflicts = [];

    for (const [name, entries] of saveMap) {
      if (entries.length === 1) {
        // Only exists on one card
        unique.push({
          card: entries[0].card,
          save: entries[0].save,
        });
      } else {
        // Check if all entries are identical (same file sizes)
        const firstFingerprint = entries[0].fileSizeFingerprint;
        const allSame = entries.every(e => e.fileSizeFingerprint === firstFingerprint);

        if (allSame) {
          // Duplicate: same name and same file sizes
          duplicates.push({
            cards: entries.map(e => e.card),
            save: entries[0].save,
          });
        } else {
          // Conflict: same name, different content
          // Determine winner based on most recent modification time
          let winner = entries[0];
          for (let i = 1; i < entries.length; i++) {
            if (entries[i].save.modified > winner.save.modified) {
              winner = entries[i];
            }
          }

          conflicts.push({
            cards: entries.map(e => e.card),
            save: entries[0].save,
            winner: {
              card: winner.card,
              save: winner.save,
            },
          });
        }
      }
    }

    return { unique, duplicates, conflicts };
  }

  /**
   * Generate a merge plan from multiple cards.
   * @param {PS2MemoryCard[]} cards - Array of parsed memory cards
   * @param {Object} options - Merge options
   * @param {string} options.strategy - 'newest' | 'largest' | 'manual'
   * @returns {MergePlan} Merge plan
   */
  static generateMergePlan(cards, options = { strategy: 'newest' }) {
    const comparison = PS2MemoryCardSync.compareSaves(cards);
    const saves = [];
    const strategy = options.strategy || 'newest';

    // Add all unique saves
    for (const { card, save } of comparison.unique) {
      saves.push({
        saveName: save.name,
        sourceCard: card,
        reason: 'Unique save - only exists on this card',
      });
    }

    // Add one copy of each duplicate (prefer first card)
    for (const { cards: dupCards, save } of comparison.duplicates) {
      saves.push({
        saveName: save.name,
        sourceCard: dupCards[0],
        reason: `Duplicate save - identical across ${dupCards.length} cards`,
      });
    }

    // Resolve conflicts based on strategy
    for (const { cards: conflictCards, save, winner } of comparison.conflicts) {
      let selectedCard;
      let reason;

      switch (strategy) {
        case 'newest': {
          selectedCard = winner.card;
          reason = 'Conflict resolved by newest modification date';
          break;
        }
        case 'largest': {
          let largest = null;
          let largestSize = -1;

          for (const card of conflictCards) {
            const cardSaves = card.getSaveEntries();
            const matchingSave = cardSaves.find(s => s.name === save.name);
            if (matchingSave && matchingSave.size > largestSize) {
              largestSize = matchingSave.size;
              largest = card;
            }
          }

          selectedCard = largest || conflictCards[0];
          reason = 'Conflict resolved by largest file size';
          break;
        }
        case 'manual':
        default: {
          selectedCard = winner.card;
          reason = 'Conflict requires manual resolution (defaulting to newest)';
          break;
        }
      }

      saves.push({
        saveName: save.name,
        sourceCard: selectedCard,
        reason,
      });
    }

    // Calculate estimated size
    let estimatedSize = 0;
    for (const { saveName, sourceCard } of saves) {
      const saveEntries = sourceCard.getSaveEntries();
      const matchingSave = saveEntries.find(s => s.name === saveName);
      if (matchingSave) {
        estimatedSize += matchingSave.size;
      }
    }

    // PS2 memory card usable space is approximately 8MB
    const MAX_USABLE_SPACE = 8 * 1024 * 1024;
    const fitsOnCard = estimatedSize <= MAX_USABLE_SPACE;

    return {
      saves,
      estimatedSize,
      fitsOnCard,
    };
  }

  /**
   * Execute a merge plan to create a new card with all specified saves.
   * @param {MergePlan} mergePlan - The merge plan to execute
   * @returns {ArrayBuffer} New card buffer containing all merged saves
   */
  static executeMerge(mergePlan) {
    const savesToCopy = mergePlan.saves.map(({ saveName, sourceCard }) => ({
      sourceCard,
      saveName,
    }));

    return PS2MemoryCardWriter.buildMergedCard(savesToCopy);
  }
}
