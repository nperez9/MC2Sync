import { type FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { activeCard, activeCardIndex, selectedSave, selectSave, deleteSave, openCopyModal, openConfirmModal } from '../state/app-state';
import { formatSize, formatTimestamp } from '../utils/format';
import type { SaveEntry } from '../domain/types';

const SaveRow: FunctionComponent<{
  save: SaveEntry;
  isSelected: boolean;
  onSelect: (s: SaveEntry) => void;
}> = ({ save, isSelected, onSelect }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleDelete = (e: Event) => {
    e.stopPropagation();
    setMenuOpen(false);
    openConfirmModal(
      'Delete Save',
      `Are you sure you want to delete "${save.gameTitle}" from this card?`,
      'Delete',
      () => deleteSave(activeCardIndex.value!, save.directoryName)
    );
  };

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
      <td style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button 
          class="btn-icon" 
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          aria-label="Options"
        >
          ⋮
        </button>
        {menuOpen && (
          <div 
            ref={menuRef}
            style={{
              position: 'absolute',
              right: '16px',
              top: '40px',
              background: 'var(--bg-surface-light)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 100,
              minWidth: '160px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <button 
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '4px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                openCopyModal(activeCardIndex.value!, save);
              }}
            >
              Copy to another card
            </button>
            <button 
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'var(--error)',
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '4px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={handleDelete}
            >
              Delete Save
            </button>
          </div>
        )}
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
          <div class="viewer-toolbar">
            {/* Export button removed temporarily per user request */}
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
                  <th style={{ width: 48 }} scope="col"></th>
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
