import { PS2MemoryCardSync } from '../lib/ps2mc-sync.js';

export class SyncPanel {
  constructor(modalId, options) {
    this.modal = document.getElementById(modalId);
    this.body = document.getElementById(`${modalId}-body`);
    this.options = options || {};
    
    this.currentPlan = null;
    this.cards = [];

    // Bind events
    const closeBtns = this.modal.querySelectorAll('.btn-close-modal');
    closeBtns.forEach(btn => btn.addEventListener('click', () => this.hide()));
    
    const executeBtn = document.getElementById('btn-execute-merge');
    if (executeBtn) {
      executeBtn.addEventListener('click', () => this._executeMerge());
    }
  }

  show(cards) {
    if (!cards || cards.length < 2) return;
    this.cards = cards;
    
    // Generate plan
    this.currentPlan = PS2MemoryCardSync.generateMergePlan(cards, { strategy: 'newest' });
    const comparison = PS2MemoryCardSync.compareSaves(cards);
    
    this._render(comparison, this.currentPlan);
    this.modal.classList.remove('hidden');
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  _render(comparison, plan) {
    const totalMB = (plan.estimatedSize / 1024 / 1024).toFixed(2);
    const capacityMB = 8.00;
    const usagePercent = Math.min(100, (plan.estimatedSize / (8*1024*1024)) * 100);
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px;">
        <div>
          <h3 style="margin-bottom: 8px;">Merge Preview</h3>
          <p style="color: var(--text-secondary); font-size: 0.875rem;">
            Resolving saves from ${this.cards.length} memory cards.
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600; font-size: 1.25rem; color: ${plan.fitsOnCard ? 'var(--success)' : 'var(--error)'};">
            ${totalMB} / ${capacityMB} MB
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Estimated Final Size</div>
        </div>
      </div>
      
      <div class="usage-bar-container" style="margin-bottom: 32px; background: var(--bg-surface);">
        <div class="usage-bar-fill" style="width: ${usagePercent}%; background: ${plan.fitsOnCard ? 'linear-gradient(90deg, var(--primary), var(--secondary))' : 'var(--error)'};"></div>
      </div>
    `;

    if (!plan.fitsOnCard) {
      html += `
        <div style="padding: 16px; background: rgba(255, 82, 82, 0.1); border: 1px solid rgba(255, 82, 82, 0.2); border-radius: var(--radius-sm); color: var(--error); margin-bottom: 24px; display: flex; gap: 12px; align-items: center;">
          <span style="font-size: 1.5rem;">⚠️</span>
          <div>
            <strong>Warning: Card Size Exceeded</strong><br/>
            The merged saves exceed the standard 8MB capacity of a PS2 memory card.
          </div>
        </div>
      `;
    }

    // Stats
    html += `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px;">
        <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-sm); text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">${comparison.unique.length}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Unique Saves</div>
        </div>
        <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-sm); text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--secondary);">${comparison.duplicates.length}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Exact Duplicates</div>
        </div>
        <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-sm); text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning);">${comparison.conflicts.length}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Conflicts Resolved</div>
        </div>
      </div>
    `;

    // Action list
    html += `<h4 style="margin-bottom: 12px; color: var(--text-secondary);">Merge Actions</h4>
             <div style="display: flex; flex-direction: column; gap: 8px;">`;
             
    plan.saves.forEach(s => {
      let icon = '🟢';
      if (s.reason.includes('Duplicate')) icon = '🟡';
      if (s.reason.includes('Conflict')) icon = '🔴';
      
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-surface); border-radius: var(--radius-sm);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span>${icon}</span>
            <span style="font-family: monospace;">${s.saveName}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            from ${s.sourceCard.filename}
          </div>
        </div>
      `;
    });
    
    html += `</div>`;

    this.body.innerHTML = html;
    
    const executeBtn = document.getElementById('btn-execute-merge');
    if (executeBtn) {
      executeBtn.disabled = !plan.fitsOnCard; // For safety, disable if it won't fit
    }
  }

  _executeMerge() {
    if (!this.currentPlan) return;
    
    // Show loading state
    const btn = document.getElementById('btn-execute-merge');
    const originalText = btn.textContent;
    btn.textContent = 'Merging...';
    btn.disabled = true;
    
    // Use timeout to allow UI to update
    setTimeout(() => {
      try {
        const mergedBuffer = PS2MemoryCardSync.executeMerge(this.currentPlan);
        if (this.options.onMergeComplete) {
          this.options.onMergeComplete(mergedBuffer);
        }
        this.hide();
      } catch (err) {
        console.error(err);
        alert('Failed to merge cards: ' + err.message);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }, 100);
  }
}
