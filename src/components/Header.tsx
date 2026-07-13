import { type FunctionComponent } from 'preact';
import { openFaqModal } from '../state/app-state';

const isDemo = window.location.pathname.replace(/\/$/, '') === '/demo';

export const Header: FunctionComponent = () => (
  <header class="app-header">
    <div class="logo-container">
      <h1 class="logo-text">MC2Sync</h1>
      <span class="subtitle">PS2 Memory Card Manager</span>
    </div>
    {isDemo && (
      <div style={{
        marginLeft: '16px',
        padding: '4px 12px',
        borderRadius: '999px',
        background: 'rgba(99,102,241,0.2)',
        border: '1px solid rgba(99,102,241,0.5)',
        color: 'var(--primary)',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em'
      }}>
        DEMO MODE
      </div>
    )}
    <div style={{ marginLeft: 'auto' }}>
      <button class="btn btn-secondary" onClick={openFaqModal}>
        FAQ / Help
      </button>
    </div>
  </header>
);
