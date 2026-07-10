import { type FunctionComponent } from 'preact';
import { useRef } from 'preact/hooks';
import { useFileDrop } from '../hooks/use-file-drop';
import { useMemoryCard } from '../hooks/use-memory-card';
import { isLoading, loadingMessage, showToast } from '../state/app-state';

export const CardLoader: FunctionComponent = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleFiles } = useMemoryCard();

  const { dropRef, isDragging } = useFileDrop({
    onFiles: handleFiles,
    onError: (msg) => showToast(msg, 'error', 5000),
  });

  const onBrowseClick = (): void => {
    fileInputRef.current?.click();
  };

  const onInputChange = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      handleFiles(Array.from(input.files));
      input.value = ''; // Reset so same file can be re-selected
    }
  };

  return (
    <div id="card-loader-container">
      <div
        ref={dropRef}
        class={`card-loader${isDragging.value ? ' drag-over' : ''}`}
        role="region"
        aria-label="Memory card file drop zone"
      >
        <div class="loader-content">
          {isLoading.value ? (
            <>
              <div class="loader-icon pulse">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </div>
              <h2 class="card-loader__title">{loadingMessage.value}</h2>
            </>
          ) : (
            <>
              <div class="loader-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <h2 class="card-loader__title">Drop .ps2 files here</h2>
              <p class="card-loader__subtitle">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                id="file-input"
                multiple
                accept=".ps2,.bin,.mcd"
                class="hidden-input"
                onChange={onInputChange}
              />
              <button
                class="btn btn-primary card-loader__btn"
                id="btn-browse"
                onClick={onBrowseClick}
                type="button"
              >
                Select Files
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
