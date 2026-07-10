import { type Timestamp } from '../domain/types';

/** Format bytes into a human-readable string (KB / MB). */
export const formatSize = (bytes: number): string => {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1_024)     return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
};

/** Format a PS2 Timestamp into a locale date string. */
export const formatTimestamp = (ts: Timestamp): string => {
  if (ts.year === 0 && ts.month === 0 && ts.day === 0) return '—';
  const d = new Date(ts.year, ts.month, ts.day, ts.hours, ts.minutes, ts.seconds);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Format a PS2 Timestamp as a full datetime string. */
export const formatTimestampFull = (ts: Timestamp): string => {
  if (ts.year === 0 && ts.month === 0 && ts.day === 0) return '—';
  const d = new Date(ts.year, ts.month, ts.day, ts.hours, ts.minutes, ts.seconds);
  return d.toLocaleString();
};
