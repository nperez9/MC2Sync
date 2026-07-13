import { render } from 'preact';
import { App } from './app';
import { loadDemoCards } from './hooks/use-demo-loader';
import './styles/main.css';

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');
render(<App />, root);

// Auto-load demo cards when the URL path is /demo or /demo/
const path = window.location.pathname.replace(/\/$/, '');
if (path === '/demo') {
  void loadDemoCards();
}
