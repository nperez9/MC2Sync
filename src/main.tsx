import { render } from 'preact';
import { App } from './app';
import './styles/main.css';

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');
render(<App />, root);
