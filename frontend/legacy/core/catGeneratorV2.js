// Removed SpriteCache - no longer using any caching, load directly from sprite sheets

import spriteMapper from './spriteMapper.js';
import spriteSheetLoader from './spriteSheetLoader.js';

// Scar categories
const SCARS_1 = ["ONE", "TWO", "THREE", "TAILSCAR", "SNOUT", "CHEEK", "SIDE", "THROAT", "TAILBASE", "BELLY", "LEGBITE", "NECKBITE", "FACE", "MANLEG", "BRIGHTHEART", "MANTAIL", "BRIDGE", "RIGHTBLIND", "LEFTBLIND", "BOTHBLIND", "BEAKCHEEK", "BEAKLOWER", "CATBITE", "RATBITE", "QUILLCHUNK", "QUILLSCRATCH", "HINDLEG", "BACK", "QUILLSIDE", "SCRATCHSIDE", "BEAKSIDE", "CATBITETWO", "FOUR"];
const SCARS_2 = ["LEFTEAR", "RIGHTEAR", "NOTAIL", "HALFTAIL", "NOPAW", "NOLEFTEAR", "NORIGHTEAR", "NOEAR"];
const SCARS_3 = ["SNAKE", "TOETRAP", "BURNPAWS", "BURNTAIL", "BURNBELLY", "BURNRUMP", "FROSTFACE", "FROSTTAIL", "FROSTMITT", "FROSTSOCK", "TOE", "SNAKETWO"];

// Default configuration
const DEFAULT_CONFIG = {
    maxCanvasSize: 2000,
    maxLayers: 50,
    poolSize: 200,  // Increased to handle many accessories and concurrent operations
    timeout: 30000,
    enableTelemetry: false,
    forbiddenSprites: new Set([0, 1, 2, 17, 19, 20])
};

// Canvas pool removed - creating canvases directly as needed

/**
 * Memory Monitor for pressure detection
 */
class MemoryMonitor {
    static checkPressure() {
        if (typeof performance === 'undefined' || !performance.memory) {
            return false;
        }
        
        const usage = performance.memory.usedJSHeapSize;
        const limit = performance.memory.jsHeapSizeLimit;
        
        return usage > limit * 0.8; // 80% threshold
    }
    
    static handlePressure(resourceManager) {
        console.warn('Memory pressure detected, performing cleanup');
        
        // No canvas pool to clear
        
        // Force garbage collection if available
        if (typeof global !== 'undefined' && global.gc) {
            global.gc();
        }
    }
}

/**
 * ResourceManager - Singleton managing all resources
 */
class ResourceManager {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // No more sprite cache - load directly from sprite sheets
        // Canvas pool removed - creating canvases directly
        this.loadingBatch = new Map();
        this.spriteSheetLoaderInitialized = false;
    }
    
    static instance = null;
    
    static getInstance(config) {
        if (!ResourceManager.instance) {
            ResourceManager.instance = new ResourceManager(config);
        }
        return ResourceManager.instance;
    }
    
    async initSpriteSheetLoader() {
        if (!this.spriteSheetLoaderInitialized) {
            this.spriteSheetLoaderInitialized = await spriteSheetLoader.init();
            if (this.spriteSheetLoaderInitialized) {
                console.log('Sprite sheet loader initialized successfully');
                // Preload common sheets for performance
                await spriteSheetLoader.preloadCommonSheets();
            }
        }
        return this.spriteSheetLoaderInitialized;
    }
    
    async loadSprite(spriteName, spriteNumber) {
        // No caching - load directly from sprite sheet loader
        await this.initSpriteSheetLoader();
        
        const canvas = await spriteSheetLoader.getSprite(spriteName, spriteNumber);
        if (!canvas) {
            // Don't log error for every missing sprite - it's too verbose
            // console.error(`Failed to load sprite: ${spriteName}_${spriteNumber}`);
            
            // Create a new empty canvas as fallback - don't use pool
            // Pool canvases need to be tracked and released properly
            const fallbackCanvas = typeof OffscreenCanvas !== 'undefined' 
                ? new OffscreenCanvas(50, 50)
                : document.createElement('canvas');
            fallbackCanvas.width = 50;
            fallbackCanvas.height = 50;
            return fallbackCanvas;
        }
        return canvas;
    }
    
    // Removed loadImage and getSpriteURL - now using sprite sheets exclusively via spriteSheetLoader
    
    acquireCanvas() {
        // Create canvas directly without pool
        if (typeof OffscreenCanvas !== 'undefined') {
            return new OffscreenCanvas(50, 50);
        } else if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = 50;
            canvas.height = 50;
            return canvas;
        } else {
            throw new Error('No canvas implementation available');
        }
    }
    
    releaseCanvas(canvas) {
        // No-op: canvases are garbage collected
    }
    
    emergencyCleanup() {
        // No canvas pool to clear
    }
    
    dispose() {
        // No canvas pool to clear
        ResourceManager.instance = null;
    }
}

// ============================================================================
// VALIDATION & ERROR HANDLING
// ============================================================================

/**
 * Parameter validator with XSS and DoS protection
 */
class ParamValidator {
    static validate(params, config = DEFAULT_CONFIG) {
        const errors = [];
        
        // Required fields
        if (params.spriteNumber === undefined || params.spriteNumber === null) {
            errors.push('Sprite number is required');
        } else if (params.spriteNumber < 0 || params.spriteNumber > 20) {
            errors.push('Invalid sprite number (must be 0-20)');
        }
        
        // XSS prevention - validate all string fields
        const stringFields = ['peltName', 'tortiePattern', 'whitePatches', 'accessory', 'colour', 'tortieColour'];
        const pattern = /^[a-zA-Z0-9_\-\s]+$/;
        
        for (const field of stringFields) {
            if (params[field] && !pattern.test(params[field])) {
                errors.push(`Invalid characters in ${field}`);
            }
        }
        
        // DoS protection - limit layers
        if (params.layers && params.layers.length > config.maxLayers) {
            errors.push(`Too many layers (max ${config.maxLayers})`);
        }
        
        // Canvas size limits
        if (params.width && params.width > config.maxCanvasSize) {
            errors.push(`Canvas width too large (max ${config.maxCanvasSize})`);
        }
        if (params.height && params.height > config.maxCanvasSize) {
            errors.push(`Canvas height too large (max ${config.maxCanvasSize})`);
        }
        
        // Forbidden sprites check
        if (!params.allowForbidden && config.forbiddenSprites.has(params.spriteNumber)) {
            params.spriteNumber = 3; // Safe default
        }
        
        if (errors.length > 0) {
            throw new ValidationError(errors);
        }
        
        return params;
    }
}

class ValidationError extends Error {
    constructor(errors) {
        super(`Validation failed: ${errors.join(', ')}`);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

/**
 * Network retry with exponential backoff
 */
class NetworkRetry {
    static async withRetry(fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                // Don't retry 404s
                if (error.message && error.message.includes('404')) {
                    throw error;
                }
                
                // Exponential backoff
                const delay = Math.min(baseDelay * Math.pow(2, i), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error(`Failed after ${maxRetries} retries: ${lastError.message}`);
    }
}

// ============================================================================
// SPRITE NAME HELPERS
// ============================================================================

/**
 * Helper to build proper sprite names for different sprite types
 */
class SpriteNameBuilder {
    static build(type, name, color) {
        // Handle special cases
        switch(type) {
            case 'pelt':
                return spriteMapper.buildSpriteName('pelt', name, color);
            case 'tortie':
                return spriteMapper.buildSpriteName('tortie', name, color);
            case 'eyes':
                // Handle eyes vs eyes2
                if (name && name.startsWith('eyes2')) {
                    return name; // Already formatted
                }
                return `eyes${color || name}`;
            case 'white':
                return `white${name}`;
            case 'scar':
                return `scar${name}`;
            case 'scars':
                // Plural form used in sprite sheets
                return `scars${name}`;
            case 'skin':
                return `skin${color || name}`;
            case 'lineart':
                return name || 'lines';
            case 'shading':
                return 'shaders';
            case 'lighting':
                return 'lighting';
            case 'accessory':
                return name; // Accessories have complex names
            default:
                return name;
        }
    }
}

// ============================================================================
// PIPELINE STAGES
// ============================================================================

/**
 * Base class for pipeline stages
 */
class PipelineStage {
    constructor(name) {
        this.name = name;
    }
    
    async execute(context, params, resources) {
        try {
            return await this.process(context, params, resources);
        } catch (error) {
            throw new Error(`Pipeline stage ${this.name} failed: ${error.message}`);
        }
    }
    
    async process(context, params, resources) {
        throw new Error('Must implement process method');
    }
}

/**
 * Stage 1: Base Pelt Rendering
 */
function createLayerCanvas(resources, width = 50, height = 50) {
    let canvas = null;
    if (resources?.acquireCanvas) {
        canvas = resources.acquireCanvas();
    } else if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(width, height);
    } else if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
    }

    if (!canvas) {
        throw new Error('Unable to create canvas for experimental colour tinting');
    }

    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function applyExperimentalTint(ctx, definition, width, height, maskSource) {
    if (!definition) return;

    const applyFill = (mode, values) => {
        if (!values) return;
        const [r, g, b, a = 1] = values;
        ctx.save();
        ctx.globalCompositeOperation = mode;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    };

    applyFill('multiply', definition.multiply);
    applyFill('screen', definition.screen);
    applyFill('overlay', definition.overlay);

    if (maskSource) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskSource, 0, 0, width, height);
        ctx.restore();
    }
}

async function buildPeltLayer(resources, peltName, colour, spriteNumber) {
    if (!peltName) {
        return null;
    }

    const resolvedColour = colour || 'WHITE';
    const experimentalDefinition = spriteMapper.getExperimentalColourDefinition(resolvedColour);
    const baseColour = experimentalDefinition?.baseColour || resolvedColour;
    const spriteName = SpriteNameBuilder.build('pelt', peltName, baseColour);
    const sprite = await resources.loadSprite(spriteName, spriteNumber);

    if (!sprite) {
        return null;
    }

    if (!experimentalDefinition) {
        return sprite;
    }

    const width = sprite.width || 50;
    const height = sprite.height || 50;
    const layerCanvas = createLayerCanvas(resources, width, height);
    const layerCtx = layerCanvas.getContext('2d');
    layerCtx.clearRect(0, 0, width, height);
    layerCtx.drawImage(sprite, 0, 0);
    applyExperimentalTint(layerCtx, experimentalDefinition, width, height, sprite);
    return layerCanvas;
}

async function drawLayer(ctx, resources, peltName, colour, spriteNumber, mask = null) {
    const layer = await buildPeltLayer(resources, peltName, colour, spriteNumber);
    if (!layer) {
        return;
    }

    if (!mask || mask === 'none') {
        ctx.drawImage(layer, 0, 0);
        return;
    }

    let maskSprite = null;
    if (typeof mask === 'string') {
        const maskName = `tortiemask${mask}`;
        maskSprite = await resources.loadSprite(maskName, spriteNumber);
    } else {
        maskSprite = mask;
    }

    if (!maskSprite) {
        ctx.drawImage(layer, 0, 0);
        return;
    }

    const width = layer.width || maskSprite.width || 50;
    const height = layer.height || maskSprite.height || 50;
    const maskedCanvas = createLayerCanvas(resources, width, height);
    const maskedCtx = maskedCanvas.getContext('2d');
    maskedCtx.clearRect(0, 0, width, height);
    maskedCtx.drawImage(layer, 0, 0);
    maskedCtx.globalCompositeOperation = 'destination-in';
    maskedCtx.drawImage(maskSprite, 0, 0);
    maskedCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(maskedCanvas, 0, 0);
}

class BasePeltStage extends PipelineStage {
    constructor() {
        super('BasePelt');
    }

    async process(context, params, resources) {
        const { ctx } = context;

        if (params.isTortie) {
            if (Array.isArray(params.tortie) && params.tortie.length > 0) {
                await drawLayer(ctx, resources, params.peltName, params.colour, params.spriteNumber);
                for (const layer of params.tortie) {
                    if (!layer) continue;
                    await drawLayer(
                        ctx,
                        resources,
                        layer.pattern,
                        layer.colour || 'GINGER',
                        params.spriteNumber,
                        layer.mask
                    );
                }
            } else if (params.tortiePattern && params.tortiePattern !== 'none') {
                await drawLayer(ctx, resources, params.peltName, params.colour, params.spriteNumber);
                await drawLayer(
                    ctx,
                    resources,
                    params.tortiePattern,
                    params.tortieColour || 'GINGER',
                    params.spriteNumber,
                    params.tortieMask
                );
            } else {
                await drawLayer(ctx, resources, params.peltName, params.colour, params.spriteNumber);
            }
        } else {
            await drawLayer(ctx, resources, params.peltName, params.colour, params.spriteNumber);
        }

        return context;
    }
}

/**
 * Stage 2: Tint Application
 */
class TintApplicationStage extends PipelineStage {
    constructor() {
        super('TintApplication');
    }
    
    async process(context, params, resources) {
        if (!params.tint || params.tint === 'none') {
            return context;
        }
        
        const { canvas, ctx } = context;
        
        // Check for regular tint first (multiply blend mode)
        let tintColor = spriteMapper.getTintColor(params.tint);
        if (tintColor) {
            // Convert array format to object format for compatibility
            if (Array.isArray(tintColor)) {
                tintColor = { r: tintColor[0], g: tintColor[1], b: tintColor[2] };
            }
            // Apply with multiply blend mode
            this.applyRGBTint(ctx, canvas, tintColor, 'multiply');
        }
        
        // Check for dilute tint (lighter blend mode)
        let diluteTintColor = spriteMapper.getDiluteTintColor(params.tint);
        if (diluteTintColor) {
            // Convert array format to object format for compatibility
            if (Array.isArray(diluteTintColor)) {
                diluteTintColor = { r: diluteTintColor[0], g: diluteTintColor[1], b: diluteTintColor[2] };
            }
            // Apply with lighter blend mode
            this.applyRGBTint(ctx, canvas, diluteTintColor, 'lighter');
        }
        
        return context;
    }
    
    applyHSVTint(ctx, canvas, tint) {
        // Complex HSV manipulation - simplified for brevity
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // ... HSV conversion logic
        ctx.putImageData(imageData, 0, 0);
    }
    
    applyRGBTint(ctx, canvas, tint, blendMode = 'multiply') {
        // Create a temporary canvas to prepare the tint mask
        const tempCanvas = new OffscreenCanvas(50, 50);
        // OffscreenCanvas size is already set to 50x50
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw the current canvas content onto the temporary canvas
        tempCtx.drawImage(canvas, 0, 0);
        
        // Use 'source-in' to create a solid-colored shape of the sprite
        // This preserves transparency!
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.fillStyle = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;
        tempCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        // On the original context, blend this tint mask using the specified blend mode
        ctx.globalCompositeOperation = blendMode;
        ctx.drawImage(tempCanvas, 0, 0);
        
        // Reset composite operation to default
        ctx.globalCompositeOperation = 'source-over';
    }
}

/**
 * Stage 3: White Patches
 */
class WhitePatchesStage extends PipelineStage {
    constructor() {
        super('WhitePatches');
    }
    
    async process(context, params, resources) {
        if (!params.whitePatches || params.whitePatches === 'none') {
            return context;
        }
        
        const { ctx } = context;
        const spriteName = SpriteNameBuilder.build('white', params.whitePatches, null);
        const patchSprite = await resources.loadSprite(spriteName, params.spriteNumber);
        if (!patchSprite) {
            return context;
        }

        const tintName = params.whitePatchesTint;

        if (tintName && tintName !== 'none') {
            if (spriteMapper.isBaseColour(tintName) || spriteMapper.isExperimentalColour(tintName)) {
                const colourLayer = await buildPeltLayer(resources, 'SingleColour', tintName, params.spriteNumber);
                if (colourLayer) {
                    const width = colourLayer.width || patchSprite.width || context.canvas.width;
                    const height = colourLayer.height || patchSprite.height || context.canvas.height;
                    const maskedCanvas = createLayerCanvas(resources, width, height);
                    const maskedCtx = maskedCanvas.getContext('2d');
                    maskedCtx.clearRect(0, 0, maskedCanvas.width, maskedCanvas.height);
                    maskedCtx.globalCompositeOperation = 'source-over';
                    maskedCtx.drawImage(colourLayer, 0, 0);
                    maskedCtx.globalCompositeOperation = 'destination-in';
                    maskedCtx.drawImage(patchSprite, 0, 0);
                    maskedCtx.globalCompositeOperation = 'source-over';
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.drawImage(maskedCanvas, 0, 0);
                    return context;
                }
            }

            let tintColor = spriteMapper.getWhitePatchesTintColor(tintName);
            if (Array.isArray(tintColor)) {
                tintColor = { r: tintColor[0], g: tintColor[1], b: tintColor[2] };
            }

            if (tintColor) {
                const width = patchSprite.width || context.canvas.width;
                const height = patchSprite.height || context.canvas.height;
                const offscreen = createLayerCanvas(resources, width, height);
                const offCtx = offscreen.getContext('2d');
                offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
                offCtx.globalCompositeOperation = 'source-over';
                offCtx.drawImage(patchSprite, 0, 0);
                offCtx.globalCompositeOperation = 'multiply';
                offCtx.fillStyle = `rgb(${tintColor.r}, ${tintColor.g}, ${tintColor.b})`;
                offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
                offCtx.globalCompositeOperation = 'destination-in';
                offCtx.drawImage(patchSprite, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(offscreen, 0, 0);
                return context;
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(patchSprite, 0, 0);
        
        return context;
    }
}

/**
 * Stage 4: Points
 */
class PointsStage extends PipelineStage {
    constructor() {
        super('Points');
    }
    
    async process(context, params, resources) {
        if (!params.points || params.points === 'none') {
            return context;
        }
        
        const { ctx } = context;
        const spriteName = SpriteNameBuilder.build('white', params.points, null);
        const pointSprite = await resources.loadSprite(spriteName, params.spriteNumber);
        ctx.drawImage(pointSprite, 0, 0);
        
        return context;
    }
}

/**
 * Stage 5: Vitiligo
 */
class VitiligoStage extends PipelineStage {
    constructor() {
        super('Vitiligo');
    }
    
    async process(context, params, resources) {
        if (!params.vitiligo || params.vitiligo === 'none') {
            return context;
        }
        
        const { ctx } = context;
        const spriteName = SpriteNameBuilder.build('white', params.vitiligo, null);
        const vitiligoSprite = await resources.loadSprite(spriteName, params.spriteNumber);
        ctx.drawImage(vitiligoSprite, 0, 0);
        
        return context;
    }
}

/**
 * Stage 6: Eye Rendering
 */
class EyeRenderStage extends PipelineStage {
    constructor() {
        super('EyeRender');
    }
    
    async process(context, params, resources) {
        const { ctx } = context;
        
        // Primary eye color
        if (params.eyeColour) {
            const spriteName = SpriteNameBuilder.build('eyes', null, params.eyeColour);
            const eyeSprite = await resources.loadSprite(spriteName, params.spriteNumber);
            ctx.drawImage(eyeSprite, 0, 0);
        }
        
        // Heterochromia (second eye color)
        if (params.eyeColour2 && params.eyeColour2 !== 'none') {
            // Second eye uses eyes2 prefix, not eyes!
            const spriteName = `eyes2${params.eyeColour2}`;
            const eyeSprite2 = await resources.loadSprite(spriteName, params.spriteNumber);
            ctx.drawImage(eyeSprite2, 0, 0);
        }
        
        return context;
    }
}

/**
 * Stage 7: Scars Layer 1
 */
class ScarLayerOneStage extends PipelineStage {
    constructor() {
        super('ScarLayerOne');
    }
    
    async process(context, params, resources) {
        // Support both single scar and array of scars
        const scarsToRender = [];
        
        if (params.scars && Array.isArray(params.scars)) {
            scarsToRender.push(...params.scars);
        } else if (params.scar && params.scar !== 'none') {
            scarsToRender.push(params.scar);
        }
        
        if (scarsToRender.length === 0) {
            return context;
        }
        
        const { ctx } = context;
        
        // Draw additive scars
        for (const scarEntry of scarsToRender) {
            const scar = typeof scarEntry === 'string' ? scarEntry : scarEntry?.id;
            if (!scar) continue;
            
            if (SCARS_1.includes(scar) || SCARS_3.includes(scar)) {
                let scarSprite = null;
                try {
                    // Use plural prefix (standard naming)
                    const spriteName = SpriteNameBuilder.build('scars', scar, null);
                    scarSprite = await resources.loadSprite(spriteName, params.spriteNumber);
                } catch (e) {
                    // Fallback to singular if some atlases still use it
                    try {
                        const altName = SpriteNameBuilder.build('scar', scar, null);
                        scarSprite = await resources.loadSprite(altName, params.spriteNumber);
                    } catch (_) {
                        console.warn(`Could not load scar sprite: ${scar}`);
                    }
                }
                
                if (scarSprite) {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.drawImage(scarSprite, 0, 0);
                }
            }
        }
        
        return context;
    }
}

/**
 * Stage 8: Shading
 */
class ShadingStage extends PipelineStage {
    constructor() {
        super('Shading');
    }
    
    async process(context, params, resources) {
        if (!params.shading) {
            return context;
        }
        
        const { ctx, canvas } = context;
        
        // Create a temporary canvas for shading with source-in
        const tempCanvas = new OffscreenCanvas(50, 50);
        const tempCtx = tempCanvas.getContext('2d');
        
        // Copy current canvas
        tempCtx.drawImage(canvas, 0, 0);
        
        // Apply shading with source-in to preserve transparency
        tempCtx.globalCompositeOperation = 'source-in';
        const spriteName = SpriteNameBuilder.build('shading', null, null);
        const shadingSprite = await resources.loadSprite(spriteName, params.spriteNumber);
        tempCtx.drawImage(shadingSprite, 0, 0);
        
        // Multiply blend the shading onto the main canvas
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        
        // Release the temporary canvas
        // No need to release - let GC handle it
        
        // Add lighting normally (not with overlay - that causes white backgrounds!)
        const lightingName = SpriteNameBuilder.build('lighting', null, null);
        const lightingSprite = await resources.loadSprite(lightingName, params.spriteNumber);
        ctx.drawImage(lightingSprite, 0, 0);
        
        return context;
    }
}

/**
 * Stage 9: Lineart
 */
class LineartStage extends PipelineStage {
    constructor() {
        super('Lineart');
    }
    
    async process(context, params, resources) {
        const { ctx } = context;
        
        // Determine lineart type (support Dark Forest)
        const isDarkForest = !!(params.darkForest || params.darkMode);
        // Default group names in spritesIndex: 'lines', 'lineartdead', 'lineartdf'
        let lineartName = 'lines';
        if (params.dead) {
            lineartName = isDarkForest ? 'lineartdf' : 'lineartdead';
        } else if (isDarkForest) {
            lineartName = 'lineartdf';
        }
        
        const spriteName = SpriteNameBuilder.build('lineart', lineartName, null);
        let lineartSprite = await resources.loadSprite(spriteName, params.spriteNumber);
        // Fallback to 'lines' if group not found (defensive)
        if (!lineartSprite && lineartName !== 'lines') {
            const fallbackName = SpriteNameBuilder.build('lineart', 'lines', null);
            lineartSprite = await resources.loadSprite(fallbackName, params.spriteNumber);
        }
        ctx.drawImage(lineartSprite, 0, 0);
        
        return context;
    }
}

/**
 * Stage 10: Skin
 */
class SkinStage extends PipelineStage {
    constructor() {
        super('Skin');
    }
    
    async process(context, params, resources) {
        // Support both skinColour and skinColor parameter names
        const skinKey = params.skinColour ?? params.skinColor;
        if (!skinKey || skinKey === 'none') {
            return context;
        }
        
        const { ctx } = context;
        ctx.globalCompositeOperation = 'source-over';
        
        // Try loading with current naming convention
        let skinSprite = null;
        try {
            const spriteName = SpriteNameBuilder.build('skin', null, skinKey);
            skinSprite = await resources.loadSprite(spriteName, params.spriteNumber);
        } catch (e) {
            // Fallback if assets use plural naming
            try {
                const altName = SpriteNameBuilder.build('skins', skinKey, null);
                skinSprite = await resources.loadSprite(altName, params.spriteNumber);
            } catch (_) {
                console.warn(`Could not load skin sprite for: ${skinKey}`);
            }
        }
        
        if (skinSprite) {
            ctx.drawImage(skinSprite, 0, 0);
        }
        
        return context;
    }
}

/**
 * Stage 11: Scars Layer 2
 */
class ScarLayerTwoStage extends PipelineStage {
    constructor() {
        super('ScarLayerTwo');
    }
    
    async process(context, params, resources) {
        // Support both single scar and array of scars
        const scarsToRender = [];
        
        if (params.scars && Array.isArray(params.scars)) {
            scarsToRender.push(...params.scars);
        } else if (params.scar && params.scar !== 'none') {
            scarsToRender.push(params.scar);
        }
        
        if (scarsToRender.length === 0) {
            return context;
        }
        
        const { ctx } = context;
        
        // Draw subtractive scars (missing parts) - SCARS_2 only
        for (const scarEntry of scarsToRender) {
            const scar = typeof scarEntry === 'string' ? scarEntry : scarEntry?.id;
            if (!scar) continue;
            
            if (SCARS_2.includes(scar)) {
                let scarSprite = null;
                try {
                    // Use plural prefix (standard naming)
                    const spriteName = SpriteNameBuilder.build('scars', scar, null);
                    scarSprite = await resources.loadSprite(spriteName, params.spriteNumber);
                } catch (e) {
                    // Fallback to singular if some atlases still use it
                    try {
                        const altName = SpriteNameBuilder.build('scar', scar, null);
                        scarSprite = await resources.loadSprite(altName, params.spriteNumber);
                    } catch (_) {
                        console.warn(`Could not load missing scar sprite: ${scar}`);
                    }
                }
                
                if (scarSprite) {
                    // Implement drawMissingScar logic from drawCat.ts
                    const originalComposite = ctx.globalCompositeOperation;
                    
                    // Clip canvas to missing scar mask (destination-in)
                    ctx.globalCompositeOperation = 'destination-in';
                    ctx.drawImage(scarSprite, 0, 0);
                    
                    // Create offscreen canvas for the lines that go on top
                    const offscreen = document.createElement('canvas');
                    offscreen.width = context.canvas.width;
                    offscreen.height = context.canvas.height;
                    const offCtx = offscreen.getContext('2d');
                    
                    // Copy current canvas and clip to scar shape
                    offCtx.drawImage(context.canvas, 0, 0);
                    offCtx.globalCompositeOperation = 'source-in';
                    offCtx.drawImage(scarSprite, 0, 0);
                    
                    // Multiply so the white disappears
                    ctx.globalCompositeOperation = 'multiply';
                    ctx.drawImage(offscreen, 0, 0);
                    
                    ctx.globalCompositeOperation = originalComposite;
                }
            }
        }
        
        return context;
    }
}

/**
 * Stage 12: Accessories
 */
class AccessoryStage extends PipelineStage {
    constructor() {
        super('Accessory');
    }
    
    async process(context, params, resources) {
        // V2: Support both single accessory and array of accessories
        const accessoriesToRender = [];
        
        // Check for array format first (V2 compatibility)
        if (params.accessories && Array.isArray(params.accessories)) {
            accessoriesToRender.push(...params.accessories);
        }
        // Check for single accessory (backward compatibility)
        else if (params.accessory && params.accessory !== 'none') {
            accessoriesToRender.push(params.accessory);
        }
        
        // Return early if no accessories
        // Defensive: filter out invalid/undefined entries
        const validAccessories = accessoriesToRender.filter(a => typeof a === 'string' && a !== '' && a !== 'none');
        if (validAccessories.length === 0) {
            return context;
        }
        
        const { ctx } = context;
        
        // Get accessory lists from spriteMapper
        const collars = spriteMapper.getCollars();
        const plantAccessories = spriteMapper.getPlantAccessories();
        const wildAccessories = spriteMapper.getWildAccessories();
        
        // Render each accessory
        for (const accessory of validAccessories) {
            let accessoryName = accessory;
            
            // Format accessory name based on type
            // The actual sprite names in spritesIndex.json keep spaces: "acc_herbsMAPLE LEAF"
            if (collars.includes(accessoryName)) {
                accessoryName = `collars${accessoryName}`;
            } else if (plantAccessories.includes(accessoryName)) {
                // Plant accessories use acc_herbs prefix but KEEP the original name with spaces
                accessoryName = `acc_herbs${accessoryName}`;
            } else if (wildAccessories.includes(accessoryName)) {
                // Wild accessories use acc_wild prefix but KEEP the original name with spaces
                accessoryName = `acc_wild${accessoryName}`;
            }
            
            const spriteName = SpriteNameBuilder.build('accessory', accessoryName, null);
            const accessorySprite = await resources.loadSprite(spriteName, params.spriteNumber);
            
            if (accessorySprite) {
                ctx.drawImage(accessorySprite, 0, 0);
            }
        }
        
        return context;
    }
}

/**
 * Stage 13.5: Dark Forest Overlay
 * Applies a subtle red/brown multiply tint for Dark Forest mode
 */
class DarkForestOverlayStage extends PipelineStage {
    constructor() {
        super('DarkForestOverlay');
    }
    
    async process(context, params, resources) {
        if (!params.darkForest && !params.darkMode) {
            return context;
        }
        const { canvas, ctx } = context;
        // Create temporary canvas to preserve alpha and apply color
        const tempCanvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(canvas.width, canvas.height) : document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        // Match target size
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        // Draw current
        tempCtx.drawImage(canvas, 0, 0);
        // Colorize with source-in to preserve alpha
        tempCtx.globalCompositeOperation = 'source-in';
        // Dark Forest reddish-brown tint (stronger)
        tempCtx.fillStyle = 'rgba(120, 30, 30, 0.5)';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        // Blend onto main canvas (multiply) — only affects cat pixels (temp has cat alpha)
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        return context;
    }
}

/**
 * Stage 13: Transform (flip/reverse)
 */
class TransformStage extends PipelineStage {
    constructor() {
        super('Transform');
    }
    
    async process(context, params, resources) {
        if (!params.reverse) {
            return context;
        }
        
        const { canvas, ctx } = context;
        
        // Create temporary canvas for flip
        const tempCanvas = new OffscreenCanvas(50, 50);
        const tempCtx = tempCanvas.getContext('2d');
        
        // Copy current canvas
        tempCtx.drawImage(canvas, 0, 0);
        
        // Clear and flip
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(tempCanvas, -canvas.width, 0);
        ctx.restore();
        
        // Release temporary canvas
        // No need to release - let GC handle it
        
        return context;
    }
}

/**
 * Stage 14: Final Output
 */
class OutputStage extends PipelineStage {
    constructor() {
        super('Output');
    }
    
    async process(context, params, resources) {
        // Simply return the context - the main render method will handle conversion
        return context;
    }
}

// ============================================================================
// RENDER PIPELINE
// ============================================================================

/**
 * RenderPipeline - Orchestrates all rendering stages
 */
class RenderPipeline {
    constructor() {
        this.stages = [
            new BasePeltStage(),
            new TintApplicationStage(),
            new WhitePatchesStage(),
            new PointsStage(),
            new VitiligoStage(),
            new EyeRenderStage(),
            new ScarLayerOneStage(),
            new ShadingStage(),
            // Apply Dark Forest tint BEFORE lineart so lines stay crisp on top
            new DarkForestOverlayStage(),
            new LineartStage(),
            new SkinStage(),
            new ScarLayerTwoStage(),
            new AccessoryStage(),
            new TransformStage(),
            new OutputStage()
        ];
    }
    
    async execute(params, resources) {
        // Create context
        const canvas = resources.acquireCanvas();
        const ctx = canvas.getContext('2d');
        
        let context = { canvas, ctx };
        
        // Execute each stage in sequence
        for (const stage of this.stages) {
            context = await stage.execute(context, params, resources);
            
            // Check memory pressure between stages
            if (MemoryMonitor.checkPressure()) {
                MemoryMonitor.handlePressure(resources);
            }
        }
        
        // Don't release the canvas here - it contains our rendered cat!
        // The caller is responsible for handling the canvas
        return context;
    }
}

// ============================================================================
// MAIN CAT GENERATOR FACADE
// ============================================================================

/**
 * CatGenerator - Main public API
 */
class CatGenerator {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.resources = null;
        this.pipeline = null;
        this.initialized = false;
        this.stats = {
            totalGenerated: 0,
            totalTime: 0,
            averageTime: 0
        };
    }
    
    /**
     * Factory method for async initialization
     */
    static async create(config = {}) {
        // Check for feature flag (per-consumer)
        const consumerId = config.consumerId || 'default';
        const useNewPipeline = localStorage.getItem(`useNewPipeline_${consumerId}`) !== 'false';
        
        // Fallback to old implementation if flag is false
        if (!useNewPipeline && typeof CatGeneratorV2Old !== 'undefined') {
            console.log(`Using old generator for consumer: ${consumerId}`);
            return new CatGeneratorV2Old(config);
        }
        
        const generator = new CatGenerator(config);
        await generator.initialize();
        return generator;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        // Initialize spriteMapper first - it's needed for sprite name building
        await spriteMapper.init();
        
        // Initialize resources
        this.resources = ResourceManager.getInstance(this.config);
        
        // Initialize pipeline
        this.pipeline = new RenderPipeline();
        
        this.initialized = true;
    }
    
    /**
     * Main render method
     */
    async render(params, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const startTime = performance.now();
        
        try {
            // Validate parameters
            const validatedParams = ParamValidator.validate(params, this.config);
            
            // Merge with options
            const finalParams = {
                ...validatedParams,
                outputFormat: options.outputFormat || 'dataURL',
                ...options
            };
            
            // Execute pipeline
            const result = await this.pipeline.execute(finalParams, this.resources);
            
            // Track performance
            const duration = performance.now() - startTime;
            this.trackPerformance(duration);
            
            // Ensure we return a DOM-appendable canvas
            let finalCanvas = result.canvas;
            
            // If it's an OffscreenCanvas, convert to regular canvas
            if (typeof OffscreenCanvas !== 'undefined' && finalCanvas instanceof OffscreenCanvas) {
                const domCanvas = document.createElement('canvas');
                domCanvas.width = finalCanvas.width;
                domCanvas.height = finalCanvas.height;
                const domCtx = domCanvas.getContext('2d');
                domCtx.drawImage(finalCanvas, 0, 0);
                finalCanvas = domCanvas;
            }
            
            return { canvas: finalCanvas, context: result };
        } catch (error) {
            console.error('Render failed:', error);
            
            // Attempt fallback if available
            if (options.fallback !== false) {
                return this.renderFallback(params);
            }
            
            throw error;
        }
    }
    
    /**
     * Legacy method for backward compatibility
     */
    async generateCat(params) {
        // Main generation method - wraps render() for backwards compatibility
        return this.render(params);
    }
    
    /**
     * Better random selection to ensure even distribution
     */
    randomSelect(array) {
        if (!array || array.length === 0) return null;
        // Use a better random selection that avoids clustering
        const index = Math.floor(Math.random() * array.length);
        return array[index];
    }
    
    /**
     * Generate random parameters
     * @param {Object} options - Optional configuration
     * @param {boolean} options.ignoreForbiddenSprites - If true, filters out forbidden sprites [0,1,2,17,19,20]
     * @param {number} options.accessoryCount - Number of accessories to generate (default 1)
     */
    async generateRandomParams(options = {}) {
        // Ensure spriteMapper is initialized
        if (!spriteMapper.loaded) {
            console.warn('SpriteMapper not loaded, initializing...');
            await spriteMapper.init();
        }
        
        // Normalize experimental colour mode (legacy boolean support)
        let experimentalMode = options.experimentalColourMode;
        if (experimentalMode === undefined) {
            experimentalMode = options.experimentalColours ? ['bold'] : 'off';
        }
        if (Array.isArray(experimentalMode)) {
            experimentalMode = experimentalMode.filter(Boolean);
            if (experimentalMode.length === 0) {
                experimentalMode = 'off';
            }
        }

        // By default, include ALL sprites (0-20) to match pixel-cat-maker randomize button
        // Only filter if explicitly requested via options.ignoreForbiddenSprites
        let availableSprites;
        if (options.ignoreForbiddenSprites) {
            const forbiddenSprites = [0, 1, 2, 17, 19, 20];
            availableSprites = Array.from({length: 21}, (_, i) => i)
                .filter(s => !forbiddenSprites.includes(s));
        } else {
            availableSprites = Array.from({length: 21}, (_, i) => i);
        }
        const spriteNumber = this.randomSelect(availableSprites);
        
        // Get ALL pelts including TwoColour - only filter Tortie/Calico as they're special
        // The original randomize button includes TwoColour in the selection
        const pelts = spriteMapper.getPeltNames()
            .filter(p => p !== 'Tortie' && p !== 'Calico');
        let colours = spriteMapper.getColourOptions(experimentalMode);
        if (options.includeBaseColours === false && Array.isArray(colours)) {
            const baseSet = new Set((spriteMapper.getColours?.() || []).map(col => String(col).toUpperCase()));
            const filtered = colours.filter(col => !baseSet.has(String(col).toUpperCase()));
            if (filtered.length > 0) {
                colours = filtered;
            }
        }
        const eyeColours = spriteMapper.getEyeColours();
        const skinColours = spriteMapper.getSkinColours();
        const tints = spriteMapper.getTints(); // Includes 'none'
        const accessories = spriteMapper.getAccessories(); // Get accessories list
        const scars = spriteMapper.getScars(); // Get scars list
        
        // Build base parameters matching original behavior exactly
        const params = {
            spriteNumber,
            peltName: this.randomSelect(pelts),
            colour: this.randomSelect(colours),
            tint: this.randomSelect(tints),
            skinColour: this.randomSelect(skinColours),
            eyeColour: this.randomSelect(eyeColours),
            eyeColour2: undefined,
            isTortie: Math.random() <= 0.5, // 50% chance
            shading: false, // Always false in original
            reverse: Math.random() <= 0.5  // 50% chance, not 20%
        };
        
        // Heterochromia - 50% chance to set eyeColour2
        if (Math.random() <= 0.5) {
            const eyeColour2WithEmpty = ["", ...eyeColours];
            const selected = eyeColour2WithEmpty[Math.floor(Math.random() * eyeColour2WithEmpty.length)];
            if (selected !== "") {
                params.eyeColour2 = selected;
            }
        }
        
        // Add tortie-specific params if tortie
        // Support for multiple tortie patterns via options.tortieCount
        if (params.isTortie) {
            const tortieMasks = spriteMapper.getTortieMasks();
            const tortieCount = options.tortieCount || 1;
            const tortiePatterns = [];
            
            for (let i = 0; i < tortieCount; i++) {
                const mask = this.randomSelect(tortieMasks);
                const col = this.randomSelect(colours);
                const pat = this.randomSelect(pelts);
                tortiePatterns.push({mask: mask, pattern: pat, colour: col});
            }
            
            // Always use array format for v2
            params.tortie = tortiePatterns;
            
            // For backward compatibility with v1, use first pattern for legacy fields
            if (tortiePatterns.length > 0) {
                params.tortieMask = tortiePatterns[0].mask;
                params.tortieColour = tortiePatterns[0].colour;
                params.tortiePattern = tortiePatterns[0].pattern;
            }
        }
        
        // Master 50% check for white patches group - matches iframe logic exactly
        if (Math.random() <= 0.5) {
            // White patches - 50% chance within this branch (25% overall)
            if (Math.random() <= 0.5) {
                const whitePatches = spriteMapper.getWhitePatches();
                if (whitePatches.length > 0) {
                    const selected = this.randomSelect(whitePatches);
                    params.whitePatches = selected;
                }
            }

            // Points - 50% chance within this branch (25% overall) - INDEPENDENT
            if (Math.random() <= 0.5) {
                const points = spriteMapper.getPoints();
                if (points.length > 0) {
                    const selected = this.randomSelect(points);
                    params.points = selected;
                }
            }

            // White patches tint - ALWAYS set in this branch
            const whitePatchMode = options.whitePatchColourMode || 'default';
            const whitePatchesTints = spriteMapper.getWhitePatchColourOptions(
                whitePatchMode,
                experimentalMode && experimentalMode !== 'off' ? experimentalMode : null
            );
            const selectedTint = this.randomSelect(whitePatchesTints);
            if (selectedTint && selectedTint !== 'none') {
                params.whitePatchesTint = selectedTint;
            }

            // Vitiligo - 50% chance within this branch (25% overall) - INDEPENDENT
            if (Math.random() <= 0.5) {
                const vitiligo = spriteMapper.getVitiligo();
                if (vitiligo.length > 0) {
                    const selected = this.randomSelect(vitiligo);
                    params.vitiligo = selected;
                }
            }
        }
        
        // Accessories - 50% chance of having any accessory
        // This gives us 50% none, 50% with accessory
        if (Math.random() <= 0.5 && accessories && accessories.length > 0) {
            const accessoryCount = options.accessoryCount || 1;
            const selectedAccessories = [];
            
            for (let i = 0; i < accessoryCount; i++) {
                const accessory = this.randomSelect(accessories);
                if (accessory && accessory !== 'none') {
                    selectedAccessories.push(accessory);
                }
            }
            
            if (selectedAccessories.length > 0) {
                // Always use array format for v2
                params.accessories = selectedAccessories;
                // For backward compatibility, set singular accessory
                params.accessory = selectedAccessories[0];
            }
        }
        
        // Scars - 50% chance of having any scar
        // This gives us 50% none, 50% with scar
        if (Math.random() <= 0.5 && scars && scars.length > 0) {
            const scarCount = options.scarCount || 1;
            const selectedScars = [];
            
            for (let i = 0; i < scarCount; i++) {
                const scar = this.randomSelect(scars);
                if (scar && scar !== 'none') {
                    selectedScars.push(scar);
                }
            }
            
            if (selectedScars.length > 0) {
                // Always use array format for v2
                params.scars = selectedScars;
                // For backward compatibility, set singular scar
                params.scar = selectedScars[0];
            }
        }
        
        return params;
    }
    
    /**
     * Method to generate random params with all sprites (including forbidden ones)
     */
    async generateRandomParamsAllSprites() {
        // Ensure spriteMapper is initialized
        if (!spriteMapper.loaded) {
            console.warn('SpriteMapper not loaded, initializing...');
            await spriteMapper.init();
        }
        
        // Include ALL sprites (0-20) for compatibility testing
        const allSprites = Array.from({length: 21}, (_, i) => i);
        const spriteNumber = this.randomSelect(allSprites);
        
        // Get data from spriteMapper including TwoColour
        const pelts = spriteMapper.getPeltNames()
            .filter(p => p !== 'Tortie' && p !== 'Calico');
        const colours = spriteMapper.getColours();
        const eyeColours = spriteMapper.getEyeColours();
        const skinColours = spriteMapper.getSkinColours();
        const tints = spriteMapper.getTints(); // Includes 'none'
        const accessories = spriteMapper.getAccessories(); // Get accessories list
        const scars = spriteMapper.getScars(); // Get scars list
        const whitePatches = spriteMapper.getWhitePatches(); // Get white patches list
        
        // Debug logging
        if (!this._hasLoggedDataAllSprites) {
            console.log('generateRandomParamsAllSprites - Available data:');
            console.log(`  Accessories: ${accessories.length} total`);
            console.log(`  Has BELL: ${accessories.filter(a => a.includes('BELL')).length}`);
            console.log(`  Has BOW: ${accessories.filter(a => a.includes('BOW')).length}`);
            console.log(`  Has NYLON: ${accessories.filter(a => a.includes('NYLON')).length}`);
            console.log(`  White patches: ${whitePatches.length} total`);
            console.log(`  Sample: ${whitePatches.slice(0, 5).join(', ')}`);
            this._hasLoggedDataAllSprites = true;
        }
        
        // Build base parameters matching original behavior exactly
        const params = {
            spriteNumber,
            peltName: this.randomSelect(pelts),
            colour: this.randomSelect(colours),
            tint: this.randomSelect(tints),
            skinColour: this.randomSelect(skinColours),
            eyeColour: this.randomSelect(eyeColours),
            eyeColour2: undefined,
            isTortie: Math.random() <= 0.5, // 50% chance
            shading: false, // Always false in original
            reverse: Math.random() <= 0.5  // 50% chance, not 20%
        };
        
        // Heterochromia - 50% chance to set eyeColour2
        if (Math.random() <= 0.5) {
            const eyeColour2WithEmpty = ["", ...eyeColours];
            const selected = eyeColour2WithEmpty[Math.floor(Math.random() * eyeColour2WithEmpty.length)];
            if (selected !== "") {
                params.eyeColour2 = selected;
            }
        }
        
        // Add tortie-specific params if tortie
        if (params.isTortie) {
            const tortieMasks = spriteMapper.getTortieMasks();
            const mask = this.randomSelect(tortieMasks);
            const col = this.randomSelect(colours);
            const pat = this.randomSelect(pelts);
            
            // Set individual fields for v1 compatibility
            params.tortieMask = mask;
            params.tortieColour = col;
            params.tortiePattern = pat;
            
            // Also set array format for v2
            params.tortie = [{mask: mask, pattern: pat, colour: col}];
        }
        
        // Master 50% check for white patches group - matches iframe logic exactly
        if (Math.random() <= 0.5) {
            // White patches - 50% chance within this branch (25% overall)
            if (Math.random() <= 0.5) {
                // Use the whitePatches we already loaded above
                if (whitePatches.length > 0) {
                    const selected = this.randomSelect(whitePatches);
                    params.whitePatches = selected;
                }
            }
            
            // Points - 50% chance within this branch (25% overall) - INDEPENDENT
            if (Math.random() <= 0.5) {
                const points = spriteMapper.getPoints();
                if (points.length > 0) {
                    const selected = this.randomSelect(points);
                    params.points = selected;
                }
            }
            
            // White patches tint - ALWAYS set in this branch
        const whitePatchesTints = spriteMapper.getWhitePatchColourOptions(
            options.whitePatchColourMode || 'default',
            experimentalMode && experimentalMode !== 'off' ? experimentalMode : null
        );
            const selectedTint = this.randomSelect(whitePatchesTints);
            if (selectedTint && selectedTint !== 'none') {
                params.whitePatchesTint = selectedTint;
            }
            
            // Vitiligo - 50% chance within this branch (25% overall) - INDEPENDENT
            if (Math.random() <= 0.5) {
                const vitiligo = spriteMapper.getVitiligo();
                if (vitiligo.length > 0) {
                    const selected = this.randomSelect(vitiligo);
                    params.vitiligo = selected;
                }
            }
        }
        
        // Accessories - 50% chance of having any accessory
        if (Math.random() <= 0.5 && accessories && accessories.length > 0) {
            const accessory = this.randomSelect(accessories);
            params.accessory = accessory;
            // Also set array format for v2
            params.accessories = [accessory];
        }
        
        // Scars - 50% chance of having any scar
        if (Math.random() <= 0.5 && scars && scars.length > 0) {
            const scar = this.randomSelect(scars);
            params.scar = scar;
            // Also set array format for v2
            params.scars = [scar];
        }
        
        return params;
    }
    
    
    /**
     * Generate all variations for a parameter
     */
    async generateAllVariationsForParameter(baseParams, parameterName) {
        // Initialize spriteMapper if needed
        if (!spriteMapper.loaded) {
            await spriteMapper.init();
        }
        
        const variations = [];
        const parameterMap = {
            sprite: Array.from({length: 21}, (_, i) => i),
            pelt: spriteMapper.getPeltNames(),
            colour: spriteMapper.getColours(),
            eyeColour: spriteMapper.getEyeColours(),
            accessory: [...spriteMapper.getAccessories(), 'none']
        };
        
        const values = parameterMap[parameterName];
        if (!values) {
            throw new Error(`Unknown parameter: ${parameterName}`);
        }
        
        for (const value of values) {
            const params = { ...baseParams };
            
            if (parameterName === 'sprite') {
                params.spriteNumber = value;
            } else {
                params[parameterName] = value;
            }
            
            variations.push(params);
        }
        
        return variations;
    }
    
    /**
     * Build URL for external cat maker
     */
    buildCatURL(params) {
        if (!params) {
            console.error('No params provided to buildCatURL');
            return '';
        }
        
        const urlParams = new URLSearchParams();
        urlParams.set('version', 'v1');
        
        // Required parameters
        urlParams.set('shading', params.shading ? 'true' : 'false');
        urlParams.set('reverse', params.reverse ? 'true' : 'false');
        urlParams.set('isTortie', params.isTortie ? 'true' : 'false');
        urlParams.set('backgroundColour', 'rgb(0 0 0 / 0)');
        
        if (params.peltName) urlParams.set('peltName', params.peltName);
        if (params.spriteNumber !== undefined) urlParams.set('spriteNumber', params.spriteNumber);
        if (params.colour) urlParams.set('colour', params.colour);
        if (params.tint && params.tint !== 'none') urlParams.set('tint', params.tint);
        if (params.skinColour) urlParams.set('skinColour', params.skinColour);
        if (params.eyeColour) urlParams.set('eyeColour', params.eyeColour);
        
        // Optional parameters
        if (params.eyeColour2) urlParams.set('eyeColour2', params.eyeColour2);
        if (params.whitePatches) urlParams.set('whitePatches', params.whitePatches);
        if (params.points) urlParams.set('points', params.points);
        if (params.whitePatchesTint && params.whitePatchesTint !== 'none') urlParams.set('whitePatchesTint', params.whitePatchesTint);
        if (params.vitiligo) urlParams.set('vitiligo', params.vitiligo);
        
        // Handle accessories - URL only supports single value
        // If accessories array exists, use first item
        if (params.accessories && Array.isArray(params.accessories) && params.accessories.length > 0) {
            urlParams.set('accessory', params.accessories[0]);
        } else if (params.accessory) {
            urlParams.set('accessory', params.accessory);
        }
        
        // Handle scars - URL only supports single value
        // If scars array exists, use first item
        if (params.scars && Array.isArray(params.scars) && params.scars.length > 0) {
            urlParams.set('scar', params.scars[0]);
        } else if (params.scar) {
            urlParams.set('scar', params.scar);
        }
        
        // Tortie-specific parameters
        if (params.isTortie) {
            if (params.tortieMask) urlParams.set('tortieMask', params.tortieMask);
            if (params.tortieColour) urlParams.set('tortieColour', params.tortieColour);
            if (params.tortiePattern) urlParams.set('tortiePattern', params.tortiePattern);
        }
        
        return `https://cgen-tools.github.io/pixel-cat-maker/?${urlParams.toString()}`;
    }
    
    /**
     * Performance tracking
     */
    trackPerformance(duration) {
        // Update stats
        this.stats.totalGenerated++;
        this.stats.totalTime += duration;
        this.stats.averageTime = this.stats.totalTime / this.stats.totalGenerated;
        
        // Send to telemetry if configured
        if (this.config.telemetry) {
            const stats = this.resources.spriteCache.getStats();
            console.log(`Render completed in ${duration}ms, Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
        }
    }
    
    /**
     * Generate all variations for a parameter
     */
    async generateAllVariationsForParameter(baseParams, parameterName, values, shuffle = false) {
        console.log(`🎨 CAT GENERATOR - generateAllVariationsForParameter:`);
        console.log(`  - Parameter name: ${parameterName}`);
        console.log(`  - Values to process:`, values);
        console.log(`  - Base params:`, baseParams);
        
        const variations = [];
        
        // Optionally shuffle the values array
        const valuesToProcess = shuffle ? [...values].sort(() => Math.random() - 0.5) : values;
        console.log(`  - Values after shuffle:`, valuesToProcess);
        
        for (const value of valuesToProcess) {
            const params = { ...baseParams };
            
            if (parameterName === 'sprite') {
                params.spriteNumber = value;
                console.log(`    Setting spriteNumber = ${value}`);
            } else {
                params[parameterName] = value;
                console.log(`    Setting ${parameterName} = ${value}`);
                console.log(`    Params after setting:`, params);
            }
            
            const result = await this.generateCat(params);
            // Add the value to the result so fillSpriteItem knows what value this variation represents
            variations.push({ ...result, value });
        }
        
        console.log(`  - Generated ${variations.length} variations`);
        return variations;
    }
    
    /**
     * Get a canvas of specified size
     */
    getCanvas(width = 50, height = 50) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    
    /**
     * Validate parameters
     */
    validateParams(params) {
        const errors = [];
        
        if (!params.spriteNumber || params.spriteNumber < 0 || params.spriteNumber > 20) {
            errors.push('Invalid sprite number');
        }
        
        if (!params.peltName) {
            errors.push('Missing pelt name');
        }
        
        if (!params.colour) {
            errors.push('Missing colour');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Get metrics
     */
    getMetrics() {
        return {
            totalGenerated: this.stats.totalGenerated,
            averageTime: this.stats.averageTime,
            cacheStats: this.resources?.spriteCache?.getStats() || {}
        };
    }
    
    /**
     * Fallback renderer
     */
    async renderFallback(params) {
        console.warn('Using fallback renderer');
        
        // Simple fallback - return placeholder
        const canvas = this.resources.acquireCanvas();
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 50, 50);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Arial';
        ctx.fillText('CAT', 15, 25);
        
        // Return the canvas directly for fallback
        return { canvas };
    }
    
    /**
     * Cleanup
     */
    
    /**
     * Generate a random cat (wrapper for compatibility)
     */
    async generateRandomCat(options = {}) {
        try {
            // For backward compatibility, ignore forbidden sprites by default
            const params = await this.generateRandomParams({
                ...options,
                ignoreForbiddenSprites: true
            });
            const result = await this.generateCat(params);
            return { params, canvas: result.canvas };
        } catch (error) {
            console.error('Error in generateRandomCat:', error);
            throw error;
        }
    }
    
    /**
     * Generate batch of cats
     */
    async generateBatch(count = 10, progressCallback = null) {
        const results = [];
        
        for (let i = 0; i < count; i++) {
            try {
                const params = await this.generateRandomParams();
                const result = await this.generateCat(params);
                results.push({ params, canvas: result.canvas });
                
                if (progressCallback) {
                    progressCallback(i + 1, count);
                }
            } catch (error) {
                console.error(`Failed to generate cat ${i + 1}:`, error);
                results.push({ error: error.message });
            }
        }
        
        return results;
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        this.dispose();
    }
    
    dispose() {
        if (this.resources) {
            this.resources.dispose();
        }
        this.initialized = false;
    }
}

// ============================================================================
// TELEMETRY & MONITORING
// ============================================================================

/**
 * Telemetry for production monitoring
 */
class Telemetry {
    static metrics = {
        generationCount: 0,
        averageTime: 0,
        cacheHitRate: 0,
        memoryPeaks: [],
        errors: []
    };
    
    static init() {
        // Report every 5 minutes
        setInterval(() => this.report(), 5 * 60 * 1000);
    }
    
    static trackGeneration(duration, cacheStats) {
        this.metrics.generationCount++;
        this.metrics.averageTime = 
            (this.metrics.averageTime * (this.metrics.generationCount - 1) + duration) 
            / this.metrics.generationCount;
        this.metrics.cacheHitRate = cacheStats.hitRate;
        
        // Track memory
        if (performance.memory) {
            this.metrics.memoryPeaks.push(performance.memory.usedJSHeapSize);
            // Keep only last 100 peaks
            if (this.metrics.memoryPeaks.length > 100) {
                this.metrics.memoryPeaks.shift();
            }
        }
    }
    
    static trackError(error) {
        this.metrics.errors.push({
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
        });
        
        // Keep only last 50 errors
        if (this.metrics.errors.length > 50) {
            this.metrics.errors.shift();
        }
    }
    
    static report() {
        // In production, send to analytics endpoint
        if (typeof fetch !== 'undefined') {
            fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.metrics)
            }).catch(err => console.error('Telemetry failed:', err));
        }
    }
}

// Initialize telemetry if in browser
if (typeof window !== 'undefined') {
    Telemetry.init();
}

// ============================================================================
// EXPORTS
// ============================================================================

// Support both ES6 and CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CatGenerator;
} else if (typeof define === 'function' && define.amd) {
    define([], function() { return CatGenerator; });
} else if (typeof window !== 'undefined') {
    window.CatGenerator = CatGenerator;
    window.CatGeneratorV2 = CatGenerator; // Alias for compatibility
}

// Export classes for testing
if (typeof exports !== 'undefined') {
    exports.CatGenerator = CatGenerator;
    // CanvasPool removed
    exports.ResourceManager = ResourceManager;
    exports.RenderPipeline = RenderPipeline;
    exports.ParamValidator = ParamValidator;
}

// Create singleton instance
const catGenerator = new CatGenerator();

// ES6 Module export - export singleton instance
export default catGenerator;
export { CatGenerator };
