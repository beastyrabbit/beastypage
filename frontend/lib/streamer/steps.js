/* eslint-disable @typescript-eslint/no-unused-vars */

import spriteMapper from "@/lib/single-cat/spriteMapper";
import {
    applyCoatChoice,
    getCoatChoiceValues,
    getCoatPatternName,
} from "@/lib/cat-v3/coatPatterns";
import { DEFAULT_POSE_NAME, getUserSelectablePoseNames } from "@/lib/cat-v3/poseOptions";
import {
    getTraitEditorDefinitionsFromCatalog,
    publicCatCatalog,
} from "@/lib/cat-system/catalog";
import {
    legacyParamsToCatDocument,
    projectCanonicalRegistryTraitsToLegacy,
    syncChangedRegistryTraitsFromLegacy,
} from "@/lib/cat-system/document";

// These traits predate the registry fallback. Keeping them here preserves the
// current voting flow while every newly compiled trait gets a generic step.
const STREAMER_BASELINE_TRAIT_IDS = new Set([
    'pose',
    'pelt',
    'coatPattern',
    'colour',
    'tortie',
    'tint',
    'whitePatches',
    'points',
    'whitePatchesTint',
    'vitiligo',
    'eyeColour',
    'eyeColour2',
    'scars',
    'shading',
    'lighting',
    'darkForest',
    'dead',
    'skinColour',
    'accessories',
    'reverse',
]);

export function getDefaultStreamParams() {
    return {
        spriteNumber: 8,
        poseName: DEFAULT_POSE_NAME,
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
    const coatPatternName = getCoatPatternName(value);
    if (coatPatternName) return coatPatternName;
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

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function registryOptionKey(traitId, value) {
    const suffix = value === undefined ? 'none' : String(value);
    return `registry_${traitId}_${encodeURIComponent(suffix)}`;
}

function setRegistryTraitValue(
    params,
    source,
    traitId,
    value
) {
    const existingTraits = isRecord(params.traits) ? params.traits : {};
    const projected = legacyParamsToCatDocument(params);
    const traits = {
        ...cloneParams(projected.traits),
        ...cloneParams(existingTraits),
    };
    if (value === undefined) {
        delete traits[traitId];
    } else {
        traits[traitId] = cloneParams(value);
    }
    params.schemaVersion = source.schemaVersion ?? projected.schemaVersion;
    params.traits = traits;
}

function getRegistryVotingDefinitions(source, poseName, handledTraitIds) {
    const handled = new Set(handledTraitIds);
    const traits = new Map(source.traits.map(trait => [trait.id, trait]));
    return getTraitEditorDefinitionsFromCatalog(source, poseName).filter(definition => {
        const trait = traits.get(definition.traitId);
        return Boolean(
            trait &&
            !handled.has(definition.traitId) &&
            trait.capabilities.display &&
            trait.capabilities.reveal !== false
        );
    });
}

function activeCatalogOptions(source, catalogId, poseName) {
    return (source.catalogs[catalogId] || []).filter(element =>
        !element.deprecated &&
        element.id.toLowerCase() !== 'none' &&
        (!element.poses || !poseName || element.poses.includes(poseName))
    );
}

function addCompoundPreset(options, seen, keyValue, label, value) {
    if (!Array.isArray(value)) return;
    const serialized = JSON.stringify(value);
    if (seen.has(serialized)) return;
    seen.add(serialized);
    options.push({
        value: cloneParams(value),
        keyValue,
        label,
    });
}

function buildCompoundListVotingOptions(
    source,
    trait,
    definition,
    poseName,
    currentValue
) {
    const binding = trait.gacha;
    const options = [];
    const seen = new Set();
    if (binding?.strategy === 'tortieList' && definition.maxItems !== 0) {
        const masks = activeCatalogOptions(source, binding.maskCatalog, poseName);
        const patterns = activeCatalogOptions(source, binding.peltCatalog, poseName);
        const colours = activeCatalogOptions(source, binding.colourCatalog, poseName);
        if (masks.length > 0 && patterns.length > 0 && colours.length > 0) {
            // tortieList defines the compound value contract. Use masks as the
            // bounded candidate set and rotate through the other two catalogs.
            for (const [index, mask] of masks.entries()) {
                const pattern = patterns[index % patterns.length];
                const colour = colours[index % colours.length];
                addCompoundPreset(
                    options,
                    seen,
                    mask.id,
                    [mask, pattern, colour]
                        .map(element => element.label || formatDisplayName(element.id))
                        .join(' / '),
                    [{
                        mask: mask.id,
                        pattern: pattern.id,
                        colour: colour.id,
                    }]
                );
            }
        }
    }

    // A compile-valid compoundList may deliberately opt out of gacha. Its
    // schema is not part of the public catalog, so only known-valid presets can
    // be offered without guessing at object fields.
    if (definition.required || (Array.isArray(currentValue) && currentValue.length > 0)) {
        addCompoundPreset(options, seen, 'current', 'Keep current value', currentValue);
    }
    if (
        definition.required ||
        (Array.isArray(trait.value.default) && trait.value.default.length > 0)
    ) {
        addCompoundPreset(
            options,
            seen,
            'default',
            'Use default value',
            trait.value.default
        );
    }
    return options;
}

function buildRegistryVotingOptions(
    source,
    trait,
    definition,
    poseName,
    currentValue
) {
    let options;
    if (definition.kind === 'toggle' && definition.valueKind === 'boolean') {
        options = [
            {
                value: false,
                keyValue: 'false',
                label: `No ${definition.label.toLowerCase()}`,
            },
            {
                value: true,
                keyValue: 'true',
                label: definition.label,
            },
        ];
    } else if (
        definition.kind === 'compoundList' &&
        definition.valueKind === 'objectList'
    ) {
        options = buildCompoundListVotingOptions(
            source,
            trait,
            definition,
            poseName,
            currentValue
        );
        if (!definition.required) {
            options.unshift({
                value: [],
                keyValue: 'none',
                label: 'None',
            });
        }
    } else {
        const isSingleChoice =
            definition.kind === 'select' && definition.valueKind === 'string';
        const isListChoice =
            definition.kind === 'list' && definition.valueKind === 'stringList';
        if (!isSingleChoice && !isListChoice) {
            throw new Error(
                `Streamer voting has no generic editor for ${definition.traitId} (${definition.kind}/${definition.valueKind})`
            );
        }
        const catalogOptions = definition.options.filter(
            element => !element.deprecated && element.id.toLowerCase() !== 'none'
        );
        if (catalogOptions.length === 0) {
            throw new Error(
                `Streamer voting trait ${definition.traitId} has no catalog options`
            );
        }

        options = catalogOptions.map(element => ({
            value: isListChoice ? [element.id] : element.id,
            keyValue: element.id,
            label: element.label || formatDisplayName(element.id),
        }));
        if (!definition.required) {
            options.unshift({
                value: isListChoice ? [] : undefined,
                keyValue: 'none',
                label: 'None',
            });
        }
    }
    return options.map(option => ({
        key: registryOptionKey(definition.traitId, option.keyValue),
        label: option.label,
        mutate: params => {
            setRegistryTraitValue(
                params,
                source,
                definition.traitId,
                option.value
            );
        },
    }));
}

/**
 * Generic voting adapter used for traits added after the original voting UI.
 * The generated catalog supplies the editor shape and pose-filtered options.
 */
export function createRegistryTraitVotingSteps(
    source,
    state = { params: getDefaultStreamParams() },
    handledTraitIds = STREAMER_BASELINE_TRAIT_IDS
) {
    const params = state?.params || getDefaultStreamParams();
    const definitions = getRegistryVotingDefinitions(
        source,
        params.poseName,
        handledTraitIds
    );
    return definitions.map(definition => {
        const trait = source.traits.find(candidate => candidate.id === definition.traitId);
        if (!trait) {
            throw new Error(`Streamer voting trait ${definition.traitId} is missing`);
        }
        const options = buildRegistryVotingOptions(
            source,
            trait,
            definition,
            params.poseName,
            isRecord(params.traits) ? params.traits[definition.traitId] : undefined
        );
        return createStep(
            `registry_trait_${definition.traitId}`,
            definition.label,
            definition.description || `Choose ${definition.label.toLowerCase()}.`,
            () => options
        );
    });
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
    const coatChoices = getCoatChoiceValues(spriteMapper.getPeltNames());
    const curated = limitUnique(coatChoices.filter(name => !/^Legacy/i.test(name)), Number.POSITIVE_INFINITY);
    return curated.map(coatChoice => ({
        key: coatChoice,
        label: formatDisplayName(coatChoice),
        mutate: params => {
            applyCoatChoice(params, coatChoice);
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
    const existing = Array.isArray(params.accessories) ? params.accessories : [];
    const slots = clampNumber(
        params._accessorySlots ?? existing.length,
        0,
        MAX_ACCESSORY_SLOTS
    );
    params._accessorySlots = slots;
    params.accessories = existing.slice(0, slots).map(item => (item === 'none' ? null : item));
    while (params.accessories.length < slots) {
        params.accessories.push(null);
    }
    params.accessory = params.accessories.find(item => typeof item === 'string' && item !== 'none') || undefined;
}

function syncScarState(params) {
    const existing = Array.isArray(params.scars) ? params.scars : [];
    const slots = clampNumber(
        params._scarSlots ?? existing.length,
        0,
        MAX_SCAR_SLOTS
    );
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
    const curated = limitUnique(getUserSelectablePoseNames(spriteMapper), Number.POSITIVE_INFINITY);
    return curated.map(poseName => ({
        key: `pose_${poseName}`,
        label: `Pose ${formatDisplayName(poseName)}`,
        mutate: params => {
            params.poseName = poseName;
        }
    }));
}

function createStep(
    id,
    title,
    description,
    optionsBuilder,
    changedTraitIds = []
) {
    return {
        id,
        title,
        description,
        getOptions: currentState => optionsBuilder(currentState),
        summarize: option => option?.label || '',
        apply: (option, currentState) => {
            if (changedTraitIds.length > 0) {
                projectCanonicalRegistryTraitsToLegacy(currentState.params);
            }
            option?.mutate?.(currentState.params, currentState);
            syncDerivedState(currentState.params);
            if (changedTraitIds.length > 0) {
                syncChangedRegistryTraitsFromLegacy(
                    currentState.params,
                    changedTraitIds
                );
            }
        }
    };
}

export function createStreamSteps(
    state = { params: getDefaultStreamParams() },
    catalogSource = publicCatCatalog
) {
    const workingState = state || { params: getDefaultStreamParams() };
    if (!workingState.params) {
        workingState.params = getDefaultStreamParams();
    }

    projectCanonicalRegistryTraitsToLegacy(workingState.params);
    syncDerivedState(workingState.params);

    const steps = [];

    steps.push(createStep('colour', 'Base Colour', 'Choose the base coat colour that defines the cat.', buildColourOptions, ['colour']));
    steps.push(createStep('pattern', 'Pattern', 'Select the main fur pattern.', buildPatternOptions, ['pelt', 'coatPattern']));

    steps.push(createStep('tortie_toggle', 'Tortie Layers', 'Decide whether to layer tortie patterns.', () => buildTortieToggleOptions(), ['tortie']));

    const tortieLayers = workingState.params._tortieLayers ?? 0;
    if (tortieLayers > 0) {
        for (let i = 0; i < tortieLayers; i += 1) {
            const layerIndex = i + 1;
            steps.push(createStep(
                `tortie_layer_${layerIndex}_mask`,
                `Tortie Layer ${layerIndex}: Mask`,
                'Choose the mask that controls where this layer appears.',
                stepState => buildTortieMaskOptions(stepState, i),
                ['tortie']
            ));
            steps.push(createStep(
                `tortie_layer_${layerIndex}_pattern`,
                `Tortie Layer ${layerIndex}: Pattern`,
                'Select the pattern that shapes this tortie overlay.',
                stepState => buildTortiePatternOptions(stepState, i),
                ['tortie']
            ));
            steps.push(createStep(
                `tortie_layer_${layerIndex}_colour`,
                `Tortie Layer ${layerIndex}: Colour`,
                'Pick the colour for this tortie overlay.',
                stepState => buildTortieColourOptions(stepState, i),
                ['tortie']
            ));
        }

        if (tortieLayers < MAX_TORTIE_LAYERS) {
            const nextLayer = tortieLayers + 1;
            steps.push(createStep(
                `tortie_add_layer_${nextLayer}`,
                `Add tortie layer ${nextLayer}?`,
                'Viewers can add up to four tortie overlays.',
                state => buildTortieMoreOptions(state, tortieLayers),
                ['tortie']
            ));
        }
    }

    steps.push(createStep('eye_primary', 'Primary Eye Colour', 'Pick the main eye colour.', buildEyePrimaryOptions, ['eyeColour', 'eyeColour2']));
    steps.push(createStep('eye_secondary', 'Secondary Eye Colour', 'Choose a secondary eye colour or keep them matching.', buildEyeSecondaryOptions, ['eyeColour2']));
    steps.push(createStep('white_patches', 'White Patches', 'Choose a white patch overlay.', buildWhitePatchOptions, ['whitePatches']));
    steps.push(createStep('points_pattern', 'Points Pattern', 'Select a points (siamese-style) highlight.', buildPointsOptions, ['points']));
    steps.push(createStep('vitiligo_pattern', 'Vitiligo', 'Add vitiligo overlays if desired.', buildVitiligoOptions, ['vitiligo']));
    steps.push(createStep('skin', 'Skin Tone', 'Select nose and ear skin colour.', buildSkinOptions, ['skinColour']));
    steps.push(createStep('tint', 'Overall Tint', 'Choose an optional tint overlay.', buildTintOptions, ['tint']));

    steps.push(createStep('accessories_toggle', 'Accessories', 'Decide whether to add accessories.', () => buildAccessoryToggleOptions(), ['accessories']));
    const accessorySlots = workingState.params._accessorySlots ?? 0;
    if (accessorySlots > 0) {
        for (let i = 0; i < accessorySlots; i += 1) {
            steps.push(createStep(`accessory_slot_${i + 1}`, `Accessory Slot ${i + 1}`, 'Select an accessory for this slot.', state => buildAccessorySelectionOptions(state, i), ['accessories']));
        }
        if (accessorySlots < MAX_ACCESSORY_SLOTS) {
            steps.push(createStep(`accessory_more_${accessorySlots + 1}`, 'Add another accessory?', 'Viewers can queue up to ten accessories.', () => buildAccessoryMoreOptions(accessorySlots), ['accessories']));
        }
    }

    steps.push(createStep('scars_toggle', 'Scars', 'Choose whether to add scars.', () => buildScarToggleOptions(), ['scars']));
    const scarSlots = workingState.params._scarSlots ?? 0;
    if (scarSlots > 0) {
        for (let i = 0; i < scarSlots; i += 1) {
            steps.push(createStep(`scar_slot_${i + 1}`, `Scar Slot ${i + 1}`, 'Pick a scar for this slot.', state => buildScarSelectionOptions(state, i), ['scars']));
        }
        if (scarSlots < MAX_SCAR_SLOTS) {
            steps.push(createStep(`scar_more_${scarSlots + 1}`, 'Add another scar?', 'Viewers can queue several scars, up to six slots.', () => buildScarMoreOptions(scarSlots), ['scars']));
        }
    }

    steps.push(createStep('pose', 'Pose', 'Choose the final sprite pose to present the cat.', buildPoseOptions, ['pose']));
    steps.push(
        ...createRegistryTraitVotingSteps(
            catalogSource,
            workingState,
            STREAMER_BASELINE_TRAIT_IDS
        )
    );

    return steps;
}

export function getStepById(steps, id) {
    return steps.find(step => step.id === id) || null;
}
