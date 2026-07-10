/**
 * useFileDrop — custom Preact hook for drag & drop + file input.
 * Validates PS2 memory card files before calling onFiles.
 */

import { useRef, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';

export const VALID_EXTENSIONS = new Set(['.ps2', '.bin', '.mcd']);
export const EXPECTED_FILE_SIZE = 8_650_752;
const SIZE_TOLERANCE = 512 * 1024; // 512 KB

const isValidExtension = (name: string): boolean => {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return VALID_EXTENSIONS.has(ext);
};

const isValidSize = (size: number): boolean =>
  Math.abs(size - EXPECTED_FILE_SIZE) <= SIZE_TOLERANCE;

export interface FileDropOptions {
  onFiles: (files: File[]) => void;
  onError: (message: string) => void;
}

export const useFileDrop = ({ onFiles, onError }: FileDropOptions) => {
  const dropRef    = useRef<HTMLDivElement>(null);
  const isDragging = useSignal(false);

  const handleFiles = (rawFiles: FileList | File[]): void => {
    const files   = Array.from(rawFiles);
    const valid:  File[]   = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!isValidExtension(file.name)) {
        errors.push(`"${file.name}" has an unsupported extension. Use .ps2, .bin, or .mcd`);
        continue;
      }
      if (!isValidSize(file.size)) {
        errors.push(`"${file.name}" has an unexpected size (${file.size} bytes). Expected ~8.3 MB`);
        continue;
      }
      valid.push(file);
    }

    if (errors.length > 0) onError(errors.join('\n'));
    if (valid.length > 0)  onFiles(valid);
  };

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const onDragOver = (e: DragEvent): void => {
      e.preventDefault();
      isDragging.value = true;
    };

    const onDragLeave = (e: DragEvent): void => {
      if (!el.contains(e.relatedTarget as Node)) {
        isDragging.value = false;
      }
    };

    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      isDragging.value = false;
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    };

    el.addEventListener('dragover',  onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop',      onDrop);

    return () => {
      el.removeEventListener('dragover',  onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop',      onDrop);
    };
  }, []);

  return { dropRef, isDragging, handleFiles };
};
