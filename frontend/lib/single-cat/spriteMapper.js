/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Sprite Mapper - Single source of truth for all sprite information
 * Loads sprite data from JSON files and provides methods to access sprite names, paths, etc.
 */

// No longer importing individual sprite paths - we use sprite sheets exclusively

class SpriteMapper {
    constructor() {
        this.spriteMap = new Map();
        this.indexedSprites = {
            pelts: new Map(),
            accessories: new Map(),
            scars: new Map(),
            white: new Map(),
            eyes: new Map(),
            skin: new Map(),
            lineart: new Map(),
            shading: new Map(),
            other: new Map()
        };
        
        // Data loaded from JSON files
        this.spritesIndex = null;
        this.peltInfo = null;
        this.loaded = false;
        this.loadingPromise = null;
        
        // Cached lists
        this.peltNames = [];
        this.colours = [];
        this.eyeColours = [];
        this.skinColours = [];
        this.accessories = [];
        this.scars = [];
        this.sprites = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        this.tortieMasks = [];
        this.whitePatches = [];
        this.points = [];
        this.vitiligo = [];
        this.tints = [];
        this.whiteTints = [];
        this.lineartStyles = [];

        // Extended palette applied dynamically on white base sprites
        this.experimentalColourDefs = {
            AQUA: { baseColour: 'WHITE', multiply: [96, 212, 255] },
            AMETHYST: { baseColour: 'WHITE', multiply: [168, 120, 255] },
            APRICOT: { baseColour: 'WHITE', multiply: [255, 198, 150], screen: [255, 220, 190, 0.25] },
            BURGUNDY: { baseColour: 'WHITE', multiply: [120, 40, 70], screen: [160, 60, 90, 0.25] },
            CERULEAN: { baseColour: 'WHITE', multiply: [90, 160, 254] },
            CHARTREUSE: { baseColour: 'WHITE', multiply: [184, 255, 80], screen: [210, 255, 120, 0.2] },
            COBALT: { baseColour: 'WHITE', multiply: [80, 118, 232] },
            CORAL: { baseColour: 'WHITE', multiply: [255, 148, 130], screen: [255, 190, 170, 0.25] },
            CRIMSON: { baseColour: 'WHITE', multiply: [200, 32, 64], screen: [220, 80, 110, 0.25] },
            DAWN: { baseColour: 'WHITE', multiply: [247, 214, 214], screen: [255, 230, 230, 0.2] },
            ELECTRICBLUE: { baseColour: 'WHITE', multiply: [70, 145, 255], screen: [110, 180, 255, 0.22] },
            EMERALD: { baseColour: 'WHITE', multiply: [56, 190, 125] },
            FERN: { baseColour: 'WHITE', multiply: [170, 214, 150], screen: [195, 236, 182, 0.22] },
            FOREST: { baseColour: 'WHITE', multiply: [88, 150, 88], screen: [30, 60, 30, 0.2] },
            FUCHSIA: { baseColour: 'WHITE', multiply: [255, 103, 218] },
            GLAZEDBLUE: { baseColour: 'WHITE', multiply: [175, 210, 235], screen: [204, 232, 255, 0.22] },
            GOLDLEAF: { baseColour: 'WHITE', multiply: [240, 203, 120], screen: [255, 226, 170, 0.2] },
            HOTPINK: { baseColour: 'WHITE', multiply: [255, 80, 150], screen: [255, 120, 190, 0.2] },
            INDIGO: { baseColour: 'WHITE', multiply: [76, 63, 170], screen: [120, 110, 210, 0.2] },
            LAVENDER: { baseColour: 'WHITE', multiply: [186, 160, 255] },
            LEMONADE: { baseColour: 'WHITE', multiply: [255, 232, 180], screen: [255, 245, 214, 0.2] },
            LIME: { baseColour: 'WHITE', multiply: [200, 255, 110], screen: [220, 255, 150, 0.2] },
            MAGENTA: { baseColour: 'WHITE', multiply: [226, 71, 174] },
            MANGO: { baseColour: 'WHITE', multiply: [255, 204, 140], screen: [255, 225, 175, 0.22] },
            MIST: { baseColour: 'WHITE', multiply: [210, 230, 243], screen: [230, 245, 255, 0.18] },
            MINT: { baseColour: 'WHITE', multiply: [155, 233, 202] },
            NAVY: { baseColour: 'WHITE', multiply: [43, 58, 120], screen: [90, 102, 180, 0.25] },
            NECTARINE: { baseColour: 'WHITE', multiply: [255, 188, 140], screen: [255, 213, 178, 0.22] },
            NEONBLUE: { baseColour: 'WHITE', multiply: [60, 120, 255], screen: [120, 180, 255, 0.25] },
            NEONGREEN: { baseColour: 'WHITE', multiply: [120, 255, 120], screen: [150, 255, 170, 0.22] },
            NEONPINK: { baseColour: 'WHITE', multiply: [255, 70, 190], screen: [255, 140, 220, 0.22] },
            NEONPURPLE: { baseColour: 'WHITE', multiply: [180, 70, 255], screen: [210, 130, 255, 0.22] },
            PEACH: { baseColour: 'WHITE', multiply: [255, 210, 175], screen: [255, 235, 210, 0.2] },
            PASTELBLUE: { baseColour: 'WHITE', multiply: [190, 220, 255], screen: [220, 235, 255, 0.18] },
            PASTELMINT: { baseColour: 'WHITE', multiply: [190, 255, 227], screen: [210, 255, 235, 0.18] },
            PASTELPINK: { baseColour: 'WHITE', multiply: [255, 200, 225], screen: [255, 220, 235, 0.18] },
            PASTELPURPLE: { baseColour: 'WHITE', multiply: [220, 200, 255], screen: [235, 220, 255, 0.18] },
            PASTELYELLOW: { baseColour: 'WHITE', multiply: [255, 240, 180], screen: [255, 250, 210, 0.18] },
            PERIWINKLE: { baseColour: 'WHITE', multiply: [158, 167, 250] },
            PLUM: { baseColour: 'WHITE', multiply: [158, 82, 158], screen: [200, 140, 200, 0.2] },
            ROYALPURPLE: { baseColour: 'WHITE', multiply: [104, 63, 192], screen: [150, 115, 220, 0.2] },
            SAND: { baseColour: 'WHITE', multiply: [235, 214, 170], screen: [245, 230, 190, 0.18] },
            SCARLET: { baseColour: 'WHITE', multiply: [255, 60, 40], screen: [255, 110, 90, 0.22] },
            SEAFOAM: { baseColour: 'WHITE', multiply: [126, 230, 207] },
            SKYBLUE: { baseColour: 'WHITE', multiply: [122, 196, 255] },
            SPRINGGREEN: { baseColour: 'WHITE', multiply: [115, 224, 130] },
            SUNSETORANGE: { baseColour: 'WHITE', multiply: [255, 120, 70], screen: [255, 170, 120, 0.22] },
            TEAL: { baseColour: 'WHITE', multiply: [70, 192, 196] },
            TURQUOISE: { baseColour: 'WHITE', multiply: [72, 210, 208] },
            WATERLILY: { baseColour: 'WHITE', multiply: [198, 225, 215], screen: [220, 240, 230, 0.16] },
            WISTERIA: { baseColour: 'WHITE', multiply: [210, 190, 255], screen: [230, 210, 255, 0.18] },
            ZEST: { baseColour: 'WHITE', multiply: [255, 200, 120], screen: [255, 220, 160, 0.2] },
            ZIRCON: { baseColour: 'WHITE', multiply: [210, 232, 255], screen: [230, 245, 255, 0.16] },
            MIDNIGHT: { baseColour: 'WHITE', multiply: [23, 29, 58] },
            OBSIDIAN: { baseColour: 'WHITE', multiply: [18, 21, 29] },
            DEEPSEA: { baseColour: 'WHITE', multiply: [27, 51, 78] },
            NIGHTFALL: { baseColour: 'WHITE', multiply: [38, 34, 68] },
            SHADOWPURPLE: { baseColour: 'WHITE', multiply: [46, 34, 78] },
            DARKORCHID: { baseColour: 'WHITE', multiply: [58, 26, 78] },
            STORMBLUE: { baseColour: 'WHITE', multiply: [39, 55, 91] },
            DARKTEAL: { baseColour: 'WHITE', multiply: [32, 78, 78] },
            EVERGREEN: { baseColour: 'WHITE', multiply: [32, 65, 46] },
            FORESTSHADOW: { baseColour: 'WHITE', multiply: [39, 55, 39] },
            MOSSY: { baseColour: 'WHITE', multiply: [52, 65, 46] },
            DEEPFUCHSIA: { baseColour: 'WHITE', multiply: [78, 26, 65] },
            GARNET: { baseColour: 'WHITE', multiply: [84, 29, 42] },
            RAVEN: { baseColour: 'WHITE', multiply: [26, 26, 32] },
            COBALTSTORM: { baseColour: 'WHITE', multiply: [42, 58, 98] },
            TWILIGHTBLUE: { baseColour: 'WHITE', multiply: [55, 58, 94] },
            VELVETPLUM: { baseColour: 'WHITE', multiply: [58, 39, 72] },
            INDIGONIGHT: { baseColour: 'WHITE', multiply: [36, 39, 81] },
            MULBERRY: { baseColour: 'WHITE', multiply: [72, 32, 58] },
            CHARCOAL: { baseColour: 'WHITE', multiply: [46, 46, 52] },
            SMOKESLATE: { baseColour: 'WHITE', multiply: [58, 65, 72] },
            DUSKROSE: { baseColour: 'WHITE', multiply: [78, 46, 58] },
            BRONZELEAF: { baseColour: 'WHITE', multiply: [91, 62, 36] },
            DARKSUNSET: { baseColour: 'WHITE', multiply: [91, 46, 36] },
            MIDNIGHTTEAL: { baseColour: 'WHITE', multiply: [26, 72, 72] },
            OCEANDEPTHS: { baseColour: 'WHITE', multiply: [32, 62, 88] },
            SHADOWMINT: { baseColour: 'WHITE', multiply: [58, 84, 72] },
            NIGHTSKY: { baseColour: 'WHITE', multiply: [46, 52, 84] },
            ASHWOOD: { baseColour: 'WHITE', multiply: [78, 72, 58] },
            DEEPRUBY: { baseColour: 'WHITE', multiply: [98, 29, 46] },
            BLACKOUTBLUE: { baseColour: 'WHITE', multiply: [10, 12, 26], screen: [30, 36, 76, 0.08] },
            BLACKOUTPURPLE: { baseColour: 'WHITE', multiply: [12, 10, 24], screen: [54, 30, 80, 0.08] },
            BLACKOUTRED: { baseColour: 'WHITE', multiply: [22, 8, 14], screen: [80, 28, 40, 0.08] },
            BLACKOUTTEAL: { baseColour: 'WHITE', multiply: [8, 20, 22], screen: [36, 80, 82, 0.08] },
            BLACKOUTGREEN: { baseColour: 'WHITE', multiply: [12, 24, 12], screen: [56, 90, 48, 0.08] },
            BLACKOUTGOLD: { baseColour: 'WHITE', multiply: [24, 18, 8], screen: [96, 72, 36, 0.08] },
            STARLESS_NAVY: { baseColour: 'WHITE', multiply: [9, 12, 28], screen: [28, 40, 88, 0.07] },
            NEBULA_INDIGO: { baseColour: 'WHITE', multiply: [11, 10, 26], screen: [36, 30, 84, 0.07] },
            UMBRAL_VIOLET: { baseColour: 'WHITE', multiply: [14, 9, 22], screen: [60, 28, 80, 0.08] },
            CRYPTIC_CRIMSON: { baseColour: 'WHITE', multiply: [22, 9, 14], screen: [92, 30, 42, 0.08] },
            ABYSSAL_TEAL: { baseColour: 'WHITE', multiply: [8, 18, 20], screen: [32, 76, 80, 0.08] },
            MOURNING_EMERALD: { baseColour: 'WHITE', multiply: [12, 22, 14], screen: [50, 90, 56, 0.08] },
            SHADOW_SAPPHIRE: { baseColour: 'WHITE', multiply: [10, 13, 30], screen: [34, 44, 92, 0.07] },
            NOCTURNE_MAGENTA: { baseColour: 'WHITE', multiply: [18, 8, 20], screen: [88, 28, 78, 0.08] },
            PHANTOM_COPPER: { baseColour: 'WHITE', multiply: [20, 14, 10], screen: [90, 70, 50, 0.08] },
            ECLIPSE_SKY: { baseColour: 'WHITE', multiply: [12, 16, 24], screen: [46, 58, 90, 0.07] }
        };

        this.experimentalColourCategories = {
            mood: ['AQUA', 'APRICOT', 'CORAL', 'DAWN', 'FERN', 'GLAZEDBLUE', 'GOLDLEAF', 'LAVENDER', 'LEMONADE', 'MANGO', 'MINT', 'MIST', 'PEACH', 'PASTELBLUE', 'PASTELMINT', 'PASTELPINK', 'PASTELPURPLE', 'PASTELYELLOW', 'PERIWINKLE', 'SEAFOAM', 'SPRINGGREEN', 'WATERLILY', 'WISTERIA', 'ZIRCON'],
            bold: ['CHARTREUSE', 'CERULEAN', 'COBALT', 'ELECTRICBLUE', 'EMERALD', 'FUCHSIA', 'HOTPINK', 'LIME', 'MAGENTA', 'NEONBLUE', 'NEONGREEN', 'NEONPINK', 'NEONPURPLE', 'SKYBLUE', 'SUNSETORANGE', 'TEAL', 'TURQUOISE', 'ZEST', 'SAND', 'SCARLET', 'NECTARINE'],
            darker: ['MIDNIGHT', 'OBSIDIAN', 'DEEPSEA', 'NIGHTFALL', 'SHADOWPURPLE', 'DARKORCHID', 'STORMBLUE', 'DARKTEAL', 'EVERGREEN', 'FORESTSHADOW', 'MOSSY', 'DEEPFUCHSIA', 'GARNET', 'RAVEN', 'COBALTSTORM', 'TWILIGHTBLUE', 'VELVETPLUM', 'INDIGONIGHT', 'MULBERRY', 'CHARCOAL', 'SMOKESLATE', 'DUSKROSE', 'BRONZELEAF', 'DARKSUNSET', 'MIDNIGHTTEAL', 'OCEANDEPTHS', 'SHADOWMINT', 'NIGHTSKY', 'ASHWOOD', 'DEEPRUBY'],
            blackout: ['BLACKOUTBLUE', 'BLACKOUTPURPLE', 'BLACKOUTRED', 'BLACKOUTTEAL', 'BLACKOUTGREEN', 'BLACKOUTGOLD', 'STARLESS_NAVY', 'NEBULA_INDIGO', 'UMBRAL_VIOLET', 'CRYPTIC_CRIMSON', 'ABYSSAL_TEAL', 'MOURNING_EMERALD', 'SHADOW_SAPPHIRE', 'NOCTURNE_MAGENTA', 'PHANTOM_COPPER', 'ECLIPSE_SKY']
        };
    }
    
    /**
     * Initialize by loading JSON data files
     */
    async init() {
        if (this.loaded) return true;
        
        // If already loading, return the existing promise
        if (this.loadingPromise) return this.loadingPromise;
        
        // Start loading
        this.loadingPromise = this._doInit();
        return this.loadingPromise;
    }
    
    async _doInit() {
        // Helper to try multiple paths (supports subpath deployments)
        const fetchJson = async (paths) => {
            for (const p of paths) {
                try {
                    const res = await fetch(p);
                    if (res && res.ok) {
                        return await res.json();
                    }
                } catch (_) {
                    // Try next path
                }
            }
            return null;
        };

        try {
            // Try absolute then relative paths
            const indexJson = await fetchJson([
                '/sprite-data/spritesIndex.json'
            ]);
            const peltJson = await fetchJson([
                '/sprite-data/peltInfo.json'
            ]);

            if (indexJson) {
                this.spritesIndex = indexJson;
                this.extractNamesFromIndex();
            }
            if (peltJson) {
                this.peltInfo = peltJson;
                this.extractNamesFromPeltInfo();
            }

            if (indexJson || peltJson) {
                this.loaded = true;
                console.log(`SpriteMapper initialized with ${this.peltNames.length} pelts, ${this.colours.length} colours`);
                return true;
            }

            // If neither loaded, fall back
            throw new Error('Failed to load spritesIndex and peltInfo via all paths');
        } catch (error) {
            console.error('Failed to load sprite data:', error);
            // Fall back to hardcoded values
            this.loadFallbackData();
            return false;
        }
    }
    
    /**
     * Extract pelt names and colors from spritesIndex
     */
    extractNamesFromIndex() {
        if (!this.spritesIndex) return;
        
        // Extract pelt patterns from sprite sheet names in spritesIndex
        const peltPatterns = new Set();
        
        for (const key of Object.keys(this.spritesIndex)) {
            // Look for pelt pattern keys like "singleWHITE", "tabbyGINGER", etc.
            const patterns = ['single', 'tabby', 'marbled', 'rosette', 'smoke', 'ticked', 
                            'speckled', 'bengal', 'mackerel', 'classic', 'sokoke', 
                            'agouti', 'singlestripe', 'masked'];
            
            for (const pattern of patterns) {
                if (key.startsWith(pattern)) {
                    peltPatterns.add(pattern);
                }
            }
        }
        
        // Map pattern names to proper format
        const patternMap = {
            'single': 'SingleColour',
            'tabby': 'Tabby',
            'marbled': 'Marbled',
            'rosette': 'Rosette',
            'smoke': 'Smoke',
            'ticked': 'Ticked',
            'speckled': 'Speckled',
            'bengal': 'Bengal',
            'mackerel': 'Mackerel',
            'classic': 'Classic',
            'sokoke': 'Sokoke',
            'agouti': 'Agouti',
            'singlestripe': 'Singlestripe',
            'masked': 'Masked'
        };
        
        this.peltNames = Array.from(peltPatterns).map(p => patternMap[p] || p).filter(Boolean);
        
        // TwoColour uses 'single' sprites but is a distinct pelt type
        // Always add it if we have SingleColour
        if (this.peltNames.includes('SingleColour') && !this.peltNames.includes('TwoColour')) {
            // Insert TwoColour right after SingleColour to maintain order
            const singleIndex = this.peltNames.indexOf('SingleColour');
            this.peltNames.splice(singleIndex + 1, 0, 'TwoColour');
        }
        
        // If no patterns found, use fallback
        if (this.peltNames.length === 0) {
            this.peltNames = ['SingleColour', 'TwoColour', 'Tabby', 'Marbled', 'Rosette', 'Smoke', 'Ticked', 
                'Speckled', 'Bengal', 'Mackerel', 'Classic', 'Sokoke', 'Agouti', 'Singlestripe', 'Masked'];
        }
        
        // Standard color list from ClanGen
        this.colours = [
            "WHITE", "PALEGREY", "SILVER", "GREY", "DARKGREY", "GHOST", "BLACK",
            "CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA",
            "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"
        ];
        
        // Eye colors
        this.eyeColours = [
            "YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE",
            "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER",
            "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW",
            "BRONZE", "SILVER"
        ];
        
        // Extract skin colors from spritesIndex
        const skinColors = new Set();
        for (const key of Object.keys(this.spritesIndex)) {
            if (key.startsWith('skin') && key !== 'skin' && key !== 'skinparalyzed') {
                const color = key.replace('skin', '');
                if (color) {
                    skinColors.add(color);
                }
            }
        }
        this.skinColours = Array.from(skinColors);
        
        // Fallback if no skin colors found
        if (this.skinColours.length === 0) {
            this.skinColours = [
                'BLACK', 'PINK', 'DARKBROWN', 'BROWN', 'LIGHTBROWN', 'DARK', 'DARKGREY',
                'GREY', 'DARKSALMON', 'SALMON', 'PEACH', 'DARKMARBLED', 'MARBLED',
                'LIGHTMARBLED', 'DARKBLUE', 'BLUE', 'LIGHTBLUE', 'RED'
            ];
        }
        
        // Extract tortie masks from spritesIndex
        const tortieMasks = new Set();
        for (const key of Object.keys(this.spritesIndex)) {
            if (key.startsWith('tortiemask') && key !== 'tortiepatchesmasks') {
                const mask = key.replace('tortiemask', '');
                if (mask) {
                    tortieMasks.add(mask);
                }
            }
        }
        this.tortieMasks = Array.from(tortieMasks);
        
        // Extract white patches from spritesIndex
        const whitePatches = new Set();
        const allKeys = Object.keys(this.spritesIndex);
        let whiteKeyCount = 0;
        
        for (const key of allKeys) {
            // Look for keys that start with 'white' but not 'whitepatches'
            if (key.startsWith('white') && key !== 'whitepatches') {
                whiteKeyCount++;
                const patch = key.substring(5); // Get everything after 'white'
                if (patch) {
                    whitePatches.add(patch);
                }
            }
        }
        
        // Define points and vitiligo patterns first
        this.points = ['COLOURPOINT', 'RAGDOLL', 'SEPIAPOINT', 'MINKPOINT', 'SEALPOINT'];
        this.vitiligo = ['VITILIGO', 'VITILIGOTWO', 'MOON', 'PHANTOM', 'KARPATI', 'POWDER', 'BLEACHED', 'SMOKEY'];
        
        // Filter out points and vitiligo patterns from white patches
        // These should ONLY be available in their respective categories
        const pointsSet = new Set(this.points);
        const vitiligoSet = new Set(this.vitiligo);
        this.whitePatches = Array.from(whitePatches).filter(patch => 
            !pointsSet.has(patch) && !vitiligoSet.has(patch)
        );
        
        console.log(`Loaded ${this.whitePatches.length} white patches after filtering (removed ${whiteKeyCount - this.whitePatches.length} points/vitiligo patterns)`);
        console.log(`First 20 white patches:`, this.whitePatches.slice(0, 20));
        console.log(`Last 20 white patches:`, this.whitePatches.slice(-20));
        
        // Tints and white tints - include 'none' as first option
        this.tints = ['none', 'pink', 'gray', 'red', 'black', 'orange', 'yellow', 'purple', 'blue', 'dilute', 'warmdilute', 'cooldilute'];
        this.whiteTints = ['none', 'darkcream', 'cream', 'offwhite', 'gray', 'pink'];
        
        // Lineart styles
        this.lineartStyles = ['normal', 'dead', 'darkforest'];
    }
    
    /**
     * Extract accessory and scar names from peltInfo
     */
    extractNamesFromPeltInfo() {
        if (!this.peltInfo) return;
        
        // Extract accessories - combine all types
        this.accessories = [];
        if (this.peltInfo.plant_accessories) {
            this.accessories.push(...this.peltInfo.plant_accessories);
        }
        if (this.peltInfo.wild_accessories) {
            this.accessories.push(...this.peltInfo.wild_accessories);
        }
        if (this.peltInfo.collars) {
            this.accessories.push(...this.peltInfo.collars);
        }
        if (this.peltInfo.extra_accessories) {
            this.accessories.push(...this.peltInfo.extra_accessories);
        }
        console.log(`Loaded ${this.accessories.length} accessories from peltInfo (plant: ${this.peltInfo.plant_accessories?.length || 0}, wild: ${this.peltInfo.wild_accessories?.length || 0}, collars: ${this.peltInfo.collars?.length || 0})`)
        
        // Don't overwrite white patches from spritesIndex - peltInfo doesn't have them
        // The white patches should already be loaded from spritesIndex
        
        // Extract scars
        this.scars = [];
        if (this.peltInfo.scars1) this.scars.push(...this.peltInfo.scars1);
        if (this.peltInfo.scars2) this.scars.push(...this.peltInfo.scars2);
        if (this.peltInfo.scars3) this.scars.push(...this.peltInfo.scars3);
    }
    
    /**
     * Load fallback hardcoded data if JSON loading fails
     */
    loadFallbackData() {
        this.peltNames = ['SingleColour', 'TwoColour', 'Tabby', 'Marbled', 'Rosette', 'Smoke', 'Ticked', 
                'Speckled', 'Bengal', 'Mackerel', 'Classic', 'Sokoke', 'Agouti', 'Singlestripe', 'Masked'];
        this.colours = ["WHITE", "PALEGREY", "SILVER", "GREY", "DARKGREY", "GHOST", "BLACK", "CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"];
        this.eyeColours = ["YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE", "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER", "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW", "BRONZE", "SILVER"];
        this.skinColours = ['BLACK', 'PINK', 'DARKBROWN', 'BROWN', 'LIGHTBROWN', 'DARK', 'DARKGREY', 'GREY', 'DARKSALMON', 'SALMON', 'PEACH', 'DARKMARBLED', 'MARBLED', 'LIGHTMARBLED', 'DARKBLUE', 'BLUE', 'LIGHTBLUE', 'RED'];
        // Add tortie masks to fallback data
        this.tortieMasks = ['ONE', 'TWO', 'THREE', 'FOUR', 'REDTAIL', 'DELILAH', 'MINIMALONE', 
                           'MINIMALTWO', 'MINIMALTHREE', 'MINIMALFOUR', 'HALF', 'OREO', 'SWOOP', 
                           'MOTTLED', 'SIDEMASK', 'EYEDOT', 'BANDANA', 'PACMAN', 'STREAMSTRIKE', 
                           'ORIOLE', 'CHIMERA', 'DAUB', 'EMBER', 'BLANKET', 'ROBIN', 'BRINDLE', 
                           'PAIGE', 'ROSETAIL', 'SAFI', 'SMUDGED', 'DAPPLENIGHT', 'STREAK', 'MASK', 
                           'CHEST', 'ARMTAIL', 'SMOKE', 'GRUMPYFACE', 'BRIE', 'BELOVED', 'BODY', 
                           'SHILOH', 'FRECKLED', 'HEARTBEAT'];
        
        // Add accessories to fallback data - include ALL collar variants
        this.accessories = [
            // Plant accessories
            'MAPLE LEAF', 'HOLLY', 'BLUE BERRIES', 'FORGET ME NOTS', 'RYE STALK', 'CATTAIL',
            'POPPY', 'ORANGE POPPY', 'CYAN POPPY', 'WHITE POPPY', 'PINK POPPY',
            'BLUEBELLS', 'LILY OF THE VALLEY', 'SNAPDRAGON', 'HERBS', 'PETALS', 'NETTLE',
            'HEATHER', 'GORSE', 'JUNIPER', 'RASPBERRY', 'LAVENDER', 'OAK LEAVES', 'CATMINT',
            'MAPLE SEED', 'LAUREL', 'BULB WHITE', 'BULB YELLOW', 'BULB ORANGE', 'BULB PINK',
            'BULB BLUE', 'CLOVER', 'DAISY', 'DRY HERBS', 'DRY CATMINT', 'DRY NETTLES', 'DRY LAURELS',
            // Wild accessories  
            'RED FEATHERS', 'BLUE FEATHERS', 'JAY FEATHERS', 'GULL FEATHERS', 'SPARROW FEATHERS',
            'MOTH WINGS', 'ROSY MOTH WINGS', 'MORPHO BUTTERFLY', 'MONARCH BUTTERFLY', 
            'CICADA WINGS', 'BLACK CICADA',
            // Collars - basic
            'CRIMSON', 'BLUE', 'YELLOW', 'CYAN', 'RED', 'LIME', 'GREEN', 'RAINBOW',
            'BLACK', 'SPIKES', 'WHITE', 'PINK', 'PURPLE', 'MULTI', 'INDIGO',
            // Collars - BELL variants
            'CRIMSONBELL', 'BLUEBELL', 'YELLOWBELL', 'CYANBELL', 'REDBELL', 'LIMEBELL',
            'GREENBELL', 'RAINBOWBELL', 'BLACKBELL', 'SPIKESBELL', 'WHITEBELL', 'PINKBELL',
            'PURPLEBELL', 'MULTIBELL', 'INDIGOBELL',
            // Collars - BOW variants  
            'CRIMSONBOW', 'BLUEBOW', 'YELLOWBOW', 'CYANBOW', 'REDBOW', 'LIMEBOW',
            'GREENBOW', 'RAINBOWBOW', 'BLACKBOW', 'SPIKESBOW', 'WHITEBOW', 'PINKBOW',
            'PURPLEBOW', 'MULTIBOW', 'INDIGOBOW',
            // Collars - NYLON variants
            'CRIMSONNYLON', 'BLUENYLON', 'YELLOWNYLON', 'CYANNYLON', 'REDNYLON', 'LIMENYLON',
            'GREENNYLON', 'RAINBOWNYLON', 'BLACKNYLON', 'SPIKESNYLON', 'WHITENYLON', 'PINKNYLON',
            'PURPLENYLON', 'MULTINYLON', 'INDIGONYLON'
        ];
        
        // Add scars to fallback data
        this.scars = ['ONE', 'TWO', 'THREE', 'MANLEG', 'BRIGHTHEART', 'MANTAIL', 'BRIDGE', 'RIGHTBLIND', 
                     'LEFTBLIND', 'BOTHBLIND', 'BEAKCHEEK', 'BEAKLOWER', 'CATBITE', 'RATBITE', 'QUILLCHUNK', 
                     'QUILLSCRATCH', 'TAILSCAR', 'SNOUT', 'CHEEK', 'SIDE', 'THROAT', 'TAILBASE', 'BELLY', 
                     'TOETRAP', 'SNAKE', 'LEGBITE', 'NECKBITE', 'FACE', 'HALFTAIL', 'NOPAW', 'FROSTFACE', 
                     'HINDLEG', 'BACK', 'QUILLSIDE', 'SCRATCHSIDE', 'TOE', 'BEAKSIDE', 'CATBITETWO', 
                     'SNAKETWO', 'FOUR', 'LEFTEAR', 'RIGHTEAR', 'NOTAIL', 'NOEAR', 'NOLEFTEAR', 'NORIGHTEAR', 
                     'FROSTTAIL', 'FROSTSOCK', 'FROSTMITT', 'BURNPAWS', 'BURNTAIL', 'BURNBELLY', 'BURNRUMP'];
        
        // Add points to fallback data
        this.points = ['COLOURPOINT', 'RAGDOLL', 'SEPIAPOINT', 'MINKPOINT', 'SEALPOINT'];
        
        // Add white patches to fallback data  
        this.whitePatches = ['ANY', 'ANYTWO', 'BROKEN', 'FRECKLES', 'RINGTAIL', 'HALFWHITE', 'PANTS', 
                            'REVERSEPANTS', 'SKUNK', 'STAR', 'TOESTAIL', 'RAVENPAW', 'HONEY', 'REVERSEHEART', 
                            'SHOOTINGSTAR', 'SPARROW', 'VEST', 'DAMIEN', 'PAWS', 'BELLY', 'TAILTIP', 'TOES', 
                            'BROKENBLAZE', 'SCOURGE', 'MITAINE', 'SQUEAKS', 'STAR', 'BLACKSTAR', 'BLAZEMASK', 
                            'TEARS', 'BLAZE'];
        
        // Add other arrays for complete fallback
        this.tints = ['none', 'pink', 'gray', 'red', 'black', 'orange', 'yellow', 'purple', 'blue', 
                     'dilute', 'warmdilute', 'cooldilute'];
        this.whitePatchesTints = ['none', 'offwhite', 'cream', 'darkcream', 'gray', 'pink'];
        this.vitiligo = ['VITILIGO', 'VITILIGOTWO', 'MOON', 'PHANTOM', 'KARPATI', 'BLEACHED', 'SMOKEY', 'POWDER'];

        this.experimentalColourCategories = {
            mood: ['AQUA', 'APRICOT', 'CORAL', 'DAWN', 'FERN', 'GLAZEDBLUE', 'GOLDLEAF', 'LAVENDER', 'LEMONADE', 'MANGO', 'MINT', 'MIST', 'PEACH', 'PASTELBLUE', 'PASTELMINT', 'PASTELPINK', 'PASTELPURPLE', 'PASTELYELLOW', 'PERIWINKLE', 'SEAFOAM', 'SPRINGGREEN', 'WATERLILY', 'WISTERIA', 'ZIRCON'],
            bold: ['CHARTREUSE', 'CERULEAN', 'COBALT', 'ELECTRICBLUE', 'EMERALD', 'FUCHSIA', 'HOTPINK', 'LIME', 'MAGENTA', 'NEONBLUE', 'NEONGREEN', 'NEONPINK', 'NEONPURPLE', 'SKYBLUE', 'SUNSETORANGE', 'TEAL', 'TURQUOISE', 'ZEST', 'SAND', 'SCARLET', 'NECTARINE'],
            darker: ['MIDNIGHT', 'OBSIDIAN', 'DEEPSEA', 'NIGHTFALL', 'SHADOWPURPLE', 'DARKORCHID', 'STORMBLUE', 'DARKTEAL', 'EVERGREEN', 'FORESTSHADOW', 'MOSSY', 'DEEPFUCHSIA', 'GARNET', 'RAVEN', 'COBALTSTORM', 'TWILIGHTBLUE', 'VELVETPLUM', 'INDIGONIGHT', 'MULBERRY', 'CHARCOAL', 'SMOKESLATE', 'DUSKROSE', 'BRONZELEAF', 'DARKSUNSET', 'MIDNIGHTTEAL', 'OCEANDEPTHS', 'SHADOWMINT', 'NIGHTSKY', 'ASHWOOD', 'DEEPRUBY']
        };

        this.loaded = true;
    }
    
    /**
     * Get pelt name to sprite name mapping
     * @returns {Object} Mapping of pelt names to sprite prefixes
     */
    getPeltToSpriteMapping() {
        return {
            'SingleColour': 'single',
            'TwoColour': 'single',
            'Tabby': 'tabby',
            'Marbled': 'marbled',
            'Rosette': 'rosette',
            'Smoke': 'smoke',
            'Ticked': 'ticked',
            'Speckled': 'speckled',
            'Bengal': 'bengal',
            'Mackerel': 'mackerel',
            'Classic': 'classic',
            'Sokoke': 'sokoke',
            'Agouti': 'agouti',
            'Singlestripe': 'singlestripe',
            'Masked': 'masked',
            'Tortie': '',
            'Calico': ''
        };
    }
    
    
    /**
     * Get sprite path for a given sprite name and number
     * @deprecated We no longer use individual sprite paths - use sprite sheets instead
     * @param {string} spriteName - Name like "singleBLACK", "tabbyGINGER", etc.
     * @param {number|string} spriteNumber - Sprite number (0-20)
     * @returns {null} Always returns null since we use sprite sheets now
     */
    getSpritePath(spriteName, spriteNumber) {
        console.warn('getSpritePath is deprecated - we use sprite sheets now');
        return null;
    }
    
    /**
     * Build sprite name from parameters - instance method for single source of truth
     * @param {string} type - Sprite type (pelt, eyes, skin, etc.)
     * @param {string} name - Specific name (SingleColour, Tabby, etc.)
     * @param {string} color - Color name
     * @returns {string} Formatted sprite name
     */
    buildSpriteName(type, name, color) {
        // Handle different naming conventions
        if (type === 'pelt') {
            if (name === 'SingleColour') {
                return `single${color}`;
            } else if (name === 'TwoColour') {
                return `single${color}`;  // TwoColour uses single sprites
            } else if (name === 'Tabby') {
                return `tabby${color}`;
            } else if (name === 'Rosette') {
                return `rosette${color}`;
            } else if (name === 'Smoke') {
                return `smoke${color}`;
            } else if (name === 'Ticked') {
                return `ticked${color}`;
            } else if (name === 'Speckled') {
                return `speckled${color}`;
            } else if (name === 'Bengal') {
                return `bengal${color}`;
            } else if (name === 'Mackerel') {
                return `mackerel${color}`;
            } else if (name === 'Classic') {
                return `classic${color}`;
            } else if (name === 'Sokoke') {
                return `sokoke${color}`;
            } else if (name === 'Agouti') {
                return `agouti${color}`;
            } else if (name === 'Singlestripe') {
                return `singlestripe${color}`;
            } else if (name === 'Masked') {
                return `masked${color}`;
            } else if (name === 'Marbled') {
                return `marbled${color}`;
            }
            // Default pattern name
            return `${name.toLowerCase()}${color}`;
        } else if (type === 'eyes') {
            return `eyes${color}`;
        } else if (type === 'skin') {
            return `skin${color}`;
        } else if (type === 'white') {
            return `white${name}`;
        } else if (type === 'scar') {
            return `scar${name}`;
        } else if (type === 'accessory') {
            return name; // Accessories have complex names
        } else if (type === 'tortie') {
            return `tortie${name}`;
        }
        
        return `${type}${name}`;
    }
    
    /**
     * Check if a sprite exists
     */
    hasSprite(spriteName, spriteNumber) {
        // Check if sprite exists in spritesIndex
        return this.spritesIndex && this.spritesIndex[spriteName] !== undefined;
    }
    
    /**
     * Get all available sprite numbers for a given sprite name
     */
    getAvailableSpriteNumbers(spriteName) {
        // All sprites have numbers 0-20
        return this.sprites;
    }
    
    /**
     * Get all pelt names (patterns)
     * @returns {string[]} Array of pelt pattern names
     */
    getPeltNames() {
        if (!this.loaded) {
            console.warn('SpriteMapper not initialized, using fallback pelt names');
            return this.peltNames;
        }
        return [...this.peltNames];
    }
    
    /**
     * Get all color names
     * @returns {string[]} Array of color names
     */
    getColours() {
        if (!this.loaded) {
            console.warn('SpriteMapper not initialized, using fallback colours');
            return this.colours;
        }
        return [...this.colours];
    }

    getExperimentalColours() {
        return Object.keys(this.experimentalColourDefs);
    }

    normalizeExperimentalModes(mode) {
        if (!mode) return [];
        if (Array.isArray(mode)) {
            return mode
                .filter(Boolean)
                .map(value => this.normalizeExperimentalModes(value))
                .flat();
        }
        const normalized = String(mode).toLowerCase();
        if (normalized === 'off') return [];
        if (normalized === 'soft') return ['mood'];
        if (['mood', 'bold', 'darker', 'blackout'].includes(normalized)) {
            return [normalized];
        }
        return [];
    }

    getExperimentalColoursByMode(mode) {
        const modes = this.normalizeExperimentalModes(mode);
        if (modes.length === 0) return [];
        const combined = new Set();
        for (const entry of modes) {
            const colours = this.experimentalColourCategories[entry];
            if (!colours) continue;
            for (const colour of colours) {
                const upper = colour.toUpperCase();
                if (this.experimentalColourDefs[upper]) {
                    combined.add(upper);
                }
            }
        }
        return Array.from(combined);
    }

    getExperimentalColourDefinition(name) {
        if (!name) return null;
        return this.experimentalColourDefs?.[name.toUpperCase()] || null;
    }

    getColourOptions(mode = 'off') {
        const baseColours = this.getColours();
        const modes = this.normalizeExperimentalModes(mode);
        if (modes.length === 0) {
            return baseColours;
        }

        const combined = new Set(baseColours);
        const extras = this.getExperimentalColoursByMode(modes);
        for (const colour of extras) {
            combined.add(colour);
        }
        return Array.from(combined);
    }

    isExperimentalColour(name) {
        if (!name) return false;
        return Object.prototype.hasOwnProperty.call(this.experimentalColourDefs, name.toUpperCase());
    }

    isBaseColour(name) {
        if (!name) return false;
        const upper = name.toUpperCase();
        return this.getColours().some(colour => colour.toUpperCase() === upper);
    }

    getWhitePatchColourOptions(mode = 'default', experimentalMode = null) {
        const normalized = (mode || 'default').toLowerCase();

        const experimentalTones = this.getExperimentalColoursByMode(experimentalMode);

        if (normalized === 'none') {
            return ['none'];
        }

        if (normalized === 'base' || normalized === 'original') {
            const options = new Set(['none']);
            for (const colour of this.getColours()) {
                options.add(colour);
            }
            for (const colour of experimentalTones) {
                options.add(colour);
            }
            return Array.from(options);
        }

        if (normalized === 'all') {
            const options = new Set(['none']);
            for (const colour of this.getColours()) {
                options.add(colour);
            }
            const extras = experimentalTones.length > 0
                ? experimentalTones
                : this.getExperimentalColours();
            for (const colour of extras) {
                options.add(colour);
            }
            return Array.from(options);
        }

        const tints = new Set(this.getWhitePatchesTints());
        for (const colour of experimentalTones) {
            tints.add(colour);
        }
        return Array.from(tints);
    }

    /**
     * Get all eye colors
     * @returns {string[]} Array of eye color names
     */
    getEyeColours() {
        if (!this.loaded) {
            console.warn('SpriteMapper not initialized, using fallback eye colours');
            return this.eyeColours;
        }
        return [...this.eyeColours];
    }
    
    /**
     * Get all accessories
     * @returns {string[]} Array of accessory names
     */
    getAccessories() {
        if (!this.loaded) {
            console.warn('SpriteMapper not initialized, no accessories available');
            return [];
        }
        return [...this.accessories];
    }
    
    /**
     * Get plant accessories
     * @returns {string[]} Array of plant accessory names
     */
    getPlantAccessories() {
        if (!this.loaded || !this.peltInfo) {
            return [];
        }
        return this.peltInfo.plant_accessories ? [...this.peltInfo.plant_accessories] : [];
    }
    
    /**
     * Get wild accessories
     * @returns {string[]} Array of wild accessory names
     */
    getWildAccessories() {
        if (!this.loaded || !this.peltInfo) {
            return [];
        }
        return this.peltInfo.wild_accessories ? [...this.peltInfo.wild_accessories] : [];
    }
    
    /**
     * Get collars
     * @returns {string[]} Array of collar names
     */
    getCollars() {
        if (!this.loaded || !this.peltInfo) {
            return [];
        }
        return this.peltInfo.collars ? [...this.peltInfo.collars] : [];
    }
    
    /**
     * Get all scars
     * @returns {string[]} Array of scar names
     */
    getScars() {
        if (!this.loaded) {
            console.warn('SpriteMapper not initialized, no scars available');
            return [];
        }
        return [...this.scars];
    }
    
    /**
     * Get scars by category
     * @param {number} category - 1, 2, or 3
     * @returns {string[]} Array of scar names in that category
     */
    getScarsByCategory(category) {
        if (!this.loaded || !this.peltInfo) {
            return [];
        }
        const scarKey = `scars${category}`;
        return this.peltInfo[scarKey] ? [...this.peltInfo[scarKey]] : [];
    }
    
    /**
     * Get all skin colors
     * @returns {string[]} Array of skin color names
     */
    getSkinColours() {
        if (!this.loaded) {
            console.warn('SpriteMapper not initialized, using fallback skin colours');
            return this.skinColours;
        }
        return [...this.skinColours];
    }
    
    /**
     * Get all sprite numbers
     * @returns {number[]} Array of sprite numbers (0-20)
     */
    getSprites() {
        return [...this.sprites];
    }
    
    /**
     * Get all tortie masks
     * @returns {string[]} Array of tortie mask names
     */
    getTortieMasks() {
        if (!this.loaded) {
            // Fallback data
            return ['ONE', 'TWO', 'THREE', 'FOUR', 'REDTAIL', 'DELILAH', 'MINIMALONE', 
                    'MINIMALTWO', 'MINIMALTHREE', 'MINIMALFOUR', 'HALF', 'OREO', 'SWOOP', 
                    'MOTTLED', 'SIDEMASK', 'EYEDOT', 'BANDANA', 'PACMAN', 'STREAMSTRIKE', 
                    'ORIOLE', 'CHIMERA', 'DAUB', 'EMBER', 'BLANKET', 'ROBIN', 'BRINDLE', 
                    'PAIGE', 'ROSETAIL', 'SAFI', 'SMUDGED', 'DAPPLENIGHT', 'STREAK', 'MASK', 
                    'CHEST', 'ARMTAIL', 'SMOKE', 'GRUMPYFACE', 'BRIE', 'BELOVED', 'BODY', 
                    'SHILOH', 'FRECKLED', 'HEARTBEAT'];
        }
        return [...this.tortieMasks];
    }
    
    /**
     * Get all white patches
     * @returns {string[]} Array of white patch names
     */
    getWhitePatches() {
        // Only use fallback if not loaded at all
        if (!this.loaded) {
            console.warn('SpriteMapper not loaded, returning empty array for white patches');
            return [];
        }
        
        // Return the loaded data even if empty (don't fall back if loaded but empty)
        if (this.whitePatches.length === 0) {
            console.warn('White patches array is empty after loading!');
        }
        
        // Always return the loaded data if we're loaded
        return [...this.whitePatches];
    }
    
    /**
     * Get all points patterns
     * @returns {string[]} Array of points pattern names
     */
    getPoints() {
        return [...this.points];
    }
    
    /**
     * Get all vitiligo patterns
     * @returns {string[]} Array of vitiligo pattern names
     */
    getVitiligo() {
        // Make sure we have all 9 vitiligo patterns
        if (!this.loaded || this.vitiligo.length < 9) {
            return ['VITILIGO', 'VITILIGOTWO', 'MOON', 'PHANTOM', 'KARPATI', 'POWDER', 'BLEACHED', 'SMOKEY'];
        }
        return [...this.vitiligo];
    }
    
    /**
     * Get all tints
     * @returns {string[]} Array of tint names
     */
    getTints() {
        // Make sure 'none' is first
        if (!this.loaded || !this.tints.includes('none')) {
            return ['none', 'pink', 'gray', 'red', 'black', 'orange', 'yellow', 'purple', 'blue', 'dilute', 'warmdilute', 'cooldilute'];
        }
        return [...this.tints];
    }
    
    /**
     * Get all white tints
     * @returns {string[]} Array of white tint names
     */
    getWhiteTints() {
        // Make sure 'none' is first
        if (!this.loaded || !this.whiteTints.includes('none')) {
            return ['none', 'darkcream', 'cream', 'offwhite', 'gray', 'pink'];
        }
        return [...this.whiteTints];
    }
    
    /**
     * Get all lineart styles
     * @returns {string[]} Array of lineart style names
     */
    getLineartStyles() {
        return [...this.lineartStyles];
    }
    
    /**
     * Get tint color RGB values
     * @param {string} tintName - Name of the tint
     * @returns {number[]|null} RGB array or null
     */
    getTintColor(tintName) {
        const tintColors = {
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
        return tintColors[tintName] || null;
    }
    
    /**
     * Get dilute tint color RGB values
     * @param {string} tintName - Name of the dilute tint
     * @returns {number[]|null} RGB array or null
     */
    getDiluteTintColor(tintName) {
        const diluteTintColors = {
            dilute: [20, 20, 20],
            warmdilute: [25, 15, 7],
            cooldilute: [7, 15, 25],
            none: null
        };
        return diluteTintColors[tintName] || null;
    }
    
    /**
     * Get white patches tint options including 'none'
     * @returns {string[]} List of white patches tint names
     */
    getWhitePatchesTints() {
        return ['none', 'darkcream', 'cream', 'offwhite', 'gray', 'pink'];
    }
    
    /**
     * Get white patches tint color RGB values
     * @param {string} tintName - Name of the white patches tint
     * @returns {number[]|null} RGB array or null
     */
    getWhitePatchesTintColor(tintName) {
        const whitePatchesTintColors = {
            darkcream: [236, 229, 208],
            cream: [247, 241, 225],
            offwhite: [238, 249, 252],
            gray: [208, 225, 229],
            pink: [254, 248, 249],
            none: null
        };
        if (!tintName) return null;
        const key = typeof tintName === 'string' ? tintName.toLowerCase() : tintName;
        return whitePatchesTintColors[key] || null;
    }
}

// Singleton instance
const spriteMapper = new SpriteMapper();

export default spriteMapper;
export { SpriteMapper };
