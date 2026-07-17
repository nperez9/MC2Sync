import { type FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { copySaveModalOpen, closeCopyModal, copySaveSource, loadedCards, copySaveToCard } from '../state/app-state';

export const CopySaveModal: FunctionComponent = () => {
  if (!copySaveModalOpen.value || !copySaveSource.value) return null;

  const { cardIndex: sourceIndex, save } = copySaveSource.value;
  const cards = loadedCards.value;

  // Filter out the source card
  const availableTargets = cards.map((card, index) => ({ card, index })).filter(item => item.index !== sourceIndex);

  const [selectedTarget, setSelectedTarget] = useState<number>(availableTargets[0]?.index ?? -1);

  const handleCopy = () => {
    if (selectedTarget === -1) return;
    void copySaveToCard(selectedTarget);
  };

  return (
    <div class="sync-modal" role="dialog" aria-modal="true" aria-label="Copy Save">
      <div class="modal-content glass-panel" style={{ maxWidth: '500px' }}>
        <div class="modal-header">
          <h2>Copy Save</h2>
          <button class="btn-icon btn-close-modal" onClick={closeCopyModal} aria-label="Close modal">×</button>
        </div>

        <div class="modal-body">
          <p style={{ marginBottom: '16px' }}>
            Copying <strong>{save.gameTitle}</strong> to another card.
          </p>

          {availableTargets.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>You need to load at least one more memory card to copy this save.</p>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Select Destination Card:
              </label>
              <select 
                class="copy-select"
                value={selectedTarget} 
                onChange={(e) => setSelectedTarget(Number((e.target as HTMLSelectElement).value))}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '1rem'
                }}
              >
                {availableTargets.map(({ card, index }) => (
                  <option key={index} value={index}>{card.fileName}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onClick={closeCopyModal} type="button">Cancel</button>
          <button 
            class="btn btn-primary" 
            onClick={handleCopy} 
            disabled={availableTargets.length === 0 || selectedTarget === -1}
          >
            Copy Save
          </button>
        </div>
      </div>
    </div>
  );
};
