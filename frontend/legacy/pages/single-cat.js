// Single Cat Generator with Parameter-by-Parameter Sprite Generation

import catGenerator from '../core/catGeneratorV2.js';
import spriteMapper from '../core/spriteMapper.js';
import { encodeCatShare } from '../core/catShare.js';
import mapperApi from '../convex/mapper-api.js';

// Configuration constants
const CONFIG = {
    CANVAS: {
        DEFAULT_SIZE: 700,
        SPRITE_SIZE: 120,
        SPRITE_BIG_SIZE: 700
    },
    ANIMATION: {
        FLIP_CYCLES: 2,
        SLOWDOWN_STEPS: 5,
        MAX_VARIATIONS: 30  // Reasonable compromise between showing variety and keeping animation length manageable
    },
    TIMING: {
        DEBOUNCE_DELAY: 250,
        TOAST_DURATION: 2000,
        ERROR_DURATION: 3000,
        INIT_DELAY: 50
    }
};

class SingleCatGenerator {
    constructor() {
        this.flipContainer = document.getElementById('flipContainer');
        this.buildingCanvas = document.getElementById('buildingCanvas');
        this.generateButton = document.getElementById('generateButton');
        this.spritesSection = document.getElementById('spritesSection');
        this.spritesGrid = document.getElementById('spritesGrid');
        this.toast = document.getElementById('toast');
        this.valueSlot = document.getElementById('valueSlot');
        this.valueRoller = document.getElementById('valueRoller');
        this.catLinks = document.getElementById('catLinks');
        this.copyCatUrlBtn = document.getElementById('copyCatUrl');
        this.openShareViewerBtn = document.getElementById('openShareViewer');
        this.copyCatBigBtn = document.getElementById('copyCatBig');
        this.copyCatNoTintBtn = document.getElementById('copyCatNoTint');
        this.viewCatLink = document.getElementById('viewCatLink');
        this.openInBuilderLink = document.getElementById('openInBuilder');
        this.parameterTable = document.getElementById('parameterTable');
        this.darkForestSelect = document.getElementById('darkForestMode');
        this.deadSelect = document.getElementById('deadMode');
        this.speedGroup = document.getElementById('speedGroup');
        this.extendedPaletteControls = document.getElementById('extendedPaletteControls');
        this.extendedPaletteButtons = Array.from(document.querySelectorAll('[data-extended-mode]'));
        this.extendedPaletteReset = document.querySelector('[data-extended-reset]');
        this.selectedExtendedModes = new Set();
        this.includeBaseColours = true;
        this.isInitialized = false;
        // Multi-layer controls (Plus page only)
        this.accCountSelect = document.getElementById('accCount');
        this.scarCountSelect = document.getElementById('scarCount');
        this.tortieCountSelect = document.getElementById('tortieCount');
        this.rollSummary = document.getElementById('rollSummary');
        
        this.currentCatUrl = '';
        this.currentShareUrl = '';
        this.isGenerating = false;
        this.currentCatData = null;
        this.currentCatParams = null;
        this.forbiddenSprites = [0, 1, 2, 17, 19, 20];
        this.validSprites = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
        
        // Store bound handlers for cleanup
        this.boundHandlers = {
            resize: this.debounce(() => this.updateCanvasSize(), CONFIG.TIMING.DEBOUNCE_DELAY),
            generate: () => {
                if (!this.isGenerating) {
                    this.generate().catch(error => {
                        this.showError('Failed to generate cat. Please try again.');
                        console.error(error);
                    });
                }
            },
            copyCatUrl: () => this.copyCatUrlToClipboard(),
            openShareViewer: () => {
                this.openSharedViewer().catch(error => {
                    console.error('Failed to open shared viewer:', error);
                    this.showError('Unable to open shared viewer.');
                });
            },
            copyCatBig: () => this.copyFinalCatBig()
        };
        
        // Track all event listeners for cleanup
        this.listeners = [];
        
        // Dynamic canvas sizing with debounced resize
        this.updateCanvasSize();
        this.addListener(window, 'resize', this.boundHandlers.resize);

        // Initialize palette button states
        this.updateExtendedPaletteButtons();

        // Quick copy without tint: SHIFT + click canvas
        this.addListener(this.buildingCanvas, 'click', async (e) => {
            if (e.shiftKey) {
                try {
                    await this.copyFinalCatNoTint();
                } catch (err) {
                    console.error('Copy (no tint) failed:', err);
                    this.showError('Failed to copy (no tint).');
                }
            }
        });
        
        // Check URL for mode
        const urlParams = new URLSearchParams(window.location.search);
        this.mode = urlParams.get('mode') === 'calm' ? 'calm' : 'flashy';

        // Configuration for multi-accessory/tortie generation
        const cfg = window.singleCatConfig || {};
        this.accessoryRange = cfg.accessories || { min: 1, max: 1 };
        this.tortieRange = cfg.tortie || { min: 1, max: 1 };

        // Add mode class to body for CSS
        document.body.classList.add(`${this.mode}-mode`);
        
        // Update header text based on mode
        const headerText = document.querySelector('.building-header h2');
        if (this.mode === 'calm') {
            headerText.textContent = 'Creating Your Unique Cat';
        } else {
            headerText.textContent = 'Building Your Cat';
        }
        
        // Sprite names mapping
        this.spriteNames = {
            0: 'Kitten (0)',
            1: 'Kitten (1)',
            2: 'Kitten (2)',
            3: 'Adolescent (3)',
            4: 'Adolescent (4)', 
            5: 'Adolescent (5)',
            6: 'Adult (6)',
            7: 'Adult (7)',
            8: 'Adult (8)',
            9: 'Longhair Adult (9)',
            10: 'Longhair Adult (10)',
            11: 'Longhair Adult (11)',
            12: 'Senior (12)',
            13: 'Senior (13)',
            14: 'Senior (14)',
            15: 'Paralyzed Adult (15)',
            16: 'Paralyzed Longhair Adult (16)',
            17: 'Paralyzed Young (17)',
            18: 'Sick Adult (18)',
            19: 'Sick Young (19)',
            20: 'Newborn (20)'
        };
        
        // Complete list of parameters - sprite moved to end
        this.parameters = [
            { id: 'colour', name: 'Colour', type: 'select' },
            { id: 'pelt', name: 'Pelt', type: 'select' },
            { id: 'eyeColour', name: 'Eyes', type: 'select' },
            { id: 'eyeColour2', name: 'Eye Colour 2', type: 'select', optional: true },
            { id: 'tortie', name: 'Tortie?', type: 'checkbox' },
            { id: 'tortieMask', name: 'Tortie Mask', type: 'select', requiresTortie: true },
            { id: 'tortiePattern', name: 'Tortie Pelt', type: 'select', requiresTortie: true },
            { id: 'tortieColour', name: 'Tortie Colour', type: 'select', requiresTortie: true },
            { id: 'tint', name: 'Tint', type: 'select' },
            { id: 'skinColour', name: 'Skin', type: 'select' },
            { id: 'whitePatches', name: 'White Patches', type: 'select', optional: true },
            { id: 'points', name: 'Points', type: 'select', optional: true },
            { id: 'whitePatchesTint', name: 'White Patches Tint', type: 'select', optional: true },
            { id: 'vitiligo', name: 'Vitiligo', type: 'select', optional: true },
            { id: 'accessory', name: 'Accessory', type: 'select', optional: true },
            { id: 'scar', name: 'Scar', type: 'select', optional: true },
            { id: 'shading', name: 'Shading', type: 'checkbox' },
            { id: 'reverse', name: 'Reverse', type: 'checkbox' },
            { id: 'sprite', name: 'Sprite', type: 'select' }  // Moved to end
        ];
        
        // Get all possible parameter values for generation - loaded dynamically
        this.parameterOptions = null;  // Will be loaded asynchronously in init()
        
        // Speed settings (in milliseconds)
        this.speedSettings = {
            fast: {
                flipSpeed: 80,
                paramPause: 200,
                typeSpeed: 30,
                calmParamPause: 200
            },
            normal: {
                flipSpeed: 150,
                paramPause: 500,
                typeSpeed: 60,
                calmParamPause: 400
            },
            slow: {
                flipSpeed: 250,
                paramPause: 1000,
                typeSpeed: 100,
                calmParamPause: 800
            }
        };
        
        this.currentSpeed = this.speedGroup?.value || 'fast';
        this.whitePatchColourMode = 'default';
        this.updateExtendedPaletteButtons();

        // Set up cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
        
        // Initialize async - disable button until ready
        this.generateButton.disabled = true;
        this.generateButton.textContent = 'Initializing...';
        
        // Call init and handle completion
        this.init().then(() => {
            console.log('SingleCatGenerator initialized successfully');
            console.log('Parameter options available:', Object.keys(this.parameterOptions || {}));
        }).catch(error => {
            console.error('Failed to initialize SingleCatGenerator:', error);
            this.isInitialized = true;
            this.generateButton.textContent = 'Generate New Cat';
            this.updateGenerateButtonState();
        });
    }
    
    /**
     * Debounce utility to limit function calls
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Random integer helper within range (inclusive)
     */
    randomInRange(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * Add event listener and track for cleanup
     */
    addListener(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler);
        this.listeners.push({ element, event, handler });
    }
    
    /**
     * Clean up all event listeners and resources
     */
    cleanup() {
        // Remove all tracked event listeners
        this.listeners.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.listeners = [];
        
        // Clear any pending timeouts/animations
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
    }
    
    /**
     * Show error message to user
     */
    showError(message) {
        if (!this.toast) return;
        
        this.toast.textContent = message;
        this.toast.classList.add('show', 'error');
        
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
        
        this.toastTimeout = setTimeout(() => {
            this.toast.classList.remove('show', 'error');
        }, CONFIG.TIMING.ERROR_DURATION);
        
        console.error('[SingleCat Error]', message);
    }
    
    /**
     * Show success message to user
     */
    showToast(message) {
        if (!this.toast) return;
        
        this.toast.textContent = message;
        this.toast.classList.add('show');
        
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
        
        this.toastTimeout = setTimeout(() => {
            this.toast.classList.remove('show');
        }, CONFIG.TIMING.TOAST_DURATION);
    }
    
    /**
     * Sample array to limit size
     */
    sampleArray(array, maxItems) {
        // Handle edge cases
        if (!array || array.length === 0) return array;
        if (!maxItems || maxItems <= 0 || !isFinite(maxItems)) return array;
        if (array.length <= maxItems) return array;
        
        const step = Math.max(1, Math.floor(array.length / maxItems));
        const sampled = [];
        
        for (let i = 0; i < array.length && sampled.length < maxItems; i += step) {
            sampled.push(array[i]);
        }
        
        return sampled;
    }

    getSelectedColourModes() {
        return Array.from(this.selectedExtendedModes);
    }

    getExperimentalModeValue() {
        const modes = this.getSelectedColourModes();
        return modes.length === 0 ? 'off' : modes;
    }

    hasActivePalettes() {
        return this.includeBaseColours || this.selectedExtendedModes.size > 0;
    }

    updateGenerateButtonState() {
        if (!this.generateButton) return;
        if (!this.isInitialized) return;

        const paletteActive = this.hasActivePalettes();
        const shouldEnable = paletteActive && !this.isGenerating;
        this.generateButton.disabled = !shouldEnable;

        if (!paletteActive) {
            if (!this.isGenerating) {
                this.generateButton.textContent = 'Select a palette';
            }
        } else if (!this.isGenerating) {
            this.generateButton.textContent = 'Generate New Cat';
        }
    }

    getColourOptions(mode = this.getExperimentalModeValue()) {
        const experimental = typeof spriteMapper.getExperimentalColoursByMode === 'function'
            ? spriteMapper.getExperimentalColoursByMode(mode) || []
            : [];
        const base = this.includeBaseColours && typeof spriteMapper.getColours === 'function'
            ? spriteMapper.getColours()
            : [];
        const combined = new Set();
        for (const colour of base) {
            combined.add(colour);
        }
        for (const colour of experimental) {
            combined.add(colour);
        }
        return Array.from(combined);
    }

    getWhitePatchTintOptions(mode = this.whitePatchColourMode) {
        if (!spriteMapper.getWhitePatchColourOptions) {
            return ['none'];
        }

        const includeModes = this.getSelectedColourModes();
        const rawOptions = spriteMapper.getWhitePatchColourOptions(mode, includeModes) || ['none'];
        const seen = new Set();
        const ordered = [];

        for (const option of rawOptions) {
            if (!option) continue;
            if (option !== 'none' && !this.includeBaseColours && typeof spriteMapper.isBaseColour === 'function' && spriteMapper.isBaseColour(option)) {
                continue;
            }
            const key = String(option);
            if (seen.has(key)) continue;
            seen.add(key);
            ordered.push(option);
        }

        const withoutNone = ordered.filter(opt => opt !== 'none');
        return ['none', ...withoutNone];
    }

    updateExtendedPaletteButtons() {
        if (!this.extendedPaletteButtons) return;
        this.extendedPaletteButtons.forEach(btn => {
            const mode = btn.dataset.extendedMode;
            if (!mode) return;
            const isActive = mode === 'base' ? this.includeBaseColours : this.selectedExtendedModes.has(mode);
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    onExtendedPaletteChange() {
        this.updateExtendedPaletteButtons();
        if (this.parameterOptions) {
            const colourOptions = this.getColourOptions();
            this.parameterOptions.colour = colourOptions;
            this.parameterOptions.tortieColour = colourOptions;
            this.parameterOptions.whitePatchesTint = this.getWhitePatchTintOptions();
        }
        this.updateGenerateButtonState();
    }

    async getParameterOptions() {
        // CRITICAL: Ensure spriteMapper is fully initialized before getting options
        // This prevents empty arrays which cause animation to fail
        try {
            await spriteMapper.init();
        } catch (error) {
            console.warn('SpriteMapper init failed in getParameterOptions, using fallback data:', error);
        }
        
        // Get pelt names with fallback if empty
        const peltNames = spriteMapper.getPeltNames();
        const fallbackPelts = ['SingleColour', 'TwoColour', 'Tabby', 'Marbled', 'Rosette', 
                               'Smoke', 'Ticked', 'Speckled', 'Bengal', 'Mackerel', 
                               'Classic', 'Sokoke', 'Agouti', 'Singlestripe', 'Masked'];
        
        // Get tortie masks with fallback if empty
        const tortieMasks = spriteMapper.getTortieMasks();
        const fallbackMasks = ['ONE', 'TWO', 'THREE', 'FOUR', 'REDTAIL', 'DELILAH', 
                               'MINIMALONE', 'MINIMALTWO', 'MINIMALTHREE', 'MINIMALFOUR', 
                               'HALF', 'OREO', 'SWOOP', 'MOTTLED', 'SIDEMASK', 'EYEDOT', 
                               'BANDANA', 'PACMAN', 'STREAMSTRIKE', 'ORIOLE', 'CHIMERA'];
        
        // Load all values dynamically from spriteMapper with fallbacks
        return {
            sprite: this.validSprites,
            pelt: peltNames.length > 0 ? peltNames : fallbackPelts,
            colour: this.getColourOptions(),
            tortie: [true, false],
            tortieMask: tortieMasks.length > 0 ? tortieMasks : fallbackMasks,
            tortiePattern: peltNames.length > 0 ? peltNames : fallbackPelts,
            tortieColour: this.getColourOptions(),
            tint: ['none', ...spriteMapper.getTints()],
            eyeColour: spriteMapper.getEyeColours(),
            eyeColour2: [...spriteMapper.getEyeColours(), 'none'],
            skinColour: spriteMapper.getSkinColours(),
            whitePatches: ['none', ...spriteMapper.getWhitePatches()],
            points: ['none', ...spriteMapper.getPoints()],
            whitePatchesTint: this.getWhitePatchTintOptions(),
            vitiligo: ['none', ...spriteMapper.getVitiligo()],
            accessory: ['none', ...spriteMapper.getAccessories()],
            scar: ['none', ...spriteMapper.getScars()],
            shading: [true, false],
            reverse: [true, false]
        };
    }
    
    async init() {
        try {
            // Initialize sprite mapper (will return existing promise if already initializing)
            await spriteMapper.init();
            this.parameterOptions = await this.getParameterOptions();
            
            this.setupEventListeners();
            this.clearCanvas();
            this.isInitialized = true;
            this.generateButton.textContent = 'Generate New Cat';
            this.updateGenerateButtonState();
        } catch (error) {
            console.error('Failed to initialize SingleCatGenerator:', error);
            // Even if spriteMapper fails, try to continue with fallback data
            this.parameterOptions = await this.getParameterOptions();
            this.setupEventListeners();
            this.clearCanvas();
            this.isInitialized = true;
            this.generateButton.textContent = 'Generate New Cat';
            this.updateGenerateButtonState();
        }
    }
    
    updateCanvasSize() {
        const catDisplay = document.querySelector('.cat-display');
        if (catDisplay) {
            const size = catDisplay.offsetWidth;
            this.canvasSize = size;
            this.buildingCanvas.width = size;
            this.buildingCanvas.height = size;
        }
    }
    
    clearCanvas() {
        const ctx = this.buildingCanvas.getContext('2d');
        const size = this.canvasSize || 700;
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Click "Generate New Cat" to begin', size / 2, size / 2);
    }
    
    setupEventListeners() {
        // Use addListener for proper cleanup tracking
        this.addListener(this.generateButton, 'click', this.boundHandlers.generate);
        
        if (this.copyCatUrlBtn) {
            this.addListener(this.copyCatUrlBtn, 'click', this.boundHandlers.copyCatUrl);
        }

        if (this.openShareViewerBtn) {
            this.addListener(this.openShareViewerBtn, 'click', this.boundHandlers.openShareViewer);
        }
        
        if (this.copyCatBigBtn) {
            this.addListener(this.copyCatBigBtn, 'click', this.boundHandlers.copyCatBig);
        }
        if (this.copyCatNoTintBtn) {
            this.addListener(this.copyCatNoTintBtn, 'click', async () => {
                try { await this.copyFinalCatNoTint(); }
                catch (e) { console.error(e); this.showError('Failed to copy (no tint).'); }
            });
        }
        
        if (this.speedGroup) {
            this.addListener(this.speedGroup, 'sl-change', (e) => {
                this.currentSpeed = e.target.value;
            });
        }

        if (this.extendedPaletteButtons && this.extendedPaletteButtons.length) {
            this.extendedPaletteButtons.forEach(btn => {
                this.addListener(btn, 'click', () => {
                    const mode = btn.dataset.extendedMode;
                    if (!mode) return;
                    if (mode === 'base') {
                        this.includeBaseColours = !this.includeBaseColours;
                    } else if (this.selectedExtendedModes.has(mode)) {
                        this.selectedExtendedModes.delete(mode);
                    } else {
                        this.selectedExtendedModes.add(mode);
                    }
                    this.onExtendedPaletteChange();
                });
            });
        }

        if (this.extendedPaletteReset) {
            this.addListener(this.extendedPaletteReset, 'click', () => {
                this.includeBaseColours = true;
                this.selectedExtendedModes.clear();
                this.onExtendedPaletteChange();
            });
        }

    }
    
    async generate() {
        try {
            // CRITICAL FIX: Ensure parameterOptions is populated before animation
            if (!this.parameterOptions) {
                console.log('Parameter options not ready, initializing now...');
                this.parameterOptions = await this.getParameterOptions();
                console.log('Parameter options loaded:', this.parameterOptions);
            }
            
            if (!this.hasActivePalettes()) {
                this.showError('Select at least one colour palette before generating.');
                this.updateGenerateButtonState();
                return;
            }

            this.isGenerating = true;
            this.updateGenerateButtonState();
            this.currentShareUrl = '';
            this.generateButton.disabled = true;
            this.spritesSection.style.display = 'none';
            this.spritesGrid.innerHTML = '';
            this.catLinks.style.display = 'none';
            if (this.openShareViewerBtn) {
                this.openShareViewerBtn.disabled = true;
                delete this.openShareViewerBtn.dataset.url;
            }
            if (this.copyCatUrlBtn) {
                this.copyCatUrlBtn.disabled = true;
            }
            this.currentCatUrl = '';
            
            // Generate new random cat parameters
            const accCount = this.getSelectedLayerCount(this.accCountSelect, this.accessoryRange);
            const scarCount = this.getSelectedLayerCount(this.scarCountSelect, { min: 1, max: 4 });
            const tortieCount = this.getSelectedLayerCount(this.tortieCountSelect, this.tortieRange);
            // Remember the intended counts for table rendering
            this.usedAccessoryCount = accCount;
            this.usedScarCount = scarCount;
            this.usedTortieCount = tortieCount;

            const randomResult = await catGenerator.generateRandomCat({
                accessoryCount: accCount,
                tortieCount: tortieCount,
                experimentalColourMode: this.getExperimentalModeValue(),
                whitePatchColourMode: this.whitePatchColourMode,
                includeBaseColours: this.includeBaseColours
            });
            this.currentCatParams = randomResult.params;
            this.currentCatData = randomResult.canvas;

            // Decide Dark Forest (10% default when random)
            let darkModeVal = this.darkForestSelect ? this.darkForestSelect.value : 'random10';
            let enableDarkForest = false;
            if (darkModeVal === 'on') enableDarkForest = true;
            else if (darkModeVal === 'off') enableDarkForest = false;
            else {
                const p = darkModeVal === 'random25' ? 0.25 : 0.10; // support legacy 'random25'
                enableDarkForest = Math.random() < p;
            }
            this.currentCatParams.darkForest = enableDarkForest;
            this.currentCatParams.darkMode = enableDarkForest;

            // Dead lineart (10% default when random) - Dark Forest takes priority in lineart stage
            let deadModeVal = this.deadSelect ? this.deadSelect.value : 'off';
            let enableDead = false;
            if (deadModeVal === 'on') enableDead = true;
            else if (deadModeVal === 'off') enableDead = false;
            else enableDead = Math.random() < 0.10;
            this.currentCatParams.dead = enableDead;
            
            // Per-slot independent odds for accessories and tortie
            const accessoriesAll = (spriteMapper.getAccessories() || []).filter(a => typeof a === 'string' && a !== '');
            const scarsAll = (spriteMapper.getScars() || []).filter(s => typeof s === 'string' && s !== '');
            const tortieMasksAll = spriteMapper.getTortieMasks();
            const tortiePeltsAll = spriteMapper.getPeltNames();
            const coloursAll = this.getColourOptions();

            this.currentAccessorySlots = [];
            for (let i = 0; i < accCount; i++) {
                const include = Math.random() <= 0.5;
                if (include && accessoriesAll.length > 0) {
                    const pick = accessoriesAll[Math.floor(Math.random() * accessoriesAll.length)];
                    this.currentAccessorySlots.push(pick);
                } else {
                    this.currentAccessorySlots.push('none');
                }
            }
            this.currentCatParams.accessories = this.currentAccessorySlots.filter(v => v && v !== 'none');
            this.currentCatParams.accessory = this.currentCatParams.accessories[0] || undefined;

            // Roll scars per slot (independent 50% chance)
            this.currentScarSlots = [];
            for (let i = 0; i < scarCount; i++) {
                const include = Math.random() <= 0.5;
                if (include && scarsAll.length > 0) {
                    const pick = scarsAll[Math.floor(Math.random() * scarsAll.length)];
                    this.currentScarSlots.push(pick);
                } else {
                    this.currentScarSlots.push('none');
                }
            }
            this.currentCatParams.scars = this.currentScarSlots.filter(v => v && v !== 'none');
            this.currentCatParams.scar = this.currentCatParams.scars[0] || undefined;

            this.currentTortieSlots = [];
            for (let i = 0; i < tortieCount; i++) {
                const include = Math.random() <= 0.5;
                if (include) {
                    const mask = tortieMasksAll[Math.floor(Math.random() * tortieMasksAll.length)] || 'ONE';
                    const pattern = tortiePeltsAll[Math.floor(Math.random() * tortiePeltsAll.length)] || 'SingleColour';
                    const colour = coloursAll[Math.floor(Math.random() * coloursAll.length)] || 'GINGER';
                    this.currentTortieSlots.push({ mask, pattern, colour });
                } else {
                    this.currentTortieSlots.push(null);
                }
            }
            const pickedLayers = this.currentTortieSlots.filter(x => !!x);
            this.currentCatParams.tortie = pickedLayers;
            this.currentCatParams.isTortie = pickedLayers.length > 0;
            if (pickedLayers.length > 0) {
                this.currentCatParams.tortieMask = pickedLayers[0].mask;
                this.currentCatParams.tortiePattern = pickedLayers[0].pattern;
                this.currentCatParams.tortieColour = pickedLayers[0].colour;
            } else {
                this.currentCatParams.tortieMask = undefined;
                this.currentCatParams.tortiePattern = undefined;
                this.currentCatParams.tortieColour = undefined;
            }

            // Hide value slot for both modes initially
            this.valueSlot.style.display = 'none';
            
            // Clear parameter table
            this.parameterTable.innerHTML = '';
            this.parameterTable.classList.add('visible');
            
            // Add building glow
            document.querySelector('.building-glow').classList.add('active');
            
            // Progressive building for both modes
            await this.buildCatProgressively();
            
            // Remove building glow
            document.querySelector('.building-glow').classList.remove('active');
            
            // Generate all sprite variations
            await this.generateAllSprites();
            
            // Show cat URL buttons
            const shareUrl = await this.buildCatShareUrl();
            if (shareUrl) {
                this.currentShareUrl = shareUrl;
                if (this.openShareViewerBtn) {
                    this.openShareViewerBtn.disabled = false;
                    this.openShareViewerBtn.dataset.url = shareUrl;
                }
            } else if (this.openShareViewerBtn) {
                this.openShareViewerBtn.disabled = true;
                delete this.openShareViewerBtn.dataset.url;
            }

            const catUrl = catGenerator.buildCatURL(this.currentCatParams);
            this.currentCatUrl = catUrl;
            if (this.viewCatLink) {
                this.viewCatLink.href = catUrl;
            }
            if (this.copyCatUrlBtn) {
                this.copyCatUrlBtn.disabled = false;
            }

            // Build Visual Builder URL
            const builderUrl = this.buildVisualBuilderURL(this.currentCatParams);
            this.openInBuilderLink.href = builderUrl;
            
            this.catLinks.style.display = 'flex';
            // Show 'Copy (No Tint)' only when Dark Forest (tint) or Star Clan (dead) is active
            if (this.copyCatNoTintBtn) {
                const hasTint = !!(this.currentCatParams.darkForest || this.currentCatParams.darkMode);
                const isStarClan = !!this.currentCatParams.dead;
                this.copyCatNoTintBtn.style.display = (hasTint || isStarClan) ? 'inline-flex' : 'none';
            }

            // Update rolled summary (actual results)
            this.updateRollSummary();
            
            this.isGenerating = false;
            this.updateGenerateButtonState();
        } catch (error) {
            console.error('Error generating cat:', error);
            this.showError('Failed to generate cat. Please try again.');
            document.querySelector('.building-glow')?.classList.remove('active');
            this.isGenerating = false;
            this.updateGenerateButtonState();
        }
    }

    getSelectedLayerCount(selectEl, range) {
        // If no control on this page, fall back to random in range
        if (!selectEl) {
            return this.randomInRange(range.min, range.max);
        }
        const val = selectEl.value;
        if (!val || val.startsWith('random')) {
            let min = range.min;
            let max = range.max;
            if (val === 'random12') { min = 1; max = 2; }
            else if (val === 'random13') { min = 1; max = 3; }
            else if (val === 'random14') { min = 1; max = 4; }
            else if (val === 'random24') { min = 2; max = 4; }
            return this.randomInRange(min, max);
        }
        const parsed = parseInt(val, 10);
        if (Number.isFinite(parsed)) return parsed;
        return this.randomInRange(range.min, range.max);
    }

    setRowValue(paramId, text) {
        const valueEl = this.parameterTable?.querySelector(`.parameter-row[data-param="${paramId}"] .param-value`);
        if (valueEl) valueEl.textContent = text;
    }
    
    hideRow(paramId) {
        const rowEl = this.parameterTable?.querySelector(`.parameter-row[data-param="${paramId}"]`);
        if (rowEl) rowEl.style.display = 'none';
    }

    renderLayeredDetails() {
        if (!this.parameterTable || !this.currentCatParams) return;

        // Accessories list (always show slots based on intended count)
        const accs = Array.isArray(this.currentAccessorySlots) ? this.currentAccessorySlots : [];
        const accSlots = Math.max(0, Number(this.usedAccessoryCount || 0));
        // Remove the compact "Accessory" row in favor of per-slot rows
        this.hideRow('accessory');
        for (let i = 0; i < accSlots; i++) {
            const a = accs[i] || 'none';
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.innerHTML = `
                <span class="param-name">Accessory ${i + 1}</span>
                <span class="param-value">${this.formatValue(a)}</span>
            `;
            this.parameterTable.appendChild(row);
        }

        // Scars layered details
        const scars = Array.isArray(this.currentScarSlots) ? this.currentScarSlots : [];
        const sSlots = Math.max(0, Number(this.usedScarCount || 0));
        // Hide compact scar row and show per-slot rows
        this.hideRow('scar');
        for (let i = 0; i < sSlots; i++) {
            const s = scars[i] || 'none';
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.innerHTML = `
                <span class="param-name">Scar ${i + 1}</span>
                <span class="param-value">${this.formatValue(s)}</span>
            `;
            this.parameterTable.appendChild(row);
        }

        // Tortie layered details
        const torties = Array.isArray(this.currentTortieSlots) ? this.currentTortieSlots : [];
        const tSlots = Math.max(0, Number(this.usedTortieCount || 0));
        // Remove compact tortie rows and use per-layer rows instead
        this.hideRow('tortie');
        this.hideRow('tortieMask');
        this.hideRow('tortiePattern');
        this.hideRow('tortieColour');
        for (let i = 0; i < tSlots; i++) {
            const t = torties[i];
            const text = t
                ? `${this.formatValue(t.mask)} • ${this.formatValue(t.pattern)} • ${this.formatValue(t.colour)}`
                : 'None';
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.innerHTML = `
                <span class="param-name">Tortie ${i + 1}</span>
                <span class="param-value">${text}</span>
            `;
            this.parameterTable.appendChild(row);
        }
    }

    async animateLayeredSlots(progressiveParams) {
        // Replace compact rows with per-slot rows
        this.renderLayeredDetails();

        // Animate Accessory slots
        await this.animateAccessorySlots(progressiveParams);

        // Animate Scar slots
        await this.animateScarSlots(progressiveParams);

        // Animate Tortie slots (mask-focused spin for visual effect)
        await this.animateTortieSlots(progressiveParams);
    }

    async animateScarSlots(progressiveParams) {
        const total = Math.max(0, Number(this.usedScarCount || 0));
        const targetScars = Array.isArray(this.currentScarSlots)
            ? this.currentScarSlots
            : [];

        const allScars = (spriteMapper.getScars() || []).filter(s => typeof s === 'string' && s !== '');

        for (let i = 0; i < total; i++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'parameter-row';
            rowEl.innerHTML = `
                <span class="param-name">Scar ${i + 1}</span>
                <span class="param-value">&nbsp;</span>
            `;
            this.parameterTable.appendChild(rowEl);

            const target = targetScars[i] || 'none';
            let options = this.sampleArray(allScars, CONFIG.ANIMATION.MAX_VARIATIONS);
            if (!options.includes(target)) options[options.length - 1] = target;
            if (!options.includes('none')) options[0] = 'none';

            const variations = [];
            for (const opt of options) {
                const test = { ...progressiveParams };
                // Carry previously decided slots visually
                const scarsSoFar = targetScars.slice(0, i).filter(x => typeof x === 'string' && x !== '' && x !== 'none');
                test.scars = [...scarsSoFar];
                if (typeof opt === 'string' && opt !== 'none' && opt !== '') test.scars.push(opt);
                const res = await catGenerator.generateCat(test);
                variations.push({ canvas: res.canvas, value: opt, isTarget: opt === target });
            }

            await this.animateFlipThroughVariations(variations, progressiveParams, { id: `scar-${i+1}` }, target);

            // Update progressive to hold real target for next slots
            if (!Array.isArray(progressiveParams.scars)) progressiveParams.scars = [];
            if (typeof target === 'string' && target !== 'none' && target !== '') progressiveParams.scars.push(target);

            // Set final text
            rowEl.querySelector('.param-value').textContent = this.formatValue(target);
        }
    }

    async animateAccessorySlots(progressiveParams) {
        const total = Math.max(0, Number(this.usedAccessoryCount || 0));
        const targetAccs = Array.isArray(this.currentAccessorySlots)
            ? this.currentAccessorySlots
            : [];

        const allAcc = (spriteMapper.getAccessories() || []).filter(a => typeof a === 'string' && a !== '');

        for (let i = 0; i < total; i++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'parameter-row';
            rowEl.innerHTML = `
                <span class="param-name">Accessory ${i + 1}</span>
                <span class="param-value">&nbsp;</span>
            `;
            this.parameterTable.appendChild(rowEl);

            const target = targetAccs[i] || 'none';
            // Build option list (sampled)
            let options = this.sampleArray(allAcc, CONFIG.ANIMATION.MAX_VARIATIONS);
            if (!options.includes(target)) options[options.length - 1] = target;
            if (!options.includes('none')) options[0] = 'none';

            // Build variations by rendering with different option in slot i
            const variations = [];
            for (const opt of options) {
                const test = { ...progressiveParams };
                // Carry previously decided slots visually
                const accsSoFar = targetAccs.slice(0, i).filter(x => typeof x === 'string' && x !== '' && x !== 'none');
                test.accessories = [...accsSoFar];
                if (typeof opt === 'string' && opt !== 'none' && opt !== '') test.accessories.push(opt);
                const res = await catGenerator.generateCat(test);
                variations.push({ canvas: res.canvas, value: opt, isTarget: opt === target });
            }

            // Animate the flip sequence on canvas to land on target
            await this.animateFlipThroughVariations(variations, progressiveParams, { id: `accessory-${i+1}` }, target);

            // Update progressive to hold real target for next slots
            if (!Array.isArray(progressiveParams.accessories)) progressiveParams.accessories = [];
            if (typeof target === 'string' && target !== 'none' && target !== '') progressiveParams.accessories.push(target);

            // Set final text
            rowEl.querySelector('.param-value').textContent = this.formatValue(target);
        }
    }

    async animateTortieSlots(progressiveParams) {
        const total = Math.max(0, Number(this.usedTortieCount || 0));
        const targetLayers = Array.isArray(this.currentCatParams.tortie)
            ? this.currentCatParams.tortie
            : [];

        const allMasks = spriteMapper.getTortieMasks();
        const allPelts = spriteMapper.getPeltNames();
        const allColours = this.getColourOptions();

        for (let i = 0; i < total; i++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'parameter-row';
            rowEl.innerHTML = `
                <span class="param-name">Tortie ${i + 1}</span>
                <span class="param-value">&nbsp;</span>
            `;
            this.parameterTable.appendChild(rowEl);

            const t = targetLayers[i];
            const targetMask = t?.mask || 'none';
            const targetPattern = t?.pattern || 'SingleColour';
            const targetColour = t?.colour || 'GINGER';

            // Sequential roll: mask -> pattern -> colour
            // Mask
            let maskOptions = this.sampleArray(allMasks, CONFIG.ANIMATION.MAX_VARIATIONS);
            if (!maskOptions.includes(targetMask)) maskOptions[maskOptions.length - 1] = targetMask;
            if (!maskOptions.includes('none')) maskOptions[0] = 'none';
            let variations = [];
            for (const m of maskOptions) {
                const test = { ...progressiveParams };
                const layersSoFar = targetLayers.slice(0, i).map(x => x ? ({...x}) : null).filter(Boolean);
                // Neutral preview for mask stage (don't reveal pattern/colour)
                const cand = (m === 'none') ? null : { mask: m, pattern: 'SingleColour', colour: 'BLACK' };
                test.tortie = [...layersSoFar];
                if (cand) test.tortie.push(cand);
                test.isTortie = test.tortie.length > 0;
                const res = await catGenerator.generateCat(test);
                variations.push({ canvas: res.canvas, value: m, isTarget: m === targetMask });
            }
            await this.animateFlipThroughVariations(variations, progressiveParams, { id: `tortie-${i+1}-mask` }, targetMask);
            if (targetMask === 'none') {
                rowEl.querySelector('.param-value').textContent = 'None';
                continue;
            } else {
                rowEl.querySelector('.param-value').textContent = `${this.formatValue(targetMask)}`;
            }

            // Pattern
            let patternOptions = this.sampleArray(allPelts, CONFIG.ANIMATION.MAX_VARIATIONS);
            if (!patternOptions.includes(targetPattern)) patternOptions[patternOptions.length - 1] = targetPattern;
            variations = [];
            for (const p of patternOptions) {
                const test = { ...progressiveParams };
                const layersSoFar = targetLayers.slice(0, i).map(x => x ? ({...x}) : null).filter(Boolean);
                // Keep colour neutral until final colour step
                const cand = { mask: targetMask, pattern: p, colour: 'BLACK' };
                test.tortie = [...layersSoFar, cand];
                test.isTortie = true;
                const res = await catGenerator.generateCat(test);
                variations.push({ canvas: res.canvas, value: p, isTarget: p === targetPattern });
            }
            await this.animateFlipThroughVariations(variations, progressiveParams, { id: `tortie-${i+1}-pattern` }, targetPattern);
            rowEl.querySelector('.param-value').textContent = `${this.formatValue(targetMask)} • ${this.formatValue(targetPattern)}`;

            // Colour
            let colourOptions = this.sampleArray(allColours, CONFIG.ANIMATION.MAX_VARIATIONS);
            if (!colourOptions.includes(targetColour)) colourOptions[colourOptions.length - 1] = targetColour;
            variations = [];
            for (const c of colourOptions) {
                const test = { ...progressiveParams };
                const layersSoFar = targetLayers.slice(0, i).map(x => x ? ({...x}) : null).filter(Boolean);
                const cand = { mask: targetMask, pattern: targetPattern, colour: c };
                test.tortie = [...layersSoFar, cand];
                test.isTortie = true;
                const res = await catGenerator.generateCat(test);
                variations.push({ canvas: res.canvas, value: c, isTarget: c === targetColour });
            }
            await this.animateFlipThroughVariations(variations, progressiveParams, { id: `tortie-${i+1}-colour` }, targetColour);
            rowEl.querySelector('.param-value').textContent = `${this.formatValue(targetMask)} • ${this.formatValue(targetPattern)} • ${this.formatValue(targetColour)}`;
            // Commit final layer to progressive params for subsequent steps
            if (!Array.isArray(progressiveParams.tortie)) progressiveParams.tortie = [];
            const prev = targetLayers.slice(0, i).map(x => x ? ({...x}) : null).filter(Boolean);
            progressiveParams.tortie = [...prev, { mask: targetMask, pattern: targetPattern, colour: targetColour }];
            progressiveParams.isTortie = true;
        }
    }

    updateRollSummary() {
        if (!this.rollSummary) return;
        const accCount = Array.isArray(this.currentAccessorySlots)
            ? this.currentAccessorySlots.filter(v => v && v !== 'none').length
            : 0;
        const scarCount = Array.isArray(this.currentScarSlots)
            ? this.currentScarSlots.filter(v => v && v !== 'none').length
            : 0;
        const tortieCount = Array.isArray(this.currentTortieSlots)
            ? this.currentTortieSlots.filter(v => !!v).length
            : 0;
        this.rollSummary.textContent = `Rolled → Accessories: ${accCount} • Scars: ${scarCount} • Tortie layers: ${tortieCount}`;
    }
    
    async buildCatProgressively() {
        const progressiveParams = {};
        // Propagate Dark Forest/darkMode through progressive renders
        if (this.currentCatParams && (this.currentCatParams.darkForest || this.currentCatParams.darkMode)) {
            progressiveParams.darkForest = !!(this.currentCatParams.darkForest || this.currentCatParams.darkMode);
            progressiveParams.darkMode = progressiveParams.darkForest;
        }
        if (this.currentCatParams && this.currentCatParams.dead) {
            progressiveParams.dead = true;
        }
        
        // Start with Adult (8) as base sprite
        progressiveParams.spriteNumber = 8;
        progressiveParams.shading = false;
        progressiveParams.reverse = false;
        progressiveParams.isTortie = false;
        
        // Start with SingleColour as default pelt so colour will be visible when rolled
        progressiveParams.peltName = 'SingleColour';
        
        // Build cat parameter by parameter
        for (const param of this.parameters) {
            // Custom handling: multi-layer features rolled at their place
            if (param.id === 'accessory') {
                await this.rollAccessoriesDuringProgressive(progressiveParams);
                continue;
            }
            if (param.id === 'scar') {
                await this.rollScarsDuringProgressive(progressiveParams);
                continue;
            }
            if (param.id === 'tortie') {
                await this.rollTortieDuringProgressive(progressiveParams);
                continue;
            }
            if (param.id === 'tortieMask' || param.id === 'tortiePattern' || param.id === 'tortieColour') {
                // We present per-layer rows instead; skip single fields
                continue;
            }
            // Skip tortie parameters entirely if tortie is disabled (don't show at all)
            if (param.requiresTortie && !this.currentCatParams.isTortie) {
                continue;
            }
            
            // Skip hidden parameters
            if (param.hidden) {
                continue;
            }
            
            // Get the target value
            const targetValue = this.getParameterValueForDisplay(param.id, this.currentCatParams);
            
            // Special handling for eyes - combine both colors
            let formattedValue;
            if (param.id === 'eyeColour') {
                const eyeColour2 = this.currentCatParams.eyeColour2;
                if (eyeColour2 && eyeColour2 !== 'none' && eyeColour2 !== targetValue) {
                    // Display both eye colors
                    formattedValue = `${this.formatValue(targetValue)} / ${this.formatValue(eyeColour2)}`;
                } else {
                    // Single eye color
                    formattedValue = this.formatParameterValue(param, targetValue);
                }
            } else {
                // Add parameter row to table
                formattedValue = this.formatParameterValue(param, targetValue);
            }
            
            // In calm mode, skip displaying "None" values entirely
            if (this.mode === 'calm' && formattedValue === 'None') {
                // Still need to update the params though
                if (param.id !== 'sprite') {
                    this.updateProgressiveParams(progressiveParams, param, targetValue);
                }
                continue;
            }
            
            // Skip if there's no value to display (but continue for "none" values on optional params in flashy mode)
            if (!formattedValue && formattedValue !== 'None') continue;
            
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.setAttribute('data-param', param.id);
            row.innerHTML = `
                <span class="param-name">${param.name}</span>
                <span class="param-value" data-text="${formattedValue}"></span>
            `;
            this.parameterTable.appendChild(row);
            
            // Highlight current row
            row.classList.add('active');
            
            // Check if we should animate this parameter
            const shouldAnimate = param.id !== 'shading' && param.id !== 'reverse' && param.id !== 'tortie' && param.id !== 'whitePatchesTint';
            
            if (shouldAnimate) {
                // Get all possible variations for this parameter
                const variations = await this.generateParameterVariations(progressiveParams, param, targetValue);
                
                if (this.mode === 'flashy') {
                    // Show flip animation through variations - this will land on the target
                    await this.animateFlipThroughVariations(variations, progressiveParams, param, targetValue);
                    
                    // Show the value in the table after flips
                    const valueSpan = row.querySelector('.param-value');
                    valueSpan.textContent = formattedValue;
                    
                    // Update progressive params AFTER showing the animation
                    if (param.id !== 'sprite') {
                        this.updateProgressiveParams(progressiveParams, param, targetValue);
                    }
                    
                    // IMPORTANT: After animation, ensure the canvas shows the correct state
                    // with the new parameter applied to the progressive params
                    const updatedResult = await catGenerator.generateCat(progressiveParams);
                    const ctx = this.buildingCanvas.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    const size = this.canvasSize || 700;
                    ctx.clearRect(0, 0, size, size);
                    ctx.drawImage(updatedResult.canvas, 0, 0, size, size);
                } else {
                    // Calm mode - typewriter effect
                    const valueSpan = row.querySelector('.param-value');
                    await this.typewriterEffect(valueSpan, formattedValue);
                    
                    // Update cat display with each new parameter
                    await this.updateCatDisplay(progressiveParams, param, targetValue);
                    
                    // Update progressive params after display
                    if (param.id !== 'sprite') {
                        this.updateProgressiveParams(progressiveParams, param, targetValue);
                    }
                }
            } else {
                // For shading, reverse, tortie, and whitePatchesTint - just display instantly
                const valueSpan = row.querySelector('.param-value');
                valueSpan.textContent = formattedValue;
                
                // Update the cat immediately
                if (param.id !== 'sprite') {
                    this.updateProgressiveParams(progressiveParams, param, targetValue);
                }
                
                // Redraw the cat with the new parameter
                const result = await catGenerator.generateCat(progressiveParams);
                const ctx = this.buildingCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                const size = this.canvasSize || 700;
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(result.canvas, 0, 0, size, size);
            }
            
            // Remove highlight
            row.classList.remove('active');
            
            // Small pause between parameters based on speed
            const speed = this.speedSettings[this.currentSpeed];
            await this.wait(this.mode === 'calm' ? speed.calmParamPause : speed.paramPause);
        }
        
        // Now update the sprite at the very end
        progressiveParams.spriteNumber = this.currentCatParams.spriteNumber;
        
        // Generate and display final cat with correct sprite
        const finalResult = await catGenerator.generateCat(progressiveParams);
        this.currentCatData = finalResult.canvas;
        
        const ctx = this.buildingCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const size = this.canvasSize || 700;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(this.currentCatData, 0, 0, size, size);

        // IMPORTANT: Persist the final rolled params so subsequent views (e.g., sprite grid, copy URL)
        // reflect the visible result, including multi-layer tortie.
        this.currentCatParams = { ...this.currentCatParams, ...progressiveParams };
    }

    async rollAccessoriesDuringProgressive(progressiveParams) {
        const total = Math.max(0, Number(this.usedAccessoryCount || 0));
        const targetAccs = Array.isArray(this.currentAccessorySlots) ? this.currentAccessorySlots : [];
        const allAcc = (spriteMapper.getAccessories() || []).filter(a => typeof a === 'string' && a !== '');

        for (let i = 0; i < total; i++) {
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.setAttribute('data-param', `accessory-${i+1}`);
            row.innerHTML = `
                <span class="param-name">Accessory ${i + 1}</span>
                <span class="param-value"></span>
            `;
            this.parameterTable.appendChild(row);

            const target = targetAccs[i] || 'none';
            let options = this.sampleArray(allAcc, CONFIG.ANIMATION.MAX_VARIATIONS);
            if (!options.includes(target)) options[options.length - 1] = target;
            if (!options.includes('none')) options[0] = 'none';

            const variations = [];
            for (const opt of options) {
                const test = { ...progressiveParams };
                const base = targetAccs.slice(0, i).filter(x => typeof x === 'string' && x !== '' && x !== 'none');
                test.accessories = [...base];
                if (typeof opt === 'string' && opt !== 'none' && opt !== '') {
                    test.accessories.push(opt);
                }
                const res = await catGenerator.generateCat(test);
                variations.push({ canvas: res.canvas, value: opt, isTarget: opt === target });
            }

            await this.animateFlipThroughVariations(variations, progressiveParams, { id: `accessory-${i+1}` }, target);

            if (!Array.isArray(progressiveParams.accessories)) progressiveParams.accessories = [];
            if (typeof target === 'string' && target !== 'none' && target !== '') {
                progressiveParams.accessories.push(target);
            }
            row.querySelector('.param-value').textContent = this.formatValue(target);
        }
    }

    async rollTortieDuringProgressive(progressiveParams) {
        // Use sequential mask -> pattern -> colour spinner per slot
        await this.animateTortieSlots(progressiveParams);
    }

    async rollScarsDuringProgressive(progressiveParams) {
        // Replace compact scar row with per-slot rows and animate each slot
        // Ensure any existing compact 'scar' row is hidden
        this.hideRow('scar');
        await this.animateScarSlots(progressiveParams);
    }
    
    async generateParameterVariations(currentParams, param, targetValue) {
        // Get possible values for this parameter - limit for performance
        let options = [];
        
        switch(param.id) {
            case 'tortie':
            case 'shading':
            case 'reverse':
                // These are not animated - just show current value
                options = [targetValue];
                break;
            default:
                // For other parameters, limit options for performance
                if (this.parameterOptions[param.id]) {
                    const allOptions = [...this.parameterOptions[param.id]];
                    
                    // Limit to MAX_VARIATIONS for performance
                    options = this.sampleArray(allOptions, CONFIG.ANIMATION.MAX_VARIATIONS);
                    // Ensure target value is included
                    if (!options.includes(targetValue)) {
                        options[options.length - 1] = targetValue; // Replace last with target
                    }
                } else {
                    console.warn(`No options found for parameter ${param.id}, using target value only`);
                    options = [targetValue];
                }
        }
        
        // Use current params directly - we already have SingleColour as default pelt
        // and colour will be set before pelt is rolled
        let previewParams = { ...currentParams };
        
        // CRITICAL FIX: For tortieMask to be visible, we need tortieColour and tortiePattern
        // Without these, the mask has no contrasting color to display
        if (param.id === 'tortieMask') {
            // Ensure we have tortie colors for visibility
            if (!previewParams.tortieColour || previewParams.tortieColour === 'none') {
                // Use a contrasting color - GINGER is typically a good default
                previewParams.tortieColour = this.currentCatParams.tortieColour || 'GINGER';
            }
            if (!previewParams.tortiePattern || previewParams.tortiePattern === 'none') {
                // Use a pattern for the tortie overlay
                previewParams.tortiePattern = this.currentCatParams.tortiePattern || 'Tabby';
            }
            // Ensure tortie is enabled for mask to show
            previewParams.isTortie = true;
        }
        
        // Map parameter ID to actual cat parameter name
        const actualParamName = this.getActualParameterName(param.id);
        
        // Use the new catGenerator method to generate all variations efficiently with shuffle
        const variations = await catGenerator.generateAllVariationsForParameter(
            previewParams,  // Use preview params with defaults
            actualParamName, 
            options,
            true  // Enable shuffle for random order
        );
        
        // Mark the target variation
        variations.forEach(v => {
            v.isTarget = v.value === targetValue;
        });
        
        return variations;
    }
    
    async animateFlipThroughVariations(variations, currentParams, param, targetValue) {
        const ctx = this.buildingCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        // Get current speed settings
        const speed = this.speedSettings[this.currentSpeed];
        
        // Find target variation
        const targetVariation = variations.find(v => v.isTarget);
        const allVariations = [...variations]; // All variations in shuffled order
        
        // Create a sequence that goes through all options 2 times then slows down to target
        const flipSequence = [];
        
        if (allVariations.length > 0) {
            // Go through all variations 2 times at full speed (already shuffled)
            for (let cycle = 0; cycle < 2; cycle++) {
                for (const variation of allVariations) {
                    flipSequence.push({ variation, delay: speed.flipSpeed });
                }
            }
            
            // Add some random variations while slowing down
            for (let i = 0; i < 5; i++) {
                const randomVar = allVariations[Math.floor(Math.random() * allVariations.length)];
                flipSequence.push({ 
                    variation: randomVar, 
                    delay: speed.flipSpeed * (1 + i * 0.3) // Gradually slow down
                });
            }
            
            // ALWAYS add the target as the final flip to ensure we land on it
            if (targetVariation) {
                flipSequence.push({ 
                    variation: targetVariation, 
                    delay: speed.flipSpeed * 2 // Final landing
                });
            }
            
            // Execute the flip sequence
            for (const { variation, delay } of flipSequence) {
                // Add flip class
                this.flipContainer.classList.add('flipping');
                
                // Draw variation
                const size = this.canvasSize || 700;
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(variation.canvas, 0, 0, size, size);
                
                await this.wait(delay);
                
                // Remove flip class
                this.flipContainer.classList.remove('flipping');
            }
            
            // Make sure we end on the target
            if (targetVariation) {
                const size = this.canvasSize || 700;
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(targetVariation.canvas, 0, 0, size, size);
            }
        } else if (targetVariation) {
            // If no other variations, just show the target
            const size = this.canvasSize || 700;
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(targetVariation.canvas, 0, 0, size, size);
        }
        
        // No need to redraw - we already landed on the target variation
    }
    
    async updateCatDisplay(currentParams, param, value) {
        const testParams = { ...currentParams };
        
        if (param.id === 'sprite') {
            testParams.spriteNumber = value;
        } else {
            this.updateProgressiveParams(testParams, param, value);
        }
        
        const result = await catGenerator.generateCat(testParams);
        
        const ctx = this.buildingCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        // Gentle fade transition
        const size = this.canvasSize || 700;
        for (let opacity = 0.5; opacity <= 1; opacity += 0.1) {
            ctx.clearRect(0, 0, size, size);
            ctx.globalAlpha = opacity;
            ctx.drawImage(result.canvas, 0, 0, size, size);
            await this.wait(30);
        }
        
        ctx.globalAlpha = 1;
    }
    
    updateProgressiveParams(params, param, value) {
        switch(param.id) {
            case 'sprite':
                params.spriteNumber = value;
                break;
            case 'pelt':
                params.peltName = value;
                break;
            case 'colour':
                params.colour = value;
                break;
            case 'tortie':
                params.isTortie = value;
                break;
            case 'tortieMask':
                params.tortieMask = value;
                break;
            case 'tortiePattern':
                params.tortiePattern = value;
                break;
            case 'tortieColour':
                params.tortieColour = value;
                break;
            case 'tint':
                params.tint = value;
                break;
            case 'eyeColour':
                params.eyeColour = value;
                break;
            case 'eyeColour2':
                params.eyeColour2 = value;
                break;
            case 'skinColour':
                params.skinColour = value;
                break;
            case 'whitePatches':
                params.whitePatches = value;
                break;
            case 'points':
                params.points = value;
                break;
            case 'whitePatchesTint':
                params.whitePatchesTint = value;
                break;
            case 'vitiligo':
                params.vitiligo = value;
                break;
            case 'accessory':
                params.accessory = value;
                break;
            case 'scar':
                params.scar = value;
                break;
            case 'shading':
                params.shading = value;
                break;
            case 'reverse':
                params.reverse = value;
                break;
        }
    }
    
    buildVisualBuilderURL(params) {
        const urlParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== 'none' && value !== false && value !== '') {
                urlParams.set(key, value);
            }
        });
        return `cat-builder.html?${urlParams.toString()}`;
    }
    
    formatParameterValue(param, value) {
        // For optional parameters, display "None" when value is none/undefined/null
        if (value === '' || value === 'none' || value === undefined || value === null) {
            // Only return "None" for optional parameters that should show it
            if (param.optional || param.id === 'eyeColour2' || param.id === 'tint') {
                return 'None';
            }
            return '';
        } else if (param.id === 'sprite' && this.spriteNames[value]) {
            return this.spriteNames[value];
        } else if (param.type === 'checkbox') {
            return value ? 'Yes' : 'No';
        } else {
            return this.formatValue(value);
        }
    }
    
    async typewriterEffect(element, text) {
        element.innerHTML = '<span class="typewriter-text"></span><span class="typewriter-cursor"></span>';
        const textSpan = element.querySelector('.typewriter-text');
        const cursor = element.querySelector('.typewriter-cursor');
        
        // Get current speed settings
        const speed = this.speedSettings[this.currentSpeed];
        
        // Type out the text at the configured speed
        for (let i = 0; i <= text.length; i++) {
            textSpan.textContent = text.substring(0, i);
            await this.wait(speed.typeSpeed);
        }
        
        // Remove cursor after typing
        await this.wait(200);
        cursor.remove();
    }
    
    getParameterValueForDisplay(paramId, params) {
        switch(paramId) {
            case 'sprite': return params.spriteNumber;
            case 'pelt': return params.peltName;
            case 'colour': return params.colour;
            case 'tortie': return params.isTortie;
            case 'tortieMask': return params.tortieMask;
            case 'tortiePattern': return params.tortiePattern;
            case 'tortieColour': return params.tortieColour;
            case 'tint': return params.tint;
            case 'eyeColour': return params.eyeColour;
            case 'eyeColour2': return params.eyeColour2;
            case 'skinColour': return params.skinColour;
            case 'whitePatches': return params.whitePatches;
            case 'points': return params.points;
            case 'whitePatchesTint': return params.whitePatchesTint;
            case 'vitiligo': return params.vitiligo;
            case 'accessory': return params.accessory;
            case 'scar': return params.scar;
            case 'shading': return params.shading;
            case 'reverse': return params.reverse;
            default: return '';
        }
    }
    
    getActualParameterName(paramId) {
        // Map parameter IDs to actual cat parameter names
        switch(paramId) {
            case 'sprite': return 'spriteNumber';
            case 'pelt': return 'peltName';
            case 'tortie': return 'isTortie';
            default: return paramId;  // Most parameters use the same name
        }
    }
    
    formatValue(value) {
        if (!value || value === '') return 'None';
        return value.toString()
            .replace(/_/g, ' ')
            .replace(/^\d+\s*-\s*/, '')
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    }
    
    async generateAllSprites() {
        this.spritesSection.style.display = 'block';
        this.spritesGrid.innerHTML = '';
        
        const originalSprite = this.currentCatParams.spriteNumber;
        
        for (const spriteNumber of this.validSprites) {
            const spriteItem = document.createElement('div');
            spriteItem.className = 'sprite-item loading-sprite';
            if (spriteNumber == originalSprite) {
                spriteItem.classList.add('highlighted');
            }
            
            spriteItem.innerHTML = `
                <div class="sprite-name">${this.spriteNames[spriteNumber] || `Sprite ${spriteNumber}`}</div>
                <div class="sprite-canvas-wrapper">
                    <canvas class="sprite-canvas" width="120" height="120"></canvas>
                    <div class="variation-loading">
                        <div class="cat-paw-loader">
                            <img src="../assets/images/paw.png" alt="Loading..." width="30" height="30">
                        </div>
                    </div>
                </div>
                <div class="sprite-buttons">
                    <button class="sprite-copy-btn" title="Copy (120×120)">
                        <img src="../assets/images/copy-solid.svg" class="copy-icon" alt="Copy">
                    </button>
                    <button class="sprite-copy-big-btn" title="Copy Big (700×700)">
                        <img src="../assets/images/copy-solid.svg" class="copy-icon" alt="Copy">
                        <img src="../assets/images/copy-solid.svg" class="copy-icon" alt="Copy">
                    </button>
                </div>
            `;
            
            this.spritesGrid.appendChild(spriteItem);
            
            const spriteParams = { ...this.currentCatParams, spriteNumber };
            const result = await catGenerator.generateCat(spriteParams);
            
            const canvas = spriteItem.querySelector('.sprite-canvas');
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            
            try {
                ctx.drawImage(result.canvas, 0, 0, 120, 120);
            } catch (e) {
                console.error(`Failed to draw sprite ${spriteNumber}:`, e);
            }
            
            // Hide the loading indicator
            const loader = spriteItem.querySelector('.variation-loading');
            if (loader) {
                loader.style.display = 'none';
            }
            
            spriteItem.classList.remove('loading-sprite');
            
            // Add event listeners for both copy buttons
            const copyBtn = spriteItem.querySelector('.sprite-copy-btn');
            const copyBigBtn = spriteItem.querySelector('.sprite-copy-big-btn');
            
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copySpriteToClipboard(canvas, this.spriteNames[spriteNumber]);
            });
            
            copyBigBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copySpriteBig(spriteParams, this.spriteNames[spriteNumber]);
            });
        }
    }
    
    // Consolidated copy method for canvas images
    async copyCanvasToClipboard(canvas, successMessage, size = null) {
        try {
            let targetCanvas = canvas;
            
            // If a specific size is requested, create a resized canvas
            if (size) {
                targetCanvas = document.createElement('canvas');
                targetCanvas.width = size;
                targetCanvas.height = size;
                const ctx = targetCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(canvas, 0, 0, size, size);
            }

            const blob = await new Promise((resolve, reject) => targetCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/png'));

            if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                this.showToast(successMessage);
                return;
            }

            this.downloadBlob(blob, `${successMessage.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'cat'}.png`);
            this.showToast('Image downloaded.');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showError('Failed to copy image. Please try again.');
        }
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'cat.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async copySpriteToClipboard(canvas, spriteName) {
        await this.copyCanvasToClipboard(canvas, `Copied ${spriteName}!`);
    }
    
    async copySpriteBig(params, spriteName) {
        try {
            // Generate the sprite at full resolution
            const result = await catGenerator.generateCat(params);
            const bigCanvas = document.createElement('canvas');
            bigCanvas.width = CONFIG.CANVAS.SPRITE_BIG_SIZE;
            bigCanvas.height = CONFIG.CANVAS.SPRITE_BIG_SIZE;
            const ctx = bigCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, CONFIG.CANVAS.SPRITE_BIG_SIZE, CONFIG.CANVAS.SPRITE_BIG_SIZE);
            
            await this.copyCanvasToClipboard(
                bigCanvas,
                `Copied ${spriteName} (${CONFIG.CANVAS.SPRITE_BIG_SIZE}×${CONFIG.CANVAS.SPRITE_BIG_SIZE})!`
            );
        } catch (error) {
            console.error('Failed to copy sprite (big):', error);
            this.showError('Failed to copy large sprite. Please try again.');
        }
    }
    
    async copyFinalCatBig() {
        if (!this.currentCatParams) return;
        
        try {
            // Generate the cat at full resolution
            const result = await catGenerator.generateCat(this.currentCatParams);
            const bigCanvas = document.createElement('canvas');
            bigCanvas.width = CONFIG.CANVAS.SPRITE_BIG_SIZE;
            bigCanvas.height = CONFIG.CANVAS.SPRITE_BIG_SIZE;
            const ctx = bigCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, CONFIG.CANVAS.SPRITE_BIG_SIZE, CONFIG.CANVAS.SPRITE_BIG_SIZE);
            
            await this.copyCanvasToClipboard(
                bigCanvas,
                `Copied cat (${CONFIG.CANVAS.SPRITE_BIG_SIZE}×${CONFIG.CANVAS.SPRITE_BIG_SIZE})!`
            );
        } catch (error) {
            console.error('Failed to copy cat (big):', error);
            this.showError('Failed to copy cat. Please try again.');
        }
    }

    async copyFinalCatNoTint() {
        if (!this.currentCatParams) return;
        try {
            const params = { ...this.currentCatParams };
            // Force normal rendering: disable Dark Forest and Star Clan
            params.darkForest = false;
            params.darkMode = false;
            params.dead = false;
            const result = await catGenerator.generateCat(params);
            const bigCanvas = document.createElement('canvas');
            bigCanvas.width = CONFIG.CANVAS.SPRITE_BIG_SIZE;
            bigCanvas.height = CONFIG.CANVAS.SPRITE_BIG_SIZE;
            const ctx = bigCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, CONFIG.CANVAS.SPRITE_BIG_SIZE, CONFIG.CANVAS.SPRITE_BIG_SIZE);
            await this.copyCanvasToClipboard(
                bigCanvas,
                `Copied cat (no tint) (${CONFIG.CANVAS.SPRITE_BIG_SIZE}×${CONFIG.CANVAS.SPRITE_BIG_SIZE})!`
            );
        } catch (error) {
            console.error('Failed to copy cat (no tint):', error);
            this.showError('Failed to copy (no tint). Please try again.');
        }
    }
    
    async buildCatShareUrl() {
        if (!this.currentCatParams) return '';

        const accessorySlots = Array.isArray(this.currentAccessorySlots) ? [...this.currentAccessorySlots] : [];
        const scarSlots = Array.isArray(this.currentScarSlots) ? [...this.currentScarSlots] : [];
        const tortieSlots = Array.isArray(this.currentTortieSlots) ? this.currentTortieSlots.map(slot => slot ? { ...slot } : null) : [];

        const counts = {
            accessories: Number.isFinite(this.usedAccessoryCount) ? this.usedAccessoryCount : accessorySlots.length,
            scars: Number.isFinite(this.usedScarCount) ? this.usedScarCount : scarSlots.length,
            tortie: Number.isFinite(this.usedTortieCount) ? this.usedTortieCount : tortieSlots.length
        };

        const sharedPayload = {
            params: this.currentCatParams,
            accessorySlots,
            scarSlots,
            tortieSlots,
            counts
        };

        const viewerUrl = new URL('./single-cat-viewer.html', window.location.href);

        try {
            const mapperId = await this.persistCatMapper(sharedPayload);
            if (mapperId) {
                viewerUrl.searchParams.set('id', mapperId);
                return viewerUrl.toString();
            }
            throw new Error('Missing mapper id');
        } catch (error) {
            console.warn('Failed to persist cat share payload, falling back to encoded URL.', error);
            try {
                const encoded = encodeCatShare(sharedPayload);
                viewerUrl.searchParams.set('cat', encoded);
                return viewerUrl.toString();
            } catch (encodeError) {
                console.error('Failed to encode shared cat data:', encodeError);
                return '';
            }
        }
    }

    async copyCatUrlToClipboard() {
        if (!this.currentCatParams) return;

        const catUrl = this.currentCatUrl || catGenerator.buildCatURL(this.currentCatParams);

        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            this.copyTextFallback(catUrl, 'Cat URL copied!');
            return;
        }

        try {
            const shareUrl = this.currentShareUrl || await this.buildCatShareUrl();
            if (shareUrl) {
                this.currentShareUrl = shareUrl;
            }
            const finalUrl = shareUrl || catUrl;
            await navigator.clipboard.writeText(finalUrl);
            this.showToast('Cat URL copied!');
        } catch (error) {
            console.error('Failed to copy URL:', error);
            this.copyTextFallback(catUrl, 'Cat URL copied!');
        }
    }

    async persistCatMapper(payload) {
        const result = await mapperApi.create(payload);
        return result?.id;
    }

    copyTextFallback(text, successMessage) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            const success = document.execCommand('copy');
            if (success) {
                this.showToast(successMessage);
            } else {
                window.prompt('Copy this text', text);
            }
        } catch (err) {
            window.prompt('Copy this text', text);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    async openSharedViewer() {
        if (!this.currentCatParams) return;

        const shareUrl = this.currentShareUrl || await this.buildCatShareUrl();
        if (!shareUrl) {
            this.showError('Unable to open shared viewer for this cat.');
            return;
        }
        this.currentShareUrl = shareUrl;

        try {
            const opened = window.open(shareUrl, '_blank', 'noopener=yes');
            if (!opened) {
                this.showError('Popup blocked. Allow popups to open the viewer.');
            }
        } catch (error) {
            console.error('Failed to open shared viewer:', error);
            this.showError('Unable to open shared viewer.');
        }
    }
    
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize when DOM is ready with a small delay to ensure browser is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Small delay to ensure browser network stack is ready
        setTimeout(() => {
            new SingleCatGenerator();
        }, 50);
    });
} else {
    // DOM already loaded, but still defer to avoid module evaluation timing issues
    setTimeout(() => {
        new SingleCatGenerator();
    }, 50);
}

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                     document.activeElement.isContentEditable;
    if (!isTyping && e.key === 'Escape') {
        window.location.href = '../index.html';
    }
});
