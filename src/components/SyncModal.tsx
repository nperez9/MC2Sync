import { type FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import {
  loadedCards,
  syncModalOpen,
  closeSyncModal,
  showToast,
} from '../state/app-state';
import { compareSaves, generateMergePlan, executeMerge } from '../domain/ps2mc-sync';
import { downloadBuffer } from '../utils/download';
import { formatSize } from '../utils/format';

const STATUS_EMOJI: Record<string, string> = {
  unique:    '🟢',
  duplicate: '🟡',
  conflict:  '🔴',
};

const STATUS_LABEL: Record<string, string> = {
  unique:    'Unique',
  duplicate: 'Duplicate',
  conflict:  'Conflict',
};

export const SyncModal: FunctionComponent = () => {
  const [isMerging, setIsMerging] = useState(false);

  if (!syncModalOpen.value) return null;

  const cards = loadedCards.value;
  const comparison = compareSaves(cards);
  const planResult = generateMergePlan(cards, 'newest');

  const handleMerge = async (): Promise<void> => {
    if (!planResult.ok) return;
    setIsMerging(true);

    // Defer to next frame so UI updates before heavy work
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const result = executeMerge(planResult.value, cards);

    setIsMerging(false);

    if (!result.ok) {
      const e = result.error;
      const msg = e.kind === 'CAPACITY_EXCEEDED'
        ? `Merge exceeds card capacity (${formatSize(e.required)} needed, ${formatSize(e.available)} available)`
        : e.kind === 'NO_SAVES'
        ? 'No saves to merge'
        : e.message;
      showToast(msg, 'error', 6000);
      return;
    }

    closeSyncModal();
    downloadBuffer(result.value, 'merged_card.ps2');
    showToast('Merged card downloaded!', 'success');
  };

  const plan = planResult.ok ? planResult.value : null;
  const capacityPct = plan
    ? Math.min(100, Math.round((plan.estimatedClusters / 8176) * 100))
    : 0;

  return (
    <div id="sync-modal" class="sync-modal" role="dialog" aria-modal="true" aria-label="Sync & Merge Cards">
      <div class="modal-content glass-panel">
        <div class="modal-header">
          <h2>Sync &amp; Merge Cards</h2>
          <button class="btn-icon btn-close-modal" onClick={closeSyncModal} aria-label="Close modal">×</button>
        </div>

        <div class="modal-body" id="sync-modal-body">
          {/* Capacity */}
          {plan && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Estimated usage</span>
                <span style={{ fontWeight: 600 }}>{formatSize(plan.estimatedBytes)}</span>
              </div>
              <div class="usage-bar-container">
                <div
                  class="usage-bar-fill"
                  style={{ width: `${capacityPct}%`, background: plan.willFit ? undefined : 'var(--error)' }}
                />
              </div>
              {!plan.willFit && (
                <p style={{ color: 'var(--error)', fontSize: '0.875rem', marginTop: '8px' }}>
                  ⚠️ Merged saves exceed card capacity
                </p>
              )}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Unique', count: comparison.uniqueCount, emoji: '🟢' },
              { label: 'Duplicates', count: comparison.duplicateCount, emoji: '🟡' },
              { label: 'Conflicts', count: comparison.conflictCount, emoji: '🔴' },
            ].map(({ label, count, emoji }) => (
              <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center', border: '1px solid var(--border-glass)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{emoji}</div>
                <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{count}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Save list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {comparison.comparisons.map((cmp) => (
              <div
                key={cmp.directoryName}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)' }}
              >
                <div>
                  <span style={{ marginRight: '8px' }}>{STATUS_EMOJI[cmp.status]}</span>
                  <span style={{ fontWeight: 600 }}>{cmp.saves[0]?.save.gameTitle ?? cmp.directoryName}</span>
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{cmp.directoryName}</span>
                </div>
                <span class={`badge ${cmp.status === 'unique' ? 'badge-success' : cmp.status === 'conflict' ? '' : 'badge-warning'}`}
                  style={cmp.status === 'conflict' ? { background: 'rgba(255,82,82,0.15)', color: 'var(--error)' } : {}}>
                  {STATUS_LABEL[cmp.status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary btn-close-modal" onClick={closeSyncModal} type="button">Cancel</button>
          <button
            class="btn btn-primary"
            id="btn-execute-merge"
            disabled={isMerging || !plan?.willFit}
            onClick={() => void handleMerge()}
            type="button"
          >
            {isMerging ? 'Merging…' : 'Merge & Download'}
          </button>
        </div>
      </div>
    </div>
  );
};
