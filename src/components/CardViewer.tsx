import { type FunctionComponent } from 'preact';
import { activeCard, selectedSave, selectSave } from '../state/app-state';
import { formatSize, formatTimestamp } from '../utils/format';
import type { SaveEntry } from '../domain/types';

const SaveRow: FunctionComponent<{
  save: SaveEntry;
  isSelected: boolean;
  onSelect: (s: SaveEntry) => void;
}> = ({ save, isSelected, onSelect }) => {
  const regionClass = {
    'NTSC-U':  'badge-ntsc-u',
    'PAL':     'badge-pal',
    'NTSC-J':  'badge-ntsc-j',
    'Unknown': 'badge-unknown',
  }[save.region] ?? 'badge-unknown';

  return (
    <tr
      class={`save-row${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(save)}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(save)}
      aria-selected={isSelected}
    >
      <td>
        {save.iconDataUrl
          ? <img src={save.iconDataUrl} width={40} height={40} alt="" style={{ borderRadius: '4px', display: 'block' }} />
          : <div style={{ width: 40, height: 40, background: 'var(--bg-surface)', borderRadius: '4px' }} />}
      </td>
      <td>
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>{save.gameTitle}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{save.directoryName}</div>
      </td>
      <td>
        <span class={`badge ${regionClass}`}>{save.region}</span>
      </td>
      <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        {formatSize(save.totalSize)}
      </td>
      <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        {formatTimestamp(save.modified)}
      </td>
      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {save.files.length} file{save.files.length !== 1 ? 's' : ''}
      </td>
    </tr>
  );
};

export const CardViewer: FunctionComponent = () => {
  const card = activeCard.value;
  if (!card) return null;

  const selected = selectedSave.value;

  return (
    <section id="main-content" class="main-content">
      <div id="card-viewer">
        <div class="viewer-header">
          <div>
            <div class="viewer-title">{card.fileName}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {card.saves.length} save{card.saves.length !== 1 ? 's' : ''} ·{' '}
              {formatSize(card.freeClusters * 1024)} free
            </div>
          </div>
        </div>

        <div class="table-container">
          {card.saves.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p>No saves found on this card.</p>
            </div>
          ) : (
            <table class="saves-table" role="grid" aria-label="Save entries">
              <thead>
                <tr>
                  <th style={{ width: 56 }} scope="col">Icon</th>
                  <th scope="col">Title</th>
                  <th scope="col">Region</th>
                  <th scope="col">Size</th>
                  <th scope="col">Modified</th>
                  <th scope="col">Files</th>
                </tr>
              </thead>
              <tbody>
                {card.saves.map((save) => (
                  <SaveRow
                    key={save.directoryName}
                    save={save}
                    isSelected={selected?.directoryName === save.directoryName}
                    onSelect={selectSave}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
};
