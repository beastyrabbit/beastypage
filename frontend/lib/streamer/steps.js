/* eslint-disable @typescript-eslint/no-unused-vars */

import spriteMapper from "@/lib/single-cat/spriteMapper";

export function getDefaultStreamParams() {
    return {
        spriteNumber: 8,
        peltName: 'SingleColour',
        colour: 'WHITE',
        isTortie: false,
        tortie: [],
        eyeColour: 'YELLOW',
        eyeColour2: undefined,
        skinColour: 'PINK',
        whitePatches: undefined,
        whitePatchesTint: 'none',
        points: undefined,
        vitiligo: undefined,
        tint: 'none',
        shading: false,
        reverse: false,
        accessory: undefined,
        accessories: [],
        scar: undefined,
        scars: [],
        _tortieLayers: 0,
        _accessorySlots: 0,
        _scarSlots: 0,
        _signupsOpen: true,
        _votesOpen: false,
        _paletteMode: 'classic'
    };
}

export function formatDisplayName(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return `#${value}`;
    return value
        .toString()
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}

export async function ensureSpriteDataLoaded() {
    if (spriteMapper.loaded) return;
    await spriteMapper.init();
}

export function cloneParams(params) {
    return JSON.parse(JSON.stringify(params));
}

function limitUnique(list, limit) {
    const seen = new Set();
    const final = [];
    for (const item of list) {
        if (item === undefined || item === null) continue;
        const key = typeof item === 'string' ? item : JSON.stringify(item);
        if (seen.has(key)) continue;
        seen.add(key);
        final.push(item);
        if (final.length >= limit) break;
    }
    return final;
}

function pickDefaultTortieMask(masks = [], layerIndex = 0, existingMask = null) {
    if (existingMask) {
        return existingMask;
    }
    if (Array.isArray(masks) && masks.length) {
        if (masks.includes('BODY')) {
            return 'BODY';
        }
        if (masks.includes('HALF')) {
            return 'HALF';
        }
        return masks[layerIndex % masks.length] || masks[0];
    }
    return 'ONE';
}

const COLOUR_PALETTE_SOURCES = {
    classic: () => spriteMapper.getColourOptions('off'),
    mood: () => spriteMapper.getColourOptions('mood'),
    bold: () => spriteMapper.getColourOptions('bold'),
    darker: () => spriteMapper.getColourOptions('darker'),
    blackout: () => spriteMapper.getColourOptions('blackout')
};

function resolveColourPalette(mode) {
    const list = [];
    const normalised = (mode || 'classic').toLowerCase();
    if (normalised === 'all') {
        list.push(
            ...spriteMapper.getColourOptions('off'),
            ...spriteMapper.getColourOptions('mood'),
            ...spriteMapper.getColourOptions('bold'),
            ...spriteMapper.getColourOptions('darker'),
            ...spriteMapper.getColourOptions('blackout')
        );
        return limitUnique(list, Number.POSITIVE_INFINITY);
    }
    const source = COLOUR_PALETTE_SOURCES[normalised];
    if (source) {
        return limitUnique(source(), Number.POSITIVE_INFINITY);
    }
    return limitUnique(spriteMapper.getColourOptions('off'), Number.POSITIVE_INFINITY);
}

function buildColourOptions(state) {
    const paletteMode = state?.params?._paletteMode || 'classic';
    const palette = resolveColourPalette(paletteMode);
    return palette.map(colour => ({
        key: colour,
        label: formatDisplayName(colour),
        mutate: params => {
            params.colour = colour;
        }
    }));
}

function buildPatternOptions(state) {
    const peltNames = spriteMapper.getPeltNames();
    const curated = limitUnique(peltNames.filter(name => !/^Legacy/i.test(name)), 18);
    return curated.map(pelt => ({
        key: pelt,
        label: formatDisplayName(pelt),
        mutate: params => {
            params.peltName = pelt;
        }
    }));
}

function applyTortiePreset(params, layers) {
    if (!Array.isArray(layers) || !layers.length) {
        params.isTortie = false;
        params.tortie = [];
        return;
    }

    const basePattern = params.peltName || 'SingleColour';
    const prepared = layers.map(layer => ({
        pattern: layer.pattern || basePattern,
        colour: layer.colour || params.colour || 'GINGER',
        mask: layer.mask || 'ONE'
    }));

    params.isTortie = true;
    params.tortie = prepared;
}

function buildTortieOptions(state) {
    const masks = spriteMapper.getTortieMasks();
    const palette = spriteMapper.getColourOptions('bold');
    const selectMask = index => masks[index] || masks[0] || 'ONE';
    const selectColour = index => palette[index] || state.params?.colour || 'GINGER';

    return [
        {
            key: 'single_coat',
            label: 'Single Coat',
            mutate: params => {
                applyTortiePreset(params, []);
            }
        },
        {
            key: 'ginger_fleck',
            label: 'Ginger Flecks',
            mutate: params => {
                applyTortiePreset(params, [
                    { colour: 'GINGER', mask: selectMask(0) }
                ]);
            }
        },
        {
            key: 'ember_overlay',
            label: 'Ember Overlay',
            mutate: params => {
                applyTortiePreset(params, [
                    { colour: 'GINGER', mask: selectMask(1) },
                    { colour: 'BLACK', mask: selectMask(2) }
                ]);
            }
        },
        {
            key: 'galaxy_blend',
            label: 'Galaxy Blend',
            mutate: params => {
                applyTortiePreset(params, [
                    { colour: selectColour(0), mask: selectMask(3) },
                    { colour: selectColour(1), mask: selectMask(4) }
                ]);
            }
        }
    ];
}

function buildEyePrimaryOptions(state) {
    const eyes = spriteMapper.getEyeColours();
    const curated = limitUnique(eyes, 14);
    return curated.map(colour => ({
        key: `eye_primary_${colour}`,
        label: formatDisplayName(colour),
        mutate: params => {
            params.eyeColour = colour;
            params.eyeColour2 = undefined;
        }
    }));
}

function buildEyeSecondaryOptions(state) {
    const eyes = spriteMapper.getEyeColours();
    const curated = limitUnique(eyes, 14);
    const baseColour = state?.params?.eyeColour;

    const options = curated.map(colour => ({
        key: `eye_secondary_${colour}`,
        label: formatDisplayName(colour),
        mutate: params => {
            params.eyeColour2 = colour === params.eyeColour ? undefined : colour;
        }
    }));

    options.unshift({
        key: 'eye_secondary_match',
        label: 'Match primary eye colour',
        mutate: params => {
            params.eyeColour2 = undefined;
        }
    });

    if (baseColour && !curated.includes(baseColour)) {
        options.push({
            key: `eye_secondary_explicit_${baseColour}`,
            label: formatDisplayName(baseColour),
            mutate: params => {
                params.eyeColour2 = undefined;
            }
        });
    }

    return limitUnique(options, Number.POSITIVE_INFINITY);
}

function buildWhitePatchOptions(state) {
    const patches = spriteMapper.getWhitePatches();
    const curated = limitUnique(['none', ...patches], Number.POSITIVE_INFINITY);
    return curated.map(patch => ({
        key: `patch_${patch}`,
        label: formatDisplayName(patch),
        mutate: params => {
            params.whitePatches = patch === 'none' ? undefined : patch;
        }
    }));
}

function buildPointsOptions(state) {
    const points = spriteMapper.getPoints();
    const curated = limitUnique(['none', ...points], 14);
    return curated.map(point => ({
        key: `points_${point}`,
        label: formatDisplayName(point),
        mutate: params => {
            params.points = point === 'none' ? undefined : point;
        }
    }));
}

function buildVitiligoOptions(state) {
    const vitiligo = spriteMapper.getVitiligo();
    const curated = limitUnique(['none', ...vitiligo], 14);
    return curated.map(item => ({
        key: `vitiligo_${item}`,
        label: formatDisplayName(item),
        mutate: params => {
            params.vitiligo = item === 'none' ? undefined : item;
        }
    }));
}

function buildSkinOptions(state) {
    const skins = spriteMapper.getSkinColours();
    const curated = limitUnique(skins, 12);
    return curated.map(colour => ({
        key: `skin_${colour}`,
        label: formatDisplayName(colour),
        mutate: params => {
            params.skinColour = colour;
        }
    }));
}

function buildTintOptions(state) {
    const tints = spriteMapper.getTints();
    const curated = limitUnique(['none', ...tints], 14);
    return curated.map(tint => ({
        key: `tint_${tint}`,
        label: formatDisplayName(tint),
        mutate: params => {
            params.tint = tint;
        }
    }));
}

const MAX_TORTIE_LAYERS = 4;
const MAX_ACCESSORY_SLOTS = 10;
const MAX_SCAR_SLOTS = 6;

function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function syncTortieState(params) {
    const layers = Array.isArray(params.tortie) ? params.tortie : [];
    let count = clampNumber(params._tortieLayers ?? layers.length ?? 0, 0, MAX_TORTIE_LAYERS);
    if (params.isTortie === false) {
        count = 0;
    }
    params._tortieLayers = count;
    params.isTortie = count > 0;

    const prepared = [];
    for (let i = 0; i < count; i += 1) {
        const layer = layers[i] || {};
        prepared.push({
            pattern: layer.pattern || params.peltName || 'SingleColour',
            colour: layer.colour || params.colour || 'GINGER',
            mask: layer.mask || 'ONE'
        });
    }
    params.tortie = prepared;
    if (params.tortie.length === 0) {
        delete params.tortie;
    }
}

function syncAccessoryState(params) {
    const slots = clampNumber(params._accessorySlots ?? 0, 0, MAX_ACCESSORY_SLOTS);
    const existing = Array.isArray(params.accessories) ? params.accessories : [];
    params._accessorySlots = slots;
    params.accessories = existing.slice(0, slots).map(item => (item === 'none' ? null : item));
    while (params.accessories.length < slots) {
        params.accessories.push(null);
    }
    params.accessory = params.accessories.find(item => typeof item === 'string' && item !== 'none') || undefined;
}

function syncScarState(params) {
    const slots = clampNumber(params._scarSlots ?? 0, 0, MAX_SCAR_SLOTS);
    const existing = Array.isArray(params.scars) ? params.scars : [];
    params.scars = existing
        .slice(0, slots)
        .map(item => (typeof item === 'string' && item !== 'none' ? item : null));

    while (params.scars.length < slots) {
        params.scars.push(null);
    }

    params._scarSlots = slots;
    params.scar = params.scars.find(scar => typeof scar === 'string' && scar !== 'none') || undefined;
}

function syncDerivedState(params) {
    syncTortieState(params);
    syncAccessoryState(params);
    syncScarState(params);
}

function buildTortieToggleOptions() {
    return [
        {
            key: 'tortie_enable',
            label: 'Yes, add tortie overlays',
            mutate: params => {
                params.isTortie = true;
                params._tortieLayers = Math.max(params._tortieLayers ?? 0, 1);
            }
        },
        {
            key: 'tortie_disable',
            label: 'No tortie layers',
            mutate: params => {
                params.isTortie = false;
                params._tortieLayers = 0;
                params.tortie = [];
            }
        }
    ];
}

function buildTortieColourOptions(state, layerIndex) {
    const baseColours = spriteMapper.getColourOptions('off');
    const moodColours = spriteMapper.getColourOptions('mood');
    const boldColours = spriteMapper.getColourOptions('bold');
    const combined = limitUnique([...baseColours, ...moodColours, ...boldColours], Number.POSITIVE_INFINITY);

    return combined.map(colour => ({
        key: `tortie_colour_${layerIndex}_${colour}`,
        label: `Layer ${layerIndex + 1}: Colour ${formatDisplayName(colour)}`,
        mutate: params => {
            if (!Array.isArray(params.tortie)) {
                params.tortie = [];
            }
            const existing = params.tortie[layerIndex] || {};
            const masks = spriteMapper.getTortieMasks();
            params.tortie[layerIndex] = {
                pattern: existing.pattern || params.peltName || 'SingleColour',
                colour,
                mask: pickDefaultTortieMask(masks, layerIndex, existing.mask)
            };
        }
    }));
}

function buildTortiePatternOptions(state, layerIndex) {
    const pelts = spriteMapper.getPeltNames();
    const curated = limitUnique(pelts.filter(name => !/^Legacy/i.test(name)), Number.POSITIVE_INFINITY);
    return curated.map(pattern => ({
        key: `tortie_pattern_${layerIndex}_${pattern}`,
        label: `Layer ${layerIndex + 1}: Pattern ${formatDisplayName(pattern)}`,
        mutate: params => {
            if (!Array.isArray(params.tortie)) {
                params.tortie = [];
            }
            const existing = params.tortie[layerIndex] || {};
            const masks = spriteMapper.getTortieMasks();
            const fallbackMask = pickDefaultTortieMask(masks, layerIndex, existing.mask);
            params.tortie[layerIndex] = {
                pattern,
                colour: existing.colour || 'BLACK',
                mask: fallbackMask
            };
        }
    }));
}

function buildTortieMaskOptions(state, layerIndex) {
    const masks = spriteMapper.getTortieMasks();
    const curated = limitUnique(masks, Number.POSITIVE_INFINITY);
    return curated.map(mask => ({
        key: `tortie_mask_${layerIndex}_${mask}`,
        label: `Layer ${layerIndex + 1}: Mask ${formatDisplayName(mask)}`,
        mutate: params => {
            if (!Array.isArray(params.tortie)) {
                params.tortie = [];
            }
            const existing = params.tortie[layerIndex] || {};
            params.tortie[layerIndex] = {
                pattern: existing.pattern || params.peltName || 'SingleColour',
                colour: existing.colour || params.colour || 'BLACK',
                mask
            };
        }
    }));
}

function buildTortieMoreOptions(state, currentLayers) {
    const next = currentLayers + 1;
    return [
        {
            key: `tortie_more_${next}_yes`,
            label: `Add tortie layer ${next}`,
            mutate: params => {
                params._tortieLayers = clampNumber((params._tortieLayers ?? 0) + 1, 0, MAX_TORTIE_LAYERS);
            }
        },
        {
            key: `tortie_more_${next}_no`,
            label: 'No more tortie layers',
            mutate: params => {
                params._tortieLayers = clampNumber(params._tortieLayers ?? currentLayers, 0, MAX_TORTIE_LAYERS);
            }
        }
    ];
}

function buildAccessoryToggleOptions() {
    return [
        {
            key: 'accessory_enable',
            label: 'Yes, add accessories',
            mutate: params => {
                params._accessorySlots = Math.max(params._accessorySlots ?? 0, 1);
            }
        },
        {
            key: 'accessory_disable',
            label: 'No accessories',
            mutate: params => {
                params._accessorySlots = 0;
                params.accessories = [];
            }
        }
    ];
}

function buildAccessorySelectionOptions(state, slotIndex) {
    const all = spriteMapper.getAccessories?.() || [];
    const plant = spriteMapper.getPlantAccessories?.() || [];
    const wild = spriteMapper.getWildAccessories?.() || [];
    const collars = spriteMapper.getCollars?.() || [];
    const combined = limitUnique(['none', ...all, ...plant, ...wild, ...collars], Number.POSITIVE_INFINITY);
    return combined.map(item => ({
        key: `accessory_slot_${slotIndex}_${item}`,
        label: formatDisplayName(item),
        mutate: params => {
            if (!Array.isArray(params.accessories)) {
                params.accessories = [];
            }
            params.accessories[slotIndex] = item === 'none' ? null : item;
        }
    }));
}

function buildAccessoryMoreOptions(currentSlots) {
    const next = currentSlots + 1;
    return [
        {
            key: `accessory_more_${next}_yes`,
            label: `Add accessory slot ${next}`,
            mutate: params => {
                params._accessorySlots = clampNumber((params._accessorySlots ?? 0) + 1, 0, MAX_ACCESSORY_SLOTS);
            }
        },
        {
            key: `accessory_more_${next}_no`,
            label: 'No more accessories',
            mutate: params => {
                params._accessorySlots = clampNumber(params._accessorySlots ?? currentSlots, 0, MAX_ACCESSORY_SLOTS);
            }
        }
    ];
}

function buildScarToggleOptions() {
    return [
        {
            key: 'scars_enable',
            label: 'Yes, add scars',
            mutate: params => {
                params._scarSlots = Math.max(params._scarSlots ?? 0, 1);
            }
        },
        {
            key: 'scars_disable',
            label: 'No scars',
            mutate: params => {
                params._scarSlots = 0;
                params.scars = [];
            }
        }
    ];
}

function buildScarSelectionOptions(state, slotIndex) {
    const scars = limitUnique([
        ...spriteMapper.getScarsByCategory(1),
        ...spriteMapper.getScarsByCategory(2),
        ...spriteMapper.getScarsByCategory(3)
    ], Number.POSITIVE_INFINITY);

    const options = scars.map(item => ({
        key: `scar_slot_${slotIndex}_${item}`,
        label: formatDisplayName(item),
        mutate: params => {
            if (!Array.isArray(params.scars)) {
                params.scars = [];
            }
            params.scars[slotIndex] = item;
        }
    }));

    options.unshift({
        key: `scar_slot_${slotIndex}_none`,
        label: 'Leave this slot empty',
        mutate: params => {
            if (!Array.isArray(params.scars)) {
                params.scars = [];
            }
            params.scars[slotIndex] = null;
        }
    });

    return options;
}

function buildScarMoreOptions(currentSlots) {
    const next = currentSlots + 1;
    return [
        {
            key: `scar_more_${next}_yes`,
            label: `Add scar slot ${next}`,
            mutate: params => {
                params._scarSlots = clampNumber((params._scarSlots ?? 0) + 1, 0, MAX_SCAR_SLOTS);
            }
        },
        {
            key: `scar_more_${next}_no`,
            label: 'No more scars',
            mutate: params => {
                params._scarSlots = clampNumber(params._scarSlots ?? currentSlots, 0, MAX_SCAR_SLOTS);
            }
        }
    ];
}

function buildPoseOptions(state) {
    const sprites = spriteMapper.getSprites();
    const curated = limitUnique(sprites, 12);
    return curated.map(sprite => ({
        key: `pose_${sprite}`,
        label: `Pose ${formatDisplayName(sprite)}`,
        mutate: params => {
            params.spriteNumber = sprite;
        }
    }));
}

function createStep(id, title, description, optionsBuilder) {
    return {
        id,
        title,
        description,
        getOptions: currentState => optionsBuilder(currentState),
        summarize: option => option?.label || '',
        apply: (option, currentState) => {
            option?.mutate?.(currentState.params, currentState);
            syncDerivedState(currentState.params);
        }
    };
}

export function createStreamSteps(state = { params: getDefaultStreamParams() }) {
    const workingState = state || { params: getDefaultStreamParams() };
    if (!workingState.params) {
        workingState.params = getDefaultStreamParams();
    }

    syncDerivedState(workingState.params);

    const steps = [];

    steps.push(createStep('colour', 'Base Colour', 'Choose the base coat colour that defines the cat.', buildColourOptions));
    steps.push(createStep('pattern', 'Pattern', 'Select the main fur pattern.', buildPatternOptions));

    steps.push(createStep('tortie_toggle', 'Tortie Layers', 'Decide whether to layer tortie patterns.', () => buildTortieToggleOptions()));

    const tortieLayers = workingState.params._tortieLayers ?? 0;
    if (tortieLayers > 0) {
        for (let i = 0; i < tortieLayers; i += 1) {
            const layerIndex = i + 1;
            steps.push(createStep(
                `tortie_layer_${layerIndex}_mask`,
                `Tortie Layer ${layerIndex}: Mask`,
                'Choose the mask that controls where this layer appears.',
                stepState => buildTortieMaskOptions(stepState, i)
            ));
            steps.push(createStep(
                `tortie_layer_${layerIndex}_pattern`,
                `Tortie Layer ${layerIndex}: Pattern`,
                'Select the pattern that shapes this tortie overlay.',
                stepState => buildTortiePatternOptions(stepState, i)
            ));
            steps.push(createStep(
                `tortie_layer_${layerIndex}_colour`,
                `Tortie Layer ${layerIndex}: Colour`,
                'Pick the colour for this tortie overlay.',
                stepState => buildTortieColourOptions(stepState, i)
            ));
        }

        if (tortieLayers < MAX_TORTIE_LAYERS) {
            const nextLayer = tortieLayers + 1;
            steps.push(createStep(
                `tortie_add_layer_${nextLayer}`,
                `Add tortie layer ${nextLayer}?`,
                'Viewers can add up to four tortie overlays.',
                state => buildTortieMoreOptions(state, tortieLayers)
            ));
        }
    }

    steps.push(createStep('eye_primary', 'Primary Eye Colour', 'Pick the main eye colour.', buildEyePrimaryOptions));
    steps.push(createStep('eye_secondary', 'Secondary Eye Colour', 'Choose a secondary eye colour or keep them matching.', buildEyeSecondaryOptions));
    steps.push(createStep('white_patches', 'White Patches', 'Choose a white patch overlay.', buildWhitePatchOptions));
    steps.push(createStep('points_pattern', 'Points Pattern', 'Select a points (siamese-style) highlight.', buildPointsOptions));
    steps.push(createStep('vitiligo_pattern', 'Vitiligo', 'Add vitiligo overlays if desired.', buildVitiligoOptions));
    steps.push(createStep('skin', 'Skin Tone', 'Select nose and ear skin colour.', buildSkinOptions));
    steps.push(createStep('tint', 'Overall Tint', 'Choose an optional tint overlay.', buildTintOptions));

    steps.push(createStep('accessories_toggle', 'Accessories', 'Decide whether to add accessories.', () => buildAccessoryToggleOptions()));
    const accessorySlots = workingState.params._accessorySlots ?? 0;
    if (accessorySlots > 0) {
        for (let i = 0; i < accessorySlots; i += 1) {
            steps.push(createStep(`accessory_slot_${i + 1}`, `Accessory Slot ${i + 1}`, 'Select an accessory for this slot.', state => buildAccessorySelectionOptions(state, i)));
        }
        if (accessorySlots < MAX_ACCESSORY_SLOTS) {
            steps.push(createStep(`accessory_more_${accessorySlots + 1}`, 'Add another accessory?', 'Viewers can queue up to ten accessories.', () => buildAccessoryMoreOptions(accessorySlots)));
        }
    }

    steps.push(createStep('scars_toggle', 'Scars', 'Choose whether to add scars.', () => buildScarToggleOptions()));
    const scarSlots = workingState.params._scarSlots ?? 0;
    if (scarSlots > 0) {
        for (let i = 0; i < scarSlots; i += 1) {
            steps.push(createStep(`scar_slot_${i + 1}`, `Scar Slot ${i + 1}`, 'Pick a scar for this slot.', state => buildScarSelectionOptions(state, i)));
        }
        if (scarSlots < MAX_SCAR_SLOTS) {
            steps.push(createStep(`scar_more_${scarSlots + 1}`, 'Add another scar?', 'Viewers can queue several scars, up to six slots.', () => buildScarMoreOptions(scarSlots)));
        }
    }

    steps.push(createStep('pose', 'Pose', 'Choose the final sprite pose to present the cat.', buildPoseOptions));

    return steps;
}

export function getStepById(steps, id) {
    return steps.find(step => step.id === id) || null;
}
