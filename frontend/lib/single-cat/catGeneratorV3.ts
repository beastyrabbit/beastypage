import {
  renderCatV3,
  renderCatBatchV3,
  decodeImageFromDataUrl,
} from '@/lib/cat-v3/api';
import {
  generateRandomParamsV3,
  type RandomGenerationOptions,
} from '@/lib/cat-v3/randomGenerator';
import type {
  BatchRenderOptions,
  BatchRenderResponse,
  BatchVariantPayload,
  CatParams,
  CatRenderParams,
} from '@/lib/cat-v3/types';

type VariantInput = {
  id: string;
  params: Partial<CatParams>;
  label?: string;
  group?: string;
};

type SlotOverrideKey = 'accessories' | 'scars' | 'tortie';

type LegacyRandomParamsOptions = RandomGenerationOptions & {
  accessoryCount?: number;
  scarCount?: number;
  tortieCount?: number;
};

function clonePlain<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  try {
    return structuredClone(input);
  } catch {
    return JSON.parse(JSON.stringify(input));
  }
}

function coerceSpriteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function splitPayload(params: CatParams | Partial<CatParams>): CatRenderParams {
  const working = clonePlain(params as Record<string, unknown>);
  const spriteNumber = coerceSpriteNumber(
    working.spriteNumber ?? working.sprite_number ?? working.sprite,
    0
  );
  delete working.spriteNumber;
  delete working.sprite_number;
  delete working.sprite;
  return {
    spriteNumber,
    params: working as Omit<CatParams, 'spriteNumber'>,
  };
}

function buildLegacyUrl(params: CatParams | null | undefined): string {
  if (!params) return '';

  const urlParams = new URLSearchParams();
  urlParams.set('version', 'v1');

  const bool = (value: unknown) => (value ? 'true' : 'false');

  urlParams.set('shading', bool(params.shading));
  urlParams.set('reverse', bool(params.reverse));
  urlParams.set('isTortie', bool(params.isTortie));
  urlParams.set('backgroundColour', 'rgb(0 0 0 / 0)');

  if (params.peltName) urlParams.set('peltName', String(params.peltName));
  if (params.spriteNumber !== undefined) urlParams.set('spriteNumber', String(params.spriteNumber));
  if (params.colour) urlParams.set('colour', String(params.colour));
  if (params.tint && params.tint !== 'none') urlParams.set('tint', String(params.tint));
  if (params.skinColour) urlParams.set('skinColour', String(params.skinColour));
  if (params.eyeColour) urlParams.set('eyeColour', String(params.eyeColour));

  if (params.eyeColour2) urlParams.set('eyeColour2', String(params.eyeColour2));
  if (params.whitePatches) urlParams.set('whitePatches', String(params.whitePatches));
  if (params.points) urlParams.set('points', String(params.points));
  if (params.whitePatchesTint && params.whitePatchesTint !== 'none') {
    urlParams.set('whitePatchesTint', String(params.whitePatchesTint));
  }
  if (params.vitiligo) urlParams.set('vitiligo', String(params.vitiligo));

  const accessories = Array.isArray(params.accessories) ? params.accessories : [];
  if (accessories.length > 0) {
    urlParams.set('accessory', String(accessories[0]));
  } else if (params.accessory) {
    urlParams.set('accessory', String(params.accessory));
  }

  const scars = Array.isArray(params.scars) ? params.scars : [];
  if (scars.length > 0) {
    urlParams.set('scar', String(scars[0]));
  } else if (params.scar) {
    urlParams.set('scar', String(params.scar));
  }

  if (params.isTortie) {
    if (params.tortieMask) urlParams.set('tortieMask', String(params.tortieMask));
    if (params.tortiePattern) urlParams.set('tortiePattern', String(params.tortiePattern));
    if (params.tortieColour) urlParams.set('tortieColour', String(params.tortieColour));
  }

  return `https://cgen-tools.github.io/pixel-cat-maker/?${urlParams.toString()}`;
}

export class CatGeneratorV3 {
  private readonly baseUrl?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl;
  }

  async generateCat(params: CatParams) {
    const payload = splitPayload(params);
    const response = await renderCatV3(payload, { baseUrl: this.baseUrl });
    const canvas = await decodeImageFromDataUrl(response.imageDataUrl);
    return {
      canvas,
      meta: response.meta,
      imageDataUrl: response.imageDataUrl,
    };
  }

  async generateRandomParams(options: LegacyRandomParamsOptions = {}) {
    const {
      accessoryCount,
      scarCount,
      tortieCount,
      slotOverrides,
      ...rest
    } = options;

    const overrides: Partial<Record<SlotOverrideKey, number>> = {
      ...(slotOverrides ?? {}),
    };

    if (typeof accessoryCount === 'number' && Number.isFinite(accessoryCount)) {
      overrides.accessories = Math.max(0, Math.trunc(accessoryCount));
    }
    if (typeof scarCount === 'number' && Number.isFinite(scarCount)) {
      overrides.scars = Math.max(0, Math.trunc(scarCount));
    }
    if (typeof tortieCount === 'number' && Number.isFinite(tortieCount)) {
      overrides.tortie = Math.max(0, Math.trunc(tortieCount));
    }

    const mapped: RandomGenerationOptions = {
      ...rest,
      slotOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    };

    return generateRandomParamsV3(mapped);
  }

  async generateRandomCat(options: Record<string, unknown> = {}) {
    const params = await this.generateRandomParams(options as LegacyRandomParamsOptions);
    const result = await this.generateCat(params);
    return { params, canvas: result.canvas };
  }

  buildCatURL(params: CatParams) {
    return buildLegacyUrl(params);
  }

  async generateVariantSheet(
    baseParams: CatParams,
    variants: VariantInput[],
    options?: (BatchRenderOptions & { priority?: RequestPriority })
  ): Promise<BatchRenderResponse> {
    const payload = splitPayload(baseParams);
    const preparedVariants: BatchVariantPayload[] = variants.map((variant) => {
      const variantPayload = splitPayload(variant.params);
      return {
        id: variant.id,
        label: variant.label,
        group: variant.group,
        spriteNumber: variantPayload.spriteNumber,
        params: variantPayload.params,
      };
    });

    const { priority, ...batchOptions } = options ?? {};

    return renderCatBatchV3(
      {
        payload,
        variants: preparedVariants,
        options: {
          includeSources: batchOptions.includeSources ?? false,
          includeBase: batchOptions.includeBase ?? false,
          tileSize: batchOptions.tileSize,
          columns: batchOptions.columns,
          frameMode: batchOptions.frameMode,
          layerId: batchOptions.layerId,
        },
      },
      { baseUrl: this.baseUrl, priority }
    );
  }
}

const catGenerator = new CatGeneratorV3();

export default catGenerator;
