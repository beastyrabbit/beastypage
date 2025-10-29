const SHARE_VERSION = 1;

function toBase64(str) {
    if (typeof btoa === 'function') {
        return btoa(str);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'utf-8').toString('base64');
    }
    throw new Error('Base64 encoding not supported in this environment');
}

function fromBase64(str) {
    if (typeof atob === 'function') {
        return atob(str);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'base64').toString('utf-8');
    }
    throw new Error('Base64 decoding not supported in this environment');
}

const PARAM_KEYS = [
    'spriteNumber',
    'peltName',
    'colour',
    'eyeColour',
    'eyeColour2',
    'tint',
    'skinColour',
    'whitePatches',
    'points',
    'whitePatchesTint',
    'vitiligo',
    'accessories',
    'accessory',
    'scars',
    'scar',
    'tortie',
    'isTortie',
    'tortieMask',
    'tortiePattern',
    'tortieColour',
    'shading',
    'reverse',
    'darkForest',
    'darkMode',
    'dead'
];

const BOOLEAN_KEYS = new Set([
    'isTortie',
    'shading',
    'reverse',
    'darkForest',
    'darkMode',
    'dead'
]);

const NUMBER_KEYS = new Set([
    'spriteNumber'
]);

function cleanString(value) {
    if (value === undefined || value === null) return undefined;
    const str = String(value).trim();
    return str === '' ? undefined : str;
}

function sanitizeStringArray(values) {
    if (!Array.isArray(values)) return [];
    const result = [];
    for (const value of values) {
        const cleaned = cleanString(value) || 'none';
        result.push(cleaned);
    }
    return result;
}

function sanitizeTortieArray(values) {
    if (!Array.isArray(values)) return [];
    const result = [];
    for (const value of values) {
        if (!value || typeof value !== 'object') {
            result.push(null);
            continue;
        }
        const cleaned = {
            mask: cleanString(value.mask),
            pattern: cleanString(value.pattern),
            colour: cleanString(value.colour)
        };
        if (!cleaned.mask && !cleaned.pattern && !cleaned.colour) {
            result.push(null);
        } else {
            result.push(cleaned);
        }
    }
    return result;
}

function sanitizeParams(params = {}) {
    const clean = {};
    for (const key of PARAM_KEYS) {
        if (!(key in params)) continue;
        const value = params[key];
        if (BOOLEAN_KEYS.has(key)) {
            clean[key] = Boolean(value);
            continue;
        }
        if (NUMBER_KEYS.has(key)) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                clean[key] = num;
            }
            continue;
        }
        if (key === 'accessories' || key === 'scars') {
            const arr = sanitizeStringArray(value);
            if (arr.length) {
                clean[key] = arr.filter(v => v !== 'none');
            }
            continue;
        }
        if (key === 'tortie') {
            const arr = sanitizeTortieArray(value);
            if (arr.some(entry => entry)) {
                clean[key] = arr.filter(entry => entry);
            }
            continue;
        }
        if (key === 'accessory' || key === 'scar') {
            const str = cleanString(value);
            if (str) clean[key] = str;
            continue;
        }
        const strValue = cleanString(value);
        if (strValue !== undefined) {
            clean[key] = strValue;
        }
    }

    // Ensure legacy single values mirror first entries if arrays exist
    if (!clean.accessory && Array.isArray(clean.accessories) && clean.accessories.length > 0) {
        clean.accessory = clean.accessories[0];
    }
    if (!clean.scar && Array.isArray(clean.scars) && clean.scars.length > 0) {
        clean.scar = clean.scars[0];
    }

    if (clean.isTortie) {
        if (!clean.tortieMask && Array.isArray(clean.tortie) && clean.tortie.length > 0) {
            clean.tortieMask = clean.tortie[0].mask || undefined;
            clean.tortiePattern = clean.tortie[0].pattern || undefined;
            clean.tortieColour = clean.tortie[0].colour || undefined;
        }
    } else {
        delete clean.tortieMask;
        delete clean.tortiePattern;
        delete clean.tortieColour;
    }

    return clean;
}

function sanitizeSlots(slots, fallbackLength = 0) {
    if (!Array.isArray(slots)) {
        return new Array(fallbackLength).fill('none');
    }
    return sanitizeStringArray(slots);
}

function sanitizeTortieSlots(slots, fallbackLength = 0) {
    if (!Array.isArray(slots)) {
        return new Array(fallbackLength).fill(null);
    }
    const result = [];
    for (const slot of slots) {
        if (!slot || typeof slot !== 'object') {
            result.push(null);
            continue;
        }
        result.push({
            mask: cleanString(slot.mask) || 'ONE',
            pattern: cleanString(slot.pattern) || 'SingleColour',
            colour: cleanString(slot.colour) || 'GINGER'
        });
    }
    return result;
}

function sanitizeCounts(counts = {}) {
    const result = {
        accessories: 0,
        scars: 0,
        tortie: 0
    };
    for (const key of Object.keys(result)) {
        if (counts[key] !== undefined) {
            const num = Number(counts[key]);
            if (Number.isFinite(num) && num >= 0) {
                result[key] = Math.floor(num);
            }
        }
    }
    return result;
}

export function encodeCatShare(data) {
    if (!data || !data.params) {
        throw new Error('encodeCatShare: params are required');
    }

    const counts = sanitizeCounts(data.counts);
    const slots = {
        accessories: sanitizeSlots(data.accessorySlots, counts.accessories),
        scars: sanitizeSlots(data.scarSlots, counts.scars),
        tortie: sanitizeTortieSlots(data.tortieSlots, counts.tortie)
    };

    const payload = {
        v: SHARE_VERSION,
        params: sanitizeParams(data.params),
        slots,
        counts: {
            accessories: slots.accessories.length,
            scars: slots.scars.length,
            tortie: slots.tortie.length
        }
    };

    const json = JSON.stringify(payload);
    return toBase64(json);
}

export function decodeCatShare(encoded) {
    if (!encoded) return null;

    let payload;
    try {
        payload = JSON.parse(fromBase64(encoded));
    } catch (error) {
        console.error('decodeCatShare: failed to parse payload', error);
        return null;
    }

    if (!payload || typeof payload !== 'object') {
        return null;
    }

    if (payload.v !== SHARE_VERSION) {
        console.warn(`decodeCatShare: unsupported version ${payload.v}`);
        return null;
    }

    return {
        params: sanitizeParams(payload.params || {}),
        accessorySlots: sanitizeSlots(payload.slots?.accessories, payload.counts?.accessories),
        scarSlots: sanitizeSlots(payload.slots?.scars, payload.counts?.scars),
        tortieSlots: sanitizeTortieSlots(payload.slots?.tortie, payload.counts?.tortie),
        counts: sanitizeCounts(payload.counts)
    };
}
