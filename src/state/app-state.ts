/**
 * Centralized application state using Preact Signals.
 * All state lives here — components read signals directly, mutations go through actions.
 */

import { signal, computed } from '@preact/signals';
import { type MemoryCard, type SaveEntry } from '../domain/types';

// ─── Core signals ─────────────────────────────────────────────────────────────

export const loadedCards      = signal<MemoryCard[]>([]);
export const activeCardIndex  = signal<number | null>(null);
export const selectedSave     = signal<SaveEntry | null>(null);
export const syncModalOpen    = signal(false);
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
