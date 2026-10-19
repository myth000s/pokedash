import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('.env.example', () => {
  it('is committed without a CardTrader token', () => {
    const lines = readFileSync('.env.example', 'utf8').split(/\r?\n/);
    const line = lines.find((l) => l.startsWith('CARDTRADER_TOKEN='));
    expect(line).toBeDefined();
    expect(line!.slice('CARDTRADER_TOKEN='.length).trim()).toBe('');
  });
});
