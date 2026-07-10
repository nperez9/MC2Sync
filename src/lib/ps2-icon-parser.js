/**
 * PS2 Icon Parser
 * Parses .icn 3D model, animation frames, and RLE compressed textures.
 */
export class PS2IconParser {
  static parse(dataArray) {
    const view = new DataView(dataArray.buffer, dataArray.byteOffset, dataArray.byteLength);
    const bufferLength = dataArray.byteLength;
    let offset = 0;

    const magic = view.getUint32(offset, true); offset += 4;
    const animShapes = view.getUint32(offset, true); offset += 4;
    const texType = view.getUint32(offset, true); offset += 4;
    const reserved = view.getUint32(offset, true); offset += 4; // sometimes scale
    const vertexCount = view.getUint32(offset, true); offset += 4;

    const shapes = [];
    
    // Parse vertices
    // A vertex block is 24 bytes per vertex.
    // X,Y,Z,W, NX,NY,NZ,NW, U,V, RGBA
    for (let shape = 0; shape < animShapes; shape++) {
      const vertices = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const colors = new Uint8Array(vertexCount * 4);
      
      for (let i = 0; i < vertexCount; i++) {
        // Vertex (X, Y, Z, W) - 8 bytes
        const x = view.getInt16(offset, true) / 4096.0; offset += 2;
        const y = view.getInt16(offset, true) / 4096.0; offset += 2;
        const z = view.getInt16(offset, true) / 4096.0; offset += 2;
        const w = view.getUint16(offset, true); offset += 2; // Flags

        // Normal (NX, NY, NZ, NW) - 8 bytes
        const nx = view.getInt16(offset, true) / 4096.0; offset += 2;
        const ny = view.getInt16(offset, true) / 4096.0; offset += 2;
        const nz = view.getInt16(offset, true) / 4096.0; offset += 2;
        const nw = view.getUint16(offset, true); offset += 2;

        // UV (U, V) - 4 bytes
        const u = view.getInt16(offset, true) / 4096.0; offset += 2;
        const v = view.getInt16(offset, true) / 4096.0; offset += 2;

        // Color (R, G, B, A) - 4 bytes
        const r = view.getUint8(offset++);
        const g = view.getUint8(offset++);
        const b = view.getUint8(offset++);
        const a = view.getUint8(offset++);

        vertices[i * 3 + 0] = x;
        vertices[i * 3 + 1] = -y; // Invert Y for WebGL
        vertices[i * 3 + 2] = z;

        normals[i * 3 + 0] = nx;
        normals[i * 3 + 1] = -ny;
        normals[i * 3 + 2] = nz;

        uvs[i * 2 + 0] = u;
        uvs[i * 2 + 1] = v;

        colors[i * 4 + 0] = r;
        colors[i * 4 + 1] = g;
        colors[i * 4 + 2] = b;
        colors[i * 4 + 3] = a;
      }
      
      shapes.push({ vertices, normals, uvs, colors });
    }

    // Parse Texture
    const textureSize = 128 * 128 * 4; // 128x128 RGBA
    const textureData = new Uint8Array(textureSize);
    
    // Check if there is data left for texture
    if (offset < bufferLength) {
      // Texture might be uncompressed (0x0F) or RLE compressed (0x0E/0x07)
      // Usually starts with size if compressed
      
      let isCompressed = false;
      // Heuristic: if remaining size is way less than 32768, it's compressed
      if ((bufferLength - offset) < 32768) {
        isCompressed = true;
      }

      if (isCompressed) {
        const compressedSize = view.getUint32(offset, true); offset += 4;
        let p = 0;
        while (offset < bufferLength && p < 128 * 128) {
          const rleCode = view.getUint16(offset, true); offset += 2;
          
          if (rleCode < 0xFF00) {
            // Repeat next pixel rleCode times
            const pixel = view.getUint16(offset, true); offset += 2;
            const rgba = decodeA1R5G5B5(pixel);
            for (let i = 0; i < rleCode && p < 128*128; i++) {
              textureData[p*4+0] = rgba[0];
              textureData[p*4+1] = rgba[1];
              textureData[p*4+2] = rgba[2];
              textureData[p*4+3] = rgba[3];
              p++;
            }
          } else {
            // Read uncompressed block of size (0x10000 - rleCode)
            const count = 0x10000 - rleCode;
            for (let i = 0; i < count && p < 128*128 && offset < bufferLength; i++) {
              const pixel = view.getUint16(offset, true); offset += 2;
              const rgba = decodeA1R5G5B5(pixel);
              textureData[p*4+0] = rgba[0];
              textureData[p*4+1] = rgba[1];
              textureData[p*4+2] = rgba[2];
              textureData[p*4+3] = rgba[3];
              p++;
            }
          }
        }
      } else {
        // Uncompressed 16-bit A1R5G5B5
        let p = 0;
        while (offset < bufferLength && p < 128 * 128) {
          const pixel = view.getUint16(offset, true); offset += 2;
          const rgba = decodeA1R5G5B5(pixel);
          textureData[p*4+0] = rgba[0];
          textureData[p*4+1] = rgba[1];
          textureData[p*4+2] = rgba[2];
          textureData[p*4+3] = rgba[3];
          p++;
        }
      }
    }

    return {
      shapes,
      textureData
    };
  }
}

function decodeA1R5G5B5(pixel) {
  const a = (pixel & 0x8000) ? 255 : 255; // Some tools ignore alpha bit, force 255
  const r = (pixel & 0x7C00) >> 10;
  const g = (pixel & 0x03E0) >> 5;
  const b = (pixel & 0x001F);
  return [
    (r << 3) | (r >> 2),
    (g << 3) | (g >> 2),
    (b << 3) | (b >> 2),
    a
  ];
}
