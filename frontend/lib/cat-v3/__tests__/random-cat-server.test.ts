import { describe, it, expect } from 'vitest';
import { generateRandomParamsServer } from '../random-cat-server';

// Valid sprite pool from random-config.json
const VALID_SPRITES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];

const VALID_PELTS = [
  'SingleColour', 'TwoColour', 'Tabby', 'Marbled', 'Rosette', 'Smoke',
  'Ticked', 'Speckled', 'Bengal', 'Mackerel', 'Classic', 'Sokoke',
  'Agouti', 'Singlestripe', 'Masked',
];

const VALID_COLOURS = [
  'WHITE', 'PALEGREY', 'SILVER', 'GREY', 'DARKGREY', 'GHOST', 'BLACK',
  'CREAM', 'PALEGINGER', 'GOLDEN', 'GINGER', 'DARKGINGER', 'SIENNA',
  'LIGHTBROWN', 'LILAC', 'BROWN', 'GOLDEN-BROWN', 'DARKBROWN', 'CHOCOLATE',
];

describe('generateRandomParamsServer', () => {
  it('returns a valid CatParams shape', async () => {
    const params = await generateRandomParamsServer();
    expect(params).toHaveProperty('spriteNumber');
    expect(params).toHaveProperty('peltName');
    expect(params).toHaveProperty('colour');
    expect(params).toHaveProperty('eyeColour');
    expect(params).toHaveProperty('skinColour');
    expect(typeof params.shading).toBe('boolean');
    expect(typeof params.reverse).toBe('boolean');
    expect(typeof params.isTortie).toBe('boolean');
  });

  it('generates a sprite number from the valid pool', async () => {
    for (let i = 0; i < 10; i++) {
      const params = await generateRandomParamsServer();
      expect(VALID_SPRITES).toContain(params.spriteNumber);
    }
  });

  it('does not pick Tortie or Calico as pelt name', async () => {
    for (let i = 0; i < 20; i++) {
      const params = await generateRandomParamsServer();
      expect(params.peltName).not.toBe('Tortie');
      expect(params.peltName).not.toBe('Calico');
      expect(VALID_PELTS).toContain(params.peltName);
    }
  });

  it('applies sprite override', async () => {
    const params = await generateRandomParamsServer({ sprite: 7 });
    expect(params.spriteNumber).toBe(7);
  });

  it('applies pelt override', async () => {
    const params = await generateRandomParamsServer({ pelt: 'Tabby' });
    expect(params.peltName).toBe('Tabby');
  });

  it('applies colour override', async () => {
    const params = await generateRandomParamsServer({ colour: 'GINGER' });
    expect(params.colour).toBe('GINGER');
  });

  it('applies shading override', async () => {
    const params = await generateRandomParamsServer({ shading: true });
    expect(params.shading).toBe(true);
  });

  it('applies torties override > 0 forces tortie', async () => {
    const params = await generateRandomParamsServer({ torties: 2 });
    expect(params.isTortie).toBe(true);
    expect(params.tortie).toBeDefined();
    expect(Array.isArray(params.tortie)).toBe(true);
  });

  it('applies torties override 0 forces no tortie', async () => {
    const params = await generateRandomParamsServer({ torties: 0 });
    expect(params.isTortie).toBe(false);
  });

  it('ignores invalid sprite override', async () => {
    const params = await generateRandomParamsServer({ sprite: 999 });
    // Should fall back to random from valid pool
    expect(VALID_SPRITES).toContain(params.spriteNumber);
  });

  it('ignores invalid pelt override', async () => {
    const params = await generateRandomParamsServer({ pelt: 'NotARealPelt' });
    expect(VALID_PELTS).toContain(params.peltName);
  });

  it('ignores invalid colour override', async () => {
    const params = await generateRandomParamsServer({ colour: 'NOPE' });
    expect(VALID_COLOURS).toContain(params.colour);
  });

  it('generates tortie patterns when torties > 0', async () => {
    const params = await generateRandomParamsServer({ torties: 2 });
    expect(params.tortie).toBeDefined();
    expect(params.tortie!.length).toBeGreaterThanOrEqual(1);
    expect(params.tortieMask).toBeDefined();
    expect(params.tortiePattern).toBeDefined();
    expect(params.tortieColour).toBeDefined();
  });
});
