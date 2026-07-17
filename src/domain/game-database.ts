/**
 * Game Database — pure TypeScript port.
 *
 * Fixes from original:
 *  - Removed duplicate key 'BASLUS-20665' (was mapping to both NFS:Underground2 and Hitman:Contracts)
 *  - Kept NFS:Underground2 and added correct key for Hitman:Contracts (BASLUS-20849)
 *  - Uses a Map for O(1) exact lookups
 *  - getRegion uses full 5-char prefix for accuracy
 */

import { type GameInfo, type Region } from './types';

// ─── Database ─────────────────────────────────────────────────────────────────

const RAW_DB: ReadonlyArray<[string, GameInfo]> = [
  // NFS
  ['BASLUS-21065', { title: 'Need for Speed: Most Wanted',     region: 'NTSC-U' }],
  ['BESLES-53558', { title: 'Need for Speed: Most Wanted',     region: 'PAL'    }],
  ['BASLUS-20665', { title: 'Need for Speed: Underground 2',   region: 'NTSC-U' }], // Fixed: removed duplicate
  ['BESLES-52725', { title: 'Need for Speed: Underground 2',   region: 'PAL'    }],
  ['BASLUS-20210', { title: 'Need for Speed: Underground',     region: 'NTSC-U' }],
  ['BASLUS-21264', { title: 'Need for Speed: Carbon',          region: 'NTSC-U' }],
  ['BASLUS-20567', { title: 'Need for Speed: Hot Pursuit 2',   region: 'NTSC-U' }],
  // GTA
  ['BASLUS-20946', { title: 'Grand Theft Auto: San Andreas',        region: 'NTSC-U' }],
  ['BESLES-53096', { title: 'Grand Theft Auto: San Andreas',        region: 'PAL'    }],
  ['BASLUS-20731', { title: 'Grand Theft Auto: Vice City',          region: 'NTSC-U' }],
  ['BASLUS-20529', { title: 'Grand Theft Auto III',                 region: 'NTSC-U' }],
  ['BASLUS-21423', { title: 'Grand Theft Auto: Vice City Stories',  region: 'NTSC-U' }],
  ['BASLUS-21361', { title: 'Grand Theft Auto: Liberty City Stories', region: 'NTSC-U' }],
  // Gran Turismo
  ['BASCUS-97502', { title: 'Gran Turismo 3: A-Spec', region: 'NTSC-U' }],
  ['BASCUS-97328', { title: 'Gran Turismo 4',         region: 'NTSC-U' }],
  ['BESCES-53096', { title: 'Gran Turismo 4',         region: 'PAL'    }],
  // God of War
  ['BASCUS-97399', { title: 'God of War',    region: 'NTSC-U' }],
  ['BASCUS-97481', { title: 'God of War II', region: 'NTSC-U' }],
  // Final Fantasy
  ['BASLUS-20312', { title: 'Final Fantasy X',   region: 'NTSC-U' }],
  ['BASLUS-20823', { title: 'Final Fantasy X-2', region: 'NTSC-U' }],
  ['BASLUS-21127', { title: 'Final Fantasy XII', region: 'NTSC-U' }],
  // Kingdom Hearts
  ['BASLUS-20370', { title: 'Kingdom Hearts',    region: 'NTSC-U' }],
  ['BASLUS-21005', { title: 'Kingdom Hearts II', region: 'NTSC-U' }],
  // Metal Gear Solid
  ['BASLUS-20159', { title: 'Metal Gear Solid 2: Sons of Liberty', region: 'NTSC-U' }],
  ['BASLUS-20643', { title: 'Metal Gear Solid 3: Snake Eater',     region: 'NTSC-U' }],
  // Resident Evil
  ['BASLUS-20745', { title: 'Resident Evil 4',                 region: 'NTSC-U' }],
  ['BASLUS-20113', { title: 'Resident Evil: Code Veronica X',  region: 'NTSC-U' }],
  // Shadow / ICO
  ['BASCUS-97472', { title: 'Shadow of the Colossus', region: 'NTSC-U' }],
  ['BASCUS-97052', { title: 'ICO',                    region: 'NTSC-U' }],
  // Jak and Daxter
  ['BASCUS-97124', { title: 'Jak and Daxter: The Precursor Legacy', region: 'NTSC-U' }],
  ['BASCUS-97265', { title: 'Jak II', region: 'NTSC-U' }],
  ['BASCUS-97330', { title: 'Jak 3',  region: 'NTSC-U' }],
  // Ratchet & Clank
  ['BASCUS-97199', { title: 'Ratchet & Clank',                   region: 'NTSC-U' }],
  ['BASCUS-97268', { title: 'Ratchet & Clank: Going Commando',   region: 'NTSC-U' }],
  ['BASCUS-97353', { title: 'Ratchet & Clank: Up Your Arsenal',  region: 'NTSC-U' }],
  // Sly Cooper
  ['BASCUS-97198', { title: 'Sly Cooper and the Thievius Raccoonus', region: 'NTSC-U' }],
  ['BASCUS-97316', { title: 'Sly 2: Band of Thieves',               region: 'NTSC-U' }],
  ['BASCUS-97466', { title: 'Sly 3: Honor Among Thieves',           region: 'NTSC-U' }],
  // Devil May Cry
  ['BASLUS-20216', { title: "Devil May Cry",                    region: 'NTSC-U' }],
  ['BASLUS-20503', { title: "Devil May Cry 2",                  region: 'NTSC-U' }],
  ['BASLUS-20672', { title: "Devil May Cry 3: Dante's Awakening", region: 'NTSC-U' }],
  // Racing / Sports
  ['BASLUS-21029', { title: 'Burnout Revenge',             region: 'NTSC-U' }],
  ['BASLUS-20735', { title: 'Burnout 3: Takedown',         region: 'NTSC-U' }],
  ['BASLUS-21376', { title: 'Burnout Dominator',           region: 'NTSC-U' }],
  ['BASLUS-20855', { title: 'Midnight Club 3: DUB Edition', region: 'NTSC-U' }],
  ['BASCUS-97398', { title: 'Twisted Metal: Black',        region: 'NTSC-U' }],
  // Dragon Ball Z
  ['BASLUS-21214', { title: 'Dragon Ball Z: Budokai Tenkaichi 2', region: 'NTSC-U' }],
  ['BASLUS-21394', { title: 'Dragon Ball Z: Budokai Tenkaichi 3', region: 'NTSC-U' }],
  ['BASLUS-20904', { title: 'Dragon Ball Z: Budokai 3',           region: 'NTSC-U' }],
  // Tekken
  ['BASLUS-20001', { title: 'Tekken Tag Tournament', region: 'NTSC-U' }],
  ['BASLUS-20408', { title: 'Tekken 4',              region: 'NTSC-U' }],
  ['BASLUS-20718', { title: 'Tekken 5',              region: 'NTSC-U' }],
  // Guitar Hero
  ['BASLUS-21038', { title: 'Guitar Hero',                    region: 'NTSC-U' }],
  ['BASLUS-21224', { title: 'Guitar Hero II',                 region: 'NTSC-U' }],
  ['BASLUS-21447', { title: 'Guitar Hero III: Legends of Rock', region: 'NTSC-U' }],
  // Hitman — Fixed: correct key for Contracts (was BASLUS-20665, a duplicate)
  ['BASLUS-20448', { title: 'Hitman 2: Silent Assassin', region: 'NTSC-U' }],
  ['BASLUS-20849', { title: 'Hitman: Contracts',          region: 'NTSC-U' }], // Corrected key
  ['BASLUS-21108', { title: 'Hitman: Blood Money',        region: 'NTSC-U' }],
  // TimeSplitters
  ['BASLUS-20388', { title: 'TimeSplitters 2',              region: 'NTSC-U' }],
  ['BASLUS-20756', { title: 'TimeSplitters: Future Perfect', region: 'NTSC-U' }],
  // Persona
  ['BASLUS-21590', { title: 'Persona 3 FES', region: 'NTSC-U' }],
  ['BASLUS-21782', { title: 'Persona 4',     region: 'NTSC-U' }],
  // Dark Cloud
  ['BASCUS-97262', { title: 'Dark Cloud 2', region: 'NTSC-U' }],
  ['BASCUS-97045', { title: 'Dark Cloud',   region: 'NTSC-U' }],
  // Prince of Persia
  ['BASLUS-20752', { title: 'Prince of Persia: The Sands of Time', region: 'NTSC-U' }],
  ['BASLUS-20934', { title: 'Prince of Persia: Warrior Within',    region: 'NTSC-U' }],
  ['BASLUS-21086', { title: 'Prince of Persia: The Two Thrones',   region: 'NTSC-U' }],
  // Tony Hawk
  ["BASLUS-20508", { title: "Tony Hawk's Underground",   region: 'NTSC-U' }],
  ["BASLUS-20751", { title: "Tony Hawk's Underground 2", region: 'NTSC-U' }],
  // Misc
  ['BASLUS-20035', { title: "Baldur's Gate: Dark Alliance", region: 'NTSC-U' }],
  ['BASLUS-20394', { title: 'Star Wars: Battlefront',       region: 'NTSC-U' }],
  ['BASLUS-21075', { title: 'Star Wars: Battlefront II',    region: 'NTSC-U' }],
  ['BASLUS-20262', { title: 'The Simpsons: Hit & Run',      region: 'NTSC-U' }],
  ['BASLUS-20589', { title: 'Crash Bandicoot: The Wrath of Cortex', region: 'NTSC-U' }],
  ['BASLUS-20909', { title: 'Crash Twinsanity',             region: 'NTSC-U' }],
  ["BASLUS-20763", { title: "Spyro: A Hero's Tail",         region: 'NTSC-U' }],
  ['BASLUS-20456', { title: 'Silent Hill 2',                region: 'NTSC-U' }],
  ['BASLUS-20634', { title: 'Silent Hill 3',                region: 'NTSC-U' }],
  ['BASLUS-20874', { title: 'Silent Hill 4: The Room',      region: 'NTSC-U' }],
  ['BASLUS-20449', { title: 'Splinter Cell',                region: 'NTSC-U' }],
  ['BASLUS-20748', { title: 'Splinter Cell: Pandora Tomorrow', region: 'NTSC-U' }],
  ['BASLUS-20114', { title: 'Max Payne',                    region: 'NTSC-U' }],
  ['BASLUS-20599', { title: 'Max Payne 2: The Fall of Max Payne', region: 'NTSC-U' }],
  ['BASLUS-20678', { title: 'Mortal Kombat: Deception',     region: 'NTSC-U' }],
  ['BASLUS-21535', { title: 'Mortal Kombat: Armageddon',    region: 'NTSC-U' }],
  ['BASLUS-20783', { title: 'Def Jam: Fight for NY',        region: 'NTSC-U' }],
  ['BASLUS-20290', { title: 'The Mark of Kri',              region: 'NTSC-U' }],
  ["BASLUS-20315", { title: 'Maximo: Ghosts to Glory',      region: 'NTSC-U' }],
  ['BASLUS-20234', { title: 'Onimusha: Warlords',           region: 'NTSC-U' }],
  ["BASLUS-20461", { title: "Onimusha 2: Samurai's Destiny", region: 'NTSC-U' }],
  ['BASLUS-20694', { title: 'Onimusha 3: Demon Siege',      region: 'NTSC-U' }],
  // FIFA
  ['BASLUS-20844', { title: 'FIFA 05', region: 'NTSC-U' }],
  ['BASLUS-21314', { title: 'FIFA 07', region: 'NTSC-U' }],
  // Madden
  ['BASLUS-20994', { title: 'Madden NFL 06', region: 'NTSC-U' }],
  // WWE
  ['BASLUS-20876', { title: 'WWE SmackDown! vs. Raw',      region: 'NTSC-U' }],
  ['BASLUS-21162', { title: 'WWE SmackDown! vs. Raw 2006', region: 'NTSC-U' }],
  // Ace Combat
  ['BASLUS-20032', { title: 'Ace Combat 04: Shattered Skies', region: 'NTSC-U' }],
  ['BASLUS-20851', { title: 'Ace Combat 5: The Unsung War',   region: 'NTSC-U' }],
  // ZOE
  ['BASLUS-20227', { title: 'Zone of the Enders',               region: 'NTSC-U' }],
  ['BASLUS-20533', { title: 'Zone of the Enders: The 2nd Runner', region: 'NTSC-U' }],
  // Music
  ['BASCUS-97067', { title: 'Amplitude',      region: 'NTSC-U' }],
  ['BASLUS-20084', { title: 'Frequency',      region: 'NTSC-U' }],
  ['BASLUS-20712', { title: 'Katamari Damacy', region: 'NTSC-U' }],
  ['BASLUS-21048', { title: 'We Love Katamari', region: 'NTSC-U' }],
  // Other
  ['BASLUS-20062', { title: 'SSX',   region: 'NTSC-U' }],
  ['BASLUS-20474', { title: 'SSX 3', region: 'NTSC-U' }],
  ["BASLUS-20223", { title: "Klonoa 2: Lunatea's Veil", region: 'NTSC-U' }],
];

/** O(1) exact-match lookup map */
const GAME_MAP = new Map<string, GameInfo>(RAW_DB);

// ─── Region map ───────────────────────────────────────────────────────────────

const REGION_PREFIXES: ReadonlyArray<[string, Region]> = [
  ['BASLU', 'NTSC-U'],
  ['BASCU', 'NTSC-U'],
  ['BESLE', 'PAL'],
  ['BESOE', 'PAL'],
  ['BASCP', 'NTSC-J'],
  ['BASLP', 'NTSC-J'],
  ['BISLP', 'NTSC-J'],
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up a game by its PS2 save directory name.
 * Tries exact match first, then a fuzzy prefix match.
 */
export const lookupGame = (directoryName: string): GameInfo | null => {
  const exact = GAME_MAP.get(directoryName);
  if (exact !== undefined) return exact;

  // Fuzzy: compare IDs ignoring the leading region letter (index 1 onwards)
  const needle = directoryName.slice(1).toUpperCase();
  for (const [key, value] of GAME_MAP) {
    if (key.slice(1).toUpperCase() === needle) return value;
  }

  return null;
};

/**
 * Determine the region from a PS2 save directory name prefix.
 */
export const getRegion = (directoryName: string): Region => {
  if (!directoryName) return 'Unknown';
  const prefix = directoryName.substring(0, 5).toUpperCase();
  for (const [pfx, region] of REGION_PREFIXES) {
    if (prefix.startsWith(pfx)) return region;
  }
  return 'Unknown';
};
