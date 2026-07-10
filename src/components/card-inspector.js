import { lookupGame, getRegion } from '../lib/game-database.js';
import { PS2IconParser } from '../lib/ps2-icon-parser.js';
import { IconRenderer } from './icon-renderer.js';

export class CardInspector {
  constructor(containerId, options) {
    this.container = document.getElementById(containerId);
    this.options = options || {};
    this.renderer = null;
  }

  show(save, memoryCard) {
    const gameInfo = lookupGame(save.name);
    const title = save.title || (gameInfo ? gameInfo.title : 'Unknown Game');
    const region = gameInfo ? gameInfo.region : getRegion(save.name);
    const regionClass = `badge-${region.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    const sizeKB = (save.size / 1024).toFixed(2);
    
    // Format dates
    const formatDate = (dateObj) => {
      if (!dateObj || isNaN(dateObj.getTime())) return 'Unknown';
      return dateObj.toLocaleString(undefined, { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    };

    let html = `
      <button id="btn-close-inspector" class="btn-icon" style="position: absolute; top: 16px; right: 16px; z-index: 100; font-size: 1.5rem; width: 32px; height: 32px; color: var(--text-secondary); background: rgba(0,0,0,0.3); border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">×</button>
      <div style="padding: 24px 24px 0 24px;">
        <div id="icon-3d-container" style="width: 100%; height: 200px; border-radius: 8px; background: rgba(0,0,0,0.2); overflow: hidden; display: flex; align-items: center; justify-content: center;">
          <span id="icon-3d-placeholder" style="color: var(--text-muted);">Loading 3D Icon...</span>
        </div>
      </div>
      <div class="inspector-header">
        <h3 style="font-family: var(--font-display); font-size: 1.25rem; margin-bottom: 4px;">${title}</h3>
        <div style="font-family: monospace; color: var(--text-secondary); margin-bottom: 12px;">${save.name}</div>
        <span class="badge ${regionClass}">${region}</span>
      </div>
      
      <div class="inspector-body">
        <div class="detail-group">
          <span class="detail-label">Total Size</span>
          <span class="detail-value" style="font-weight: 600; color: var(--primary);">${sizeKB} KB</span>
        </div>
        
        <div class="detail-group">
          <span class="detail-label">Created</span>
          <span class="detail-value">${formatDate(save.created)}</span>
        </div>
        
        <div class="detail-group">
          <span class="detail-label">Modified</span>
          <span class="detail-value">${formatDate(save.modified)}</span>
        </div>
        
        <div class="detail-group">
          <span class="detail-label">Mode Flags</span>
          <span class="detail-value" style="font-family: monospace;">0x${save.mode.toString(16).toUpperCase().padStart(4, '0')}</span>
        </div>
        
        <div class="detail-group">
          <span class="detail-label">Internal Files (${save.files.length})</span>
          <div class="file-list">
    `;

    save.files.forEach(file => {
      html += `
        <div class="file-item">
          <span style="color: var(--text-primary);">${file.name}</span>
          <span style="color: var(--text-muted);">${file.size} B</span>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.container.classList.remove('hidden');

    const closeBtn = this.container.querySelector('#btn-close-inspector');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide();
        if (this.options.onClose) {
          this.options.onClose();
        }
      });
    }

    // Setup 3D renderer
    let iconFile = null;
    for (const file of save.files) {
      if (file.name.endsWith('.icn') || file.name.endsWith('.ico')) {
        iconFile = file;
        break;
      }
    }

    if (this.renderer) {
      this.renderer.clear();
    }
    
    if (iconFile) {
      setTimeout(() => {
        try {
          const iconData = memoryCard.readFileData(iconFile);
          const parsedIcon = PS2IconParser.parse(iconData);
          document.getElementById('icon-3d-placeholder').style.display = 'none';
          this.renderer = new IconRenderer('icon-3d-container');
          this.renderer.loadIcon(parsedIcon);
        } catch (err) {
          console.error("Failed to parse or render 3D icon:", err);
          document.getElementById('icon-3d-placeholder').innerText = "Failed to load icon";
        }
      }, 10);
    } else {
      document.getElementById('icon-3d-placeholder').innerText = "No 3D Icon found";
    }
  }

  hide() {
    this.container.classList.add('hidden');
    if (this.renderer) {
      this.renderer.clear();
    }
  }
}
