import { describe, expect, it } from 'vitest';
import { generateStartingPassword, passwordSchema } from './password';

describe('generateStartingPassword', () => {
  it('makes 24-char url-safe starting passwords', () => {
    const a = generateStartingPassword(), b = generateStartingPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(b);
  });
  it('makes starting passwords that pass the password rule', () => {
    expect(passwordSchema.safeParse(generateStartingPassword()).success).toBe(true);
  });
});

describe('passwordSchema', () => {
  it('limits password length to 12–72', () => {
    expect(passwordSchema.safeParse('x'.repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(73)).success).toBe(false);
  });
});
