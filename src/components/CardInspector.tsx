import { type FunctionComponent } from 'preact';
import { selectedSave, selectSave, activeCardIndex, deleteSave, openCopyModal, openConfirmModal } from '../state/app-state';
import { formatSize, formatTimestamp, formatTimestampFull } from '../utils/format';
import { IconRenderer } from './IconRenderer';

export const CardInspector: FunctionComponent = () => {
  const save = selectedSave.value;
  if (!save) return null;

  const regionClass = {
    'NTSC-U':  'badge-ntsc-u',
    'PAL':     'badge-pal',
    'NTSC-J':  'badge-ntsc-j',
    'Unknown': 'badge-unknown',
  }[save.region] ?? 'badge-unknown';

  return (
    <aside id="inspector-panel" class="inspector-panel" aria-label="Save details">
      <div class="inspector-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3, flex: 1, marginRight: '12px' }}>
            {save.gameTitle}
          </h3>
          <button
            class="btn-icon"
            onClick={() => selectSave(null)}
            aria-label="Close inspector"
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span class={`badge ${regionClass}`}>{save.region}</span>
          <span class="badge" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            {save.files.length} file{save.files.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div class="inspector-body">
        {/* 3D icon — rendered by Three.js, no setTimeout needed */}
        {save.parsedIcon && <IconRenderer icon={save.parsedIcon} />}

        <div class="detail-group">
          <span class="detail-label">Game ID</span>
          <span class="detail-value" style={{ fontFamily: 'monospace' }}>{save.directoryName}</span>
        </div>

        <div class="detail-group">
          <span class="detail-label">Total Size</span>
          <span class="detail-value">{formatSize(save.totalSize)}</span>
        </div>

        <div class="detail-group">
          <span class="detail-label">Created</span>
          <span class="detail-value">{formatTimestampFull(save.created)}</span>
        </div>

        <div class="detail-group">
          <span class="detail-label">Modified</span>
          <span class="detail-value">{formatTimestampFull(save.modified)}</span>
        </div>

        {save.files.length > 0 && (
          <div class="detail-group">
            <span class="detail-label">Files</span>
            <div class="file-list">
              {save.files.map((file) => (
                <div key={file.name} class="file-item">
                  <span style={{ fontFamily: 'monospace' }}>{file.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{formatSize(file.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* <button 
            class="btn btn-secondary w-full"
            onClick={() => openCopyModal(activeCardIndex.value!, save)}
          >
            Copy to another card
          </button> */}
          <button 
            class="btn btn-danger w-full" 
            onClick={() => {
              openConfirmModal(
                'Delete Save',
                `Are you sure you want to delete "${save.gameTitle}" from this card?`,
                'Delete',
                () => deleteSave(activeCardIndex.value!, save.directoryName)
              );
            }}
          >
            Delete Save
          </button>
        </div>
      </div>
    </aside>
  );
};
