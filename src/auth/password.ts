import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/** A starting password from the user script: 18 random bytes as base64url, so 24 URL-safe characters. */
export function generateStartingPassword(): string {
  return randomBytes(18).toString('base64url');
}

/** Every pokedash password: Supabase's 12-character minimum, and at most bcrypt's 72. */
export const passwordSchema = z.string().min(12).max(72);
