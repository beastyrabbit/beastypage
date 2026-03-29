import { describe, it, expect } from 'vitest';
import { generateRandomParamsServer } from '../random-cat-server';
import { getColorNamesForPalette } from '@/lib/palettes';

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

  it('fills exact accessory slot counts when exactLayerCounts is true', async () => {
    const params = await generateRandomParamsServer(
      { accessories: 4, scars: 0, torties: 0 },
      { exactLayerCounts: true },
    );
    expect(params.accessories).toHaveLength(4);
  });

  it('fills exact scar slot counts when exactLayerCounts is true', async () => {
    const params = await generateRandomParamsServer(
      { accessories: 0, scars: 4, torties: 0 },
      { exactLayerCounts: true },
    );
    expect(params.scars).toHaveLength(4);
  });

  it('fills exact tortie slot counts when exactLayerCounts is true', async () => {
    const params = await generateRandomParamsServer(
      { accessories: 0, scars: 0, torties: 4 },
      { exactLayerCounts: true },
    );
    expect(params.isTortie).toBe(true);
    expect(params.tortie).toHaveLength(4);
  });

  it('forces no tortie when exactLayerCounts is true and torties is 0', async () => {
    const params = await generateRandomParamsServer(
      { accessories: 0, scars: 0, torties: 0 },
      { exactLayerCounts: true },
    );
    expect(params.isTortie).toBe(false);
    expect(params.tortie).toBeUndefined();
  });

  it('keeps placeholder-capable sparse legacy behavior when exactLayerCounts is false', async () => {
    const seenSparse = new Set<string>();

    for (let i = 0; i < 25; i += 1) {
      const params = await generateRandomParamsServer(
        { accessories: 4, scars: 4, torties: 4 },
        { exactLayerCounts: false },
      );
      seenSparse.add([
        params.accessories?.length ?? 0,
        params.scars?.length ?? 0,
        params.tortie?.length ?? 0,
      ].join(':'));
    }

    expect(Array.from(seenSparse).some((entry) => entry !== '4:4:4')).toBe(true);
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

  it('uses new pattern palette colours when palette overrides are provided', async () => {
    const allowed = new Set(getColorNamesForPalette('chevron-patterns'));
    expect(allowed.size).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      const params = await generateRandomParamsServer({
        palettes: ['chevron-patterns'],
        torties: 2,
      });

      expect(allowed.has(params.colour)).toBe(true);
      for (const layer of params.tortie ?? []) {
        if (layer?.colour) {
          expect(allowed.has(layer.colour)).toBe(true);
        }
      }
    }
  });

  it('does not fall back to classic colours when multiple pattern palettes are selected', async () => {
    const allowed = new Set([
      ...getColorNamesForPalette('chevron-patterns'),
      ...getColorNamesForPalette('houndstooth-patterns'),
    ]);
    expect(allowed.size).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      const params = await generateRandomParamsServer({
        palettes: ['chevron-patterns', 'houndstooth-patterns'],
      });
      expect(allowed.has(params.colour)).toBe(true);
      expect(VALID_COLOURS).not.toContain(params.colour);
    }
  });
});
