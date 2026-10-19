import { describe, it, expect } from 'vitest';
import { splitProductName } from './names';

describe('splitProductName', () => {
  it('takes the last bracket group as the detail, or none', () => {
    expect(splitProductName('Raikou [Amazing Shot]')).toEqual({ title: 'Raikou', detail: 'Amazing Shot' });
    expect(splitProductName('Crobat [G] Lv.44 [Flash Bite | Toxic Fang]')).toEqual({ title: 'Crobat [G] Lv.44', detail: 'Flash Bite | Toxic Fang' });
    expect(splitProductName('30th Celebration Elite Trainer Box')).toEqual({ title: '30th Celebration Elite Trainer Box', detail: null });
  });
});
