export interface TrackedSet {
  key: string;
  name: string;
  cardmarketExpansionIds: number[];
  excludedCategories: string[];
  cardtraderExpansionPrefix: string;
}

export const THIRTIETH_CELEBRATION: TrackedSet = {
  key: '30th-celebration',
  name: '30th Celebration',
  cardmarketExpansionIds: [6601],
  excludedCategories: ['Pokémon Coins', 'PCG Set'],
  cardtraderExpansionPrefix: '30th Celebration',
};

export const TRACKED_SETS: TrackedSet[] = [THIRTIETH_CELEBRATION];
