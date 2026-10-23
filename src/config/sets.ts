export interface TrackedSet {
  key: string;
  name: string;
  era: 'modern' | 'vintage';
  cardmarketExpansionIds: number[];
  excludedCategories: string[];
  cardtraderExpansionPrefix: string;
  /** Exact CardTrader expansions; used instead of the prefix when present. */
  cardtraderExpansionIds?: number[];
  /** The CardTrader expansion whose non-1st-Edition offers are Shadowless. */
  shadowlessExpansionId?: number;
  hasFirstEdition: boolean;
  usPrices: boolean;
}

export const THIRTIETH_CELEBRATION: TrackedSet = {
  key: '30th-celebration',
  name: '30th Celebration',
  era: 'modern',
  cardmarketExpansionIds: [6601],
  excludedCategories: ['Pokémon Coins', 'PCG Set'],
  cardtraderExpansionPrefix: '30th Celebration',
  hasFirstEdition: false,
  usPrices: true,
};

function wotc(
  key: string, name: string, cardtraderExpansionIds: number[], cardmarketExpansionId: number,
  hasFirstEdition: boolean, shadowlessExpansionId?: number,
): TrackedSet {
  return {
    key, name, era: 'vintage',
    cardmarketExpansionIds: [cardmarketExpansionId],
    excludedCategories: ['Pokémon Coins'],
    cardtraderExpansionPrefix: name,
    cardtraderExpansionIds,
    ...(shadowlessExpansionId === undefined ? {} : { shadowlessExpansionId }),
    hasFirstEdition,
    usPrices: false,
  };
}

export const BASE_SET = wotc('base-set', 'Base Set', [1472, 1969], 1523, true, 1969);
export const JUNGLE = wotc('jungle', 'Jungle', [1473], 1525, true);
export const FOSSIL = wotc('fossil', 'Fossil', [1476], 1526, true);
export const BASE_SET_2 = wotc('base-set-2', 'Base Set 2', [1478], 1527, false);
export const TEAM_ROCKET = wotc('team-rocket', 'Team Rocket', [1479], 1528, true);
export const GYM_HEROES = wotc('gym-heroes', 'Gym Heroes', [1480], 1529, true);
export const GYM_CHALLENGE = wotc('gym-challenge', 'Gym Challenge', [1481], 1530, true);
export const NEO_GENESIS = wotc('neo-genesis', 'Neo Genesis', [1482], 1531, true);
export const NEO_DISCOVERY = wotc('neo-discovery', 'Neo Discovery', [1483], 1532, true);
export const NEO_REVELATION = wotc('neo-revelation', 'Neo Revelation', [1485], 1533, true);
export const NEO_DESTINY = wotc('neo-destiny', 'Neo Destiny', [1486], 1534, true);
export const LEGENDARY_COLLECTION = wotc('legendary-collection', 'Legendary Collection', [1487], 1535, false);
export const EXPEDITION = wotc('expedition', 'Expedition Base Set', [1488], 1536, false);
export const AQUAPOLIS = wotc('aquapolis', 'Aquapolis', [1491], 1537, false);
export const SKYRIDGE = wotc('skyridge', 'Skyridge', [1492], 1538, false);

export const TRACKED_SETS: TrackedSet[] = [
  THIRTIETH_CELEBRATION,
  BASE_SET,
  JUNGLE,
  FOSSIL,
  BASE_SET_2,
  TEAM_ROCKET,
  GYM_HEROES,
  GYM_CHALLENGE,
  NEO_GENESIS,
  NEO_DISCOVERY,
  NEO_REVELATION,
  NEO_DESTINY,
  LEGENDARY_COLLECTION,
  EXPEDITION,
  AQUAPOLIS,
  SKYRIDGE,
];

export function findSet(key: string): TrackedSet | undefined {
  return TRACKED_SETS.find((s) => s.key === key);
}
