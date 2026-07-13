/**
 * Centralized application state using Preact Signals.
 * All state lives here — components read signals directly, mutations go through actions.
 */

import { signal, computed } from '@preact/signals';
import { type MemoryCard, type SaveEntry, type MergeAction } from '../domain/types';
import { executeMerge } from '../domain/ps2mc-sync';
import { parseMemoryCard } from '../domain/ps2mc-parser';
import { downloadBuffer } from '../utils/download';

// ─── Core signals ─────────────────────────────────────────────────────────────

export const loadedCards      = signal<MemoryCard[]>([]);
export const activeCardIndex  = signal<number | null>(null);
export const selectedSave     = signal<SaveEntry | null>(null);
export const syncModalOpen    = signal(false);
export const faqModalOpen     = signal(false);
export const copySaveModalOpen = signal(false);
export const copySaveSource   = signal<{ cardIndex: number; save: SaveEntry } | null>(null);
export const confirmModalState = signal<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
}>({ isOpen: false, title: '', message: '', confirmText: 'Confirm', onConfirm: () => {} });
export const isLoading        = signal(false);
export const loadingMessage   = signal('');

// ─── Toast signal ─────────────────────────────────────────────────────────────

export interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly type: 'success' | 'error' | 'info' | 'warning';
  readonly duration: number;
}

let _toastId = 0;
export const toasts = signal<ToastItem[]>([]);

// ─── Derived (computed) signals ───────────────────────────────────────────────

export const activeCard = computed<MemoryCard | null>(() => {
  const idx = activeCardIndex.value;
  if (idx === null) return null;
  return loadedCards.value[idx] ?? null;
});

export const hasCards  = computed(() => loadedCards.value.length > 0);
export const canSync   = computed(() => loadedCards.value.length >= 2);

// ─── Actions ──────────────────────────────────────────────────────────────────

export const addCard = (card: MemoryCard): void => {
  loadedCards.value = [...loadedCards.value, card];
  // Auto-select the first card
  if (activeCardIndex.value === null) {
    activeCardIndex.value = 0;
  }
};

export const removeCard = (index: number): void => {
  const next = loadedCards.value.filter((_, i) => i !== index);
  loadedCards.value = next;

  // Adjust active index
  if (next.length === 0) {
    activeCardIndex.value = null;
    selectedSave.value    = null;
  } else if (activeCardIndex.value !== null && activeCardIndex.value >= next.length) {
    activeCardIndex.value = next.length - 1;
    selectedSave.value    = null;
  } else if (activeCardIndex.value === index) {
    selectedSave.value = null;
  }
};

export const selectCard = (index: number): void => {
  if (index === activeCardIndex.value) return;
  activeCardIndex.value = index;
  selectedSave.value    = null; // Clear selection when switching cards
};

export const selectSave = (save: SaveEntry | null): void => {
  selectedSave.value = save;
};

export const openSyncModal  = (): void => { syncModalOpen.value = true; };
export const closeSyncModal = (): void => { syncModalOpen.value = false; };

export const openFaqModal   = (): void => { faqModalOpen.value = true; };
export const closeFaqModal  = (): void => { faqModalOpen.value = false; };

export const openCopyModal  = (cardIndex: number, save: SaveEntry): void => {
  copySaveSource.value = { cardIndex, save };
  copySaveModalOpen.value = true;
};
export const closeCopyModal = (): void => {
  copySaveModalOpen.value = false;
  copySaveSource.value = null;
};

export const openConfirmModal = (title: string, message: string, confirmText: string, onConfirm: () => void): void => {
  confirmModalState.value = { isOpen: true, title, message, confirmText, onConfirm };
};
export const closeConfirmModal = (): void => {
  confirmModalState.value = { ...confirmModalState.value, isOpen: false };
};

export const setLoading = (loading: boolean, message = ''): void => {
  isLoading.value    = loading;
  loadingMessage.value = message;
};

// ─── Toast actions ────────────────────────────────────────────────────────────

export const showToast = (
  message: string,
  type: ToastItem['type'] = 'info',
  duration = 3000,
): void => {
  const id = ++_toastId;
  toasts.value = [...toasts.value, { id, message, type, duration }];
};

export const dismissToast = (id: number): void => {
  toasts.value = toasts.value.filter(t => t.id !== id);
};

export const deleteSave = (cardIndex: number, directoryName: string): void => {
  const card = loadedCards.value[cardIndex];
  if (!card) return;

  const saveToRemove = card.saves.find(s => s.directoryName === directoryName);
  if (!saveToRemove) return;

  const newSaves = card.saves.filter(s => s.directoryName !== directoryName);
  
  // Approximate used clusters for UI
  const freedClusters = Math.ceil(saveToRemove.totalSize / 1024) + 1;
  const newUsed = Math.max(0, card.usedClusters - freedClusters);
  const newFree = card.totalClusters - newUsed;

  const updatedCard = {
    ...card,
    saves: newSaves,
    usedClusters: newUsed,
    freeClusters: newFree,
    isModified: true,
  };

  const newCards = [...loadedCards.value];
  newCards[cardIndex] = updatedCard;
  loadedCards.value = newCards;

  if (selectedSave.value?.directoryName === directoryName) {
    selectedSave.value = null;
  }
  
  showToast('Save deleted from memory. Export to save changes.', 'info');
};

export const exportCard = async (cardIndex: number): Promise<void> => {
  const card = loadedCards.value[cardIndex];
  if (!card) return;

  setLoading(true, 'Exporting card...');
  // Allow UI to update
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  // Create a MergePlan with only the remaining saves from this single card
  const actions: MergeAction[] = card.saves.map(save => ({
    type: 'copy',
    directoryName: save.directoryName,
    sourceCardIndex: 0,
    save,
    reason: 'Export',
  }));

  const result = executeMerge(
    { actions, estimatedBytes: 0, estimatedClusters: 0, totalSaves: actions.length, willFit: true },
    [card]
  );

  setLoading(false);

  if (result.ok) {
    downloadBuffer(result.value, card.fileName);
    
    // Clear isModified flag
    const newCards = [...loadedCards.value];
    newCards[cardIndex] = { ...card, isModified: false };
    loadedCards.value = newCards;
    
    showToast('Card exported successfully!', 'success');
  } else {
    showToast('Error exporting card: ' + (result.error.kind === 'WRITE_ERROR' ? result.error.message : 'Unknown'), 'error', 6000);
  }
};

export const copySaveToCard = async (targetCardIndex: number): Promise<void> => {
  const sourceInfo = copySaveSource.value;
  if (!sourceInfo) return;
  
  const { cardIndex: sourceCardIndex, save } = sourceInfo;
  if (sourceCardIndex === targetCardIndex) return;

  const sourceCard = loadedCards.value[sourceCardIndex];
  const targetCard = loadedCards.value[targetCardIndex];
  if (!sourceCard || !targetCard) return;

  // Check if save exists
  if (targetCard.saves.some(s => s.directoryName === save.directoryName)) {
    showToast(`Save "${save.gameTitle}" already exists on target card.`, 'warning');
    return;
  }

  setLoading(true, 'Copying save...');
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  try {
    const actions: MergeAction[] = [
      ...targetCard.saves.map(s => ({
        type: 'copy' as const,
        directoryName: s.directoryName,
        sourceCardIndex: 0,
        save: s,
        reason: 'existing'
      })),
      {
        type: 'copy' as const,
        directoryName: save.directoryName,
        sourceCardIndex: 1,
        save: save,
        reason: 'copied'
      }
    ];

    const result = executeMerge(
      { actions, estimatedBytes: 0, estimatedClusters: 0, totalSaves: actions.length, willFit: true },
      [targetCard, sourceCard]
    );

    if (!result.ok) {
      showToast('Error copying save: ' + (result.error.kind === 'WRITE_ERROR' ? result.error.message : 'Capacity exceeded'), 'error', 6000);
      return;
    }

    // Parse the new buffer to get exact clusters and valid state
    const parseResult = parseMemoryCard(result.value, targetCard.fileName);
    if (!parseResult.ok) {
      showToast('Error parsing new card buffer.', 'error');
      return;
    }

    // Replace target card with newly parsed card and mark as modified
    const newTargetCard = { ...parseResult.value, isModified: true };
    const newCards = [...loadedCards.value];
    newCards[targetCardIndex] = newTargetCard;
    loadedCards.value = newCards;

    showToast(`Save "${save.gameTitle}" copied successfully!`, 'success');
    closeCopyModal();
  } finally {
    setLoading(false);
  }
};
