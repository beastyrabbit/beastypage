/**
 * Visual Cat Builder
 * Interactive cat customization with sprite previews
 */

import catGenerator from '../core/catGeneratorV2.js';
import spriteMapper from '../core/spriteMapper.js';

// Parameter definitions - sprites will be loaded from spriteMapper
// Patterns will be loaded from spriteMapper
// Colors will be loaded from spriteMapper
// Eye colors will be loaded from spriteMapper
// Skin colors will be loaded from spriteMapper
// Tortie masks will be loaded from spriteMapper
// White patches will be loaded from spriteMapper
// Points, vitiligo, tints, and lineart will be loaded from spriteMapper

// Accessories and collars will be loaded dynamically from spriteMapper

// Scars will be loaded dynamically from spriteMapper

class CatBuilder {
    constructor() {
        this.generator = null; // Will be initialized asynchronously
        this.currentParams = this.getDefaultParams();
        this.thumbnailCache = new Map();
        this.isGenerating = false;
        this.previewDebounce = null;
        this.gridsInitialized = false;
        this.loadedClanCats = []; // Store loaded clan cats
        this.clanCatPreviews = new Map(); // Cache generated previews
        
        this.init();
    }
    
    getDefaultParams() {
        return {
            spriteNumber: 8,
            peltName: 'SingleColour',
            colour: 'WHITE',
            isTortie: false,
            tortiePattern: 'SingleColour',
            tortieColour: 'GINGER',
            tortieMask: 'ONE',
            eyeColour: 'YELLOW',
            eyeColour2: undefined,
            skinColour: 'PINK',
            whitePatches: undefined,
            points: undefined,
            whitePatchesTint: undefined,
            vitiligo: undefined,
            tint: undefined,
            shading: false,
            reverse: false,
            accessory: undefined,
            scar: undefined,
            dead: false,
            darkForest: false
        };
    }
    
    async init() {
        // Initialize the cat generator - it's a singleton instance
        this.generator = catGenerator;  // Use the imported singleton directly
        
        this.setupViewModes();
        this.setupEventListeners();
        this.setupImageSizeSlider();
        this.setupHelpOverlay();
        this.loadFromURL();
        await this.initializeUI();
        // Don't call updatePreview here - it triggers thumbnail refresh before items are ready
        // The preview will be generated when user interacts with the UI
    }
    
    setupViewModes() {
        // Setup tab navigation for scrolling
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.scrollToSection(tab);
                
                // Update active state
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    
    // Removed setViewMode - no longer needed
    
    scrollToSection(sectionName) {
        // Find section with matching data-section attribute
        const targetSection = document.querySelector(`.parameter-section[data-section="${sectionName}"]`);
        if (targetSection) {
            // Use scrollIntoView for more reliable scrolling
            targetSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            // Update active tab button
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === sectionName);
            });
        }
    }
    
    showSpritePopup(name, canvas) {
        const popup = document.getElementById('spritePopup');
        const popupTitle = document.getElementById('spritePopupTitle');
        const popupCanvas = document.getElementById('spritePopupCanvas');
        
        if (!popup || !popupCanvas) return;
        
        // Set title
        if (popupTitle) {
            popupTitle.textContent = this.formatName(name);
        }
        
        // Set canvas size to 800x800 for double size
        popupCanvas.width = 800;
        popupCanvas.height = 800;
        const ctx = popupCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 800, 800);
        
        // Add background
        ctx.fillStyle = '#d4d4d4';
        ctx.fillRect(0, 0, 800, 800);
        
        // Draw the sprite at double size
        ctx.drawImage(canvas, 0, 0, 800, 800);
        
        // Show popup
        popup.classList.add('active');
    }
    
    setupImageSizeSlider() {
        const slider = document.getElementById('imageSizeSlider');
        const display = document.getElementById('sizeDisplay');
        
        if (!slider || !display) return;
        
        // Load saved size
        const savedSize = localStorage.getItem('catBuilderImageSize') || '2';
        slider.value = savedSize;
        display.textContent = savedSize + 'x';
        
        // Apply initial size
        this.updateImageSizes(parseFloat(savedSize));
        
        // Handle slider changes
        slider.addEventListener('input', (e) => {
            const size = parseFloat(e.target.value);
            display.textContent = size + 'x';
            this.updateImageSizes(size);
            localStorage.setItem('catBuilderImageSize', size);
        });
    }
    
    updateImageSizes(multiplier) {
        const baseSize = 50; // Base size in pixels (1x = 50px)
        const size = baseSize * multiplier;
        
        // Update CSS variable for dynamic sizing
        document.documentElement.style.setProperty('--sprite-size', `${size}px`);
        
        // Update grid columns based on size
        const grids = document.querySelectorAll('.sprite-grid');
        grids.forEach(grid => {
            // Calculate columns based on available width and desired size
            const minSize = Math.max(size, 50); // Minimum 50px
            const maxSize = Math.min(size * 1.2, 425); // Max 425px (8.5x)
            grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${minSize}px, ${maxSize}px))`;
        });
    }
    
    setupHelpOverlay() {
        const overlay = document.getElementById('helpOverlay');
        const closeBtn = document.getElementById('helpClose');
        const startBtn = document.getElementById('helpStart');
        
        if (!overlay) return;
        
        // Show help on first visit
        const hasSeenHelp = localStorage.getItem('catBuilderHelpSeen');
        if (!hasSeenHelp) {
            setTimeout(() => {
                overlay.classList.add('active');
            }, 500);
        }
        
        // Close handlers
        const closeHelp = () => {
            overlay.classList.remove('active');
            localStorage.setItem('catBuilderHelpSeen', 'true');
        };
        
        closeBtn?.addEventListener('click', closeHelp);
        startBtn?.addEventListener('click', closeHelp);
        
        // Setup help button (now in the preview area)
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                overlay.classList.add('active');
            });
        }
    }
    
    setupEventListeners() {
        // Header buttons
        document.getElementById('refreshThumbnailsBtn')?.addEventListener('click', () => this.refreshAllThumbnails(true));
        document.getElementById('randomizeBtn')?.addEventListener('click', () => this.randomizeAll());
        document.getElementById('resetBtn')?.addEventListener('click', () => this.resetAll());
        document.getElementById('loadUrlBtn')?.addEventListener('click', () => this.showUrlLoadModal());
        document.getElementById('importClanCatsBtn')?.addEventListener('click', () => this.showClanCatsModal());
        
        // Shading toggle button in header
        document.getElementById('shadingToggleBtn')?.addEventListener('click', () => {
            this.currentParams.shading = !this.currentParams.shading;
            document.getElementById('shadingToggleBtn').classList.toggle('active', this.currentParams.shading);
            this.updatePreview();
        });
        
        // Reverse toggle button in header
        document.getElementById('reverseToggleBtn')?.addEventListener('click', () => {
            this.currentParams.reverse = !this.currentParams.reverse;
            document.getElementById('reverseToggleBtn').classList.toggle('active', this.currentParams.reverse);
            this.updatePreview();
        });
        
        // Tortie toggle button in header
        document.getElementById('tortieToggleBtn')?.addEventListener('click', () => {
            this.currentParams.isTortie = !this.currentParams.isTortie;
            document.getElementById('tortieToggleBtn').classList.toggle('active', this.currentParams.isTortie);
            this.updatePreview();
            
            // Show/hide tortie sections based on state
            this.updateTortieSectionsVisibility();
        });
        
        // Export buttons
        document.getElementById('downloadBtn')?.addEventListener('click', () => this.downloadCat());
        document.getElementById('shareBtn')?.addEventListener('click', () => this.shareURL());
        document.getElementById('copyUrlBtn')?.addEventListener('click', () => this.copyCatURL());
        document.getElementById('viewInMakerBtn')?.addEventListener('click', () => this.viewInMaker());
        
        // Sprite popup close button
        document.getElementById('spritePopupClose')?.addEventListener('click', () => {
            document.getElementById('spritePopup')?.classList.remove('active');
        });
        
        // Setup URL load modal
        this.setupUrlLoadModal();
        
        // Close popup on overlay click
        document.getElementById('spritePopup')?.addEventListener('click', (e) => {
            if (e.target.id === 'spritePopup') {
                document.getElementById('spritePopup').classList.remove('active');
            }
        });
        
        // Mobile drawer
        document.getElementById('mobileDrawerToggle')?.addEventListener('click', () => {
            document.querySelector('.parameters-container').classList.toggle('open');
        });
    }
    
    toggleTabGroup(btn) {
        // Only allow toggling in sidebar mode
        const container = document.getElementById('builderContainer');
        if (!container.classList.contains('view-mode-sidebar')) {
            return;
        }
        
        const group = btn.dataset.toggleGroup;
        const content = btn.nextElementSibling;
        const arrow = btn.querySelector('.group-arrow');
        
        if (content && content.classList.contains('tab-group-content')) {
            content.classList.toggle('collapsed');
            arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0)';
        }
    }
    
    toggleSection(btn) {
        const section = btn.dataset.toggle;
        const content = document.getElementById(`${section}Content`);
        const arrow = btn.querySelector('.section-arrow');
        
        if (content) {
            content.classList.toggle('collapsed');
            arrow.style.transform = content.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0)';
        }
    }
    
    async initializeUI() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        
        // Only populate grids on first initialization
        if (!this.gridsInitialized) {
            // Initialize spriteMapper first
            await spriteMapper.init();
            
            // Get data from spriteMapper
            const sprites = spriteMapper.getSprites();
            const patterns = spriteMapper.getPeltNames();
            const colors = spriteMapper.getColours();
            const eyeColors = spriteMapper.getEyeColours();
            const skinColors = spriteMapper.getSkinColours();
            const tortieMasks = spriteMapper.getTortieMasks();
            const whitePatches = spriteMapper.getWhitePatches();
            const points = spriteMapper.getPoints();
            const vitiligo = spriteMapper.getVitiligo();
            const tints = spriteMapper.getTints();
            const whiteTints = spriteMapper.getWhiteTints();
            const lineartStyles = spriteMapper.getLineartStyles();
            
            // Initialize all grids immediately without waiting
            this.populateSpriteGrid('spriteGrid', sprites, 'sprite');
            this.populatePatternGrid('patternGrid', patterns, 'pattern');
            this.populateColorGrid('colorGrid', colors, 'color');
            
            // Tortie options
            this.populatePatternGrid('tortiePatternGrid', patterns, 'tortiePattern');
            this.populateColorGrid('tortieColorGrid', colors, 'tortieColor');
            this.populateTortieMaskGrid('tortieMaskGrid', tortieMasks, 'tortieMask');
            
            // Eyes
            this.populateEyeGrid('eyeColorGrid', eyeColors, 'eyeColor');
            this.populateEyeGrid('eyeColor2Grid', eyeColors, 'eyeColor2');
            
            // Markings
            this.populateWhitePatchesGrid('whitePatchesGrid', whitePatches, 'whitePatches');
            this.populatePointsGrid('pointsGrid', points, 'points');
            this.populateTintGrid('whiteTintGrid', whiteTints, 'whiteTint');
            this.populateVitiligoGrid('vitiligoGrid', vitiligo, 'vitiligo');
            
            // Details
            this.populateSkinGrid('skinColorGrid', skinColors, 'skinColor');
            this.populateTintGrid('tintGrid', tints, 'tint');
            this.populateLineartGrid('lineartGrid', lineartStyles, 'lineart');
            
            // Accessories - load from spriteMapper
            await spriteMapper.init(); // Ensure spriteMapper is initialized
            const plantAccessories = spriteMapper.getPlantAccessories();
            const wildAccessories = spriteMapper.getWildAccessories();
            this.populateAccessoryGrid('plantAccessoryGrid', plantAccessories, 'plant');
            this.populateAccessoryGrid('wildAccessoryGrid', wildAccessories, 'wild');
            this.populateCollarGrid('collarGrid');
            
            // Scars - get from spriteMapper by category
            const scars1 = spriteMapper.getScarsByCategory(1) || [];
            const scars2 = spriteMapper.getScarsByCategory(2) || [];
            const scars3 = spriteMapper.getScarsByCategory(3) || [];
            this.populateScarGrid('battleScarsGrid', scars1, 'battle');
            this.populateScarGrid('missingPartsGrid', scars2, 'missing');
            this.populateScarGrid('environmentalScarsGrid', scars3, 'environmental');
            
            this.gridsInitialized = true;
        }
        
        // Hide loading overlay quickly
        setTimeout(() => {
            loadingOverlay?.classList.remove('active');
        }, 100);
        
        // Generate initial preview without triggering thumbnail refresh
        this.generatePreview();
    }
    
    async populateSpriteGrid(gridId, sprites, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const sprite of sprites) {
            const item = this.createEmptySpriteItem(sprite, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: sprite });
        }
        
        // Then generate variations and fill them in
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'sprite',
            sprites,
            false // Don't shuffle
        );
        
        // Fill in the pre-created items with the generated variations
        for (let i = 0; i < variations.length; i++) {
            if (items[i]) {
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            }
        }
    }
    
    async populatePatternGrid(gridId, patterns, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const pattern of patterns) {
            const item = this.createEmptySpriteItem(pattern, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: pattern });
        }
        
        // Then generate variations and fill them in
        const mappedParamName = paramName === 'tortiePattern' ? 'tortiePattern' : 'pelt';
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            mappedParamName,
            patterns,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateColorGrid(gridId, colors, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const color of colors) {
            const item = this.createEmptySpriteItem(color, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: color });
        }
        
        // Then generate variations and fill them in
        const mappedParamName = paramName === 'tortieColor' ? 'tortieColour' : 'colour';
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            mappedParamName,
            colors,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateTortieMaskGrid(gridId, masks, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const mask of masks) {
            const item = this.createEmptySpriteItem(mask, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: mask });
        }
        
        // First enable tortie for these variations
        const tortieParams = { ...this.currentParams, isTortie: true };
        const variations = await this.generator.generateAllVariationsForParameter(
            tortieParams,
            'tortieMask',
            masks,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateEyeGrid(gridId, colors, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const color of colors) {
            const item = this.createEmptySpriteItem(color, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: color });
        }
        
        const mappedParamName = paramName === 'eyeColor' ? 'eyeColour' : 'eyeColour2';
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            mappedParamName,
            colors,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateWhitePatchesGrid(gridId, patches, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const patch of patches) {
            const item = this.createEmptySpriteItem(patch, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: patch });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'whitePatches',
            patches,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populatePointsGrid(gridId, points, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const point of points) {
            const item = this.createEmptySpriteItem(point, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: point });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'points',
            points,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateTintGrid(gridId, tints, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const tint of tints) {
            const item = this.createEmptySpriteItem(tint, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: tint });
        }
        
        const mappedParamName = paramName === 'whiteTint' ? 'whitePatchesTint' : 'tint';
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            mappedParamName,
            tints,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateLineartGrid(gridId, styles, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const style of styles) {
            const item = this.createEmptySpriteItem(style, paramName);
            // Update display name for better readability
            const nameLabel = item.querySelector('.sprite-name');
            if (nameLabel) {
                const displayNames = {
                    'normal': 'Normal',
                    'dead': 'StarClan',
                    'darkforest': 'Dark Forest',
                    'aprilfools': 'April Fools',
                    'aprilfools-dead': 'AF StarClan',
                    'aprilfools-darkforest': 'AF Dark Forest'
                };
                nameLabel.textContent = displayNames[style] || this.formatName(style);
            }
            grid.appendChild(item);
            items.push({ element: item, value: style });
        }
        
        // Generate variations with different lineart styles
        const variations = [];
        for (const style of styles) {
            const params = { ...this.currentParams };
            
            // Set dead, darkForest, and aprilFools based on style
            const isAprilFools = style.startsWith('aprilfools');
            params.aprilFools = isAprilFools;
            params.dead = (style === 'dead' || style === 'darkforest' || 
                          style === 'aprilfools-dead' || style === 'aprilfools-darkforest');
            params.darkForest = (style === 'darkforest' || style === 'aprilfools-darkforest');
            
            try {
                const result = await this.generator.generateCat(params);
                variations.push({
                    value: style,
                    canvas: result.canvas
                });
            } catch (error) {
                console.error(`Failed to generate lineart style ${style}:`, error);
            }
        }
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateVitiligoGrid(gridId, options, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const option of options) {
            const item = this.createEmptySpriteItem(option, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: option });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'vitiligo',
            options,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateSkinGrid(gridId, colors, paramName) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const color of colors) {
            const item = this.createEmptySpriteItem(color, paramName);
            grid.appendChild(item);
            items.push({ element: item, value: color });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'skinColour',
            colors,
            false
        );
        
        // Fill in the pre-created items - ensure ALL items get handled
        for (let i = 0; i < items.length; i++) {
            if (items[i] && variations[i]) {
                // We have both item and variation
                await this.fillSpriteItem(items[i].element, variations[i], paramName);
            } else if (items[i]) {
                // Item exists but no variation - create a fallback regenerate function
                const item = items[i].element;
                const value = items[i].value;
                
                // Remove loader to show it's done processing
                const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
                const loader = canvasWrapper?.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                item.classList.remove('loading');
                item.classList.add('no-variation');
                
                // Attach regenerate function that uses the item's value
                item.regenerateThumbnail = async () => {
                    if (value === undefined || value === null) {
                        console.error('Cannot regenerate thumbnail with undefined value');
                        return;
                    }
                    await this.regenerateSingleThumbnail(item, paramName, value);
                };
            }
        }
    }
    
    async populateAccessoryGrid(gridId, accessories, type) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const accessory of accessories) {
            const item = this.createEmptySpriteItem(accessory, `${type}Accessory`);
            grid.appendChild(item);
            items.push({ element: item, value: accessory });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'accessory',
            accessories,
            false
        );
        
        // Fill in the pre-created items
        for (let i = 0; i < variations.length; i++) {
            if (items[i]) {
                await this.fillSpriteItem(items[i].element, variations[i], `${type}Accessory`);
            }
        }
    }
    
    async populateCollarGrid(gridId) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // Get collars from spriteMapper
        const collars = spriteMapper.getCollars();
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const collar of collars) {
            const item = this.createEmptySpriteItem(collar, 'collar');
            // Store the actual collar value for selection
            item.dataset.collarValue = collar;
            // Update the display name
            const nameLabel = item.querySelector('.sprite-name');
            if (nameLabel) {
                // Format display name for collars
                let displayName = collar;
                // Try to extract color and type from collar name
                const collarTypes = ['BELL', 'BOW', 'NYLON'];
                for (const type of collarTypes) {
                    if (type && collar.endsWith(type)) {
                        const color = collar.substring(0, collar.length - type.length);
                        displayName = `${color} ${type}`;
                        break;
                    }
                }
                nameLabel.textContent = this.formatName(displayName);
            }
            grid.appendChild(item);
            items.push({ element: item, value: collar });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'accessory',
            collars,
            false
        );
        
        // Fill in the pre-created items
        for (let i = 0; i < variations.length; i++) {
            if (items[i]) {
                await this.fillSpriteItem(items[i].element, variations[i], 'collar');
            }
        }
    }
    
    async populateScarGrid(gridId, scars, type) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        
        // First, create all boxes with loading indicators
        const items = [];
        for (const scar of scars) {
            const item = this.createEmptySpriteItem(scar, `${type}Scars`);
            grid.appendChild(item);
            items.push({ element: item, value: scar });
        }
        
        const variations = await this.generator.generateAllVariationsForParameter(
            this.currentParams,
            'scar',
            scars,
            false
        );
        
        // Fill in the pre-created items
        for (let i = 0; i < variations.length; i++) {
            if (items[i]) {
                await this.fillSpriteItem(items[i].element, variations[i], `${type}Scars`);
            }
        }
    }
    
    createEmptySpriteItem(value, paramName) {
        const item = document.createElement('div');
        item.className = 'sprite-item loading';
        item.dataset.param = paramName;
        item.dataset.value = value;
        
        // Check if selected
        if (this.isSelected(paramName, value)) {
            item.classList.add('selected');
        }
        
        // Create name label at top
        const nameLabel = document.createElement('div');
        nameLabel.className = 'sprite-name';
        nameLabel.textContent = this.formatName(value);
        item.appendChild(nameLabel);
        
        // Create zoom button (disabled initially)
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'sprite-zoom-btn';
        zoomBtn.innerHTML = '🔍';
        zoomBtn.disabled = true;
        item.appendChild(zoomBtn);
        
        // Create canvas wrapper with spinner
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'sprite-canvas-wrapper';
        
        const spinner = document.createElement('div');
        spinner.className = 'cat-paw-loader';
        spinner.innerHTML = '<img src="../assets/images/paw.png" alt="Loading..." width="50" height="50">';
        canvasWrapper.appendChild(spinner);
        item.appendChild(canvasWrapper);
        
        // Add click handler
        item.addEventListener('click', () => this.selectParameter(paramName, value));
        
        return item;
    }
    
    async fillSpriteItem(item, variation, paramName) {
        const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
        const zoomBtn = item.querySelector('.sprite-zoom-btn');
        
        if (!canvasWrapper) return;
        
        // Validate variation data
        if (!variation || !variation.canvas || variation.value === undefined) {
            console.warn('Invalid variation data for fillSpriteItem:', { variation, paramName });
            // Remove loader and mark as error
            const loader = canvasWrapper.querySelector('.cat-paw-loader');
            if (loader) {
                canvasWrapper.removeChild(loader);
            }
            item.classList.remove('loading');
            item.classList.add('error');
            return;
        }
        
        // Create thumbnail canvas
        const thumbnail = document.createElement('canvas');
        thumbnail.width = 200;
        thumbnail.height = 200;
        const ctx = thumbnail.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(variation.canvas, 0, 0, 200, 200);
        
        // Remove loader and add canvas
        const loader = canvasWrapper.querySelector('.cat-paw-loader');
        if (loader) {
            canvasWrapper.removeChild(loader);
        }
        canvasWrapper.appendChild(thumbnail);
        
        // Store the full canvas reference on the item for popup
        item.fullCanvas = variation.canvas;
        
        // Enable zoom button
        if (zoomBtn) {
            zoomBtn.disabled = false;
            zoomBtn.onclick = async (e) => {
                e.stopPropagation();
                // Use the stored full canvas if available
                if (item.fullCanvas) {
                    this.showSpritePopup(variation.value, item.fullCanvas);
                } else {
                    // Generate full size for popup if not available
                    const fullParams = this.buildParamsForVariation(paramName, variation.value);
                    const result = await this.generator.generateCat(fullParams);
                    item.fullCanvas = result.canvas; // Store for future use
                    this.showSpritePopup(variation.value, result.canvas);
                }
            };
        }
        
        // Remove loading state
        item.classList.remove('loading');
        
        // Store regenerate function with validation
        const validValue = variation.value;
        item.regenerateThumbnail = async () => {
            // Double-check value is still valid
            if (validValue === undefined || validValue === null) {
                console.error('Cannot regenerate thumbnail with undefined value');
                return;
            }
            await this.regenerateSingleThumbnail(item, paramName, validValue);
        };
    }
    
    async createSpriteItemFromVariation(variation, paramName) {
        const item = document.createElement('div');
        item.className = 'sprite-item';
        item.dataset.param = paramName;
        item.dataset.value = variation.value;
        
        // Check if selected
        if (this.isSelected(paramName, variation.value)) {
            item.classList.add('selected');
        }
        
        // Create name label at top
        const nameLabel = document.createElement('div');
        nameLabel.className = 'sprite-name';
        nameLabel.textContent = this.formatName(variation.value);
        item.appendChild(nameLabel);
        
        // Create zoom button
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'sprite-zoom-btn';
        zoomBtn.innerHTML = '🔍';
        
        // Store full canvas reference
        item.fullCanvas = variation.canvas;
        
        zoomBtn.onclick = (e) => {
            e.stopPropagation();
            if (item.fullCanvas) {
                this.showSpritePopup(variation.value, item.fullCanvas);
            } else {
                // Fallback to thumbnail if no full canvas
                const thumbnailCanvas = item.querySelector('canvas');
                if (thumbnailCanvas) {
                    this.showSpritePopup(variation.value, thumbnailCanvas);
                }
            }
        };
        item.appendChild(zoomBtn);
        
        // Create canvas wrapper
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'sprite-canvas-wrapper';
        
        // Create thumbnail canvas - fixed size, CSS handles display scaling
        const thumbnail = document.createElement('canvas');
        thumbnail.width = 200;  // Fixed internal resolution
        thumbnail.height = 200;
        const ctx = thumbnail.getContext('2d');
        
        // No background needed - the sprite-item has background
        
        // Disable smoothing for pixel art
        ctx.imageSmoothingEnabled = false;
        
        // Draw the already-generated cat variation
        ctx.drawImage(variation.canvas, 0, 0, 200, 200);
        
        canvasWrapper.appendChild(thumbnail);
        item.appendChild(canvasWrapper);
        
        // Store the regenerate function on the element
        item.regenerateThumbnail = async () => {
            await this.regenerateSingleThumbnail(item, paramName, variation.value);
        };
        
        // Add click handler
        item.addEventListener('click', () => this.selectParameter(paramName, variation.value));
        
        return item;
    }
    
    // Keep old function for grids that don't use variations yet
    async createSpriteItem(value, paramName, params) {
        const item = document.createElement('div');
        item.className = 'sprite-item loading';
        item.dataset.param = paramName;
        item.dataset.value = value;
        
        // Check if selected
        if (this.isSelected(paramName, value)) {
            item.classList.add('selected');
        }
        
        // Create name label at top
        const nameLabel = document.createElement('div');
        nameLabel.className = 'sprite-name';
        nameLabel.textContent = this.formatName(value);
        item.appendChild(nameLabel);
        
        // Create zoom button
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'sprite-zoom-btn';
        zoomBtn.innerHTML = '🔍';
        zoomBtn.onclick = async (e) => {
            e.stopPropagation();
            // Get the current thumbnail canvas or generate if needed
            const thumbnailCanvas = item.querySelector('canvas');
            if (thumbnailCanvas) {
                this.showSpritePopup(value, thumbnailCanvas);
            } else {
                // If no canvas yet, generate full size for popup
                const fullParams = this.buildParamsForVariation(paramName, value);
                const result = await this.generator.generateCat(fullParams);
                this.showSpritePopup(value, result.canvas);
            }
        };
        item.appendChild(zoomBtn);
        
        // Create canvas wrapper with spinner
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'sprite-canvas-wrapper';
        
        const spinner = document.createElement('div');
        spinner.className = 'cat-paw-loader';
        spinner.innerHTML = '<img src="../assets/images/paw.png" alt="Loading..." width="50" height="50">';
        canvasWrapper.appendChild(spinner);
        item.appendChild(canvasWrapper);
        
        // Add click handler
        item.addEventListener('click', () => this.selectParameter(paramName, value));
        
        // Generate thumbnail asynchronously with delay to prevent overwhelming
        setTimeout(async () => {
            try {
                const canvas = await this.generateThumbnail(params);
                
                const loader = canvasWrapper.querySelector('.cat-paw-loader');
                if (loader) {
                    item.classList.remove('loading');
                    canvasWrapper.removeChild(loader);
                    canvasWrapper.appendChild(canvas);
                }
            } catch (error) {
                console.error('Failed to create sprite item:', error, 'for', paramName, value);
                item.classList.remove('loading');
                const loader = canvasWrapper.querySelector('.cat-paw-loader');
                if (loader) {
                    canvasWrapper.removeChild(loader);
                }
                // Add error indicator
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'width:80px;height:80px;background:rgba(255,0,0,0.1);display:flex;align-items:center;justify-content:center;';
                errorDiv.textContent = '❌';
                canvasWrapper.appendChild(errorDiv);
            }
        }, Math.random() * 100); // Stagger loading
        
        return item;
    }
    
    async generateThumbnail(params) {
        const cacheKey = JSON.stringify(params);
        
        if (this.thumbnailCache.has(cacheKey)) {
            return this.thumbnailCache.get(cacheKey).cloneNode(true);
        }
        
        try {
            const result = await this.generator.generateCat(params);
            
            if (!result || !result.canvas) {
                throw new Error('Generator returned invalid result');
            }
            
            const thumbnail = document.createElement('canvas');
            thumbnail.width = 80;
            thumbnail.height = 80;
            const ctx = thumbnail.getContext('2d');
            
            // No background needed - the sprite-item has background
            
            // Disable smoothing for pixel art
            ctx.imageSmoothingEnabled = false;
            ctx.mozImageSmoothingEnabled = false;
            ctx.webkitImageSmoothingEnabled = false;
            ctx.msImageSmoothingEnabled = false;
            
            // Draw the cat
            ctx.drawImage(result.canvas, 0, 0, 80, 80);
            
            this.thumbnailCache.set(cacheKey, thumbnail);
            return thumbnail.cloneNode(true);
        } catch (error) {
            console.error('Failed to generate thumbnail:', error);
            const errorCanvas = document.createElement('canvas');
            errorCanvas.width = 80;
            errorCanvas.height = 80;
            const ctx = errorCanvas.getContext('2d');
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.fillRect(0, 0, 80, 80);
            ctx.fillStyle = 'white';
            ctx.font = '10px monospace';
            ctx.fillText('ERROR', 20, 40);
            return errorCanvas;
        }
    }
    
    isSelected(paramName, value) {
        // Safety check - ensure currentParams is initialized
        if (!this.currentParams) {
            return false;
        }
        
        switch (paramName) {
            case 'sprite':
                return this.currentParams.spriteNumber === value;
            case 'pattern':
                return this.currentParams.peltName === value;
            case 'color':
                return this.currentParams.colour === value;
            case 'tortiePattern':
                return this.currentParams.tortiePattern === value;
            case 'tortieColor':
                return this.currentParams.tortieColour === value;
            case 'tortieMask':
                return this.currentParams.tortieMask === value;
            case 'eyeColor':
                return this.currentParams.eyeColour === value;
            case 'eyeColor2':
                return this.currentParams.eyeColour2 === value;
            case 'skinColor':
                return this.currentParams.skinColour === value;
            case 'whitePatches':
                return this.currentParams.whitePatches === value;
            case 'points':
                return this.currentParams.points === value;
            case 'whiteTint':
                return this.currentParams.whitePatchesTint === value;
            case 'vitiligo':
                return this.currentParams.vitiligo === value;
            case 'tint':
                return this.currentParams.tint === value;
            case 'lineart':
                // Check if the current lineart state matches the selected value
                if (value === 'normal') {
                    return !this.currentParams.dead && !this.currentParams.darkForest && !this.currentParams.aprilFools;
                } else if (value === 'dead') {
                    return this.currentParams.dead && !this.currentParams.darkForest && !this.currentParams.aprilFools;
                } else if (value === 'darkforest') {
                    return this.currentParams.dead && this.currentParams.darkForest && !this.currentParams.aprilFools;
                } else if (value === 'aprilfools') {
                    return !this.currentParams.dead && !this.currentParams.darkForest && this.currentParams.aprilFools;
                } else if (value === 'aprilfools-dead') {
                    return this.currentParams.dead && !this.currentParams.darkForest && this.currentParams.aprilFools;
                } else if (value === 'aprilfools-darkforest') {
                    return this.currentParams.dead && this.currentParams.darkForest && this.currentParams.aprilFools;
                }
                return false;
            case 'plantAccessory':
            case 'wildAccessory':
                return this.currentParams.accessory === value;
            case 'collar':
                // For collars, the value is the full collar string
                return this.currentParams.accessory === value;
            case 'battleScars':
            case 'missingScars':  
            case 'environmentalScars':
                return this.currentParams.scar === value;
            default:
                return false;
        }
    }
    
    selectParameter(paramName, value) {
        // Ensure currentParams is initialized
        if (!this.currentParams) {
            console.warn('selectParameter called before currentParams initialized');
            this.currentParams = this.getDefaultParams();
        }
        
        // Update selection UI
        document.querySelectorAll(`[data-param="${paramName}"]`).forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`[data-param="${paramName}"][data-value="${value}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        // Update parameters
        switch (paramName) {
            case 'sprite':
                this.currentParams.spriteNumber = value;
                break;
            case 'pattern':
                this.currentParams.peltName = value;
                break;
            case 'color':
                this.currentParams.colour = value;
                break;
            case 'tortiePattern':
                this.currentParams.tortiePattern = value;
                this.currentParams.isTortie = true; // Auto-enable tortie when selecting tortie parameter
                document.getElementById('tortieToggleBtn')?.classList.add('active');
                this.updateTortieSectionsVisibility();
                break;
            case 'tortieColor':
                this.currentParams.tortieColour = value;
                this.currentParams.isTortie = true; // Auto-enable tortie when selecting tortie parameter
                document.getElementById('tortieToggleBtn')?.classList.add('active');
                this.updateTortieSectionsVisibility();
                break;
            case 'tortieMask':
                this.currentParams.tortieMask = value;
                this.currentParams.isTortie = true; // Auto-enable tortie when selecting tortie parameter
                document.getElementById('tortieToggleBtn')?.classList.add('active');
                this.updateTortieSectionsVisibility();
                break;
            case 'eyeColor':
                this.currentParams.eyeColour = value;
                break;
            case 'eyeColor2':
                this.currentParams.eyeColour2 = value;
                // Secondary eye color is automatically set when selected
                break;
            case 'skinColor':
                this.currentParams.skinColour = value;
                break;
            case 'whitePatches':
                this.currentParams.whitePatches = value;
                break;
            case 'points':
                this.currentParams.points = value;
                break;
            case 'whiteTint':
                this.currentParams.whitePatchesTint = value;
                break;
            case 'vitiligo':
                this.currentParams.vitiligo = value;
                break;
            case 'tint':
                this.currentParams.tint = value;
                break;
            case 'lineart':
                // Handle lineart style selection
                const isAprilFools = value.startsWith('aprilfools');
                this.currentParams.aprilFools = isAprilFools;
                this.currentParams.dead = (value === 'dead' || value === 'darkforest' || 
                                         value === 'aprilfools-dead' || value === 'aprilfools-darkforest');
                this.currentParams.darkForest = (value === 'darkforest' || value === 'aprilfools-darkforest');
                break;
            case 'plantAccessory':
            case 'wildAccessory':
                this.currentParams.accessory = value;
                break;
            case 'collar':
                const collarItem = document.querySelector(`[data-param="${paramName}"][data-value="${value}"]`);
                this.currentParams.accessory = collarItem?.dataset.collarValue || value;
                break;
            case 'battleScars':
            case 'missingScars':
            case 'environmentalScars':
                this.currentParams.scar = value;
                break;
        }
        
        this.updatePreview();
    }
    
    clearParameter(param) {
        switch (param) {
            case 'whitePatches':
                this.currentParams.whitePatches = undefined;
                break;
            case 'points':
                this.currentParams.points = undefined;
                break;
            case 'whiteTint':
                this.currentParams.whitePatchesTint = undefined;
                break;
            case 'vitiligo':
                this.currentParams.vitiligo = undefined;
                break;
            case 'tint':
                this.currentParams.tint = 'none';
                break;
            case 'lineart':
                this.currentParams.dead = false;
                this.currentParams.darkForest = false;
                this.currentParams.aprilFools = false;
                break;
            case 'plantAccessory':
            case 'wildAccessory':
            case 'collar':
                this.currentParams.accessory = undefined;
                break;
            case 'battleScars':
            case 'missingParts':
            case 'environmentalScars':
                this.currentParams.scar = undefined;
                break;
        }
        
        // Clear selection UI
        document.querySelectorAll(`[data-param*="${param}"]`).forEach(item => {
            item.classList.remove('selected');
        });
        
        this.updatePreview();
    }
    
    updateTortieSectionsVisibility() {
        // Update visibility of tortie-related sections based on isTortie state
        const tortieSections = document.querySelectorAll('[data-section="tortiePattern"], [data-section="tortieColor"], [data-section="tortieMask"]');
        tortieSections.forEach(section => {
            if (section) {
                section.style.opacity = this.currentParams.isTortie ? '1' : '0.5';
                // Don't disable interactions - clicking should enable tortie
            }
        });
    }
    
    updatePreview() {
        // Don't update preview if generator isn't ready or params aren't set
        if (!this.generator || !this.currentParams) {
            console.warn('Skipping updatePreview - generator or params not ready');
            return;
        }
        
        // Debounce preview updates
        clearTimeout(this.previewDebounce);
        this.previewDebounce = setTimeout(() => {
            this.generatePreview();
            // ALWAYS refresh thumbnails when parameters change
            this.refreshAllThumbnails();
        }, 100);
    }
    
    async refreshAllThumbnails(isManual = false) {
        console.log(`Triggering ${isManual ? 'manual' : 'automatic'} async thumbnail refresh...`);
        
        // Get all sprite items currently in the DOM
        const allSpriteItems = document.querySelectorAll('.sprite-item');
        
        if (allSpriteItems.length === 0) {
            console.log('No thumbnails to refresh yet');
            return;
        }
        
        // Create an array of regeneration promises
        const regenerationPromises = [];
        
        // Stagger the regeneration slightly to avoid overwhelming the browser
        let delay = 0;
        const staggerDelay = isManual ? 0 : 5; // No stagger for manual refresh
        
        // Trigger regeneration for each item independently
        allSpriteItems.forEach((item, index) => {
            if (item.regenerateThumbnail) {
                // Each item regenerates itself asynchronously with a small stagger
                const promise = new Promise((resolve) => {
                    setTimeout(() => {
                        item.regenerateThumbnail()
                            .then(resolve)
                            .catch(err => {
                                console.error('Failed to regenerate thumbnail:', err);
                                resolve(); // Resolve anyway to not block others
                            });
                    }, delay);
                });
                
                regenerationPromises.push(promise);
                delay += staggerDelay;
            }
        });
        
        // Fire and forget - don't wait for all to complete
        // This allows each thumbnail to update as soon as it's ready
        Promise.all(regenerationPromises).then(() => {
            console.log('All thumbnails regenerated');
        }).catch(err => {
            console.error('Some thumbnails failed to regenerate:', err);
        });
    }
    
    async regenerateSingleThumbnail(item, paramName, value) {
        // Check if item is still in DOM
        if (!item || !item.parentNode) {
            return;
        }
        
        // Find canvas wrapper and existing canvas
        const canvasWrapper = item.querySelector('.sprite-canvas-wrapper');
        if (!canvasWrapper) {
            console.error('No canvas wrapper found for thumbnail regeneration');
            return;
        }
        
        const existingCanvas = canvasWrapper.querySelector('canvas');
        if (existingCanvas) {
            existingCanvas.style.opacity = '0.5';
        }
        
        try {
            // Build params for this specific variation
            const params = this.buildParamsForVariation(paramName, value);
            
            // Generate the cat
            const result = await this.generator.generateCat(params);
            
            if (!result || !result.canvas) {
                throw new Error('Invalid generation result');
            }
            
            // Create new thumbnail canvas - fixed size, CSS handles display scaling
            const newCanvas = document.createElement('canvas');
            newCanvas.width = 200;  // Fixed internal resolution
            newCanvas.height = 200;
            const ctx = newCanvas.getContext('2d');
            
            // No background needed - the sprite-item has background
            
            // Disable smoothing
            ctx.imageSmoothingEnabled = false;
            
            // Draw the cat
            ctx.drawImage(result.canvas, 0, 0, 200, 200);
            
            // Update the stored full canvas for popup
            item.fullCanvas = result.canvas;
            
            // Replace old canvas with new one in wrapper
            if (existingCanvas) {
                canvasWrapper.replaceChild(newCanvas, existingCanvas);
            } else {
                // Clear wrapper and add new canvas
                canvasWrapper.innerHTML = '';
                canvasWrapper.appendChild(newCanvas);
            }
            
            // Update selection state
            if (this.isSelected(paramName, value)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
            
        } catch (error) {
            console.error(`Failed to regenerate thumbnail for ${paramName}:${value}`, error);
            if (existingCanvas) {
                existingCanvas.style.opacity = '1';
            }
        }
    }
    
    buildParamsForVariation(paramName, value) {
        // Ensure currentParams is initialized
        if (!this.currentParams) {
            console.warn('currentParams was not initialized in buildParamsForVariation, initializing with defaults');
            this.currentParams = this.getDefaultParams();
        }
        
        // Validate value parameter
        if (value === undefined || value === null) {
            console.error('buildParamsForVariation called with undefined value!', { paramName, value });
            // Return current params without modification as fallback
            return { ...this.getDefaultParams(), ...this.currentParams };
        }
        
        // Start with current params, ensuring defaults if not set
        const params = { 
            ...this.getDefaultParams(),
            ...this.currentParams 
        };
        
        // Validate that spriteNumber exists
        if (!params.spriteNumber && params.spriteNumber !== 0) {
            console.error('spriteNumber missing after merging params!', { paramName, value, params });
            params.spriteNumber = 8; // Force a default
        }
        
        // Apply the variation
        switch (paramName) {
            case 'sprite':
                params.spriteNumber = value;
                break;
            case 'pattern':
                params.peltName = value;
                break;
            case 'color':
                params.colour = value;
                break;
            case 'tortiePattern':
                params.isTortie = true;
                params.tortiePattern = value;
                break;
            case 'tortieColor':
                params.isTortie = true;
                params.tortieColour = value;
                break;
            case 'tortieMask':
                params.isTortie = true;
                params.tortieMask = value;
                break;
            case 'eyeColor':
                params.eyeColour = value;
                break;
            case 'eyeColor2':
                params.eyeColour2 = value;
                break;
            case 'skinColor':
                params.skinColour = value;
                break;
            case 'whitePatches':
                params.whitePatches = value;
                break;
            case 'points':
                params.points = value;
                break;
            case 'whiteTint':
                params.whitePatchesTint = value;
                break;
            case 'vitiligo':
                params.vitiligo = value;
                break;
            case 'tint':
                params.tint = value;
                break;
            case 'lineart':
                // Handle lineart style selection
                const isAprilFools = value.startsWith('aprilfools');
                params.aprilFools = isAprilFools;
                params.dead = (value === 'dead' || value === 'darkforest' || 
                              value === 'aprilfools-dead' || value === 'aprilfools-darkforest');
                params.darkForest = (value === 'darkforest' || value === 'aprilfools-darkforest');
                break;
            case 'plantAccessory':
            case 'wildAccessory':
            case 'collar':
                params.accessory = value;
                break;
            case 'battleScars':
            case 'missingScars':
            case 'environmentalScars':
                params.scar = value;
                break;
        }
        
        return params;
    }
    
    async generatePreview() {
        if (this.isGenerating) return;
        this.isGenerating = true;
        
        const loading = document.getElementById('previewLoading');
        const canvas = document.getElementById('catPreview');
        
        if (loading) loading.classList.add('active');
        
        try {
            const result = await this.generator.generateCat(this.currentParams);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
            
            // Update info display
            this.updateParamsDisplay();
        } catch (error) {
            console.error('Failed to generate preview:', error);
        }
        
        if (loading) loading.classList.remove('active');
        this.isGenerating = false;
    }
    
    updateParamsDisplay() {
        const display = document.getElementById('currentParams');
        if (!display) return;
        
        const params = [];
        params.push(`Sprite: ${this.currentParams.spriteNumber}`);
        params.push(`Pattern: ${this.currentParams.peltName}`);
        params.push(`Color: ${this.currentParams.colour}`);
        
        if (this.currentParams.isTortie) {
            params.push(`Tortie: ${this.currentParams.tortiePattern} ${this.currentParams.tortieColour}`);
            params.push(`Mask: ${this.currentParams.tortieMask}`);
        }
        
        params.push(`Eyes: ${this.currentParams.eyeColour}`);
        if (this.currentParams.eyeColour2) {
            params.push(`Eye 2: ${this.currentParams.eyeColour2}`);
        }
        
        params.push(`Skin: ${this.currentParams.skinColour}`);
        
        if (this.currentParams.whitePatches) {
            params.push(`White: ${this.currentParams.whitePatches}`);
        }
        
        if (this.currentParams.accessory) {
            params.push(`Accessory: ${this.currentParams.accessory}`);
        }
        
        if (this.currentParams.scar) {
            params.push(`Scar: ${this.currentParams.scar}`);
        }
        
        display.textContent = params.join(' | ');
    }
    
    formatName(value) {
        if (typeof value === 'number') return `#${value}`;
        return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    
    async randomizeAll() {
        this.currentParams = await this.generator.generateRandomParams();
        
        // Update UI to reflect new params
        this.updateUIFromParams();
        this.updatePreview();
    }
    
    resetAll() {
        this.currentParams = this.getDefaultParams();
        this.updateUIFromParams();
        this.updatePreview();
    }
    
    updateUIFromParams() {
        // Clear all selections
        document.querySelectorAll('.sprite-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Update header toggle buttons
        const shadingBtn = document.getElementById('shadingToggleBtn');
        if (shadingBtn) {
            shadingBtn.classList.toggle('active', this.currentParams.shading);
        }
        
        const reverseBtn = document.getElementById('reverseToggleBtn');
        if (reverseBtn) {
            reverseBtn.classList.toggle('active', this.currentParams.reverse);
        }
        
        const tortieBtn = document.getElementById('tortieToggleBtn');
        if (tortieBtn) {
            tortieBtn.classList.toggle('active', this.currentParams.isTortie);
        }
        
        // Update tortie sections visibility
        this.updateTortieSectionsVisibility();
        
        // Re-select current items - this will be updated when sprites are loaded
    }
    
    downloadCat() {
        const canvas = document.getElementById('catPreview');
        const link = document.createElement('a');
        link.download = 'my-perfect-cat.png';
        link.href = canvas.toDataURL();
        link.click();
    }
    
    shareURL() {
        const url = this.buildShareURL();
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Share URL copied!');
        });
    }
    
    copyCatURL() {
        const url = this.generator.buildCatURL(this.currentParams);
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Cat URL copied!');
        });
    }
    
    viewInMaker() {
        const url = this.generator.buildCatURL(this.currentParams);
        window.open(url, '_blank');
    }
    
    buildShareURL() {
        const params = new URLSearchParams();
        Object.entries(this.currentParams).forEach(([key, value]) => {
            if (value !== undefined && value !== 'none' && value !== false) {
                params.set(key, value);
            }
        });
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }
    
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        
        // Check if this is a pixel-cat-maker URL by looking for characteristic params
        const hasPixelCatMakerParams = params.has('peltName') || params.has('spriteNumber') || 
                                       params.has('colour') || params.has('eyeColour');
        
        if (hasPixelCatMakerParams) {
            // Parse pixel-cat-maker URL format
            this.loadFromPixelCatMakerURL(params);
        } else if (params.toString()) {
            // Parse our internal format only if there are URL params
            // Start with defaults to ensure all required fields are present
            const newParams = { ...this.getDefaultParams() };
            
            params.forEach((value, key) => {
                if (key in newParams) {
                    // Convert string values to appropriate types
                    if (value === 'true') {
                        newParams[key] = true;
                    } else if (value === 'false') {
                        newParams[key] = false;
                    } else if (!isNaN(value)) {
                        newParams[key] = Number(value);
                    } else {
                        newParams[key] = value;
                    }
                }
            });
            
            this.currentParams = newParams;
        } else {
            // No URL params - initialize with defaults
            this.currentParams = this.getDefaultParams();
        }
        
        this.updateUIFromParams();
    }
    
    loadFromPixelCatMakerURL(params) {
        // Reset to defaults first
        this.resetAll();
        
        // Map pixel-cat-maker params to our internal format
        params.forEach((value, key) => {
            switch(key) {
                case 'spriteNumber':
                    this.currentParams.spriteNumber = parseInt(value);
                    break;
                case 'peltName':
                    this.currentParams.peltName = value;
                    break;
                case 'colour':
                    this.currentParams.colour = value;
                    break;
                case 'isTortie':
                    this.currentParams.isTortie = value === 'true';
                    break;
                case 'tortiePattern':
                    this.currentParams.tortiePattern = value;
                    break;
                case 'tortieColour':
                    this.currentParams.tortieColour = value;
                    break;
                case 'tortieMask':
                    this.currentParams.tortieMask = value;
                    break;
                case 'eyeColour':
                    this.currentParams.eyeColour = value;
                    break;
                case 'eyeColour2':
                    this.currentParams.eyeColour2 = value;
                    break;
                case 'skinColour':
                    this.currentParams.skinColour = value;
                    break;
                case 'whitePatches':
                    this.currentParams.whitePatches = value;
                    break;
                case 'whitePatchesTint':
                    this.currentParams.whitePatchesTint = value;
                    break;
                case 'points':
                    this.currentParams.points = value;
                    break;
                case 'vitiligo':
                    this.currentParams.vitiligo = value;
                    break;
                case 'tint':
                    this.currentParams.tint = value;
                    break;
                case 'accessory':
                    this.currentParams.accessory = value;
                    break;
                case 'scar':
                    this.currentParams.scar = value;
                    break;
                case 'shading':
                    this.currentParams.shading = value === 'true';
                    break;
                case 'reverse':
                    this.currentParams.reverse = value === 'true';
                    break;
                // Ignore params we don't use
                case 'version':
                case 'backgroundColour':
                    break;
            }
        });
    }
    
    showToast(message) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2000);
        }
    }
    
    showUrlLoadModal() {
        const modal = document.getElementById('urlLoadModal');
        const input = document.getElementById('urlInput');
        if (modal && input) {
            modal.classList.add('active');
            input.value = '';
            input.focus();
        }
    }
    
    setupUrlLoadModal() {
        const modal = document.getElementById('urlLoadModal');
        const closeBtn = document.getElementById('urlLoadClose');
        const cancelBtn = document.getElementById('urlLoadCancel');
        const confirmBtn = document.getElementById('urlLoadConfirm');
        const input = document.getElementById('urlInput');
        
        const closeModal = () => {
            if (modal) modal.classList.remove('active');
        };
        
        const loadFromInput = () => {
            if (!input?.value) return;
            
            try {
                // Parse the URL
                const url = new URL(input.value);
                const params = new URLSearchParams(url.search);
                
                // Load the parameters
                this.loadFromPixelCatMakerURL(params);
                
                // Update UI
                this.updateUIFromParams();
                this.updatePreview();
                
                // Close modal and show success
                closeModal();
                this.showToast('Cat loaded successfully!');
            } catch (error) {
                console.error('Failed to parse URL:', error);
                this.showToast('Invalid URL format');
            }
        };
        
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (confirmBtn) confirmBtn.addEventListener('click', loadFromInput);
        
        // Allow Enter key to submit
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    loadFromInput();
                }
            });
        }
        
        // Setup Clan Cats modal
        this.setupClanCatsModal();
    }
    
    // Clan Cats Import functionality
    showClanCatsModal() {
        const modal = document.getElementById('clanCatsModal');
        if (modal) {
            modal.classList.add('active');
            // Show existing cats if any are loaded
            if (this.loadedClanCats.length > 0) {
                this.displayLoadedCats();
            }
        }
    }
    
    setupClanCatsModal() {
        const modal = document.getElementById('clanCatsModal');
        const closeBtn = document.getElementById('clanCatsClose');
        const cancelBtn = document.getElementById('clanCatsCancelBtn');
        const browseBtn = document.getElementById('clanCatsBrowseBtn');
        const pasteBtn = document.getElementById('clanCatsPasteBtn');
        const pasteArea = document.getElementById('clanCatsPasteArea');
        const loadBtn = document.getElementById('clanCatsLoadBtn');
        const fileInput = document.getElementById('clanCatsFile');
        
        const closeModal = () => {
            if (modal) {
                modal.classList.remove('active');
                // Hide paste area when closing
                pasteArea.style.display = 'none';
                loadBtn.style.display = 'none';
            }
        };
        
        // Close handlers
        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        
        // Browse button - trigger file input
        browseBtn?.addEventListener('click', () => {
            fileInput?.click();
        });
        
        // Paste button - show/hide paste area
        pasteBtn?.addEventListener('click', () => {
            const isVisible = pasteArea.style.display === 'block';
            pasteArea.style.display = isVisible ? 'none' : 'block';
            loadBtn.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                pasteArea.focus();
            }
        });
        
        // File input handler
        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    this.loadClanCats(data, true); // true = replace existing
                    // Reset file input so same file can be selected again
                    fileInput.value = '';
                } catch (error) {
                    console.error('Error loading file:', error);
                    this.showToast('Error loading file. Please check it\'s a valid JSON file.', 'error');
                }
            }
        });
        
        // Load button handler for paste
        loadBtn?.addEventListener('click', () => {
            if (pasteArea.value.trim()) {
                try {
                    const data = JSON.parse(pasteArea.value);
                    this.loadClanCats(data, true); // true = replace existing
                    // Hide paste area after successful load
                    pasteArea.style.display = 'none';
                    loadBtn.style.display = 'none';
                    pasteArea.value = '';
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                    this.showToast('Invalid JSON format. Please check your input.', 'error');
                }
            }
        });
        
        // Allow Enter key in paste area to load
        pasteArea?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                loadBtn?.click();
            }
        });
        
        // Close on overlay click
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    async loadClanCats(data, replace = false) {
        // Validate data
        if (!Array.isArray(data) || data.length === 0) {
            this.showToast('Invalid clan cats data format.', 'error');
            return;
        }
        
        // Store or append cats
        if (replace) {
            this.loadedClanCats = data;
            this.clanCatPreviews.clear(); // Clear preview cache if replacing
        } else {
            // Append new cats (avoid duplicates by ID)
            const existingIds = new Set(this.loadedClanCats.map(cat => cat.ID));
            const newCats = data.filter(cat => !existingIds.has(cat.ID));
            this.loadedClanCats.push(...newCats);
        }
        
        // Display the cats
        this.displayLoadedCats();
        
        // Generate previews for new cats
        const newCats = replace ? data : data.filter(cat => !this.clanCatPreviews.has(cat.ID));
        if (newCats.length > 0) {
            await this.generateClanCatPreviews(newCats);
        }
        
        this.showToast(`Loaded ${data.length} cats!`, 'success');
    }
    
    displayLoadedCats() {
        const grid = document.getElementById('clanCatsGrid');
        const gridLabel = document.getElementById('clanCatsGridLabel');
        
        if (!grid) return;
        
        // Clear grid
        grid.innerHTML = '';
        
        if (this.loadedClanCats.length === 0) {
            // Create and show empty state
            const emptyState = document.createElement('div');
            emptyState.id = 'clanCatsEmptyState';
            emptyState.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--muted); font-size: 14px;';
            emptyState.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.3;">🐱</div>
                <p>No cats loaded yet</p>
                <p style="font-size: 12px; margin-top: 8px;">Use the Browse or Paste buttons above to load your clan cats</p>
            `;
            grid.appendChild(emptyState);
            
            if (gridLabel) {
                gridLabel.style.display = 'none';
            }
        } else {
            // Show label and display cats
            if (gridLabel) {
                gridLabel.style.display = 'block';
            }
            
            // Create items for all loaded cats
            for (const catData of this.loadedClanCats) {
                const item = this.createClanCatItem(catData);
                grid.appendChild(item);
                
                // If we have a cached preview, apply it immediately
                if (this.clanCatPreviews.has(catData.ID)) {
                    this.applyCachedPreview(item, this.clanCatPreviews.get(catData.ID));
                }
            }
        }
    }
    
    applyCachedPreview(item, canvas) {
        // Create display canvas
        const displayCanvas = document.createElement('canvas');
        displayCanvas.className = 'clan-cat-canvas';
        displayCanvas.width = 150;
        displayCanvas.height = 150;
        const ctx = displayCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, 150, 150);
        
        // Replace loader with canvas
        const loader = item.querySelector('.clan-cat-loader');
        if (loader) {
            loader.replaceWith(displayCanvas);
        }
        
        // Remove loading class
        item.classList.remove('loading');
    }
    
    createClanCatItem(catData) {
        const item = document.createElement('div');
        item.className = 'clan-cat-item loading';
        item.dataset.catId = catData.ID;
        
        // Create loader
        const loader = document.createElement('div');
        loader.className = 'clan-cat-loader';
        loader.innerHTML = '<img src="../assets/images/paw.png" alt="Loading..." width="50" height="50">';
        item.appendChild(loader);
        
        // Create name label
        const nameLabel = document.createElement('div');
        nameLabel.className = 'clan-cat-name';
        nameLabel.textContent = `${catData.name_prefix || ''}${catData.name_suffix || ''}`;
        item.appendChild(nameLabel);
        
        // Create ID label
        const idLabel = document.createElement('div');
        idLabel.className = 'clan-cat-id';
        idLabel.textContent = `ID: ${catData.ID}`;
        item.appendChild(idLabel);
        
        // Store cat data on element
        item.catData = catData;
        
        // Add click handler
        item.addEventListener('click', () => {
            if (!item.classList.contains('loading')) {
                this.loadClanCatIntoBuilder(catData);
                document.getElementById('clanCatsModal').classList.remove('active');
            }
        });
        
        return item;
    }
    
    async generateClanCatPreviews(catsData) {
        // Process cats in batches to avoid overwhelming the browser
        const batchSize = 4;
        for (let i = 0; i < catsData.length; i += batchSize) {
            const batch = catsData.slice(i, i + batchSize);
            await Promise.all(batch.map(catData => this.generateSingleCatPreview(catData)));
        }
    }
    
    async generateSingleCatPreview(catData) {
        const item = document.querySelector(`.clan-cat-item[data-cat-id="${catData.ID}"]`);
        if (!item) return;
        
        // Check if we already have this preview cached
        if (this.clanCatPreviews.has(catData.ID)) {
            this.applyCachedPreview(item, this.clanCatPreviews.get(catData.ID));
            return;
        }
        
        try {
            // Convert clan cat data to generator params
            const params = this.mapClanCatToParams(catData);
            
            // Generate the cat - returns {canvas, dataURL}
            const result = await this.generator.generateCat(params);
            
            // Check if result has canvas property or is the canvas itself
            const sourceCanvas = result.canvas || result;
            
            // Cache the source canvas
            this.clanCatPreviews.set(catData.ID, sourceCanvas);
            
            // Create display canvas
            const displayCanvas = document.createElement('canvas');
            displayCanvas.className = 'clan-cat-canvas';
            displayCanvas.width = 150;
            displayCanvas.height = 150;
            const ctx = displayCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sourceCanvas, 0, 0, 150, 150);
            
            // Replace loader with canvas
            const loader = item.querySelector('.clan-cat-loader');
            if (loader) {
                loader.replaceWith(displayCanvas);
            }
            
            // Remove loading class
            item.classList.remove('loading');
        } catch (error) {
            console.error(`Error generating preview for cat ${catData.ID}:`, error);
            item.classList.remove('loading');
        }
    }
    
    mapClanCatToParams(catData) {
        const params = { ...this.getDefaultParams() };
        
        // Map sprite based on status/age
        if (catData.status === 'kitten' && catData.sprite_kitten !== undefined) {
            params.spriteNumber = catData.sprite_kitten;
        } else if (catData.status === 'apprentice' && catData.sprite_adolescent !== undefined) {
            params.spriteNumber = catData.sprite_adolescent;
        } else if (catData.status === 'elder' && catData.sprite_senior !== undefined) {
            params.spriteNumber = catData.sprite_senior;
        } else if (catData.paralyzed && catData.sprite_para_adult !== undefined) {
            params.spriteNumber = catData.sprite_para_adult;
        } else if (catData.sprite_adult !== undefined) {
            params.spriteNumber = catData.sprite_adult;
        }
        
        // Map pelt pattern
        if (catData.pelt_name) {
            params.peltName = catData.pelt_name;
        }
        
        // Map pelt color
        if (catData.pelt_color) {
            params.colour = catData.pelt_color;
        }
        
        // Map tortie/calico patterns
        if (catData.tortie_pattern) {
            params.isTortie = true;
            params.tortiePattern = catData.tortie_pattern;
            
            if (catData.tortie_color) {
                params.tortieColour = catData.tortie_color;
            }
            
            // Map pattern to tortieMask if available
            if (catData.pattern) {
                params.tortieMask = catData.pattern;
            }
        }
        
        // Map eye colors
        if (catData.eye_colour) {
            params.eyeColour = catData.eye_colour;
        }
        if (catData.eye_colour2) {
            params.eyeColour2 = catData.eye_colour2;
        }
        
        // Map skin color
        if (catData.skin) {
            params.skinColour = catData.skin;
        }
        
        // Map white patches
        if (catData.white_patches) {
            params.whitePatches = catData.white_patches;
        }
        
        // Map points
        if (catData.points) {
            params.points = catData.points;
        }
        
        // Map vitiligo
        if (catData.vitiligo) {
            params.vitiligo = catData.vitiligo;
        }
        
        // Map tints
        if (catData.tint && catData.tint !== 'none') {
            params.tint = catData.tint;
        }
        if (catData.white_patches_tint && catData.white_patches_tint !== 'none') {
            params.whitePatchesTint = catData.white_patches_tint;
        }
        
        // Map reverse
        if (catData.reverse !== undefined) {
            params.reverse = catData.reverse;
        }
        
        // Map accessories from inventory
        if (catData.inventory && catData.inventory.length > 0) {
            // Look for collar items in inventory
            for (const item of catData.inventory) {
                if (typeof item === 'string' && 
                    (item.includes('BELL') || item.includes('BOW') || 
                     item.includes('NYLON') || item.includes('COLLAR'))) {
                    params.accessory = item;
                    break;
                }
            }
        }
        
        // Map scars
        if (catData.scars && catData.scars.length > 0) {
            // Use the first scar
            params.scar = catData.scars[0];
        }
        
        // Map dead/dark forest status
        if (catData.dead) {
            params.dead = true;
        }
        if (catData.df) {
            params.darkForest = true;
        }
        
        return params;
    }
    
    loadClanCatIntoBuilder(catData) {
        // Map clan cat data to builder params
        const params = this.mapClanCatToParams(catData);
        
        // Update current params
        this.currentParams = params;
        
        // Update UI to reflect new params
        this.updateUIFromParams();
        this.updatePreview();
        
        // Show success message
        const catName = `${catData.name_prefix || ''}${catData.name_suffix || ''}`;
        this.showToast(`Loaded ${catName} into builder!`, 'success');
    }
}

// Initialize and expose builder globally for tests
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('cat-builder: initializing global catBuilder');
        window.catBuilder = new CatBuilder();
    });
} else {
    console.log('cat-builder: initializing global catBuilder (immediate)');
    window.catBuilder = new CatBuilder();
}

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                     document.activeElement.isContentEditable;
    if (!isTyping && e.key === 'Escape') {
        window.location.href = '../index.html';
    }
});