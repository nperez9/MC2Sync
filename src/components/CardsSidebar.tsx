import { type FunctionComponent } from 'preact';
import { useRef } from 'preact/hooks';
import {
  loadedCards,
  activeCardIndex,
  selectCard,
  removeCard,
  canSync,
  openSyncModal,
  showToast,
  openConfirmModal,
} from '../state/app-state';
import { formatSize } from '../utils/format';
import { useMemoryCard } from '../hooks/use-memory-card';
import { useFileDrop } from '../hooks/use-file-drop';

export const CardsSidebar: FunctionComponent = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleFiles } = useMemoryCard();

  const { dropRef } = useFileDrop({
    onFiles: handleFiles,
    onError: (msg) => showToast(msg, 'error', 5000),
  });

  const onLoadMoreClick = (): void => { fileInputRef.current?.click(); };

  const onInputChange = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      handleFiles(Array.from(input.files));
      input.value = '';
    }
  };

  const cards = loadedCards.value;

  return (
    <aside
      ref={dropRef}
      id="cards-sidebar"
      class="cards-sidebar"
      aria-label="Loaded memory cards"
    >
      <h3 class="sidebar-title">Loaded Cards</h3>

      <div id="cards-list" class="cards-list">
        {cards.map((card, index) => {
          const usedPct = card.totalClusters > 0
            ? Math.round((card.usedClusters / card.totalClusters) * 100)
            : 0;

          return (
            <div
              key={card.fileName + index}
              class={`card-item${activeCardIndex.value === index ? ' active' : ''}`}
              onClick={() => selectCard(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && selectCard(index)}
              aria-selected={activeCardIndex.value === index}
            >
              <div class="card-item-title">
                <span>{card.fileName}</span>
                <button
                  class="btn-icon"
                  style="width:20px;height:20px;font-size:0.75rem;"
                  title="Close card"
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfirmModal(
                      'Close Card',
                      `Are you sure you want to close "${card.fileName}"? Any unsaved changes will be lost.`,
                      'Close Card',
                      () => removeCard(index)
                    );
                  }}
                  aria-label="Close card"
                >
                  ×
                </button>
              </div>
              <div class="card-item-subtitle">
                {card.saves.length} saves · {formatSize(card.usedClusters * 1024)} used
              </div>
              <div class="usage-bar-container" title={`${usedPct}% used`}>
                <div
                  class="usage-bar-fill"
                  style={{ width: `${usedPct}%` }}
                  role="progressbar"
                  aria-valuenow={usedPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div class="sidebar-footer" style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".ps2,.bin,.mcd"
          class="hidden-input"
          onChange={onInputChange}
        />
        <button
          id="btn-load-more"
          class="btn btn-secondary w-full"
          onClick={onLoadMoreClick}
          type="button"
        >
          Load Another Card
        </button>
        <button
          id="btn-sync-all"
          class="btn btn-secondary w-full"
          disabled={!canSync.value}
          onClick={openSyncModal}
          type="button"
          title={canSync.value ? 'Sync and merge cards' : 'Load at least 2 cards to sync'}
        >
          Sync Cards
        </button>
      </div>
    </aside>
  );
};
