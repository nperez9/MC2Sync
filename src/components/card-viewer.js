import { lookupGame, getRegion } from '../lib/game-database.js';
import { PS2IconParser } from '../lib/ps2-icon-parser.js';

export class CardViewer {
  constructor(containerId, options) {
    this.container = document.getElementById(containerId);
    this.options = options || {};
    this.currentCard = null;
  }

  render(memoryCard) {
    this.currentCard = memoryCard;
    
    const saves = memoryCard.getSaveEntries();
    
    let html = `
      <div class="viewer-header">
        <div>
          <h2 class="viewer-title">${memoryCard.filename}</h2>
          <div class="text-secondary">${saves.length} saves • ${(memoryCard.freeSpace / 1024 / 1024).toFixed(2)} MB free</div>
        </div>
      </div>
      <div class="table-container">
    `;

    if (saves.length === 0) {
      html += `
        <div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
          <h3>No saves found</h3>
          <p>This memory card appears to be empty.</p>
        </div>
      `;
    } else {
      html += `
        <table class="saves-table">
          <thead>
            <tr>
              <th width="50">Icon</th>
              <th>Game</th>
              <th>Game ID</th>
              <th>Size</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
      `;

      saves.forEach((save, index) => {
        const gameInfo = lookupGame(save.name);
        const title = save.title || (gameInfo ? gameInfo.title : 'Unknown Game');
        const region = gameInfo ? gameInfo.region : getRegion(save.name);
        const regionClass = `badge-${region.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        const sizeKB = (save.size / 1024).toFixed(1) + ' KB';

        let iconSrc = null;
        let iconFile = null;
        for (const file of save.files) {
          if (file.name.endsWith('.icn') || file.name.endsWith('.ico')) {
            iconFile = file;
            break;
          }
        }
        
        if (iconFile) {
          try {
            const iconData = memoryCard.readFileData(iconFile);
            const parsedIcon = PS2IconParser.parse(iconData);
            if (parsedIcon.textureData) {
              const canvas = document.createElement('canvas');
              canvas.width = 128;
              canvas.height = 128;
              const ctx = canvas.getContext('2d');
              const imgData = ctx.createImageData(128, 128);
              imgData.data.set(parsedIcon.textureData);
              ctx.putImageData(imgData, 0, 0);
              iconSrc = canvas.toDataURL();
            }
          } catch(e) {
            console.error("Failed to extract 2D icon", e);
          }
        }
        
        const iconHtml = iconSrc 
          ? `<img src="${iconSrc}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3);" />` 
          : `<div style="width: 32px; height: 32px; background: var(--bg-surface-light); border-radius: 4px; display: grid; place-content: center; font-size: 12px; color: var(--primary);">🎮</div>`;

        html += `
          <tr class="save-row" data-index="${index}">
            <td>${iconHtml}</td>
            <td style="font-weight: 500;">${title}</td>
            <td style="font-family: monospace; font-size: 13px; color: var(--text-secondary);">${save.name}</td>
            <td style="color: var(--text-secondary);">${sizeKB}</td>
            <td><span class="badge ${regionClass}">${region}</span></td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    }

    html += `</div>`;
    this.container.innerHTML = html;

    this._attachEvents(saves);
  }

  _attachEvents(saves) {
    const rows = this.container.querySelectorAll('.save-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        // Deselect others
        rows.forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        
        const index = row.getAttribute('data-index');
        if (this.options.onSaveSelect) {
          this.options.onSaveSelect(saves[index]);
        }
      });
    });
  }

  clear() {
    this.container.innerHTML = '';
    this.currentCard = null;
  }

  deselectAll() {
    const rows = this.container.querySelectorAll('.save-row');
    rows.forEach(r => r.classList.remove('selected'));
  }
}
