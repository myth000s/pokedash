import { z } from 'zod';
import type { Condition } from '@/domain/types';

export const CT_LANGUAGE_KEY = 'pokemon_language';
export const CT_REVERSE_KEY = 'pokemon_reverse';

export const CT_CONDITIONS: Record<string, Condition> = {
  'Mint': 'mint',
  'Near Mint': 'near_mint',
  'Slightly Played': 'slightly_played',
  'Moderately Played': 'moderately_played',
  'Played': 'played',
  'Poor': 'poor',
};

export const ctExpansionSchema = z
  .object({ id: z.number(), game_id: z.number(), code: z.string(), name: z.string() })
  .passthrough();
export type CtExpansion = z.infer<typeof ctExpansionSchema>;

export const ctBlueprintSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    expansion_id: z.number(),
    card_market_ids: z.array(z.number()).default([]),
  })
  .passthrough();
export type CtBlueprint = z.infer<typeof ctBlueprintSchema>;

export const ctProductSchema = z
  .object({
    id: z.number(),
    blueprint_id: z.number(),
    name_en: z.string(),
    quantity: z.number(),
    price: z.object({ cents: z.number(), currency: z.string() }).passthrough(),
    properties_hash: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    user: z.object({ username: z.string(), country_code: z.string().nullable() }).passthrough(),
    graded: z.boolean().nullish(),
    on_vacation: z.boolean().nullish(),
    bundle_size: z.number().nullish(),
  })
  .passthrough();
export type CtProduct = z.infer<typeof ctProductSchema>;
