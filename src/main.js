import { PS2MemoryCard } from './lib/ps2mc-parser.js';
import { PS2MemoryCardSync } from './lib/ps2mc-sync.js';
import { PS2MemoryCardWriter } from './lib/ps2mc-writer.js';
import { CardLoader } from './components/card-loader.js';
import { CardViewer } from './components/card-viewer.js';
import { CardInspector } from './components/card-inspector.js';
import { SyncPanel } from './components/sync-panel.js';
import { Toast } from './components/toast.js';
import './styles/main.css';

class MC2SyncApp {
  constructor() {
    this.loadedCards = []; 
    this.activeCard = null;
    this.init();
  }
  
  init() {
    this.loader = new CardLoader('card-loader-container', this.handleFilesLoaded.bind(this));
    this.loader.render();

    this.viewer = new CardViewer('card-viewer', {
      onSaveSelect: this.handleSaveSelect.bind(this),
      onSyncClick: this.handleSync.bind(this)
    });

    this.inspector = new CardInspector('inspector-panel', {
      onClose: () => this.viewer.deselectAll()
    });
    
    this.syncPanel = new SyncPanel('sync-modal', {
      onMergeComplete: this.handleMergeComplete.bind(this)
    });

    document.getElementById('btn-sync-all').addEventListener('click', () => this.handleSync());
    document.getElementById('btn-load-more').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
  }
  
  async handleFilesLoaded(files, errors) {
    if (errors && errors.length > 0) {
      errors.forEach(err => Toast.show(err, 'error'));
    }

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const card = PS2MemoryCard.parse(buffer, file.name);
        this.loadedCards.push(card);
        Toast.show(`Loaded ${file.name} successfully`, 'success');
      } catch (err) {
        console.error(err);
        Toast.show(`Failed to parse ${file.name}: ${err.message}`, 'error');
      }
    }

    if (this.loadedCards.length > 0) {
      this.loader.hide();
      this.renderSidebar();
      if (!this.activeCard) {
        this.switchCard(0);
      }
    }
  }
  
  renderSidebar() {
    const sidebar = document.getElementById('cards-sidebar');
    const list = document.getElementById('cards-list');
    sidebar.classList.remove('hidden');
    
    list.innerHTML = '';
    
    this.loadedCards.forEach((card, index) => {
      const item = document.createElement('div');
      item.className = `card-item ${this.activeCard === card ? 'active' : ''}`;
      
      const usagePercent = Math.round((card.usedSpace / card.totalSpace) * 100);
      
      item.innerHTML = `
        <div class="card-item-title">
          <span>${card.filename}</span>
          <span>${card.entries.length} saves</span>
        </div>
        <div class="card-item-subtitle">${(card.usedSpace/1024/1024).toFixed(2)} MB used</div>
        <div class="usage-bar-container">
          <div class="usage-bar-fill" style="width: ${usagePercent}%"></div>
        </div>
      `;
      
      item.addEventListener('click', () => this.switchCard(index));
      list.appendChild(item);
    });

    const syncBtn = document.getElementById('btn-sync-all');
    if (this.loadedCards.length >= 2) {
      syncBtn.disabled = false;
      syncBtn.classList.add('btn-primary');
      syncBtn.classList.remove('btn-secondary');
    } else {
      syncBtn.disabled = true;
      syncBtn.classList.remove('btn-primary');
      syncBtn.classList.add('btn-secondary');
    }
  }
  
  switchCard(index) {
    this.activeCard = this.loadedCards[index];
    this.renderSidebar();
    
    const mainContent = document.getElementById('main-content');
    mainContent.classList.remove('hidden');
    
    this.inspector.hide();
    this.viewer.render(this.activeCard);
  }
  
  handleSaveSelect(save) {
    this.inspector.show(save, this.activeCard);
  }
  
  handleSync() {
    this.syncPanel.show(this.loadedCards);
  }
  
  handleMergeComplete(mergedBuffer) {
    // Trigger download
    const blob = new Blob([mergedBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Merged-MemoryCard.ps2';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    Toast.show('Memory card merged and downloaded successfully!', 'success', 5000);
  }
}

new MC2SyncApp();
