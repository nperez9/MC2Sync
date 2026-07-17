import { type FunctionComponent } from 'preact';
import { confirmModalState, closeConfirmModal } from '../state/app-state';

export const ConfirmModal: FunctionComponent = () => {
  const state = confirmModalState.value;
  if (!state.isOpen) return null;

  return (
    <div class="sync-modal" role="dialog" aria-modal="true" aria-label={state.title}>
      <div class="modal-content glass-panel" style={{ maxWidth: '400px' }}>
        <div class="modal-header">
          <h2>{state.title}</h2>
          <button class="btn-icon btn-close-modal" onClick={closeConfirmModal} aria-label="Close modal">×</button>
        </div>
        
        <div class="modal-body">
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            {state.message}
          </p>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn-secondary" onClick={closeConfirmModal}>
            Cancel
          </button>
          <button 
            class="btn btn-danger" 
            onClick={() => {
              state.onConfirm();
              closeConfirmModal();
            }}
          >
            {state.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
