/**
 * Native Cat Generator V2
 * Supports arrays for accessories and tortie patterns
 * 100% backward compatible with V1
 */

// Tint color definitions
const TINT_COLORS = {
    pink: [253, 237, 237],
    gray: [225, 225, 225],
    red: [248, 226, 228],
    black: [195, 195, 195],
    orange: [255, 247, 235],
    yellow: [250, 248, 225],
    purple: [235, 225, 244],
    blue: [218, 237, 245],
    none: null
};

const DILUTE_TINT_COLORS = {
    dilute: [20, 20, 20],
    warmdilute: [25, 15, 7],
    cooldilute: [7, 15, 25],
    none: null
};

const WHITE_PATCHES_TINT_COLORS = {
    darkcream: [236, 229, 208],
    cream: [247, 241, 225],
    offwhite: [238, 249, 252],
    gray: [208, 225, 229],
    pink: [254, 248, 249],
    none: null
};

// Configuration defaults - can be overridden but use sensible defaults
const DEFAULT_CONFIG = {
    canvasWidth: 50,
    canvasHeight: 50,
    spriteBasePath: 'pixel-cat-maker/sprites/split/',
    cacheEnabled: true,
    maxCacheSize: 500,
    forbiddenSprites: new Set([0, 1, 2, 17, 19, 20])
};

// Pelt sprite name mapping
const PELT_SPRITES = {
    SingleColour: "single",
    TwoColour: "single",
    Tabby: "tabby",
    Marbled: "marbled",
    Rosette: "rosette",
    Smoke: "smoke",
    Ticked: "ticked",
    Speckled: "speckled",
    Bengal: "bengal",
    Mackerel: "mackerel",
    Classic: "classic",
    Sokoke: "sokoke",
    Agouti: "agouti",
    Singlestripe: "singlestripe",
    Masked: "masked",
    Tortie: "",
    Calico: ""
};

// Scar categories
const SCARS_1 = ["ONE", "TWO", "THREE", "TAILSCAR", "SNOUT", "CHEEK", "SIDE", "THROAT", "TAILBASE", "BELLY", "LEGBITE", "NECKBITE", "FACE", "MANLEG", "BRIGHTHEART", "MANTAIL", "BRIDGE", "RIGHTBLIND", "LEFTBLIND", "BOTHBLIND", "BEAKCHEEK", "BEAKLOWER", "CATBITE", "RATBITE", "QUILLCHUNK", "QUILLSCRATCH", "HINDLEG", "BACK", "QUILLSIDE", "SCRATCHSIDE", "BEAKSIDE", "CATBITETWO", "FOUR"];
const SCARS_2 = ["LEFTEAR", "RIGHTEAR", "NOTAIL", "HALFTAIL", "NOPAW", "NOLEFTEAR", "NORIGHTEAR", "NOEAR"];
const SCARS_3 = ["SNAKE", "TOETRAP", "BURNPAWS", "BURNTAIL", "BURNBELLY", "BURNRUMP", "FROSTFACE", "FROSTTAIL", "FROSTMITT", "FROSTSOCK", "TOE", "SNAKETWO"];

// Accessory categories - updated with all variations from pixel-cat-maker
const PLANT_ACCESSORIES = ["MAPLE LEAF", "HOLLY", "BLUE BERRIES", "FORGET ME NOTS", "RYE STALK", "CATTAIL", "POPPY", "ORANGE POPPY", "CYAN POPPY", "WHITE POPPY", "PINK POPPY", "BLUEBELLS", "LILY OF THE VALLEY", "SNAPDRAGON", "HERBS", "PETALS", "NETTLE", "HEATHER", "GORSE", "JUNIPER", "RASPBERRY", "LAVENDER", "OAK LEAVES", "CATMINT", "MAPLE SEED", "LAUREL", "BULB WHITE", "BULB YELLOW", "BULB ORANGE", "BULB PINK", "BULB BLUE", "CLOVER", "DAISY", "DRY HERBS", "DRY CATMINT", "DRY NETTLES", "DRY LAURELS"];
const WILD_ACCESSORIES = ["RED FEATHERS", "BLUE FEATHERS", "JAY FEATHERS", "GULL FEATHERS", "SPARROW FEATHERS", "MOTH WINGS", "ROSY MOTH WINGS", "MORPHO BUTTERFLY", "MONARCH BUTTERFLY", "CICADA WINGS", "BLACK CICADA"];
const COLLARS = ["CRIMSON", "BLUE", "YELLOW", "CYAN", "RED", "LIME", "GREEN", "RAINBOW", "BLACK", "SPIKES", "WHITE", "PINK", "PURPLE", "MULTI", "INDIGO", 
    "CRIMSONBELL", "BLUEBELL", "YELLOWBELL", "CYANBELL", "REDBELL", "LIMEBELL", "GREENBELL", "RAINBOWBELL", "BLACKBELL", "SPIKESBELL", "WHITEBELL", "PINKBELL", "PURPLEBELL", "MULTIBELL", "INDIGOBELL",
    "CRIMSONBOW", "BLUEBOW", "YELLOWBOW", "CYANBOW", "REDBOW", "LIMEBOW", "GREENBOW", "RAINBOWBOW", "BLACKBOW", "SPIKESBOW", "WHITEBOW", "PINKBOW", "PURPLEBOW", "MULTIBOW", "INDIGOBOW",
    "CRIMSONNYLON", "BLUENYLON", "YELLOWNYLON", "CYANNYLON", "REDNYLON", "LIMENYLON", "GREENNYLON", "RAINBOWNYLON", "BLACKNYLON", "SPIKESNYLON", "WHITENYLON", "PINKNYLON", "PURPLENYLON", "MULTINYLON", "INDIGONYLON"];

class CatGenerator {
    constructor(config = {}) {
        // Merge user config with defaults
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // LRU cache for loaded sprite images
        this.spriteCache = new Map();
        this.cacheAccessOrder = [];
        
        // Determine base path based on current location if not provided
        if (!config.spriteBasePath) {
            // Guard window access for worker/SSR compatibility
            if (typeof window !== 'undefined' && window.location) {
                const path = window.location.pathname;
                if (path.includes('/pages/') || path.includes('/test/')) {
                    this.spriteBasePath = '../pixel-cat-maker/sprites/split/';
                } else {
                    this.spriteBasePath = 'pixel-cat-maker/sprites/split/';
                }
            } else {
                // Default path when window is unavailable
                this.spriteBasePath = 'pixel-cat-maker/sprites/split/';
            }
        } else {
            this.spriteBasePath = config.spriteBasePath;
        }
        
        // Pre-compute arrays for performance
        this.accessoryTypes = {
            plant: PLANT_ACCESSORIES,
            wild: WILD_ACCESSORIES,
            collar: COLLARS
        };
        this.allAccessories = [...PLANT_ACCESSORIES, ...WILD_ACCESSORIES, ...COLLARS];
        
        // Pre-compute validation sets for O(1) lookup
        this.validPelts = new Set(Object.keys(PELT_SPRITES).filter(p => p !== 'Tortie' && p !== 'Calico'));
        this.validColours = new Set(["CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", "GREY", "DARKGREY", "GHOST", "BLACK", "WHITE", "PALEGREY", "SILVER", "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"]);
        this.validTints = new Set([...Object.keys(TINT_COLORS), ...Object.keys(DILUTE_TINT_COLORS)]);
        this.validEyeColours = new Set(["YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE", "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER", "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW", "BRONZE", "SILVER"]);
        this.validSkinColours = new Set(["BLACK", "PINK", "DARKBROWN", "BROWN", "LIGHTBROWN", "DARK", "DARKGREY", "GREY", "DARKSALMON", "SALMON", "PEACH", "DARKMARBLED", "MARBLED", "LIGHTMARBLED", "DARKBLUE", "BLUE", "LIGHTBLUE", "RED"]);
        this.validTortieMasks = new Set(["ONE", "TWO", "THREE", "FOUR", "REDTAIL", "DELILAH", "MINIMALONE", "MINIMALTWO", "MINIMALTHREE", "MINIMALFOUR", "HALF", "OREO", "SWOOP", "MOTTLED", "SIDEMASK", "EYEDOT", "BANDANA", "PACMAN", "STREAMSTRIKE", "ORIOLE", "CHIMERA", "DAUB", "EMBER", "BLANKET", "ROBIN", "BRINDLE", "PAIGE", "ROSETAIL", "SAFI", "SMUDGED", "DAPPLENIGHT", "STREAK", "MASK", "CHEST", "ARMTAIL", "SMOKE", "GRUMPYFACE", "BRIE", "BELOVED", "BODY", "SHILOH", "FRECKLED", "HEARTBEAT"]);
        this.validAccessories = new Set(this.allAccessories);
        this.validScars = new Set([...SCARS_1, ...SCARS_2, ...SCARS_3]);
        
        // Pre-compute arrays for generateRandomParams
        this.whitePatches = {
            little: ["LITTLE", "LIGHTTUXEDO", "BUZZARDFANG", "TIP", "BLAZE", "BIB", "VEE", "PAWS", "BELLY", "TAILTIP", "TOES", "BROKENBLAZE", "LILTWO", "SCOURGE", "TOESTAIL", "RAVENPAW", "HONEY", "LUNA", "EXTRA", "MUSTACHE", "REVERSEHEART", "SPARKLE", "RIGHTEAR", "LEFTEAR", "ESTRELLA", "REVERSEEYE", "BACKSPOT", "EYEBAGS", "LOCKET", "BLAZEMASK", "TEARS"],
            mid: ["TUXEDO", "FANCY", "UNDERS", "DAMIEN", "SKUNK", "MITAINE", "SQUEAKS", "STAR", "WINGS", "DIVA", "SAVANNAH", "FADESPOTS", "BEARD", "DAPPLEPAW", "TOPCOVER", "WOODPECKER", "MISS", "BOWTIE", "VEST", "FADEBELLY", "DIGIT", "FCTWO", "FCONE", "MIA", "ROSINA", "PRINCESS", "DOUGIE"],
            high: ["ANY", "ANYTWO", "BROKEN", "FRECKLES", "RINGTAIL", "HALFFACE", "PANTSTWO", "GOATEE", "PRINCE", "FAROFA", "MISTER", "PANTS", "REVERSEPANTS", "HALFWHITE", "APPALOOSA", "PIEBALD", "CURVED", "GLASS", "MASKMANTLE", "MAO", "PAINTED", "SHIBAINU", "OWL", "BUB", "SPARROW", "TRIXIE", "SAMMY", "FRONT", "BLOSSOMSTEP", "BULLSEYE", "FINN", "SCAR", "BUSTER", "HAWKBLAZE", "CAKE"],
            mostly: ["VAN", "ONEEAR", "LIGHTSONG", "TAIL", "HEART", "MOORISH", "APRON", "CAPSADDLE", "CHESTSPECK", "BLACKSTAR", "PETAL", "HEARTTWO", "PEBBLESHINE", "BOOTS", "COW", "COWTWO", "LOVEBUG", "SHOOTINGSTAR", "EYESPOT", "PEBBLE", "TAILTWO", "BUDDY", "KROPKA"],
            full: ["FULLWHITE"]
        };
        this.allWhitePatches = [...this.whitePatches.little, ...this.whitePatches.mid, ...this.whitePatches.high, ...this.whitePatches.mostly, ...this.whitePatches.full];
        
        // Parameter setter map for O(1) lookup in generateAllVariationsForParameter
        this.parameterSetters = {
            sprite: (p, v) => p.spriteNumber = v,
            pelt: (p, v) => p.peltName = v,
            colour: (p, v) => p.colour = v,
            tortie: (p, v) => p.isTortie = v,
            tortieMask: (p, v) => p.tortieMask = v,
            tortiePattern: (p, v) => p.tortiePattern = v,
            tortieColour: (p, v) => p.tortieColour = v,
            tint: (p, v) => p.tint = (v === 'none' ? 'none' : v),
            eyeColour: (p, v) => p.eyeColour = v,
            eyeColour2: (p, v) => p.eyeColour2 = (v === 'none' ? undefined : v),
            skinColour: (p, v) => p.skinColour = v,
            whitePatches: (p, v) => p.whitePatches = (v === 'none' ? undefined : v),
            points: (p, v) => p.points = (v === 'none' ? undefined : v),
            whitePatchesTint: (p, v) => p.whitePatchesTint = (v === 'none' ? undefined : v),
            vitiligo: (p, v) => p.vitiligo = (v === 'none' ? undefined : v),
            accessory: (p, v) => p.accessory = (v === 'none' ? undefined : v),
            scar: (p, v) => p.scar = (v === 'none' ? undefined : v),
            shading: (p, v) => p.shading = v,
            reverse: (p, v) => p.reverse = v
        };
    }

    /**
     * Create a canvas with fallback support
     */
    getCanvas(width = this.config.canvasWidth, height = this.config.canvasHeight) {
        // Try OffscreenCanvas first (better performance)
        if (typeof OffscreenCanvas !== 'undefined') {
            return new OffscreenCanvas(width, height);
        }
        // Fallback to regular canvas
        if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
        // No canvas implementation available
        throw new Error('No canvas implementation available');
    }

    /**
     * Get sprite URL with proper encoding
     */
    getSpriteURL(spriteName, spriteNumber) {
        // Centralize encoding to avoid double-encoding issues
        const safeName = spriteName.replace(/[^a-zA-Z0-9_-]/g, (char) => encodeURIComponent(char));
        return `${this.spriteBasePath}${safeName}_${spriteNumber}.png`;
    }

    /**
     * Load sprite image with LRU caching
     */
    async loadSprite(spriteName, spriteNumber) {
        const cacheKey = `${spriteName}_${spriteNumber}`;
        
        if (this.config.cacheEnabled && this.spriteCache.has(cacheKey)) {
            // Move to end of access order (most recently used)
            const index = this.cacheAccessOrder.indexOf(cacheKey);
            if (index > -1) {
                this.cacheAccessOrder.splice(index, 1);
            }
            this.cacheAccessOrder.push(cacheKey);
            return this.spriteCache.get(cacheKey);
        }

        const url = this.getSpriteURL(spriteName, spriteNumber);
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                // LRU cache management with edge case handling
                if (this.config.cacheEnabled) {
                    // Check cache size limit
                    if (this.spriteCache.size >= this.config.maxCacheSize && this.cacheAccessOrder.length > 0) {
                        // Remove least recently used with safety check
                        const lru = this.cacheAccessOrder.shift();
                        if (lru !== undefined) {
                            this.spriteCache.delete(lru);
                        }
                    }
                    this.spriteCache.set(cacheKey, img);
                    this.cacheAccessOrder.push(cacheKey);
                }
                resolve(img);
            };
            img.onerror = () => {
                console.error(`Failed to load sprite: ${url}`);
                reject(new Error(`Failed to load sprite: ${url}`));
            };
        });
    }

    /**
     * Draw a sprite to canvas
     */
    async drawSprite(spriteName, spriteNumber, ctx) {
        try {
            const img = await this.loadSprite(spriteName, spriteNumber);
            const { canvasWidth: w, canvasHeight: h } = this.config;
            ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
        } catch (e) {
            console.error(`Error drawing sprite ${spriteName}_${spriteNumber}:`, e);
        }
    }

    /**
     * Apply tint to canvas with specified blend mode
     */
    async drawTint(tintColor, blendMode, ctx) {
        if (tintColor === null) return;

        const color = `rgb(${tintColor[0]} ${tintColor[1]} ${tintColor[2]})`;
        const { canvasWidth: w, canvasHeight: h } = this.config;
        
        // Create temp canvas for tinting
        const tempCanvas = this.getCanvas();
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        
        // Copy current canvas
        tempCtx.drawImage(ctx.canvas, 0, 0);
        
        // Apply tint with source-in to preserve transparency
        tempCtx.globalCompositeOperation = "source-in";
        tempCtx.fillStyle = color;
        tempCtx.fillRect(0, 0, w, h);
        
        // Create another temp canvas for blending
        const blendCanvas = this.getCanvas();
        const blendCtx = blendCanvas.getContext("2d");
        if (!blendCtx) return;
        
        // Copy original
        blendCtx.drawImage(ctx.canvas, 0, 0);
        
        // Apply blend mode
        blendCtx.globalCompositeOperation = blendMode;
        blendCtx.drawImage(tempCanvas, 0, 0);
        
        // Draw back to main canvas preserving alpha
        const originalOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "source-in";
        ctx.drawImage(blendCanvas, 0, 0);
        ctx.globalCompositeOperation = originalOp;
    }

    /**
     * Draw masked sprite (for tortie patterns)
     */
    async drawMaskedSprite(patternSprite, maskSprite, spriteNumber, ctx) {
        const tempCanvas = this.getCanvas();
        const tempCtx = tempCanvas.getContext("2d");
        
        if (tempCtx !== null) {
            // Draw mask
            await this.drawSprite(maskSprite, spriteNumber, tempCtx);
            
            // Apply pattern with source-in
            tempCtx.globalCompositeOperation = "source-in";
            await this.drawSprite(patternSprite, spriteNumber, tempCtx);
            
            // Draw to main canvas
            ctx.drawImage(tempCanvas, 0, 0);
        }
    }

    /**
     * Apply shading effect
     */
    async applyShading(spriteNumber, ctx) {
        const tempCanvas = this.getCanvas();
        const tempCtx = tempCanvas.getContext("2d");
        
        if (tempCtx === null) return;
        
        // Copy current canvas
        tempCtx.drawImage(ctx.canvas, 0, 0);
        
        // Apply shading with source-in
        tempCtx.globalCompositeOperation = "source-in";
        await this.drawSprite("shaders", spriteNumber, tempCtx);
        
        // Multiply blend
        const originalOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalCompositeOperation = originalOp;
        
        // Add lighting
        await this.drawSprite("lighting", spriteNumber, ctx);
    }

    /**
     * Apply missing part mask (for scars that remove parts)
     */
    async applyMissingMask(scarName, spriteNumber, ctx) {
        const originalOp = ctx.globalCompositeOperation;
        
        // Use destination-in to mask out parts
        ctx.globalCompositeOperation = "destination-in";
        await this.drawSprite(`scars${scarName}`, spriteNumber, ctx);
        
        // Create temp canvas for multiply effect
        const tempCanvas = this.getCanvas();
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        
        tempCtx.drawImage(ctx.canvas, 0, 0);
        tempCtx.globalCompositeOperation = "source-in";
        await this.drawSprite(`scars${scarName}`, spriteNumber, tempCtx);
        
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(tempCanvas, 0, 0);
        
        ctx.globalCompositeOperation = originalOp;
    }

    /**
     * Validate input parameters with comprehensive checks
     */
    validateParams(params) {
        if (!params || typeof params !== 'object') {
            throw new Error('Invalid parameters: expected object');
        }
        
        const { spriteNumber, peltName, colour, tint, eyeColour, eyeColour2, skinColour, 
                tortie, accessories, scar } = params;
        
        // Validate sprite number
        if (spriteNumber !== undefined) {
            if (!Number.isInteger(spriteNumber) || spriteNumber < 0 || spriteNumber > 20) {
                throw new Error(`Invalid spriteNumber: ${spriteNumber}. Must be integer 0-20`);
            }
        }
        
        // Validate pelt name
        if (peltName && !this.validPelts.has(peltName) && peltName !== 'Tortie' && peltName !== 'Calico') {
            throw new Error(`Invalid peltName: ${peltName}`);
        }
        
        // Validate colour
        if (colour && !this.validColours.has(colour)) {
            throw new Error(`Invalid colour: ${colour}`);
        }
        
        // Validate tint
        if (tint && tint !== 'none' && !this.validTints.has(tint)) {
            throw new Error(`Invalid tint: ${tint}`);
        }
        
        // Validate eye colours
        if (eyeColour && !this.validEyeColours.has(eyeColour)) {
            throw new Error(`Invalid eyeColour: ${eyeColour}`);
        }
        if (eyeColour2 && !this.validEyeColours.has(eyeColour2)) {
            throw new Error(`Invalid eyeColour2: ${eyeColour2}`);
        }
        
        // Validate skin colour
        if (skinColour && !this.validSkinColours.has(skinColour)) {
            throw new Error(`Invalid skinColour: ${skinColour}`);
        }
        
        // Validate tortie array
        if (tortie) {
            if (!Array.isArray(tortie)) {
                throw new Error('Invalid tortie: expected array');
            }
            for (const layer of tortie) {
                if (!layer || typeof layer !== 'object') {
                    throw new Error('Invalid tortie layer: expected object');
                }
                if (!layer.mask || !this.validTortieMasks.has(layer.mask)) {
                    throw new Error(`Invalid tortie mask: ${layer.mask}`);
                }
                if (!layer.pattern || !this.validPelts.has(layer.pattern)) {
                    throw new Error(`Invalid tortie pattern: ${layer.pattern}`);
                }
                if (!layer.colour || !this.validColours.has(layer.colour)) {
                    throw new Error(`Invalid tortie colour: ${layer.colour}`);
                }
            }
        }
        
        // Validate accessories array
        if (accessories) {
            if (!Array.isArray(accessories)) {
                throw new Error('Invalid accessories: expected array');
            }
            for (const acc of accessories) {
                if (!this.validAccessories.has(acc)) {
                    throw new Error(`Invalid accessory: ${acc}`);
                }
            }
        }
        
        // Validate scar
        if (scar && !this.validScars.has(scar)) {
            throw new Error(`Invalid scar: ${scar}`);
        }
        
        return true;
    }

    /**
     * Main function to generate a cat
     */
    async generateCat(params) {
        // Validate input parameters
        try {
            this.validateParams(params);
        } catch (error) {
            console.error('Validation error:', error.message);
            throw error;
        }
        const { canvasWidth: w, canvasHeight: h } = this.config;
        const canvas = this.getCanvas();
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
            throw new Error("Failed to get canvas context");
        }

        // Clear canvas
        ctx.clearRect(0, 0, w, h);

        const {
            spriteNumber = 12,
            peltName = "SingleColour",
            colour = "WHITE",
            tint = "none",
            skinColour = "BLACK",
            eyeColour = "YELLOW",
            eyeColour2,
            whitePatches,
            points,
            whitePatchesTint = "none",
            vitiligo,
            accessory,
            accessories,  // V2: Add accessories array
            scar,
            isTortie = false,
            tortiePattern = "SingleColour",
            tortieColour = "GOLDEN",
            tortieMask = "ONE",
            tortie,  // V2: Add tortie array
            shading = false,
            reverse = false,
            dead = false,
            darkForest = false,
            aprilFools = false
        } = params;

        // V2: Support both old tortie format and new array format
        // Normalize tortie to array of objects
        let tortieLayers = [];
        if (tortie) {
            // New v2 format: array of tortie objects
            tortieLayers = Array.isArray(tortie) ? tortie : [tortie];
        } else if (isTortie && tortieMask && tortiePattern && tortieColour) {
            // Old v1 format: separate parameters
            tortieLayers = [{mask: tortieMask, pattern: tortiePattern, colour: tortieColour}];
        }
        
        // Determine if cat is tortie/calico
        const isTortieEffective = tortieLayers.length > 0 || isTortie;
        const peltType = isTortieEffective ? "Tortie" : peltName;

        // 1. Draw base pelt
        if (peltType !== "Tortie" && peltType !== "Calico") {
            const spritesName = PELT_SPRITES[peltName];
            await this.drawSprite(`${spritesName}${colour}`, spriteNumber, ctx);
        } else {
            // Draw tortie base
            const tortieBase = PELT_SPRITES[peltName] || "single";
            await this.drawSprite(`${tortieBase}${colour}`, spriteNumber, ctx);
            
            // Apply each tortie pattern layer
            for (const layer of tortieLayers) {
                const pattern = layer.pattern === "Single" ? "SingleColour" : layer.pattern;
                const patternSprite = PELT_SPRITES[pattern] || "single";
                await this.drawMaskedSprite(
                    `${patternSprite}${layer.colour}`,
                    `tortiemask${layer.mask}`,
                    spriteNumber,
                    ctx
                );
            }
        }

        // 2. Apply tints
        if (tint !== "none") {
            if (TINT_COLORS[tint]) {
                await this.drawTint(TINT_COLORS[tint], "multiply", ctx);
            }
            if (DILUTE_TINT_COLORS[tint]) {
                await this.drawTint(DILUTE_TINT_COLORS[tint], "lighter", ctx);
            }
        }

        // 3. Draw white patches
        if (whitePatches) {
            const patchCanvas = this.getCanvas();
            const patchCtx = patchCanvas.getContext("2d");
            
            await this.drawSprite(`white${whitePatches}`, spriteNumber, patchCtx);
            
            if (whitePatchesTint !== "none" && WHITE_PATCHES_TINT_COLORS[whitePatchesTint]) {
                await this.drawTint(WHITE_PATCHES_TINT_COLORS[whitePatchesTint], "multiply", patchCtx);
            }
            
            ctx.drawImage(patchCanvas, 0, 0);
        }

        // 4. Draw points
        if (points) {
            const pointCanvas = this.getCanvas();
            const pointCtx = pointCanvas.getContext("2d");
            
            await this.drawSprite(`white${points}`, spriteNumber, pointCtx);
            
            if (whitePatchesTint !== "none" && WHITE_PATCHES_TINT_COLORS[whitePatchesTint]) {
                await this.drawTint(WHITE_PATCHES_TINT_COLORS[whitePatchesTint], "multiply", pointCtx);
            }
            
            ctx.drawImage(pointCanvas, 0, 0);
        }

        // 5. Draw vitiligo
        if (vitiligo) {
            await this.drawSprite(`white${vitiligo}`, spriteNumber, ctx);
        }

        // 6. Draw eyes
        await this.drawSprite(`eyes${eyeColour}`, spriteNumber, ctx);
        if (eyeColour2) {
            await this.drawSprite(`eyes2${eyeColour2}`, spriteNumber, ctx);
        }

        // 7. Draw scars (first layer)
        if (scar) {
            const scars = Array.isArray(scar) ? scar : [scar];
            for (const scarName of scars) {
                if (SCARS_1.includes(scarName)) {
                    await this.drawSprite(`scars${scarName}`, spriteNumber, ctx);
                }
                if (SCARS_3.includes(scarName)) {
                    await this.drawSprite(`scars${scarName}`, spriteNumber, ctx);
                }
            }
        }

        // 8. Apply shading
        if (shading) {
            await this.applyShading(spriteNumber, ctx);
        }

        // 9. Draw lineart
        let lineartType = "lines";
        if (aprilFools) {
            if (dead) {
                lineartType = darkForest ? "aprilfoolslineartdf" : "aprilfoolslineartdead";
            } else {
                lineartType = "aprilfoolslineart";
            }
        } else if (dead) {
            lineartType = darkForest ? "lineartdf" : "lineartdead";
        }
        await this.drawSprite(lineartType, spriteNumber, ctx);

        // 10. Draw skin
        await this.drawSprite(`skin${skinColour}`, spriteNumber, ctx);

        // 11. Draw missing scars (second layer)
        if (scar) {
            const scars = Array.isArray(scar) ? scar : [scar];
            for (const scarName of scars) {
                if (SCARS_2.includes(scarName)) {
                    await this.applyMissingMask(scarName, spriteNumber, ctx);
                }
            }
        }

        // 12. Draw accessories - AFTER skin and scars
        // V2: Support both single accessory (backward compat) and array of accessories
        let accessoriesToDraw = [];
        if (accessories && Array.isArray(accessories)) {
            // New V2 format: array of accessories
            accessoriesToDraw = accessories;
        } else if (accessory) {
            // Old V1 format: single accessory (could be string or array)
            accessoriesToDraw = Array.isArray(accessory) ? accessory : [accessory];
        }
        
        for (const acc of accessoriesToDraw) {
            if (PLANT_ACCESSORIES.includes(acc)) {
                // Don't encode here - let getSpriteURL handle it
                await this.drawSprite(`acc_herbs${acc}`, spriteNumber, ctx);
            } else if (WILD_ACCESSORIES.includes(acc)) {
                // Don't encode here - let getSpriteURL handle it
                await this.drawSprite(`acc_wild${acc}`, spriteNumber, ctx);
            } else if (COLLARS.includes(acc)) {
                await this.drawSprite(`collars${acc}`, spriteNumber, ctx);
            }
        }

        // 13. Apply reverse if needed
        const finalCanvas = this.getCanvas();
        const finalCtx = finalCanvas.getContext('2d');
        
        if (finalCtx) {
            if (reverse) {
                finalCtx.scale(-1, 1);
                finalCtx.drawImage(canvas, -w, 0);
            } else {
                finalCtx.drawImage(canvas, 0, 0);
            }
        }
        
        // Convert to regular canvas for compatibility
        let outputCanvas;
        if (typeof document !== 'undefined') {
            outputCanvas = document.createElement('canvas');
            outputCanvas.width = w;
            outputCanvas.height = h;
            const outputCtx = outputCanvas.getContext('2d');
            if (outputCtx && finalCtx) {
                outputCtx.drawImage(finalCanvas, 0, 0);
            }
        } else {
            // In worker/node environment, just return the final canvas
            outputCanvas = finalCanvas;
        }

        return {
            canvas: outputCanvas,
            params: params
        };
    }

    /**
     * Generate a random cat
     */
    async generateAllVariationsForParameter(baseParams, paramName, paramValues, shuffle = false) {
        // Generate all variations for a specific parameter
        const variations = [];
        
        // Optionally shuffle the param values for random order using Fisher-Yates algorithm
        let valuesToProcess = [...paramValues];
        if (shuffle) {
            // Fisher-Yates shuffle for better randomization
            for (let i = valuesToProcess.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [valuesToProcess[i], valuesToProcess[j]] = [valuesToProcess[j], valuesToProcess[i]];
            }
        }
        
        for (const value of valuesToProcess) {
            const testParams = { ...baseParams };
            
            // Use O(1) parameter setter map instead of O(n) switch
            const setter = this.parameterSetters[paramName];
            if (setter) {
                setter(testParams, value);
            } else {
                console.warn(`Unknown parameter: ${paramName}`);
            }
            
            try {
                const result = await this.generateCat(testParams);
                variations.push({
                    value: value,
                    canvas: result.canvas,
                    params: testParams
                });
            } catch (e) {
                console.error(`Failed to generate variation for ${paramName}:${value}`, e);
            }
        }
        
        return variations;
    }
    
    generateRandomParams(includeAllSprites = false) {
        // Fast parameter generation without canvas rendering
        // Use parameter flag to control sprite inclusion
        const sprites = includeAllSprites 
            ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
            : Array.from({length: 21}, (_, i) => i).filter(s => !this.config.forbiddenSprites.has(s));
        // Filter out Tortie and Calico from base pelts - they're not actual pelt types
        const pelts = Object.keys(PELT_SPRITES).filter(p => p !== 'Tortie' && p !== 'Calico');
        const colours = ["CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", "GREY", "DARKGREY", "GHOST", "BLACK", "WHITE", "PALEGREY", "SILVER", "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"];
        // Include both regular and dilute tints with 'none' to match original behavior
        const regularTints = Object.keys(TINT_COLORS).filter(t => t !== 'none');
        const diluteTints = Object.keys(DILUTE_TINT_COLORS).filter(t => t !== 'none');
        const tints = ['none', ...regularTints, ...diluteTints]; // Include 'none' as an option
        const eyeColours = ["YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE", "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER", "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW", "BRONZE", "SILVER"];
        const skinColours = ["BLACK", "PINK", "DARKBROWN", "BROWN", "LIGHTBROWN", "DARK", "DARKGREY", "GREY", "DARKSALMON", "SALMON", "PEACH", "DARKMARBLED", "MARBLED", "LIGHTMARBLED", "DARKBLUE", "BLUE", "LIGHTBLUE", "RED"];
        
        // Match the EXACT probabilities from the original pixel-cat-maker
        const params = {
            spriteNumber: sprites[Math.floor(Math.random() * sprites.length)],
            peltName: pelts[Math.floor(Math.random() * pelts.length)],
            colour: colours[Math.floor(Math.random() * colours.length)],
            tint: tints[Math.floor(Math.random() * tints.length)], // Now includes 'none' as an option
            skinColour: skinColours[Math.floor(Math.random() * skinColours.length)],
            eyeColour: eyeColours[Math.floor(Math.random() * eyeColours.length)],
            eyeColour2: undefined, // Will be set after with proper logic
            isTortie: Math.random() <= 0.5, // 50% chance
            shading: false, // Original doesn't randomize shading - defaults to false
            reverse: Math.random() <= 0.5  // 50% chance
        };

        // Eye colour 2 - 50% chance to randomize from options INCLUDING empty
        // When randomizing, pick from empty + all eye colors
        if (Math.random() <= 0.5) {
            const eyeColour2WithEmpty = ["", ...eyeColours];
            const selected = eyeColour2WithEmpty[Math.floor(Math.random() * eyeColour2WithEmpty.length)];
            if (selected !== "") {
                params.eyeColour2 = selected;
            }
            // else leave undefined (empty option selected)
        }
        // else leave undefined (selectedIndex = 0 = empty)

        // Add tortie-specific params if tortie
        if (params.isTortie) {
            const tortieMasks = ["ONE", "TWO", "THREE", "FOUR", "REDTAIL", "DELILAH", "MINIMALONE", "MINIMALTWO", "MINIMALTHREE", "MINIMALFOUR", "HALF", "OREO", "SWOOP", "MOTTLED", "SIDEMASK", "EYEDOT", "BANDANA", "PACMAN", "STREAMSTRIKE", "ORIOLE", "CHIMERA", "DAUB", "EMBER", "BLANKET", "ROBIN", "BRINDLE", "PAIGE", "ROSETAIL", "SAFI", "SMUDGED", "DAPPLENIGHT", "STREAK", "MASK", "CHEST", "ARMTAIL", "SMOKE", "GRUMPYFACE", "BRIE", "BELOVED", "BODY", "SHILOH", "FRECKLED", "HEARTBEAT"];
            const mask = tortieMasks[Math.floor(Math.random() * tortieMasks.length)];
            const col = colours[Math.floor(Math.random() * colours.length)];
            const pat = pelts[Math.floor(Math.random() * pelts.length)];
            
            // V2: Set both new array format and legacy fields
            params.tortie = [{mask: mask, pattern: pat, colour: col}];  // new v2 format
            params.tortieMask = mask;                                    // legacy v1 format
            params.tortieColour = col;                                   // legacy v1 format
            params.tortiePattern = pat;                                  // legacy v1 format
        }

        // IMPORTANT: The original has a 50% check that controls 4 parameters together!
        // If that check passes, it randomizes them individually
        // If it fails, ALL four are set to none
        if (Math.random() <= 0.5) {
            // We're in the "randomization branch" - each param gets its own chance
            
            // White patches - 50% chance to randomize, 50% to be none (25% overall)
            if (Math.random() <= 0.5) {
                const littleWhite = ["LITTLE", "LIGHTTUXEDO", "BUZZARDFANG", "TIP", "BLAZE", "BIB", "VEE", "PAWS", "BELLY", "TAILTIP", "TOES", "BROKENBLAZE", "LILTWO", "SCOURGE", "TOESTAIL", "RAVENPAW", "HONEY", "LUNA", "EXTRA", "MUSTACHE", "REVERSEHEART", "SPARKLE", "RIGHTEAR", "LEFTEAR", "ESTRELLA", "REVERSEEYE", "BACKSPOT", "EYEBAGS", "LOCKET", "BLAZEMASK", "TEARS"];
                const midWhite = ["TUXEDO", "FANCY", "UNDERS", "DAMIEN", "SKUNK", "MITAINE", "SQUEAKS", "STAR", "WINGS", "DIVA", "SAVANNAH", "FADESPOTS", "BEARD", "DAPPLEPAW", "TOPCOVER", "WOODPECKER", "MISS", "BOWTIE", "VEST", "FADEBELLY", "DIGIT", "FCTWO", "FCONE", "MIA", "ROSINA", "PRINCESS", "DOUGIE"];
                const highWhite = ["ANY", "ANYTWO", "BROKEN", "FRECKLES", "RINGTAIL", "HALFFACE", "PANTSTWO", "GOATEE", "PRINCE", "FAROFA", "MISTER", "PANTS", "REVERSEPANTS", "HALFWHITE", "APPALOOSA", "PIEBALD", "CURVED", "GLASS", "MASKMANTLE", "MAO", "PAINTED", "SHIBAINU", "OWL", "BUB", "SPARROW", "TRIXIE", "SAMMY", "FRONT", "BLOSSOMSTEP", "BULLSEYE", "FINN", "SCAR", "BUSTER", "HAWKBLAZE", "CAKE"];
                const mostlyWhite = ["VAN", "ONEEAR", "LIGHTSONG", "TAIL", "HEART", "MOORISH", "APRON", "CAPSADDLE", "CHESTSPECK", "BLACKSTAR", "PETAL", "HEARTTWO", "PEBBLESHINE", "BOOTS", "COW", "COWTWO", "LOVEBUG", "SHOOTINGSTAR", "EYESPOT", "PEBBLE", "TAILTWO", "BUDDY", "KROPKA"];
                const fullWhite = ["FULLWHITE"];
                
                // Original picks randomly from all options with equal weight
                const allWhitePatches = [...littleWhite, ...midWhite, ...highWhite, ...mostlyWhite, ...fullWhite];
                params.whitePatches = allWhitePatches[Math.floor(Math.random() * allWhitePatches.length)];
            }
            // else leave undefined (none)
            
            // Points - 50% chance to randomize, 50% to be none (25% overall)
            if (Math.random() <= 0.5) {
                // randomizeSelected picks from all options including empty
                const pointsWithEmpty = ["", "COLOURPOINT", "RAGDOLL", "SEPIAPOINT", "MINKPOINT", "SEALPOINT"];
                params.points = pointsWithEmpty[Math.floor(Math.random() * pointsWithEmpty.length)] || undefined;
            }
            // else leave undefined
            
            // White patches tint - ALWAYS randomized in this branch! (50% overall)
            const whitePatchesTintsWithNone = ["none", ...Object.keys(WHITE_PATCHES_TINT_COLORS).filter(t => t !== 'none')];
            const selectedTint = whitePatchesTintsWithNone[Math.floor(Math.random() * whitePatchesTintsWithNone.length)];
            if (selectedTint !== 'none') {
                params.whitePatchesTint = selectedTint;
            }
            // else leave undefined for 'none'
            
            // Vitiligo - 50% chance to randomize, 50% to be none (25% overall)
            if (Math.random() <= 0.5) {
                const vitiligoWithEmpty = ["", "VITILIGO", "VITILIGOTWO"];
                params.vitiligo = vitiligoWithEmpty[Math.floor(Math.random() * vitiligoWithEmpty.length)] || undefined;
            }
            // else leave undefined
        }
        // else ALL four parameters stay undefined (none)
        
        // Accessories - 50% chance - use pre-computed array for performance
        if (Math.random() <= 0.5) {
            const acc = this.allAccessories[Math.floor(Math.random() * this.allAccessories.length)];
            
            // V2: Set both new array format and legacy field
            params.accessories = [acc];    // new v2 format (array with one element)
            params.accessory = acc;        // legacy v1 format (single value)
        }
        
        // Scars - 50% chance
        if (Math.random() <= 0.5) {
            const allScars = [...SCARS_1, ...SCARS_2, ...SCARS_3];
            params.scar = allScars[Math.floor(Math.random() * allScars.length)];
        }

        return params;
    }
    
    // Backward compatibility wrapper - delegates to unified method
    generateRandomParamsAllSprites() {
        return this.generateRandomParams(true);
    }
    
    async generateRandomCat() {
        // Generate random parameters
        const params = this.generateRandomParams();
        
        // Generate the cat canvas with these params
        const result = await this.generateCat(params);
        
        return result;  // Already contains {canvas, params}
    }

    /**
     * Generate parameters using weighted utilities (for Perfect Cat Finder)
     */
    generateWeightedParams(utilities, temperature = 0.8, epsilon = 0.1) {
        // Get parameter options
        const sprites = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
        const pelts = Object.keys(PELT_SPRITES).filter(p => p !== 'Tortie' && p !== 'Calico');
        const colours = ["CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", "GREY", "DARKGREY", "GHOST", "BLACK", "WHITE", "PALEGREY", "SILVER", "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"];
        const regularTints = Object.keys(TINT_COLORS).filter(t => t !== 'none');
        const diluteTints = Object.keys(DILUTE_TINT_COLORS).filter(t => t !== 'none');
        const tints = ['none', ...regularTints, ...diluteTints];
        const eyeColours = ["YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE", "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER", "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW", "BRONZE", "SILVER"];
        const skinColours = ["BLACK", "PINK", "DARKBROWN", "BROWN", "LIGHTBROWN", "DARK", "DARKGREY", "GREY", "DARKSALMON", "SALMON", "PEACH", "DARKMARBLED", "MARBLED", "LIGHTMARBLED", "DARKBLUE", "BLUE", "LIGHTBLUE", "RED"];
        const tortieMasks = ["ONE", "TWO", "THREE", "FOUR", "REDTAIL", "DELILAH", "MINIMALONE", "MINIMALTWO", "MINIMALTHREE", "MINIMALFOUR", "HALF", "OREO", "SWOOP", "MOTTLED", "SIDEMASK", "EYEDOT", "BANDANA", "PACMAN", "STREAMSTRIKE", "ORIOLE", "CHIMERA", "DAUB", "EMBER", "BLANKET", "ROBIN", "BRINDLE", "PAIGE", "ROSETAIL", "SAFI", "SMUDGED", "DAPPLENIGHT", "STREAK", "MASK", "CHEST", "ARMTAIL", "SMOKE", "GRUMPYFACE", "BRIE", "BELOVED", "BODY", "SHILOH", "FRECKLED", "HEARTBEAT"];
        
        // Helper function to sample from weighted distribution
        const sampleWeighted = (options, utilityArray) => {
            // Epsilon-greedy exploration
            if (Math.random() < epsilon) {
                return options[Math.floor(Math.random() * options.length)];
            }
            
            // Softmax sampling
            const scores = options.map((_, i) => Math.exp(utilityArray[i] / temperature));
            const sum = scores.reduce((a, b) => a + b, 0);
            const probs = scores.map(s => s / sum);
            
            // Sample from distribution
            const rand = Math.random();
            let cumSum = 0;
            for (let i = 0; i < probs.length; i++) {
                cumSum += probs[i];
                if (rand < cumSum) {
                    return options[i];
                }
            }
            return options[options.length - 1];
        };
        
        // Generate parameters
        const params = {
            spriteNumber: sampleWeighted(sprites, utilities.spriteNumber || new Float32Array(sprites.length)),
            peltName: sampleWeighted(pelts, utilities.peltName || new Float32Array(pelts.length)),
            colour: sampleWeighted(colours, utilities.colour || new Float32Array(colours.length)),
            tint: sampleWeighted(tints, utilities.tint || new Float32Array(tints.length)),
            skinColour: sampleWeighted(skinColours, utilities.skinColour || new Float32Array(skinColours.length)),
            eyeColour: sampleWeighted(eyeColours, utilities.eyeColour || new Float32Array(eyeColours.length)),
            eyeColour2: undefined,
            isTortie: sampleWeighted([false, true], utilities.isTortie || new Float32Array(2)),
            shading: sampleWeighted([false, true], utilities.shading || new Float32Array(2)),
            reverse: sampleWeighted([false, true], utilities.reverse || new Float32Array(2))
        };
        
        // Handle eyeColour2
        const eyeColour2Options = ["", ...eyeColours];
        const eyeColour2 = sampleWeighted(eyeColour2Options, utilities.eyeColour2 || new Float32Array(eyeColour2Options.length));
        if (eyeColour2 !== "") {
            params.eyeColour2 = eyeColour2;
        }
        
        // Add tortie params if tortie
        if (params.isTortie) {
            params.tortieMask = sampleWeighted(tortieMasks, utilities.tortieMask || new Float32Array(tortieMasks.length));
            params.tortieColour = sampleWeighted(colours, utilities.tortieColour || new Float32Array(colours.length));
            params.tortiePattern = sampleWeighted(pelts, utilities.tortiePattern || new Float32Array(pelts.length));
        }
        
        // Handle optional params (white patches, points, etc.)
        // These will be added based on utilities when we have the full list
        
        return params;
    }
    
    /**
     * Generate the "perfect cat" from utilities (argmax for each parameter)
     */
    generatePerfectParams(utilities) {
        // Get parameter options
        const sprites = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
        const pelts = Object.keys(PELT_SPRITES).filter(p => p !== 'Tortie' && p !== 'Calico');
        const colours = ["CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", "GREY", "DARKGREY", "GHOST", "BLACK", "WHITE", "PALEGREY", "SILVER", "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"];
        const regularTints = Object.keys(TINT_COLORS).filter(t => t !== 'none');
        const diluteTints = Object.keys(DILUTE_TINT_COLORS).filter(t => t !== 'none');
        const tints = ['none', ...regularTints, ...diluteTints];
        const eyeColours = ["YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE", "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER", "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW", "BRONZE", "SILVER"];
        const skinColours = ["BLACK", "PINK", "DARKBROWN", "BROWN", "LIGHTBROWN", "DARK", "DARKGREY", "GREY", "DARKSALMON", "SALMON", "PEACH", "DARKMARBLED", "MARBLED", "LIGHTMARBLED", "DARKBLUE", "BLUE", "LIGHTBLUE", "RED"];
        const tortieMasks = ["ONE", "TWO", "THREE", "FOUR", "REDTAIL", "DELILAH", "MINIMALONE", "MINIMALTWO", "MINIMALTHREE", "MINIMALFOUR", "HALF", "OREO", "SWOOP", "MOTTLED", "SIDEMASK", "EYEDOT", "BANDANA", "PACMAN", "STREAMSTRIKE", "ORIOLE", "CHIMERA", "DAUB", "EMBER", "BLANKET", "ROBIN", "BRINDLE", "PAIGE", "ROSETAIL", "SAFI", "SMUDGED", "DAPPLENIGHT", "STREAK", "MASK", "CHEST", "ARMTAIL", "SMOKE", "GRUMPYFACE", "BRIE", "BELOVED", "BODY", "SHILOH", "FRECKLED", "HEARTBEAT"];
        
        // Helper to get argmax
        const getArgmax = (options, utilityArray) => {
            if (!utilityArray || utilityArray.length === 0) {
                return options[0]; // Default to first if no utilities
            }
            let maxIdx = 0;
            let maxVal = utilityArray[0];
            for (let i = 1; i < utilityArray.length; i++) {
                if (utilityArray[i] > maxVal) {
                    maxVal = utilityArray[i];
                    maxIdx = i;
                }
            }
            return options[maxIdx];
        };
        
        // Generate parameters using argmax
        const params = {
            spriteNumber: getArgmax(sprites, utilities.spriteNumber),
            peltName: getArgmax(pelts, utilities.peltName),
            colour: getArgmax(colours, utilities.colour),
            tint: getArgmax(tints, utilities.tint),
            skinColour: getArgmax(skinColours, utilities.skinColour),
            eyeColour: getArgmax(eyeColours, utilities.eyeColour),
            eyeColour2: undefined,
            isTortie: getArgmax([false, true], utilities.isTortie),
            shading: getArgmax([false, true], utilities.shading),
            reverse: getArgmax([false, true], utilities.reverse)
        };
        
        // Handle eyeColour2
        const eyeColour2Options = ["", ...eyeColours];
        const eyeColour2 = getArgmax(eyeColour2Options, utilities.eyeColour2);
        if (eyeColour2 !== "") {
            params.eyeColour2 = eyeColour2;
        }
        
        // Add tortie params if tortie
        if (params.isTortie) {
            params.tortieMask = getArgmax(tortieMasks, utilities.tortieMask);
            params.tortieColour = getArgmax(colours, utilities.tortieColour);
            params.tortiePattern = getArgmax(pelts, utilities.tortiePattern);
        }
        
        return params;
    }

    /**
     * Build URL for catmaker.io
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
        
        // V2: Handle accessories array (use first element for URL)
        const accessories = params.accessories || (params.accessory ? [params.accessory] : []);
        if (accessories.length > 0) {
            urlParams.set('accessory', accessories[0]);
        }
        
        if (params.scar) urlParams.set('scar', params.scar);
        
        // Tortie-specific parameters
        // V2: Handle both array format and legacy format
        const tortieLayers = params.tortie || [];
        const isTortieEffective = params.isTortie || tortieLayers.length > 0;
        
        if (isTortieEffective) {
            // Use first layer from array or fall back to legacy fields
            const firstLayer = tortieLayers[0];
            if (firstLayer) {
                urlParams.set('tortieMask', firstLayer.mask);
                urlParams.set('tortieColour', firstLayer.colour);
                urlParams.set('tortiePattern', firstLayer.pattern);
            } else if (params.tortieMask && params.tortieColour && params.tortiePattern) {
                urlParams.set('tortieMask', params.tortieMask);
                urlParams.set('tortieColour', params.tortieColour);
                urlParams.set('tortiePattern', params.tortiePattern);
            }
        }
        
        return `https://cgen-tools.github.io/pixel-cat-maker/?${urlParams.toString()}`;
    }
}

// Create singleton instance
const catGenerator = new CatGenerator();

// Export for ES6 modules
export default catGenerator;
export { CatGenerator };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
    window.CatGenerator = CatGenerator;
    window.catGenerator = catGenerator;
}