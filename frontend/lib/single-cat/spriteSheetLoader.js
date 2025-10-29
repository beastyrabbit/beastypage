/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * SpriteSheetLoader - Efficient sprite sheet loading system
 * Loads combined sprite sheets instead of individual files
 */

class SpriteSheetLoader {
    constructor() {
        // Cache loaded sprite sheets
        this.loadedSheets = new Map();
        this.loadingSheets = new Map();

        // Cache extracted sprites
        this.extractedSprites = new Map();

        this.missingGroups = new Set();
        this.commonSheetsPreloaded = false;
        this.normalizedIndex = null;
        
        // Sprite sheet index from pixel-cat-maker
        this.spritesIndex = null;
        this.spritesOffsetMap = null;
        
        // Base path for sprite sheets - use absolute path for GitHub Pages
        this.spriteSheetPath = '/sprites/';
        
        // No canvas pooling - creates new canvases as needed
    }
    
    /**
     * Initialize the loader with sprite indices
     */
    async init() {
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
            if (this.spritesIndex && this.spritesOffsetMap) {
                return true;
            }
            // Try absolute then relative paths
            const indexJson = await fetchJson([
                '/sprite-data/spritesIndex.json'
            ]);
            const offsetJson = await fetchJson([
                '/sprite-data/spritesOffsetMap.json'
            ]);

            if (!indexJson || !offsetJson) {
                console.warn('Could not load sprite indices, falling back to individual files');
                return false;
            }

            this.spritesIndex = indexJson;
            this.spritesOffsetMap = offsetJson;
            this.normalizedIndex = new Map(Object.keys(this.spritesIndex || {}).map(key => [key.toLowerCase(), key]));
            
            console.log(`Loaded sprite sheet index with ${Object.keys(this.spritesIndex).length} sprite groups`);
            return true;
        } catch (error) {
            console.error('Failed to initialize SpriteSheetLoader:', error);
            return false;
        }
    }
    
    /**
     * Load a sprite sheet if not already loaded
     * @param {string} sheetName - Name of the sprite sheet
     * @returns {Promise<HTMLImageElement|null>}
     */
    async loadSpriteSheet(sheetName) {
        // Check cache
        if (this.loadedSheets.has(sheetName)) {
            return this.loadedSheets.get(sheetName);
        }

        if (this.loadingSheets.has(sheetName)) {
            return this.loadingSheets.get(sheetName);
        }

        const tryPaths = [
            `${this.spriteSheetPath}${sheetName}.png`
        ];
        const loadPromise = (async () => {
            for (const src of tryPaths) {
                try {
                    const img = new Image();
                    const wait = new Promise((resolve, reject) => {
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                    });
                    img.src = src;
                    await wait;
                    this.loadedSheets.set(sheetName, img);
                    console.log(`Loaded sprite sheet: ${sheetName} (${src})`);
                    return img;
                } catch (err) {
                    // Try next path
                }
            }

            console.error(`Failed to load sprite sheet ${sheetName} from all paths`);
            return null;
        })();

        this.loadingSheets.set(sheetName, loadPromise);

        try {
            const img = await loadPromise;
            return img;
        } finally {
            this.loadingSheets.delete(sheetName);
        }
    }
    
    /**
     * Extract a sprite from a sprite sheet
     * @param {HTMLImageElement} sheet - The sprite sheet image
     * @param {string} spriteName - Name of the sprite group
     * @param {number} spriteNumber - Sprite number (0-20)
     * @returns {HTMLCanvasElement|OffscreenCanvas}
     */
    extractSprite(sheet, spriteName, spriteNumber) {
        const cacheKey = `${spriteName}_${spriteNumber}`;
        
        // Check cache
        if (this.extractedSprites.has(cacheKey)) {
            // Return a copy for DOM usage - create new canvas, don't use pool
            const cachedCanvas = this.extractedSprites.get(cacheKey);
            const canvas = typeof OffscreenCanvas !== 'undefined' 
                ? new OffscreenCanvas(50, 50)
                : document.createElement('canvas');
            canvas.width = 50;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(cachedCanvas, 0, 0);
            return canvas;
        }
        
        // Get sprite info
        const spriteInfo = this.spritesIndex[spriteName];
        if (!spriteInfo) {
            console.error(`Sprite group not found: ${spriteName}`);
            return null;
        }
        
        const offsetInfo = this.spritesOffsetMap[spriteNumber];
        if (!offsetInfo) {
            console.error(`Sprite number ${spriteNumber} not found in offset map`);
            return null;
        }
        
        // Calculate position in sprite sheet
        const x = spriteInfo.xOffset + (50 * offsetInfo.x);
        const y = spriteInfo.yOffset + (50 * offsetInfo.y);
        
        // Extract sprite - create new canvas, don't use pool
        const canvas = typeof OffscreenCanvas !== 'undefined' 
            ? new OffscreenCanvas(50, 50)
            : document.createElement('canvas');
        canvas.width = 50;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(
            sheet,
            x, y, 50, 50,  // Source rectangle
            0, 0, 50, 50   // Destination rectangle
        );
        
        // Cache the extracted sprite
        // Clone the canvas for caching
        const cachedCanvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(50, 50)
            : document.createElement('canvas');
        
        if (cachedCanvas.width !== 50) {
            cachedCanvas.width = 50;
            cachedCanvas.height = 50;
        }
        
        const cachedCtx = cachedCanvas.getContext('2d');
        cachedCtx.drawImage(canvas, 0, 0);
        
        this.extractedSprites.set(cacheKey, cachedCanvas);
        
        return canvas;
    }
    
    /**
     * Get a sprite by name and number
     * @param {string} spriteName - Name like "singleBLACK", "tabbyGINGER", etc.
     * @param {number} spriteNumber - Sprite number (0-20)
     * @returns {Promise<HTMLCanvasElement|OffscreenCanvas|null>}
     */
    async getSprite(spriteName, spriteNumber) {
        // Check if we have sprite indices
        if (!this.spritesIndex || !this.spritesOffsetMap) {
            console.error('Sprite indices not loaded');
            return null;
        }
        
        // Parse sprite name to find the correct group
        const groupName = this.findSpriteGroup(spriteName);
        if (!groupName) {
            this.missingGroups = this.missingGroups || new Set();
            if (!this.missingGroups.has(spriteName)) {
                console.warn(`Could not find sprite group for: ${spriteName}`);
                this.missingGroups.add(spriteName);
            }
            return null;
        }
        
        // Get sprite sheet info
        const spriteInfo = this.spritesIndex[groupName];
        if (!spriteInfo) {
            console.warn(`No sprite info for group: ${groupName}`);
            return null;
        }
        
        // Load the sprite sheet
        const sheet = await this.loadSpriteSheet(spriteInfo.spritesheet);
        if (!sheet) {
            console.error(`Failed to load sprite sheet for: ${spriteInfo.spritesheet}`);
            return null;
        }
        
        // Extract and return the sprite
        return this.extractSprite(sheet, groupName, spriteNumber);
    }
    
    /**
     * Find the sprite group name from a sprite name
     * @param {string} spriteName - e.g., "singleBLACK", "tabbyGINGER"
     * @returns {string|null} - The group name in spritesIndex
     */
    findSpriteGroup(spriteName) {
        // First, try exact match in spritesIndex (for accessories with spaces)
        if (this.spritesIndex && this.spritesIndex[spriteName]) {
            return spriteName;
        }
        
        // Direct mapping for common patterns
        const mappings = {
            'lines': 'lines',
            'shaders': 'shaders',
            'lighting': 'lighting',
            'lineartdead': 'lineartdead',
            'lineartdf': 'lineartdf',
            'skin': (name) => {
                if (name.includes('paralyzed')) return 'skinparalyzed';
                return 'skin';
            },
            'eyes': (name) => {
                if (name.startsWith('eyes2')) return 'eyes2';
                return 'eyes';
            },
            'single': (name) => {
                const color = name.replace('single', '');
                return `single${color.toLowerCase()}`;
            },
            'tabby': (name) => {
                const color = name.replace('tabby', '');
                return `tabby${color.toLowerCase()}`;
            },
            'tortie': (name) => {
                const pattern = name.replace('tortie', '');
                return `tortie${pattern.toLowerCase()}`;
            },
            'white': (name) => {
                const pattern = name.replace('white', '');
                return `white${pattern.toLowerCase()}`;
            },
            'scar': (name) => {
                // Map scar sprites - they're indexed as scarsNAME in uppercase
                const type = name.replace(/^scars?/, '');
                return `scars${type.toUpperCase()}`;
            },
            'scars': (name) => {
                // Handle plural form - sprites are indexed as scarsNAME
                const type = name.replace('scars', '');
                return `scars${type.toUpperCase()}`;
            },
            'acc_herbs': (name) => {
                // Handle plant accessories - preserve the exact name including spaces
                // e.g., "acc_herbsMAPLE LEAF" stays as "acc_herbsMAPLE LEAF" 
                return name;
            },
            'acc_wild': (name) => {
                // Handle wild accessories - preserve the exact name including spaces
                // e.g., "acc_wildGULL FEATHERS" stays as "acc_wildGULL FEATHERS"
                return name;
            },
            'collars': (name) => {
                // Handle collar accessories - preserve the exact name
                return name;
            }
        };
        
        // Try to find a matching pattern
        for (const [prefix, handler] of Object.entries(mappings)) {
            if (spriteName.startsWith(prefix)) {
                if (typeof handler === 'function') {
                    const result = handler(spriteName);
                    // Check if the result exists in spritesIndex
                    if (this.spritesIndex && this.spritesIndex[result]) {
                        return result;
                    }
                    // If function result doesn't exist, continue searching
                    continue;
                } else {
                    // Handler is a string, return it directly
                    return handler;
                }
            }
        }
        
        // Try lowercase as last resort
        const lower = spriteName.toLowerCase();
        if (this.spritesIndex && this.spritesIndex[lower]) {
            return lower;
        }

        if (this.normalizedIndex && this.normalizedIndex.has(lower)) {
            return this.normalizedIndex.get(lower);
        }

        return null;
    }
    
    // REMOVED: Individual sprite fallback - we ONLY use sprite sheets
    
    /**
     * Preload commonly used sprite sheets
     */
    async preloadCommonSheets() {
        if (this.commonSheetsPreloaded) {
            return;
        }

        const commonSheets = [
            'lineart', 'shadersnewwhite', 'lightingnew',
            'singlecolours', 'tabbycolours', 'eyes', 'skin'
        ];
        
        const promises = commonSheets.map(sheet => this.loadSpriteSheet(sheet));
        await Promise.all(promises);
        
        console.log(`Preloaded ${commonSheets.length} common sprite sheets`);
        this.commonSheetsPreloaded = true;
    }
    
    /**
     * Clear caches to free memory
     */
    clearCache() {
        this.extractedSprites.clear();
        // Don't clear loaded sheets - they're more expensive to reload
        console.log('Cleared extracted sprite cache');
    }
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            loadedSheets: this.loadedSheets.size,
            extractedSprites: this.extractedSprites.size
        };
    }
}

// Singleton instance
const spriteSheetLoader = new SpriteSheetLoader();

export default spriteSheetLoader;
export { SpriteSheetLoader };
