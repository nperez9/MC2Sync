/** Shared binary / ArrayBuffer utilities */

/**
 * Concatenate multiple Uint8Array slices into a single Uint8Array.
 */
export const concatBytes = (...arrays: Uint8Array[]): Uint8Array => {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.byteLength;
  }
  return out;
};

/**
 * Read a null-terminated ASCII string from a Uint8Array.
 */
export const readCString = (data: Uint8Array, start: number, maxLen: number): string => {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const ch = data[start + i];
    if (ch === undefined || ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
};
