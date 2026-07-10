import fs from 'fs';
import { PS2MemoryCard } from './src/lib/ps2mc-parser.js';

const buf = fs.readFileSync('D:\\Roms\\PlayStation 2\\Memory Cards\\NFS MW.ps2');
const card = PS2MemoryCard.parse(buf.buffer, 'NFS MW.ps2');
const saves = card.getSaveEntries();

let iconFile = null;
for (const save of saves) {
  for (const file of save.files) {
    if (file.name.endsWith('.icn') || file.name.endsWith('.ico')) {
      iconFile = file;
      break;
    }
  }
  if (iconFile) break;
}

if (iconFile) {
  const data = card.readFileData(iconFile);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  
  const shapes = view.getUint32(4, true);
  const texType = view.getUint32(8, true);
  const scale = view.getFloat32(12, true);
  const vc = view.getUint32(16, true);
  
  console.log(`Shapes: ${shapes}, TexType: ${texType.toString(16)}, Scale: ${scale}, VC: ${vc}`);
  
  // vertex is 24 bytes.
  // 0: x (short), 2: y (short), 4: z (short), 6: unused/flag (short)
  // 8: nx (short), 10: ny (short), 12: nz (short), 14: unused/flag (short)
  // 16: u (short), 18: v (short)
  // 20: r (byte), 21: g (byte), 22: b (byte), 23: a (byte)
  
  const vertexDataSize = shapes * vc * 24;
  const texOffset = 20 + vertexDataSize;
  console.log(`Tex offset: ${texOffset}, remaining: ${data.length - texOffset}`);
  
  // Let's generate an OBJ file
  let obj = '';
  for(let i=0; i<vc; i++) {
    const offset = 20 + i * 24;
    const x = view.getInt16(offset + 0, true) / 4096.0;
    const y = view.getInt16(offset + 2, true) / 4096.0;
    const z = view.getInt16(offset + 4, true) / 4096.0;
    obj += `v ${x} ${-y} ${z}\n`; // -y because PS2 Y might be flipped
  }
  
  // Triangles - PS2 uses triangle strips. If the W coordinate (offset 6) has a specific flag, it might mean "don't draw" or "restart strip".
  // Actually, PS2 hardware (VIF/GIF) usually uses a flag in the ADC bit (bit 15 of vertex coordinate) to mark the start/end of a strip.
  // Let's print the flag values
  const flags = new Set();
  for(let i=0; i<vc; i++) {
    const offset = 20 + i * 24;
    const f1 = view.getUint16(offset + 6, true);
    flags.add(f1);
  }
  console.log('Flags at offset 6:', Array.from(flags));
  
  // Write OBJ without faces just as point cloud
  fs.writeFileSync('test.obj', obj);
  console.log('Wrote test.obj (point cloud)');
}
