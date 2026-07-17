/**
 * loadDemoCards — fetches the two bundled demo memory cards from /demo/*
 * and loads them into app state exactly like a user drag-drop would.
 */

import { parseMemoryCard } from '../domain/ps2mc-parser';
import { addCard, setLoading, showToast } from '../state/app-state';

const DEMO_CARDS = [
  { url: '/demo/Mcd001.ps2',  name: 'Mcd001.ps2'  },
  { url: '/demo/NFS_MW.ps2',  name: 'NFS MW.ps2'  },
] as const;

export const loadDemoCards = async (): Promise<void> => {
  setLoading(true, 'Loading demo cards…');

  const results = await Promise.allSettled(
    DEMO_CARDS.map(async ({ url, name }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${name} (${response.status})`);
      const buffer = await response.arrayBuffer();
      const result = parseMemoryCard(buffer, name);
      if (!result.ok) {
        const e = result.error;
        const msg =
          e.kind === 'INVALID_SIZE'  ? `Invalid size (${e.actual}B, expected ${e.expected}B)` :
          e.kind === 'INVALID_MAGIC' ? `Bad magic string: "${e.actual}"` :
          'Parse failed';
        throw new Error(`"${name}": ${msg}`);
      }
      return result.value;
    }),
  );

  setLoading(false);

  let loaded = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      addCard(r.value);
      loaded++;
    } else {
      showToast(r.reason instanceof Error ? r.reason.message : String(r.reason), 'error', 6000);
    }
  }

  if (loaded > 0) {
    showToast(`Demo loaded — ${loaded} memory card${loaded > 1 ? 's' : ''} ready!`, 'success', 4000);
  }
};
