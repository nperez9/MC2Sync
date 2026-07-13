import { type FunctionComponent } from 'preact';
import { faqModalOpen, closeFaqModal } from '../state/app-state';

export const FaqModal: FunctionComponent = () => {
  if (!faqModalOpen.value) return null;

  return (
    <div class="sync-modal" role="dialog" aria-modal="true" aria-label="FAQ & Help">
      <div class="modal-content glass-panel" style={{ maxWidth: '700px' }}>
        <div class="modal-header">
          <h2>How MC2Sync Works 🎮</h2>
          <button class="btn-icon btn-close-modal" onClick={closeFaqModal} aria-label="Close modal">×</button>
        </div>

        <div class="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>What is MC2Sync?</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              MC2Sync is a fast, web-based tool for managing PlayStation 2 virtual memory card files (e.g., <code>.ps2</code>, <code>.bin</code>). 
              It runs entirely in your browser, which means your save files never leave your computer.
            </p>
          </div>

          <div>
            <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>How do I sync multiple cards?</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              1. Drag and drop two or more memory card files into the app.<br/>
              2. Click <strong>"Sync Cards"</strong> in the sidebar.<br/>
              3. The app will compare all saves. Unique saves are kept, exact duplicates are merged, and for conflicts (same game, different saves), it automatically picks the newest one.<br/>
              4. Click <strong>"Merge & Download"</strong> to get a single, combined memory card!
            </p>
          </div>

          <div>
            <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>How do I delete saves?</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Click on a save from the list to open the Inspector on the right. At the bottom of the Inspector, click <strong>"Delete Save"</strong>. 
              Once you delete saves, an <strong>"Export Modified Card"</strong> button will appear at the top to download the updated memory card.
            </p>
          </div>

          <div>
            <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>Is this compatible with PCSX2?</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Yes! The exported cards are standard 8MB PS2 memory cards, perfectly compatible with PCSX2, AetherSX2, and other emulators that support <code>.ps2</code>/<code>.bin</code> files.
            </p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" onClick={closeFaqModal} type="button">Got it!</button>
        </div>
      </div>
    </div>
  );
};
