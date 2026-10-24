import type { Condition, Confidence, Edition, Marketplace } from '@/domain/types';

/** Splits "Raikou [Amazing Shot]" into a title and the text of the last [...] group. */
export function splitProductName(name: string): { title: string; detail: string | null } {
  if (!name.endsWith(']')) return { title: name, detail: null };
  const open = name.lastIndexOf('[');
  if (open === -1) return { title: name, detail: null };
  const title = name.slice(0, open).trim();
  if (!title) return { title: name, detail: null };
  return { title, detail: name.slice(open + 1, -1) };
}

export const CONDITION_LABELS: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  slightly_played: 'Slightly Played',
  moderately_played: 'Moderately Played',
  played: 'Played',
  poor: 'Poor',
};

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  cardtrader: 'CardTrader',
  ebay: 'eBay',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  insufficient: 'Not enough data',
};

export const EDITION_LABELS: Record<Edition, string> = {
  first_edition: '1st Edition',
  shadowless: 'Shadowless',
  unlimited: 'Unlimited',
};
