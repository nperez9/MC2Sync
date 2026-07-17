/**
 * PS2 Icon Parser — pure functional TypeScript port.
 * Parses .icn 3D model files: vertices, animation shapes, and RLE-compressed textures.
 *
 * Fixes from original:
 *  - Alpha bit is now correctly decoded: A1=1 → opaque (255), A1=0 → transparent (0)
 *  - Strong typing throughout
 *  - Returns Result<ParsedIcon, ParseError> instead of throwing
 */

import { type ParsedIcon, type IconShape, type IconVertex, type ParseError, type Result, ok, err } from './types';

// ─── A1R5G5B5 colour decoder ─────────────────────────────────────────────────

/**
 * Decode a 16-bit A1R5G5B5 pixel into RGBA bytes.
 * Bit 15 = alpha (1 = opaque, 0 = transparent).
 */
const decodeA1R5G5B5 = (pixel: number): [number, number, number, number] => {
  const a = (pixel & 0x8000) !== 0 ? 255 : 0; // Fixed: was always 255
  const r = (pixel & 0x7c00) >> 10;
  const g = (pixel & 0x03e0) >> 5;
  const b =  pixel & 0x001f;
  return [
    (r << 3) | (r >> 2),
    (g << 3) | (g >> 2),
    (b << 3) | (b >> 2),
    a,
  ];
};

// ─── Vertex parsing ───────────────────────────────────────────────────────────

const parseShape = (view: DataView, offsetIn: number, vertexCount: number): { shape: IconShape; offset: number } => {
  let offset = offsetIn;
  const vertices: IconVertex[] = [];

  for (let i = 0; i < vertexCount; i++) {
    // Position (X, Y, Z, W) — 4× int16, 8 bytes
    const x =  view.getInt16(offset,     true) / 4096.0; offset += 2;
    const y =  view.getInt16(offset,     true) / 4096.0; offset += 2;
    const z =  view.getInt16(offset,     true) / 4096.0; offset += 2;
    /* w = */ view.getUint16(offset,     true);           offset += 2; // flags, unused

    // Normal (NX, NY, NZ, NW) — 4× int16, 8 bytes
    const nx =  view.getInt16(offset,   true) / 4096.0; offset += 2;
    const ny =  view.getInt16(offset,   true) / 4096.0; offset += 2;
    const nz =  view.getInt16(offset,   true) / 4096.0; offset += 2;
    /* nw = */ view.getUint16(offset,   true);           offset += 2; // flags, unused

    // UV — 2× int16, 4 bytes
    const u = view.getInt16(offset,     true) / 4096.0; offset += 2;
    const v = view.getInt16(offset,     true) / 4096.0; offset += 2;

    // Color RGBA — 4× uint8, 4 bytes
    const r = view.getUint8(offset++);
    const g = view.getUint8(offset++);
    const b = view.getUint8(offset++);
    const a = view.getUint8(offset++);

    vertices.push({
      x,
      y: -y, // Invert Y for WebGL coordinate system
      z,
      nx,
      ny: -ny,
      nz,
      u,
      v,
      r,
      g,
      b,
      a,
    });
  }

  return { shape: { vertices }, offset };
};

// ─── Texture parsing ──────────────────────────────────────────────────────────

const TEXTURE_PIXELS = 128 * 128;
const TEXTURE_BYTES  = TEXTURE_PIXELS * 4; // RGBA

const writePixel = (tex: Uint8Array, p: number, rgba: [number, number, number, number]): void => {
  const base = p * 4;
  tex[base]     = rgba[0];
  tex[base + 1] = rgba[1];
  tex[base + 2] = rgba[2];
  tex[base + 3] = rgba[3];
};

const parseTextureRLE = (view: DataView, offsetIn: number, bufferLength: number): Uint8Array => {
  let offset = offsetIn;
  /* compressedSize = */ view.getUint32(offset, true); offset += 4;

  const tex = new Uint8Array(TEXTURE_BYTES);
  let p = 0;

  while (offset < bufferLength && p < TEXTURE_PIXELS) {
    const rleCode = view.getUint16(offset, true); offset += 2;

    if (rleCode < 0xff00) {
      // Run: repeat next pixel rleCode times
      const pixel = view.getUint16(offset, true); offset += 2;
      const rgba  = decodeA1R5G5B5(pixel);
      for (let i = 0; i < rleCode && p < TEXTURE_PIXELS; i++) {
        writePixel(tex, p++, rgba);
      }
    } else {
      // Literal block of size (0x10000 - rleCode) pixels
      const count = 0x10000 - rleCode;
      for (let i = 0; i < count && p < TEXTURE_PIXELS && offset < bufferLength; i++) {
        const pixel = view.getUint16(offset, true); offset += 2;
        writePixel(tex, p++, decodeA1R5G5B5(pixel));
      }
    }
  }

  return tex;
};

const parseTextureRaw = (view: DataView, offsetIn: number, bufferLength: number): Uint8Array => {
  let offset = offsetIn;
  const tex  = new Uint8Array(TEXTURE_BYTES);
  let p = 0;

  while (offset + 1 < bufferLength && p < TEXTURE_PIXELS) {
    const pixel = view.getUint16(offset, true); offset += 2;
    writePixel(tex, p++, decodeA1R5G5B5(pixel));
  }

  return tex;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a PS2 save icon (.icn) file.
 * Returns a Result<ParsedIcon, ParseError>.
 */
export const parseIcon = (dataArray: Uint8Array): Result<ParsedIcon, ParseError> => {
  try {
    const view         = new DataView(dataArray.buffer, dataArray.byteOffset, dataArray.byteLength);
    const bufferLength = dataArray.byteLength;
    let offset         = 0;

    /* magic = */      view.getUint32(offset, true); offset += 4;
    const animShapes = view.getUint32(offset, true); offset += 4;
    /* texType = */    view.getUint32(offset, true); offset += 4;
    /* reserved = */   view.getUint32(offset, true); offset += 4;
    const vertexCount = view.getUint32(offset, true); offset += 4;

    const shapes: IconShape[] = [];

    for (let s = 0; s < animShapes; s++) {
      const result = parseShape(view, offset, vertexCount);
      shapes.push(result.shape);
      offset = result.offset;
    }

    // Texture: heuristic — if remaining data < 32 KB, assume RLE compressed
    let textureData: Uint8Array;
    if (offset >= bufferLength) {
      textureData = new Uint8Array(TEXTURE_BYTES); // No texture data
    } else if (bufferLength - offset < 32_768) {
      textureData = parseTextureRLE(view, offset, bufferLength);
    } else {
      textureData = parseTextureRaw(view, offset, bufferLength);
    }

    return ok({
      animShapes,
      vertexCount,
      shapes,
      textureData,
    });
  } catch (e) {
    return err({
      kind: 'ICON_PARSE_ERROR',
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
