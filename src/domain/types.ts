// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// ─── Error Types ─────────────────────────────────────────────────────────────

export type ParseError =
  | { readonly kind: 'INVALID_SIZE'; readonly expected: number; readonly actual: number }
  | { readonly kind: 'INVALID_MAGIC'; readonly actual: string }
  | { readonly kind: 'FAT_CYCLE'; readonly cluster: number }
  | { readonly kind: 'ICON_PARSE_ERROR'; readonly message: string };

export type MergeError =
  | { readonly kind: 'CAPACITY_EXCEEDED'; readonly required: number; readonly available: number }
  | { readonly kind: 'NO_SAVES'; }
  | { readonly kind: 'WRITE_ERROR'; readonly message: string };

// ─── PS2 Timestamp ───────────────────────────────────────────────────────────

export interface Timestamp {
  readonly seconds: number;
  readonly minutes: number;
  readonly hours: number;
  readonly day: number;
  readonly month: number;  // 0-based (JS convention)
  readonly year: number;
}

// ─── PS2 Superblock ──────────────────────────────────────────────────────────

export interface Superblock {
  readonly magic: string;
  readonly version: string;
  readonly pageLen: number;
  readonly pagesPerCluster: number;
  readonly pagesPerBlock: number;
  readonly clustersPerCard: number;
  readonly allocOffset: number;
  readonly allocEnd: number;
  readonly rootdirCluster: number;
  readonly backupBlock1: number;
  readonly backupBlock2: number;
  readonly ifcList: readonly number[];
}

// ─── PS2 Directory Entry ─────────────────────────────────────────────────────

export interface DirectoryEntry {
  readonly mode: number;
  readonly length: number;
  readonly created: Timestamp;
  readonly firstCluster: number;
  readonly modified: Timestamp;
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly exists: boolean;
}

// ─── Save File (file within a save directory) ────────────────────────────────

export interface SaveFile {
  readonly name: string;
  readonly size: number;
  readonly created: Timestamp;
  readonly modified: Timestamp;
  readonly firstCluster: number;
}

// ─── Save Entry (a single game save = a directory on the card) ───────────────

export interface SaveEntry {
  readonly directoryName: string;
  readonly gameTitle: string;        // Decoded from icon.sys (Shift-JIS)
  readonly gameTitleAscii: string;   // Fallback ASCII title
  readonly gameId: string;
  readonly region: Region;
  readonly totalSize: number;        // Total bytes used by all files in the save
  readonly created: Timestamp;
  readonly modified: Timestamp;
  readonly firstCluster: number;
  readonly files: readonly SaveFile[];
  readonly iconDataUrl: string | null;   // 2D preview (base64 canvas)
  readonly parsedIcon: ParsedIcon | null; // 3D icon data for Three.js
}

// ─── Memory Card ─────────────────────────────────────────────────────────────

export interface MemoryCard {
  readonly fileName: string;
  readonly superblock: Superblock;
  readonly fat: Uint32Array;
  readonly saves: readonly SaveEntry[];
  readonly totalClusters: number;
  readonly usedClusters: number;
  readonly freeClusters: number;
  readonly rawBuffer: ArrayBuffer;
  readonly isModified?: boolean;
}


// ─── Game Database ───────────────────────────────────────────────────────────

export type Region = 'NTSC-U' | 'PAL' | 'NTSC-J' | 'Unknown';

export interface GameInfo {
  readonly title: string;
  readonly region: Region;
}

// ─── Sync / Merge ─────────────────────────────────────────────────────────────

export type SaveStatus = 'unique' | 'duplicate' | 'conflict';
export type MergeStrategy = 'newest' | 'largest' | 'manual';

export interface SaveComparison {
  readonly directoryName: string;
  readonly status: SaveStatus;
  readonly saves: ReadonlyArray<{ readonly cardIndex: number; readonly save: SaveEntry }>;
  /** Index into saves[] of the recommended winner (for conflicts) */
  readonly recommendedIndex: number | null;
}

export interface ComparisonResult {
  readonly comparisons: readonly SaveComparison[];
  readonly uniqueCount: number;
  readonly duplicateCount: number;
  readonly conflictCount: number;
}

export type MergeActionType = 'copy' | 'skip';

export interface MergeAction {
  readonly type: MergeActionType;
  readonly directoryName: string;
  readonly sourceCardIndex: number;
  readonly save: SaveEntry;
  readonly reason: string;
}

export interface MergePlan {
  readonly actions: readonly MergeAction[];
  readonly totalSaves: number;
  readonly estimatedClusters: number;
  readonly estimatedBytes: number;
  readonly willFit: boolean;
}

// ─── Icon / 3D ───────────────────────────────────────────────────────────────

export interface IconVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly u: number;
  readonly v: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface IconShape {
  readonly vertices: readonly IconVertex[];
}

export interface ParsedIcon {
  readonly animShapes: number;
  readonly vertexCount: number;
  readonly shapes: readonly IconShape[];
  readonly textureData: Uint8Array; // 128×128 RGBA
}
