import { type FunctionComponent } from 'preact';
import { openFaqModal } from '../state/app-state';

export const Header: FunctionComponent = () => (
  <header class="app-header">
    <div class="logo-container">
      <h1 class="logo-text">MC2Sync</h1>
      <span class="subtitle">PS2 Memory Card Manager</span>
    </div>
    <div style={{ marginLeft: 'auto' }}>
      <button class="btn btn-secondary" onClick={openFaqModal}>
        FAQ / Help
      </button>
    </div>
  </header>
);
