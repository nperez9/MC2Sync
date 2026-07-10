/**
 * PS2 Memory Card Binary Parser
 * Parses .ps2 memory card files (8,650,752 bytes = 8MB + ECC)
 * 
 * File structure:
 * - 16,384 pages total
 * - Raw page in file: 528 bytes (512 data + 16 spare/ECC)
 * - Cluster: 2 pages = 1024 bytes of data
 * - All multi-byte values are LITTLE ENDIAN
 */

const EXPECTED_FILE_SIZE = 8650752;
const PAGE_SIZE = 512;
const SPARE_SIZE = 16;
const RAW_PAGE_SIZE = PAGE_SIZE + SPARE_SIZE; // 528
const PAGES_PER_CLUSTER = 2;
const CLUSTER_SIZE = PAGE_SIZE * PAGES_PER_CLUSTER; // 1024
const TOTAL_PAGES = 16384;
const TOTAL_CLUSTERS = 8192;
const DIR_ENTRY_SIZE = 512;

// Mode flags
const DF_EXISTS = 0x8000;
const DF_DIRECTORY = 0x0020;
const DF_FILE = 0x0010;
const DF_READ = 0x0001;
const DF_WRITE = 0x0002;
const DF_EXECUTE = 0x0004;

const FAT_CHAIN_END = 0xFFFFFFFF;
const FAT_CHAIN_END_MASKED = 0x7FFFFFFF;

/**
 * Read a single page's data (512 bytes) from the raw card buffer.
 * Page N starts at offset N * 528, we read 512 bytes (skip 16 spare).
 * @param {ArrayBuffer} buffer - The entire card buffer
 * @param {number} pageIndex - Page index (0-based)
 * @returns {Uint8Array} 512 bytes of page data
 */
function readPageData(buffer, pageIndex) {
  const offset = pageIndex * RAW_PAGE_SIZE;
  return new Uint8Array(buffer, offset, PAGE_SIZE);
}

/**
 * Read a cluster's data (1024 bytes) from the raw card buffer.
 * Cluster N = pages N*2 and N*2+1, concatenated data portions.
 * @param {ArrayBuffer} buffer - The entire card buffer
 * @param {number} clusterIndex - Absolute cluster index
 * @returns {Uint8Array} 1024 bytes of cluster data
 */
function readClusterDataRaw(buffer, clusterIndex) {
  const page0 = clusterIndex * PAGES_PER_CLUSTER;
  const page1 = page0 + 1;
  const result = new Uint8Array(CLUSTER_SIZE);
  result.set(readPageData(buffer, page0), 0);
  result.set(readPageData(buffer, page1), PAGE_SIZE);
  return result;
}

/**
 * Parse a PS2 timestamp from 8 bytes.
 * Format: [unused, seconds, minutes, hours, day, month, year_lo, year_hi]
 * @param {DataView} view - DataView to read from
 * @param {number} offset - Byte offset
 * @returns {Date}
 */
function parseTimestamp(view, offset) {
  const seconds = view.getUint8(offset + 1);
  const minutes = view.getUint8(offset + 2);
  const hours = view.getUint8(offset + 3);
  const day = view.getUint8(offset + 4);
  const month = view.getUint8(offset + 5);
  const yearLo = view.getUint8(offset + 6);
  const yearHi = view.getUint8(offset + 7);
  const year = yearLo | (yearHi << 8);

  // Month is 1-based in PS2 format, Date constructor expects 0-based
  if (year === 0 && month === 0 && day === 0) {
    return new Date(0);
  }
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Parse a directory entry from 512 bytes of data.
 * @param {Uint8Array} data - 512 bytes of directory entry data
 * @returns {Object} Parsed directory entry
 */
function parseDirectoryEntry(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const mode = view.getUint32(0x00, true);
  const length = view.getUint32(0x04, true);
  const created = parseTimestamp(view, 0x08);
  const cluster = view.getUint32(0x10, true);
  const dirEntry = view.getUint32(0x14, true);
  const modified = parseTimestamp(view, 0x18);
  const attr = view.getUint32(0x20, true);

  // Read name (null-terminated, up to 32 bytes starting at 0x40)
  let name = '';
  for (let i = 0; i < 32; i++) {
    const ch = data[0x40 + i];
    if (ch === 0) break;
    name += String.fromCharCode(ch);
  }

  const isDirectory = (mode & DF_DIRECTORY) !== 0;
  const isFile = (mode & DF_FILE) !== 0;
  const exists = (mode & DF_EXISTS) !== 0;

  return {
    mode,
    length,
    created,
    cluster,
    dirEntry,
    modified,
    attr,
    name,
    isDirectory,
    isFile,
    exists,
    rawData: new Uint8Array(data),
  };
}

/**
 * Parse the superblock from the first page of the card.
 * @param {ArrayBuffer} buffer - The entire card buffer
 * @returns {Object} Parsed superblock
 */
function parseSuperblock(buffer) {
  const pageData = readPageData(buffer, 0);
  const view = new DataView(pageData.buffer, pageData.byteOffset, pageData.byteLength);

  // Read magic string (28 bytes at offset 0x00)
  let magic = '';
  for (let i = 0; i < 28; i++) {
    const ch = pageData[i];
    if (ch === 0) break;
    magic += String.fromCharCode(ch);
  }

  // Read version string (12 bytes at offset 0x1C)
  let version = '';
  for (let i = 0; i < 12; i++) {
    const ch = pageData[0x1C + i];
    if (ch === 0) break;
    version += String.fromCharCode(ch);
  }

  const pageLen = view.getUint16(0x28, true);
  const pagesPerCluster = view.getUint16(0x2A, true);
  const pagesPerBlock = view.getUint16(0x2C, true);
  // 0x2E is padding
  const clustersPerCard = view.getUint32(0x30, true);
  const allocOffset = view.getUint32(0x34, true);
  const allocEnd = view.getUint32(0x38, true);
  const rootdirCluster = view.getUint32(0x3C, true);
  const backupBlock1 = view.getUint32(0x40, true);
  const backupBlock2 = view.getUint32(0x44, true);

  // Read IFC list (32 uint32 entries starting at 0x50)
  const ifcList = [];
  for (let i = 0; i < 32; i++) {
    ifcList.push(view.getUint32(0x50 + i * 4, true));
  }

  return {
    magic,
    version,
    pageLen,
    pagesPerCluster,
    pagesPerBlock,
    clustersPerCard,
    allocOffset,
    allocEnd,
    rootdirCluster,
    backupBlock1,
    backupBlock2,
    ifcList,
  };
}

/**
 * Build the complete FAT array using double-indirect indexing.
 *
 * 1. ifc_list[i] contains ABSOLUTE cluster indices pointing to indirect FAT clusters
 * 2. Each indirect FAT cluster contains uint32 entries (1024/4 = 256), these are
 *    ABSOLUTE cluster indices pointing to actual FAT clusters
 * 3. Each FAT cluster contains uint32 entries, one per allocatable cluster
 * 4. All entries concatenated form the FAT indexed by allocatable cluster number
 *
 * @param {ArrayBuffer} buffer - The entire card buffer
 * @param {Object} superblock - Parsed superblock
 * @returns {Uint32Array} Complete FAT array
 */
function buildFAT(buffer, superblock) {
  const fat = new Uint32Array(TOTAL_CLUSTERS);
  fat.fill(FAT_CHAIN_END);
  const entriesPerCluster = CLUSTER_SIZE / 4; // 256

  for (let i = 0; i < superblock.ifcList.length; i++) {
    const ifcCluster = superblock.ifcList[i];
    if (ifcCluster === FAT_CHAIN_END || ifcCluster >= TOTAL_CLUSTERS) continue;

    // Read the indirect FAT cluster (contains absolute cluster indices to FAT clusters)
    const indirectData = readClusterDataRaw(buffer, ifcCluster);
    const indirectView = new DataView(indirectData.buffer, indirectData.byteOffset, indirectData.byteLength);

    for (let j = 0; j < entriesPerCluster; j++) {
      const fatClusterIndex = indirectView.getUint32(j * 4, true);
      if (fatClusterIndex === FAT_CHAIN_END || fatClusterIndex >= TOTAL_CLUSTERS) continue;

      // Read the actual FAT cluster
      const fatData = readClusterDataRaw(buffer, fatClusterIndex);
      const fatView = new DataView(fatData.buffer, fatData.byteOffset, fatData.byteLength);

      for (let k = 0; k < entriesPerCluster; k++) {
        const fatIndex = (i * entriesPerCluster * entriesPerCluster) + (j * entriesPerCluster) + k;
        if (fatIndex < TOTAL_CLUSTERS) {
          fat[fatIndex] = fatView.getUint32(k * 4, true);
        }
      }
    }
  }

  return fat;
}

/**
 * Follow a cluster chain through the FAT.
 * @param {Uint32Array} fat - The FAT array
 * @param {number} firstCluster - First allocatable cluster index
 * @returns {number[]} Array of allocatable cluster indices in the chain
 */
function followClusterChain(fat, firstCluster) {
  const chain = [];
  let current = firstCluster;
  const visited = new Set();

  while (true) {
    if (current === FAT_CHAIN_END || current >= fat.length) break;
    const masked = current & FAT_CHAIN_END_MASKED;
    if (masked === FAT_CHAIN_END_MASKED) break;
    if (visited.has(current)) break; // Prevent infinite loops

    visited.add(current);
    chain.push(current);

    const fatEntry = fat[current];
    if (fatEntry === FAT_CHAIN_END) break;
    const nextMasked = fatEntry & FAT_CHAIN_END_MASKED;
    if (nextMasked === FAT_CHAIN_END_MASKED) break;

    current = nextMasked;
  }

  return chain;
}

/**
 * Read data from an allocatable cluster index.
 * Absolute cluster = allocOffset + allocatableIndex
 * @param {ArrayBuffer} buffer - The entire card buffer
 * @param {number} allocatableIndex - Allocatable cluster index
 * @param {number} allocOffset - Allocation offset from superblock
 * @returns {Uint8Array} Cluster data (1024 bytes)
 */
function readAllocatableCluster(buffer, allocatableIndex, allocOffset) {
  const absoluteCluster = allocOffset + allocatableIndex;
  return readClusterDataRaw(buffer, absoluteCluster);
}

/**
 * PS2 Memory Card parser class.
 */
export class PS2MemoryCard {
  /**
   * @param {ArrayBuffer} arrayBuffer - Raw card data (8,650,752 bytes)
   * @param {string} filename - Source filename
   */
  constructor(arrayBuffer, filename) {
    if (arrayBuffer.byteLength !== EXPECTED_FILE_SIZE) {
      throw new Error(
        `Invalid PS2 memory card file size: expected ${EXPECTED_FILE_SIZE} bytes, got ${arrayBuffer.byteLength} bytes`
      );
    }

    this.rawBuffer = arrayBuffer;
    this.filename = filename || 'unknown.ps2';
    this.superblock = parseSuperblock(arrayBuffer);

    // Validate magic
    if (!this.superblock.magic.startsWith('Sony PS2 Memory Card Format')) {
      throw new Error(`Invalid PS2 memory card: bad magic string "${this.superblock.magic}"`);
    }

    // Build FAT
    this._fat = buildFAT(arrayBuffer, this.superblock);

    // Parse root directory and save entries
    this.entries = this._parseRootDirectory();

    // Calculate space usage
    this._calculateSpace();
  }

  /**
   * Static factory method.
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} filename
   * @returns {PS2MemoryCard}
   */
  static parse(arrayBuffer, filename) {
    return new PS2MemoryCard(arrayBuffer, filename);
  }

  /**
   * Get the cluster chain starting from a given allocatable cluster.
   * @param {number} firstCluster - First allocatable cluster index
   * @returns {number[]} Array of allocatable cluster indices
   */
  getClusterChain(firstCluster) {
    return followClusterChain(this._fat, firstCluster);
  }

  /**
   * Read data from a single allocatable cluster.
   * @param {number} clusterIndex - Allocatable cluster index
   * @returns {Uint8Array} 1024 bytes of cluster data
   */
  readClusterData(clusterIndex) {
    return readAllocatableCluster(this.rawBuffer, clusterIndex, this.superblock.allocOffset);
  }

  /**
   * Read the complete file data for a file entry by following its cluster chain.
   * @param {Object} entry - A parsed directory entry with cluster and length fields
   * @returns {Uint8Array} Complete file data (trimmed to entry.length)
   */
  readFileData(entry) {
    const chain = this.getClusterChain(entry.cluster);
    const totalSize = chain.length * CLUSTER_SIZE;
    const rawData = new Uint8Array(totalSize);

    for (let i = 0; i < chain.length; i++) {
      const clusterData = this.readClusterData(chain[i]);
      rawData.set(clusterData, i * CLUSTER_SIZE);
    }

    // Trim to actual file size
    const fileSize = entry.length;
    if (fileSize <= totalSize) {
      return rawData.slice(0, fileSize);
    }
    return rawData;
  }

  /**
   * Read all directory entries from a directory.
   * @param {Object} dirEntry - A parsed directory entry (must be a directory)
   * @returns {Object[]} Array of parsed directory entries
   */
  readDirectoryEntries(dirEntry) {
    if (!dirEntry.isDirectory) {
      throw new Error(`Entry "${dirEntry.name}" is not a directory`);
    }

    const chain = this.getClusterChain(dirEntry.cluster);
    const entriesPerCluster = CLUSTER_SIZE / DIR_ENTRY_SIZE; // 2 entries per cluster
    const entries = [];

    for (let i = 0; i < chain.length; i++) {
      const clusterData = this.readClusterData(chain[i]);

      for (let j = 0; j < entriesPerCluster; j++) {
        if (entries.length >= dirEntry.length) break;
        const entryData = clusterData.slice(j * DIR_ENTRY_SIZE, (j + 1) * DIR_ENTRY_SIZE);
        const parsed = parseDirectoryEntry(entryData);
        entries.push(parsed);
      }
      if (entries.length >= dirEntry.length) break;
    }

    return entries;
  }

  /**
   * Get all save entries (game save directories) from the card.
   * @returns {Object[]} Array of save entry objects
   */
  getSaveEntries() {
    return this.entries.map(saveDir => {
      const files = [];
      let totalSize = 0;
      let title = null;

      // Read files within the save directory
      try {
        const dirEntries = this.readDirectoryEntries(saveDir);

        for (const entry of dirEntries) {
          if (!entry.exists) continue;
          if (entry.name === '.' || entry.name === '..') continue;

          if (entry.isFile) {
            const fileInfo = {
              name: entry.name,
              size: entry.length,
              created: entry.created,
              modified: entry.modified,
              mode: entry.mode,
              cluster: entry.cluster,
            };
            files.push(fileInfo);
            totalSize += entry.length;
            
            if (entry.name.toLowerCase() === 'icon.sys') {
              try {
                const sysData = this.readFileData(fileInfo);
                if (sysData.byteLength >= 0xC0 + 68) {
                  const titleBytes = sysData.slice(0xC0, 0xC0 + 68);
                  let endIdx = titleBytes.indexOf(0);
                  if (endIdx === -1) endIdx = titleBytes.length;
                  const decoder = new TextDecoder('shift-jis');
                  title = decoder.decode(titleBytes.slice(0, endIdx));
                  title = title.replace(/[\n\r]/g, ' ').replace(/\0/g, '').trim();
                }
              } catch (e) {
                console.warn('Could not parse icon.sys title', e);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Warning: Could not read entries for save "${saveDir.name}": ${e.message}`);
      }

      return {
        name: saveDir.name,
        title: title,
        type: 'directory',
        size: totalSize,
        files,
        created: saveDir.created,
        modified: saveDir.modified,
        mode: saveDir.mode,
        cluster: saveDir.cluster,
        rawData: saveDir.rawData,
      };
    });
  }

  /**
   * Parse root directory to find save directories.
   * @returns {Object[]} Array of directory entries representing saves
   * @private
   */
  _parseRootDirectory() {
    const rootCluster = this.superblock.rootdirCluster;

    // Read the root dir's first cluster to get the '.' entry which has the entry count
    const firstClusterData = this.readClusterData(rootCluster);
    const dotEntry = parseDirectoryEntry(firstClusterData.slice(0, DIR_ENTRY_SIZE));

    const rootEntry = {
      name: '/',
      isDirectory: true,
      cluster: rootCluster,
      length: dotEntry.length,
      mode: dotEntry.mode,
    };

    const allEntries = this.readDirectoryEntries(rootEntry);
    const saves = [];

    for (const entry of allEntries) {
      if (!entry.exists) continue;
      if (entry.name === '.' || entry.name === '..') continue;
      if (entry.isDirectory) {
        saves.push(entry);
      }
    }

    return saves;
  }

  /**
   * Calculate free, used, and total space on the card.
   * @private
   */
  _calculateSpace() {
    const allocatableClusters = this.superblock.allocEnd - this.superblock.allocOffset;
    this.totalSpace = allocatableClusters * CLUSTER_SIZE;

    // Count clusters used by all saves and the root directory
    let usedClusters = 0;

    // Root directory clusters
    const rootChain = this.getClusterChain(this.superblock.rootdirCluster);
    usedClusters += rootChain.length;

    // Save directory and file clusters
    for (const save of this.entries) {
      const dirChain = this.getClusterChain(save.cluster);
      usedClusters += dirChain.length;

      try {
        const dirEntries = this.readDirectoryEntries(save);
        for (const entry of dirEntries) {
          if (!entry.exists || entry.name === '.' || entry.name === '..') continue;
          if (entry.isFile) {
            const fileChain = this.getClusterChain(entry.cluster);
            usedClusters += fileChain.length;
          }
        }
      } catch (e) {
        // Skip on error
      }
    }

    this.usedSpace = usedClusters * CLUSTER_SIZE;
    this.freeSpace = Math.max(0, this.totalSpace - this.usedSpace);
  }
}

// Export constants for use by other modules
export {
  EXPECTED_FILE_SIZE,
  PAGE_SIZE,
  SPARE_SIZE,
  RAW_PAGE_SIZE,
  PAGES_PER_CLUSTER,
  CLUSTER_SIZE,
  TOTAL_PAGES,
  TOTAL_CLUSTERS,
  DIR_ENTRY_SIZE,
  DF_EXISTS,
  DF_DIRECTORY,
  DF_FILE,
  DF_READ,
  DF_WRITE,
  DF_EXECUTE,
  FAT_CHAIN_END,
  FAT_CHAIN_END_MASKED,
  parseTimestamp,
  parseDirectoryEntry,
  readClusterDataRaw,
  readPageData,
};
