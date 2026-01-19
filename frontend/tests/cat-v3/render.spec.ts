import { describe, expect, it } from 'bun:test';

import { renderCatV3 } from '@/lib/cat-v3/api';

const baseUrl = process.env.RENDERER_BASE_URL;

// Skip tests if RENDERER_BASE_URL is not set
describe.skipIf(!baseUrl)('renderer-service', () => {
  it('returns a PNG data URL for a simple cat', async () => {
    const result = await renderCatV3(
      {
        spriteNumber: 5,
        params: {
          colour: 'GINGER',
          eyeColour: 'GREEN',
          tint: 'none',
        },
      },
      { baseUrl: baseUrl! }
    );

    expect(result.imageDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.meta.duration_ms).toBeGreaterThanOrEqual(0);
    const pngBytes = Buffer.from(result.imageDataUrl.split(',')[1] ?? '', 'base64');
    expect(pngBytes.length).toBeGreaterThan(50);
  });
});
