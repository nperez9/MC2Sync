# EmuSync — PS2 Memory Card Manager

Herramienta web para administrar, inspeccionar y sincronizar archivos de memory cards virtuales de PS2 (`.ps2`). Permite cargar múltiples memory cards, ver su contenido, detectar duplicados, y mergear todo en una card definitiva.

## Arquitectura

**Aplicación 100% client-side** (HTML + CSS + JS vanilla) — sin backend, sin framework. Todo el parseo binario se hace en el browser con `FileReader` + `DataView`.

Se usa **Vite** como dev server y bundler para hot reload y organización modular del código.

---

## Proposed Changes

### 1. Proyecto Base (Vite)

#### [NEW] `package.json`
Setup mínimo de Vite para dev server con hot reload.

#### [NEW] `index.html`
Página principal con layout de la app: sidebar de cards cargadas, área principal de contenido, panel de sync.

#### [NEW] `vite.config.js`
Configuración básica de Vite.

---

### 2. PS2 Memory Card Parser (`src/lib/`)

El core técnico. Implementa el parseo completo del filesystem PS2 usando la especificación documentada por Ross Ridge.

#### [NEW] `src/lib/ps2mc-parser.js`
Parser principal del archivo `.ps2`. Responsabilidades:
- **Superblock** (offset 0x00, 340 bytes): Lee magic string `"Sony PS2 Memory Card Format"`, page_len (512), pages_per_cluster (2), clusters_per_card (8192), alloc_offset, rootdir_cluster, ifc_list[32]
- **FAT con double-indirect indexing**: Reconstruye la tabla de asignación siguiendo ifc_list → Indirect Table → FAT entries
- **Cluster chain traversal**: Sigue las cadenas de clusters para leer archivos completos
- **Directory entries** (512 bytes cada una): Parsea mode flags, length, created/modified timestamps, first cluster, name (32 bytes null-terminated)
- **ECC handling**: Los archivos `.ps2` de PCSX2 incluyen spare/ECC data (cada página de 512 bytes tiene 16 bytes extra de ECC). El parser debe skipear estos bytes extra.

Estructura de datos de salida:
```js
{
  filename: "Mcd001.ps2",
  superblock: { magic, version, pageLen, pagesPerCluster, ... },
  entries: [
    {
      name: "BASLUS-20946",     // Directory name (game ID)
      type: "directory",
      size: 0,
      files: [...],             // Sub-entries (save data files)
      created: Date,
      modified: Date,
      mode: 0x8427,
      cluster: 123
    }
  ],
  freeSpace: 4096000,           // bytes
  usedSpace: 3200000            // bytes  
}
```

#### [NEW] `src/lib/ps2mc-writer.js`
Escritor de memory cards. Responsabilidades:
- Crear una memory card vacía con filesystem válido (superblock, FAT, root directory)
- Copiar saves completos (directorio + archivos) de una card parseada a otra
- Eliminar saves (marcar clusters como libres en FAT, limpiar directory entry)
- Recalcular FAT y actualizar superblock
- Generar el archivo `.ps2` binario final con ECC data

#### [NEW] `src/lib/ps2mc-sync.js`
Lógica de sincronización/merge entre cards:
- Compara saves entre múltiples cards por nombre de directorio (game ID)
- Detecta duplicados exactos (comparando bytes de los save files)
- Detecta conflictos (mismo juego, saves diferentes → usa el más reciente por timestamp)
- Genera un plan de merge antes de ejecutar
- Ejecuta el merge creando una nueva card con los saves seleccionados

#### [NEW] `src/lib/game-database.js`
Base de datos embebida (JSON) con mapeo de Game IDs comunes a nombres de juegos. Formato:
```js
{
  "BASLUS-20946": { title: "Need for Speed: Most Wanted", region: "NTSC-U" },
  "BESLES-50194": { title: "Gran Turismo 4", region: "PAL" },
  // ~200+ juegos populares
}
```

---

### 3. UI Components (`src/components/`)

#### [NEW] `src/components/card-loader.js`
- Zona de drag & drop para cargar archivos `.ps2`
- File picker como alternativa
- Muestra progreso de parseo
- Soporta cargar múltiples cards simultáneamente

#### [NEW] `src/components/card-viewer.js`
- Vista de tabla/grilla con los saves de una card
- Muestra: icono de juego (genérico por región), nombre del juego (desde game-database), game ID, tamaño, fecha de creación/modificación
- Barra de uso de espacio (usado/libre/total 8MB)
- Selección múltiple de saves para operaciones batch
- Acciones: eliminar save, copiar a otra card

#### [NEW] `src/components/card-inspector.js`
- Panel lateral con detalles de un save seleccionado
- Metadata completa: game ID, región, modo flags, timestamps, tamaño total, número de archivos internos
- Lista de archivos internos del save con sus tamaños

#### [NEW] `src/components/sync-panel.js`
- UI de sincronización entre cards
- Vista de comparación lado a lado
- Indicadores visuales: 🟢 único, 🟡 duplicado, 🔴 conflicto
- Preview del resultado del merge antes de ejecutar
- Botón para generar la card final mergeada
- Descarga automática del `.ps2` resultante

#### [NEW] `src/components/toast.js`
- Sistema de notificaciones toast para feedback visual

---

### 4. Estilos (`src/styles/`)

#### [NEW] `src/styles/main.css`
Design system completo:
- **Tema**: Dark mode con acentos púrpura/cyan inspirado en la estética PS2
- **Tipografía**: Inter/Outfit desde Google Fonts
- **Layout**: Sidebar + main content con CSS Grid
- **Componentes**: Cards con glassmorphism, tablas estilizadas, badges de estado, barras de progreso animadas, tooltips
- **Animaciones**: Transiciones suaves, hover effects, loading states, micro-animaciones en acciones

---

### 5. App Principal

#### [NEW] `src/main.js`
Entry point. Inicializa la app, maneja el estado global (cards cargadas, card activa, selección), coordina componentes.

---

## Formato Técnico - PS2 Memory Card

Referencia rápida del formato para la implementación:

| Concepto | Valor por defecto |
|---|---|
| Tamaño total | 8,388,608 bytes (8 MB) |
| Page size | 512 bytes |
| Pages per cluster | 2 |
| Cluster size | 1,024 bytes |
| Total clusters | 8,192 |
| ECC por página | 16 bytes extra |
| Tamaño real .ps2 | 8,650,752 bytes (8MB + ECC) |
| Directory entry | 512 bytes |
| Entries por cluster | 2 |
| Byte order | Little-endian |
| FAT | Double-indirect (ifc_list → indirect → FAT) |
| Superblock offset | 0x00 (primera página) |

### Superblock (offset 0x00)
| Offset | Campo | Tipo | Descripción |
|---|---|---|---|
| 0x00 | magic | byte[28] | "Sony PS2 Memory Card Format" |
| 0x1C | version | byte[12] | "1.x.0.0" |
| 0x28 | page_len | uint16 | 512 |
| 0x2A | pages_per_cluster | uint16 | 2 |
| 0x2C | pages_per_block | uint16 | 16 |
| 0x30 | clusters_per_card | uint32 | 8192 |
| 0x34 | alloc_offset | uint32 | First allocatable cluster |
| 0x38 | alloc_end | uint32 | Last allocatable cluster |
| 0x3C | rootdir_cluster | uint32 | Root directory first cluster |
| 0x40 | backup_block1 | uint32 | Backup block |
| 0x44 | backup_block2 | uint32 | Backup block 2 |
| 0x50 | ifc_list | uint32[32] | Indirect FAT cluster list |

### Directory Entry (512 bytes)
| Offset | Campo | Tipo | Descripción |
|---|---|---|---|
| 0x00 | mode | uint32 | Mode flags |
| 0x04 | length | uint32 | Size (bytes) or entry count (dir) |
| 0x08 | created | byte[8] | Creation timestamp |
| 0x10 | cluster | uint32 | First cluster |
| 0x14 | dir_entry | uint32 | Parent dir entry index |
| 0x18 | modified | byte[8] | Modified timestamp |
| 0x20 | attr | uint32 | User attribute |
| 0x40 | name | byte[32] | Null-terminated name |

### Mode Flags
| Bit | Valor | Significado |
|---|---|---|
| 0x8427 | - | Típico para directorio de save |
| 0x8417 | - | Típico para archivo de save |
| 0x0010 | DF_FILE | Regular file |
| 0x0020 | DF_DIR | Directory |
| 0x8000 | DF_EXISTS | Entry exists |

---

## Verification Plan

### Automated Tests
- Cargar ambos archivos de ejemplo (`Mcd001-RM.ps2` y `NFS MW.ps2`) y verificar que el parser lee correctamente el superblock y lista los saves
- Verificar que el tamaño de los archivos coincide (8,650,752 bytes = 8MB + ECC)
- Crear una card vacía, copiar saves, y verificar que el archivo resultante es parseable

### Manual Verification
- Abrir la UI en el browser, cargar las 2 cards de ejemplo
- Verificar que se muestran los saves correctamente con nombres de juegos
- Ejecutar una sincronización y descargar el resultado
- Abrir el `.ps2` resultante en PCSX2 para validar que funciona
