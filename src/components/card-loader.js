export class CardLoader {
  constructor(containerId, onFilesLoaded) {
    this.container = document.getElementById(containerId);
    this.onFilesLoaded = onFilesLoaded;
    this.fileInput = null;
    this.dropZone = null;
  }

  render() {
    this.dropZone = this.container;
    this.fileInput = document.getElementById('file-input');
    const browseBtn = this.container.querySelector('.card-loader__btn');

    if (browseBtn) {
      browseBtn.addEventListener('click', () => this.fileInput.click());
    }

    this.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length) this._handleFiles(files);
      this.fileInput.value = '';
    });

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.classList.remove('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length) this._handleFiles(files);
    });
  }

  _handleFiles(files) {
    const PS2_CARD_SIZE = 8650752;
    const TOLERANCE = 1024 * 512;
    const validFiles = [];
    const errors = [];

    for (const file of files) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!['ps2', 'bin', 'mcd'].includes(ext)) {
        errors.push(`"${file.name}" is not a supported format (.ps2, .bin, .mcd)`);
        continue;
      }
      if (Math.abs(file.size - PS2_CARD_SIZE) > TOLERANCE) {
        errors.push(`"${file.name}" has unexpected size (${(file.size / 1024 / 1024).toFixed(2)} MB, expected ~8.25 MB)`);
        continue;
      }
      validFiles.push(file);
    }

    this._showLoading();

    if (this.onFilesLoaded) {
      this.onFilesLoaded(validFiles, errors);
    }
  }

  _showLoading() {
    const title = this.container.querySelector('.card-loader__title');
    const subtitle = this.container.querySelector('.card-loader__subtitle');
    const btn = this.container.querySelector('.card-loader__btn');
    const icon = this.container.querySelector('.card-loader__icon');

    if (title) title.textContent = 'Loading memory cards...';
    if (subtitle) subtitle.textContent = 'Parsing file data';
    if (btn) btn.style.display = 'none';
    if (icon) icon.classList.add('pulse');
  }

  reset() {
    const title = this.container.querySelector('.card-loader__title');
    const subtitle = this.container.querySelector('.card-loader__subtitle');
    const btn = this.container.querySelector('.card-loader__btn');
    const icon = this.container.querySelector('.card-loader__icon');

    if (title) title.textContent = 'Drop your PS2 memory card files here';
    if (subtitle) subtitle.textContent = 'Supports .ps2 memory card images (8MB)';
    if (btn) btn.style.display = '';
    if (icon) icon.classList.remove('pulse');
  }

  hide() {
    this.container.classList.add('hidden');
  }

  show() {
    this.container.classList.remove('hidden');
  }
}
