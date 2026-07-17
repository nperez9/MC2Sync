/**
 * useMemoryCard — orchestrates the file → parse → store flow.
 */

import { parseMemoryCard } from '../domain/ps2mc-parser';
import {
  addCard,
  setLoading,
  showToast,
} from '../state/app-state';

export const useMemoryCard = () => {
  const handleFiles = async (files: File[]): Promise<void> => {
    setLoading(true, `Loading ${files.length} card${files.length > 1 ? 's' : ''}…`);

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const result = parseMemoryCard(buffer, file.name);
        if (!result.ok) {
          const e = result.error;
          switch (e.kind) {
            case 'INVALID_SIZE':
              throw new Error(`"${file.name}": invalid size (${e.actual} bytes, expected ${e.expected})`);
            case 'INVALID_MAGIC':
              throw new Error(`"${file.name}": not a valid PS2 memory card (bad magic string)`);
            default:
              throw new Error(`"${file.name}": parse failed`);
          }
        }
        return result.value;
      }),
    );

    setLoading(false);

    let successCount = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        addCard(result.value);
        successCount++;
      } else {
        showToast(result.reason instanceof Error ? result.reason.message : String(result.reason), 'error', 5000);
      }
    }

    if (successCount > 0) {
      showToast(
        `${successCount} card${successCount > 1 ? 's' : ''} loaded — ${results.filter(r => r.status === 'fulfilled').flatMap(r => r.status === 'fulfilled' ? [r.value.saves.length] : []).reduce((a, b) => a + b, 0)} saves found`,
        'success',
      );
    }
  };

  return { handleFiles };
};
