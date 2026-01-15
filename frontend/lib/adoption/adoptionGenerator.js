import catGenerator from '../single-cat/catGeneratorV3';
import spriteMapper from '../single-cat/spriteMapper.js';
import { encodeCatShare, createCatShare } from '../catShare';

const CONFIG = {
    CANVAS: {
        SIZE: 220
    },
    ANIMATION: {
        VARIATION_SAMPLES: 8,
        MIN_VARIATIONS: 4
    },
    TIMING: {
        FAST: 70,
        NORMAL: 120,
        SLOW: 240,
        BETWEEN_STAGES: 450
    }
};

const AFTERLIFE_DEFAULT = 'both10';

export class AdoptionGenerator {
    constructor(options = {}) {
        this.options = options || {};
        this.onBatchFinalized = typeof this.options.onBatchFinalized === 'function'
            ? this.options.onBatchFinalized
            : null;
        this.persistCat = typeof this.options.persistCat === 'function'
            ? this.options.persistCat
            : null;
        this.viewerBasePath = this.options.viewerBasePath || '/view';
        this.batchPersistToken = null;
        this.batchPersisted = false;
        this.lastSettingsSnapshot = null;
        this.currentLayerConfig = null;
        this.currentBatchTitle = '';
        this.currentBatchCreator = '';
        this.currentBatchTitleDraft = '';
        this.currentBatchCreatorDraft = '';
        this.onGenerationStart = typeof this.options.onGenerationStart === 'function'
            ? this.options.onGenerationStart
            : null;
        this.onRevealComplete = typeof this.options.onRevealComplete === 'function'
            ? this.options.onRevealComplete
            : null;

        this.generateButton = document.getElementById('generateButton');
        this.speedGroup = document.getElementById('speedGroup');
        this.accCountSelect = document.getElementById('accCount');
        this.scarCountSelect = document.getElementById('scarCount');
        this.tortieCountSelect = document.getElementById('tortieCount');
        this.afterlifeSelect = document.getElementById('afterlifeMode');
        this.stageStatusEl = document.getElementById('stageStatus');
        this.catCountDisplay = document.getElementById('catCountDisplay');
        this.catGrid = document.getElementById('catGrid');
        this.removalTip = document.getElementById('removalTip');
        this.paletteButtons = Array.from(document.querySelectorAll('[data-extended-mode]'));
        this.paletteReset = document.querySelector('[data-extended-reset]');
        this.cardTemplate = document.getElementById('catCardTemplate');

        this.selectedExtendedModes = new Set();
        this.includeBaseColours = true;
        this.whitePatchColourMode = 'default';
        this.currentSpeed = 'normal';
        this.parameterOptions = null;
        this.defaults = {};
        this.stagePlan = [];
        this.catPlans = [];
        this.spriteOptions = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18];
        this.spriteNames = {
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
            18: 'Sick Adult (18)'
        };
        this.isGenerating = false;
        this.awaitingRemoval = false;
        this.pendingRemovals = 0;

        this.speedDurations = {
            fast: CONFIG.TIMING.FAST,
            normal: CONFIG.TIMING.NORMAL,
            slow: CONFIG.TIMING.SLOW
        };

        this.overlay = document.getElementById('catDetailOverlay');
        this.overlayCanvas = document.getElementById('detailCanvas');
        this.overlayTable = document.getElementById('detailTable');
        this.overlayTitle = document.getElementById('detailTitle');
        this.overlayCopyBigBtn = document.getElementById('detailCopyBig');
        this.overlayCopyShareBtn = document.getElementById('detailCopyShare');
        this.overlayOpenViewerBtn = document.getElementById('detailOpenViewer');
        this.overlayOpenSpritesBtn = document.getElementById('detailOpenSprites');
        this.spriteGalleryOverlay = document.getElementById('spriteGalleryOverlay');
        this.spriteGalleryGrid = document.getElementById('spriteGalleryGrid');
        this.overlayBatchTitle = document.getElementById('detailBatchTitle');
        this.overlayBatchCreator = document.getElementById('detailBatchCreator');
        if (this.overlayCopyBigBtn) {
            this.overlayCopyBigBtn.dataset.originalText = this.overlayCopyBigBtn.textContent;
        }
        if (this.overlayCopyShareBtn) {
            this.overlayCopyShareBtn.dataset.originalText = this.overlayCopyShareBtn.textContent;
        }
        if (this.overlayOpenViewerBtn) {
            this.overlayOpenViewerBtn.disabled = true;
            this.overlayOpenViewerBtn.dataset.originalText = this.overlayOpenViewerBtn.textContent;
        }
        this.overlayCloseTargets = Array.from(document.querySelectorAll('[data-overlay-close]'));
        this.spriteGalleryCloseTargets = Array.from(document.querySelectorAll('[data-sprite-gallery-close]'));

        this.quickPreviewPopup = null;
        this.quickPreviewCanvas = null;
        this.createQuickPreviewPopup();

        this.currentDetailPlan = null;
        this.currentDetailParams = null;
        this.currentBatchTitle = '';
        this.currentBatchCreator = '';
        this.currentBatchTitleDraft = '';
        this.currentBatchCreatorDraft = '';
        this.detailShareUrl = '';
        this.detailRenderToken = null;
        this.isRevealComplete = false;
        this.spriteGalleryPreviews = [];

        this.setupEventListeners();
        this.init().catch(err => {
            console.error('Failed to initialize adoption generator', err);
            this.stageStatusEl.textContent = 'Initialization error. Try refreshing the page.';
        });
    }

    async init() {
        await spriteMapper.init();
        this.parameterOptions = await this.getParameterOptions();
        this.defaults = this.buildDefaults();
        this.updateExtendedPaletteButtons();
        this.updateGenerateButtonState();
        this.clearGrid();
    }

    setupEventListeners() {
        if (this.generateButton) {
            this.generateButton.addEventListener('click', () => {
                if (!this.isGenerating) {
                    this.generate().catch(err => {
                        console.error('Generation failed', err);
                        this.finishGenerationWithError('Failed to generate cats. Please try again.');
                    });
                }
            });
        }

        if (this.speedGroup) {
            this.speedGroup.addEventListener('sl-change', (event) => {
                if (event?.target?.value) {
                    this.currentSpeed = event.target.value;
                }
            });
        }

        if (this.paletteButtons.length) {
            this.paletteButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = btn.dataset.extendedMode;
                    if (!mode) return;
                    if (mode === 'base') {
                        this.includeBaseColours = !this.includeBaseColours;
                    } else if (this.selectedExtendedModes.has(mode)) {
                        this.selectedExtendedModes.delete(mode);
                    } else {
                        this.selectedExtendedModes.add(mode);
                    }
                    this.onPaletteChange();
                });
            });
        }

        if (this.paletteReset) {
            this.paletteReset.addEventListener('click', () => {
                this.includeBaseColours = true;
                this.selectedExtendedModes.clear();
                this.onPaletteChange();
            });
        }

        if (this.catGrid) {
            this.catGrid.addEventListener('click', (event) => {
                const removeBtn = event.target.closest('.cat-remove');
                if (!removeBtn) return;
                const card = removeBtn.closest('.cat-card');
                if (!card || !this.awaitingRemoval) return;
                const catId = card.dataset.catId;
                if (catId) {
                    this.handleRemoval(catId);
                }
            });
        }

        if (this.overlay) {
            this.overlayCloseTargets.forEach(el => {
                el.addEventListener('click', () => this.closeDetailOverlay());
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    if (this.spriteGalleryOverlay && this.spriteGalleryOverlay.classList.contains('open')) {
                        this.closeSpriteGallery();
                        return;
                    }
                    this.closeDetailOverlay();
                }
            });

            if (this.overlayCopyBigBtn) {
                this.overlayCopyBigBtn.addEventListener('click', async () => {
                    if (!this.overlayCanvas) return;
                    try {
                        await this.copyCanvasToClipboard(this.overlayCanvas, 700);
                        this.flashButton(this.overlayCopyBigBtn, 'Copied!');
                    } catch (error) {
                        console.error('Failed to copy cat image:', error);
                        this.flashButton(this.overlayCopyBigBtn, 'Copy failed');
                    }
                });
            }

            if (this.overlayCopyShareBtn) {
                this.overlayCopyShareBtn.addEventListener('click', async () => {
                    if (!this.detailShareUrl) return;
                    try {
                        await navigator.clipboard.writeText(this.detailShareUrl);
                        this.flashButton(this.overlayCopyShareBtn, 'URL Copied!');
                    } catch (error) {
                        console.error('Failed to copy share URL:', error);
                        this.flashButton(this.overlayCopyShareBtn, 'Copy failed');
                    }
                });
            }

            if (this.overlayOpenViewerBtn) {
                this.overlayOpenViewerBtn.addEventListener('click', () => {
                    if (!this.detailShareUrl) return;
                    try {
                        window.open(this.detailShareUrl, '_blank', 'noopener=yes');
                    } catch (error) {
                        console.error('Failed to open viewer:', error);
                        this.flashButton(this.overlayOpenViewerBtn, 'Open failed');
                    }
                });
            }

            if (this.overlayOpenSpritesBtn) {
                this.overlayOpenSpritesBtn.addEventListener('click', () => {
                    this.openSpriteGallery();
                    if (!this.spriteGalleryPreviews.length && this.currentDetailParams) {
                        this.prepareSpriteGallery(this.currentDetailParams, this.detailRenderToken, { force: true })
                            .catch(error => console.error('Failed to prepare sprite gallery', error));
                    }
                });
            }
        }

        if (this.spriteGalleryOverlay) {
            this.spriteGalleryCloseTargets.forEach(el => {
                el.addEventListener('click', () => this.closeSpriteGallery());
            });
        }
    }

    async generate() {
        if (!this.hasActivePalettes()) {
            this.stageStatusEl.textContent = 'Select at least one colour palette before generating.';
            return;
        }

        if (!this.parameterOptions) {
            this.parameterOptions = await this.getParameterOptions();
            this.defaults = this.buildDefaults();
        }

        this.closeDetailOverlay(true);
        this.isGenerating = true;
        this.isRevealComplete = false;
        this.awaitingRemoval = false;
        this.pendingRemovals = 0;
        this.updateGenerateButtonState();
        this.stageStatusEl.textContent = 'Preparing adoption roll...';
        this.clearGrid();

        this.batchPersistToken = Symbol('batch');
        this.batchPersisted = false;
        if (typeof this.onGenerationStart === 'function') {
            try {
                this.onGenerationStart();
            } catch (error) {
                console.warn('onGenerationStart callback failed', error);
            }
        }

        const layerConfig = this.getLayerConfig();
        this.currentLayerConfig = layerConfig;
        this.lastSettingsSnapshot = this.buildSettingsSnapshot(layerConfig);
        this.stagePlan = this.buildStagePlan(layerConfig);
        const startCount = 10 + this.stagePlan.length;

        try {
            this.catPlans = await this.generateCatPlans(startCount, layerConfig);
        } catch (error) {
            throw error;
        }

        await this.renderCatCards();
        this.updateCatCount();

        try {
            await this.runStageSequence();
            this.finishGeneration();
        } catch (error) {
            this.finishGenerationWithError('Generation interrupted. Please try again.');
            throw error;
        }
    }

    async runStageSequence() {
        for (const stage of this.stagePlan) {
            this.stageStatusEl.textContent = `Rolling ${stage.label}...`;
            await this.animateStage(stage);
            await this.enterRemovalPhase(stage);
            await this.wait(this.speedDurations[this.currentSpeed] + CONFIG.TIMING.BETWEEN_STAGES);
        }
    }

    async animateStage(stage) {
        const tasks = this.catPlans.map(plan => this.animateStageForCat(plan, stage));
        await Promise.all(tasks);
    }

    async animateStageForCat(plan, stage) {
        if (stage.type === 'tortie') {
            await this.animateTortieLayer(plan, stage);
            return;
        }
        if (stage.type === 'tortie-sub') {
            await this.animateTortieSubElement(plan, stage);
            return;
        }
        if (stage.type === 'accessory') {
            await this.animateAccessorySlot(plan, stage);
            return;
        }
        if (stage.type === 'scar') {
            await this.animateScarSlot(plan, stage);
            return;
        }
        await this.animateSimpleParameter(plan, stage);
    }

    async enterRemovalPhase(stage) {
        if (this.catPlans.length <= 10) {
            if (this.catPlans.length === 10) {
                this.stageStatusEl.textContent = 'Ten finalists locked in—continuing reveals.';
            } else {
                this.stageStatusEl.textContent = 'Keeping the current pool—continuing reveals.';
            }
            this.removalTip.textContent = 'Removals complete—enjoy the rest of the reveal.';
            return;
        }

        this.pendingRemovals = 1;
        this.awaitingRemoval = true;
        this.catGrid.classList.add('removal-mode');
        this.catPlans.forEach(plan => plan.card.classList.add('removal-enabled'));
        this.stageStatusEl.textContent = `Remove one cat after ${stage.label}.`;
        this.removalTip.textContent = 'Hover a cat and click ✕ to remove it.';
        await this.waitForRemoval();
        this.awaitingRemoval = false;
        this.catGrid.classList.remove('removal-mode');
        this.catPlans.forEach(plan => plan.card.classList.remove('removal-enabled'));
    }

    async waitForRemoval() {
        while (this.pendingRemovals > 0) {
            await this.wait(50);
        }
    }

    handleRemoval(catId) {
        if (!this.awaitingRemoval) return;
        const index = this.catPlans.findIndex(plan => plan.id === catId);
        if (index === -1) return;
        const [plan] = this.catPlans.splice(index, 1);
        plan.card.classList.add('force-overlay');
        plan.card.style.opacity = '0';
        setTimeout(() => {
            plan.card.remove();
        }, 250);
        this.pendingRemovals = Math.max(0, this.pendingRemovals - 1);
        this.stageStatusEl.textContent = 'Cat removed—rolling continues.';
        this.removalTip.textContent = 'Watch the next reveal.';
        this.refreshLabels();
        this.updateCatCount();
    }

    refreshLabels() {
        this.catPlans.forEach((plan, idx) => {
            plan.index = idx + 1;
            if (plan.labelEl) {
                plan.labelEl.textContent = `Cat ${plan.index}`;
            }
        });
    }

    finishGeneration() {
        this.stageStatusEl.textContent = 'Finalised ten cats! You can regenerate to try again.';
        this.removalTip.textContent = 'Generation complete.';
        this.isGenerating = false;
        this.isRevealComplete = true;
        this.updateGenerateButtonState();
        if (typeof this.onRevealComplete === 'function') {
            try {
                this.onRevealComplete();
            } catch (error) {
                console.warn('onRevealComplete callback failed', error);
            }
        }
        this.handleBatchFinalized();
    }

    async handleBatchFinalized() {
        if (!this.onBatchFinalized) return;
        if (!Array.isArray(this.catPlans) || this.catPlans.length === 0) return;
        if (!this.batchPersistToken) return;
        if (this.batchPersisted) return;

        const token = this.batchPersistToken;
        const finalPlans = this.catPlans.slice(0, 10);
        const cats = finalPlans.map((plan, index) => this.buildCatExport(plan, index));
        const snapshot = this.lastSettingsSnapshot ? { ...this.lastSettingsSnapshot } : null;

        try {
            await this.onBatchFinalized({
                token,
                cats,
                settings: snapshot,
                totalFinalCats: cats.length,
                createdAt: Date.now()
            });
            if (this.batchPersistToken === token) {
                this.batchPersisted = true;
            }
        } catch (error) {
            console.error('Failed to persist adoption batch', error);
        }
    }

    finishGenerationWithError(message) {
        console.error(message);
        this.stageStatusEl.textContent = message;
        this.isGenerating = false;
        this.isRevealComplete = false;
        this.awaitingRemoval = false;
        this.pendingRemovals = 0;
        this.updateGenerateButtonState();
        this.closeDetailOverlay(true);
    }

    getLayerConfig() {
        return {
            accessoryCount: this.parseSelectValue(this.accCountSelect, 2),
            scarCount: this.parseSelectValue(this.scarCountSelect, 2),
            tortieCount: this.parseSelectValue(this.tortieCountSelect, 2)
        };
    }

    buildSettingsSnapshot(layerConfig) {
        return {
            accessoryCount: layerConfig?.accessoryCount ?? 0,
            scarCount: layerConfig?.scarCount ?? 0,
            tortieCount: layerConfig?.tortieCount ?? 0,
            includeBaseColours: !!this.includeBaseColours,
            selectedExtendedModes: Array.from(this.selectedExtendedModes ?? []),
            whitePatchColourMode: this.whitePatchColourMode || 'default',
            afterlifeMode: this.afterlifeSelect ? this.afterlifeSelect.value : AFTERLIFE_DEFAULT,
            speed: this.currentSpeed,
            timestamp: Date.now()
        };
    }

    parseSelectValue(select, fallback) {
        if (!select) return fallback;
        const parsed = parseInt(select.value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    buildStagePlan({ accessoryCount, scarCount, tortieCount }) {
        const stages = [];
        stages.push({ id: 'colour', label: 'Colour', type: 'simple', param: 'colour' });
        stages.push({ id: 'peltName', label: 'Pelt', type: 'simple', param: 'peltName' });
        stages.push({ id: 'eyeColour', label: 'Eyes', type: 'simple', param: 'eyeColour' });
        stages.push({ id: 'eyeColour2', label: 'Eye Colour 2', type: 'simple', param: 'eyeColour2' });

        for (let i = 0; i < tortieCount; i++) {
            stages.push({ id: `tortie-${i}-mask`, label: `Tortie ${i + 1} Mask`, type: 'tortie-sub', layerIndex: i, subElement: 'mask' });
            stages.push({ id: `tortie-${i}-pattern`, label: `Tortie ${i + 1} Pelt`, type: 'tortie-sub', layerIndex: i, subElement: 'pattern' });
            stages.push({ id: `tortie-${i}-colour`, label: `Tortie ${i + 1} Colour`, type: 'tortie-sub', layerIndex: i, subElement: 'colour' });
        }

        stages.push({ id: 'tint', label: 'Tint', type: 'simple', param: 'tint' });
        stages.push({ id: 'skinColour', label: 'Skin', type: 'simple', param: 'skinColour' });
        stages.push({ id: 'whitePatches', label: 'White Patches', type: 'simple', param: 'whitePatches' });
        stages.push({ id: 'points', label: 'Points', type: 'simple', param: 'points' });
        stages.push({ id: 'whitePatchesTint', label: 'Patches Tint', type: 'simple', param: 'whitePatchesTint' });
        stages.push({ id: 'vitiligo', label: 'Vitiligo', type: 'simple', param: 'vitiligo' });

        for (let i = 0; i < accessoryCount; i++) {
            stages.push({ id: `accessory-${i}`, label: `Accessory ${i + 1}`, type: 'accessory', slotIndex: i });
        }

        for (let i = 0; i < scarCount; i++) {
            stages.push({ id: `scar-${i}`, label: `Scar ${i + 1}`, type: 'scar', slotIndex: i });
        }

        stages.push({ id: 'shading', label: 'Shading', type: 'simple', param: 'shading' });
        stages.push({ id: 'reverse', label: 'Reverse', type: 'simple', param: 'reverse' });
        stages.push({ id: 'spriteNumber', label: 'Sprite', type: 'simple', param: 'spriteNumber' });
        return stages;
    }

    async generateCatPlans(count, layerConfig) {
        const plans = [];
        for (let i = 0; i < count; i++) {
            const params = await this.generateRandomParams(layerConfig);
            plans.push(this.buildCatPlan(i, params, layerConfig));
        }
        return plans;
    }

    async generateRandomParams(layerConfig) {
        const randomResult = await catGenerator.generateRandomParams({
            accessoryCount: layerConfig.accessoryCount,
            scarCount: layerConfig.scarCount,
            tortieCount: layerConfig.tortieCount,
            experimentalColourMode: this.getExperimentalModeValue(),
            whitePatchColourMode: this.whitePatchColourMode,
            includeBaseColours: this.includeBaseColours
        });

        const { darkForest: enableDarkForest, dead: enableDead } = this.resolveAfterlifeFlags();

        randomResult.darkForest = enableDarkForest;
        randomResult.darkMode = enableDarkForest;
        randomResult.dead = enableDead;

        this.ensureLayerDepth(randomResult, layerConfig);
        return randomResult;
    }

    resolveAfterlifeFlags() {
        const value = this.afterlifeSelect ? this.afterlifeSelect.value : AFTERLIFE_DEFAULT;
        switch (value) {
            case 'off':
                return { darkForest: false, dead: false };
            case 'dark10':
                return { darkForest: Math.random() < 0.1, dead: false };
            case 'star10':
                return { darkForest: false, dead: Math.random() < 0.1 };
            case 'both10':
                return {
                    darkForest: Math.random() < 0.1,
                    dead: Math.random() < 0.1
                };
            case 'darkForce':
                return { darkForest: true, dead: false };
            case 'starForce':
                return { darkForest: false, dead: true };
            default:
                return { darkForest: false, dead: false };
        }
    }

    buildCatPlan(index, params, layerConfig) {
        const accessorySlots = this.fillSlots(layerConfig.accessoryCount, params.accessories);
        const scarSlots = this.fillSlots(layerConfig.scarCount, params.scars);
        const tortieSlots = this.fillTortieSlots(layerConfig.tortieCount, params.tortie);

        const state = this.buildInitialState(params, accessorySlots.length, scarSlots.length, tortieSlots.length);

        return {
            id: `cat-${Date.now()}-${index}`,
            index: index + 1,
            params,
            accessorySlots,
            scarSlots,
            tortieSlots,
            state,
            card: null,
            canvas: null,
            labelEl: null,
            valueEl: null
        };
    }

    fillSlots(slotCount, values = []) {
        const slots = [];
        for (let i = 0; i < slotCount; i++) {
            const value = values?.[i] || null;
            slots.push(value || 'none');
        }
        return slots;
    }

    fillTortieSlots(slotCount, values = []) {
        const slots = [];
        for (let i = 0; i < slotCount; i++) {
            const value = values?.[i] || null;
            slots.push(value);
        }
        return slots;
    }

    buildInitialState(params, accessoryCount, scarCount, tortieCount) {
        const state = {
            spriteNumber: 8,
            peltName: 'SingleColour',
            colour: this.defaults.colour,
            tint: 'none',
            skinColour: this.defaults.skinColour,
            eyeColour: this.defaults.eyeColour,
            eyeColour2: 'none',
            whitePatches: 'none',
            whitePatchesTint: 'none',
            points: 'none',
            vitiligo: 'none',
            shading: false,
            reverse: false,
            dead: params.dead,
            darkForest: params.darkForest,
            isTortie: false,
            accessorySlots: Array(accessoryCount).fill('none'),
            scarSlots: Array(scarCount).fill('none'),
            tortieLayers: Array(tortieCount).fill(null),
            tortieRevealed: Array(tortieCount).fill(null).map(() => ({ mask: false, pattern: false, colour: false }))
        };
        return state;
    }

    async renderCatCards() {
        this.clearGrid();
        const fragment = document.createDocumentFragment();
        this.catPlans.forEach(plan => {
            const { card, canvas, labelEl, valueEl } = this.createCatCard(plan);
            fragment.appendChild(card);
            plan.card = card;
            plan.canvas = canvas;
            plan.labelEl = labelEl;
            plan.valueEl = valueEl;
        });
        this.catGrid.appendChild(fragment);
        await Promise.all(this.catPlans.map(plan => this.drawCat(plan.state, plan.canvas)));
    }

    createCatCard(plan) {
        const card = document.createElement('article');
        card.className = 'cat-card';
        card.dataset.catId = plan.id;

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'cat-canvas-wrapper';

        const canvas = document.createElement('canvas');
        canvas.className = 'cat-canvas';
        canvas.width = CONFIG.CANVAS.SIZE;
        canvas.height = CONFIG.CANVAS.SIZE;

        const overlay = document.createElement('div');
        overlay.className = 'cat-overlay';

        const removeButton = document.createElement('button');
        removeButton.className = 'cat-remove';
        removeButton.type = 'button';
        removeButton.title = 'Remove this cat';
        removeButton.textContent = '✕';

        overlay.appendChild(removeButton);
        canvasWrapper.appendChild(canvas);
        canvasWrapper.appendChild(overlay);

        const meta = document.createElement('div');
        meta.className = 'cat-meta';

        const labelRow = document.createElement('div');
        labelRow.className = 'cat-label-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'cat-label';
        labelEl.textContent = `Cat ${plan.index}`;

        const previewButton = document.createElement('button');
        previewButton.className = 'cat-preview';
        previewButton.type = 'button';
        previewButton.title = 'Preview larger';
        previewButton.textContent = '🔍';
        previewButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.openQuickPreview(plan);
        });

        labelRow.appendChild(labelEl);
        labelRow.appendChild(previewButton);

        const valueEl = document.createElement('span');
        valueEl.className = 'cat-stage-value';
        valueEl.textContent = 'Rolling soon…';

        meta.appendChild(labelRow);
        meta.appendChild(valueEl);

        card.appendChild(canvasWrapper);
        card.appendChild(meta);

        card.addEventListener('click', (event) => {
            if (event.target.closest('.cat-remove')) return;
            if (event.target.closest('.cat-preview')) return;
            if (this.isGenerating || this.awaitingRemoval || !this.isRevealComplete) return;
            this.openDetailOverlay(plan);
        });

        return { card, canvas, labelEl, valueEl };
    }

    clearGrid() {
        if (this.catGrid) {
            this.catGrid.innerHTML = '';
        }
    }

    updateCatCount() {
        if (!this.catCountDisplay) return;
        this.catCountDisplay.textContent = `${this.catPlans.length}`;
    }

    async animateSimpleParameter(plan, stage) {
        const finalValue = this.getStageValue(plan, stage);
        const variations = this.sampleVariations(stage.param, finalValue);
        const baseState = this.cloneState(plan.state);

        for (const value of variations) {
            const tempState = this.cloneState(baseState);
            this.applyStageValue(tempState, stage, value);
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        this.applyStageValue(plan.state, stage, finalValue);
        await this.drawCat(plan.state, plan.canvas);
        plan.valueEl.textContent = this.describeStageValue(stage, finalValue);
    }

    async animateAccessorySlot(plan, stage) {
        const finalValue = plan.accessorySlots[stage.slotIndex] || 'none';
        const options = this.sampleVariations('accessory', finalValue);
        const baseState = this.cloneState(plan.state);

        for (const value of options) {
            const tempState = this.cloneState(baseState);
            tempState.accessorySlots[stage.slotIndex] = value;
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        plan.state.accessorySlots[stage.slotIndex] = finalValue;
        await this.drawCat(plan.state, plan.canvas);
        plan.valueEl.textContent = this.describeStageValue(stage, finalValue);
    }

    async animateScarSlot(plan, stage) {
        const finalValue = plan.scarSlots[stage.slotIndex] || 'none';
        const options = this.sampleVariations('scar', finalValue);
        const baseState = this.cloneState(plan.state);

        for (const value of options) {
            const tempState = this.cloneState(baseState);
            tempState.scarSlots[stage.slotIndex] = value;
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        plan.state.scarSlots[stage.slotIndex] = finalValue;
        await this.drawCat(plan.state, plan.canvas);
        plan.valueEl.textContent = this.describeStageValue(stage, finalValue);
    }

    async animateTortieLayer(plan, stage) {
        const layer = plan.tortieSlots[stage.layerIndex];
        if (!layer) {
            plan.state.tortieLayers[stage.layerIndex] = null;
            plan.state.isTortie = plan.state.tortieLayers.some(l => l);
            await this.drawCat(plan.state, plan.canvas);
            plan.valueEl.textContent = `${stage.label}: None`;
            return;
        }

        const baseState = this.cloneState(plan.state);
        const maskOptions = this.sampleVariations('tortieMask', layer.mask);
        for (const mask of maskOptions) {
            const tempState = this.cloneState(baseState);
            tempState.tortieLayers[stage.layerIndex] = { mask, pattern: layer.pattern, colour: layer.colour };
            tempState.isTortie = true;
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        const patternOptions = this.sampleVariations('tortiePattern', layer.pattern);
        for (const pattern of patternOptions) {
            const tempState = this.cloneState(baseState);
            tempState.tortieLayers[stage.layerIndex] = { mask: layer.mask, pattern, colour: layer.colour };
            tempState.isTortie = true;
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        const colourOptions = this.sampleVariations('tortieColour', layer.colour);
        for (const colour of colourOptions) {
            const tempState = this.cloneState(baseState);
            tempState.tortieLayers[stage.layerIndex] = { mask: layer.mask, pattern: layer.pattern, colour };
            tempState.isTortie = true;
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        plan.state.tortieLayers[stage.layerIndex] = { ...layer };
        plan.state.isTortie = plan.state.tortieLayers.some(l => l);
        await this.drawCat(plan.state, plan.canvas);
        plan.valueEl.textContent = this.describeTortieLayer(stage, layer);
    }

    async animateTortieSubElement(plan, stage) {
        const { layerIndex, subElement } = stage;
        const layer = plan.tortieSlots[layerIndex];

        if (!layer) {
            plan.state.tortieLayers[layerIndex] = null;
            plan.state.isTortie = plan.state.tortieLayers.some(l => l);
            await this.drawCat(plan.state, plan.canvas);
            plan.valueEl.textContent = `Tortie Layer ${layerIndex + 1}: None`;
            return;
        }

        const revealed = plan.state.tortieRevealed[layerIndex];

        // Get or initialize placeholder values for this layer
        if (!plan.tortiePlaceholders) {
            plan.tortiePlaceholders = {};
        }
        if (!plan.tortiePlaceholders[layerIndex]) {
            const patternOptions = this.parameterOptions?.tortiePattern || [];
            const maskOptions = this.parameterOptions?.tortieMask || [];
            plan.tortiePlaceholders[layerIndex] = {
                mask: maskOptions.length > 0 ? maskOptions[0] : layer.mask,
                pattern: patternOptions.length > 0 ? patternOptions[0] : layer.pattern,
                colour: 'WHITE'
            };
        }
        const placeholders = plan.tortiePlaceholders[layerIndex];

        // Build current layer state with revealed values + placeholders for unrevealed
        const currentLayer = {
            mask: revealed.mask ? (plan.state.tortieLayers[layerIndex]?.mask || layer.mask) : placeholders.mask,
            pattern: revealed.pattern ? (plan.state.tortieLayers[layerIndex]?.pattern || layer.pattern) : placeholders.pattern,
            colour: revealed.colour ? (plan.state.tortieLayers[layerIndex]?.colour || layer.colour) : placeholders.colour
        };

        const paramMap = {
            mask: 'tortieMask',
            pattern: 'tortiePattern',
            colour: 'tortieColour'
        };
        const paramKey = paramMap[subElement];
        const finalValue = layer[subElement];
        const options = this.sampleVariations(paramKey, finalValue);

        for (const value of options) {
            const tempState = this.cloneState(plan.state);
            const tempLayer = {
                mask: subElement === 'mask' ? value : currentLayer.mask,
                pattern: subElement === 'pattern' ? value : currentLayer.pattern,
                colour: subElement === 'colour' ? value : currentLayer.colour
            };
            tempState.tortieLayers[layerIndex] = tempLayer;
            tempState.isTortie = true;
            await this.drawCat(tempState, plan.canvas);
            await this.wait(this.speedDurations[this.currentSpeed]);
        }

        // Update revealed state
        revealed[subElement] = true;

        // Build final layer with revealed value + keep placeholders for unrevealed
        const finalLayer = {
            mask: subElement === 'mask' ? finalValue : currentLayer.mask,
            pattern: subElement === 'pattern' ? finalValue : currentLayer.pattern,
            colour: subElement === 'colour' ? finalValue : currentLayer.colour
        };

        plan.state.tortieLayers[layerIndex] = finalLayer;
        plan.state.isTortie = true;
        await this.drawCat(plan.state, plan.canvas);
        plan.valueEl.textContent = this.describeTortieSubElement(layerIndex, finalLayer, revealed);
    }

    getStageValue(plan, stage) {
        if (stage.param === 'spriteNumber') {
            return plan.params.spriteNumber;
        }
        if (stage.param === 'whitePatches') {
            return plan.params.whitePatches || 'none';
        }
        if (stage.param === 'points') {
            return plan.params.points || 'none';
        }
        if (stage.param === 'whitePatchesTint') {
            return plan.params.whitePatchesTint || 'none';
        }
        if (stage.param === 'vitiligo') {
            return plan.params.vitiligo || 'none';
        }
        if (stage.param === 'eyeColour2') {
            return plan.params.eyeColour2 || 'none';
        }
        return plan.params[stage.param];
    }

    describeStageValue(stage, value) {
        if (stage.type === 'accessory' || stage.type === 'scar') {
            return `${stage.label}: ${this.formatValue(value)}`;
        }
        if (stage.param === 'eyeColour2' && (!value || value === 'none')) {
            return `${stage.label}: None`;
        }
        if (stage.param === 'shading' || stage.param === 'reverse') {
            return `${stage.label}: ${value ? 'Enabled' : 'Disabled'}`;
        }
        if (stage.param === 'spriteNumber') {
            const spriteLabel = (value !== undefined && value !== null)
                ? (this.spriteNames[value] || `Sprite ${value}`)
                : 'Unknown Sprite';
            return `${stage.label}: ${spriteLabel}`;
        }
        return `${stage.label}: ${this.formatValue(value)}`;
    }

    describeTortieLayer(stage, layer) {
        if (!layer) return `${stage.label}: None`;
        const parts = [layer.mask, layer.pattern, layer.colour].map(v => this.formatValue(v));
        return `${stage.label}: ${parts.join(' • ')}`;
    }

    describeTortieSubElement(layerIndex, layer, revealed) {
        if (!layer) return `Tortie Layer ${layerIndex + 1}: None`;
        const parts = [
            revealed?.mask ? this.formatValue(layer.mask) : '—',
            revealed?.pattern ? this.formatValue(layer.pattern) : '—',
            revealed?.colour ? this.formatValue(layer.colour) : '—'
        ];
        return `Tortie Layer ${layerIndex + 1}: ${parts.join(' • ')}`;
    }

    applyStageValue(state, stage, value) {
        if (stage.type === 'simple') {
            if (stage.param === 'whitePatches' && value === 'none') {
                state.whitePatches = 'none';
                return;
            }
            if (stage.param === 'points' && value === 'none') {
                state.points = 'none';
                return;
            }
            if (stage.param === 'whitePatchesTint' && value === 'none') {
                state.whitePatchesTint = 'none';
                return;
            }
            if (stage.param === 'vitiligo' && value === 'none') {
                state.vitiligo = 'none';
                return;
            }
            if (stage.param === 'eyeColour2' && (!value || value === 'none')) {
                state.eyeColour2 = 'none';
                return;
            }
            if (stage.param === 'spriteNumber') {
                state.spriteNumber = value;
                return;
            }
            state[stage.param] = value;
            return;
        }
        if (stage.type === 'accessory') {
            state.accessorySlots[stage.slotIndex] = value;
            return;
        }
        if (stage.type === 'scar') {
            state.scarSlots[stage.slotIndex] = value;
        }
    }

    sampleVariations(param, finalValue) {
        const options = this.parameterOptions?.[param];
        if (!options || options.length === 0) {
            return [finalValue];
        }
        const results = new Set();
        results.add(finalValue);
        const desiredSamples = param === 'spriteNumber' ? 6 : CONFIG.ANIMATION.VARIATION_SAMPLES;
        const sampleCount = Math.min(options.length, Math.max(CONFIG.ANIMATION.MIN_VARIATIONS, desiredSamples));
        while (results.size < sampleCount) {
            const pick = options[Math.floor(Math.random() * options.length)];
            results.add(pick);
        }
        const arr = Array.from(results);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (arr[arr.length - 1] !== finalValue) {
            const idx = arr.indexOf(finalValue);
            if (idx !== -1) {
                [arr[idx], arr[arr.length - 1]] = [arr[arr.length - 1], arr[idx]];
            } else {
                arr[arr.length - 1] = finalValue;
            }
        }
        return arr;
    }

    async drawCat(state, canvas) {
        const params = this.buildRenderParams(state);
        const result = await catGenerator.generateCat(params);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, CONFIG.CANVAS.SIZE, CONFIG.CANVAS.SIZE);
        ctx.drawImage(result.canvas, 0, 0, CONFIG.CANVAS.SIZE, CONFIG.CANVAS.SIZE);
    }

    buildRenderParams(state) {
        const accessories = state.accessorySlots.filter(v => v && v !== 'none');
        const scars = state.scarSlots.filter(v => v && v !== 'none');
        const tortieLayers = state.tortieLayers.filter(Boolean).map(layer => ({ ...layer }));

        return {
            spriteNumber: state.spriteNumber,
            peltName: state.peltName,
            colour: state.colour,
            tint: state.tint,
            skinColour: state.skinColour,
            eyeColour: state.eyeColour,
            eyeColour2: state.eyeColour2 !== 'none' ? state.eyeColour2 : undefined,
            whitePatches: state.whitePatches !== 'none' ? state.whitePatches : undefined,
            points: state.points !== 'none' ? state.points : undefined,
            whitePatchesTint: state.whitePatchesTint !== 'none' ? state.whitePatchesTint : undefined,
            vitiligo: state.vitiligo !== 'none' ? state.vitiligo : undefined,
            shading: !!state.shading,
            reverse: !!state.reverse,
            darkForest: !!state.darkForest,
            darkMode: !!state.darkForest,
            dead: !!state.dead,
            accessories,
            accessory: accessories[0],
            scars,
            scar: scars[0],
            tortie: tortieLayers,
            isTortie: tortieLayers.length > 0
        };
    }

    buildSharePayload(plan, preparedParams = null) {
        const params = preparedParams ? { ...preparedParams } : this.buildRenderParams(plan.state);

        const accessorySlots = Array.isArray(plan?.state?.accessorySlots)
            ? plan.state.accessorySlots.map(value => value || 'none')
            : Array.isArray(plan?.accessorySlots)
                ? plan.accessorySlots.map(value => value || 'none')
                : [];

        const scarSlots = Array.isArray(plan?.state?.scarSlots)
            ? plan.state.scarSlots.map(value => value || 'none')
            : Array.isArray(plan?.scarSlots)
                ? plan.scarSlots.map(value => value || 'none')
                : [];

        const tortieSlots = Array.isArray(plan?.state?.tortieLayers)
            ? plan.state.tortieLayers.map(layer => (layer ? { ...layer } : null))
            : Array.isArray(plan?.tortieSlots)
                ? plan.tortieSlots.map(layer => (layer ? { ...layer } : null))
                : [];

        const counts = {
            accessories: accessorySlots.length,
            scars: scarSlots.length,
            tortie: tortieSlots.length
        };

        return {
            params,
            accessorySlots,
            scarSlots,
            tortieSlots,
            counts
        };
    }

    buildCatExport(plan, index = 0) {
        const params = this.buildRenderParams(plan.state);
        const payload = this.buildSharePayload(plan, params);
        let encoded = '';
        try {
            encoded = encodeCatShare(payload);
        } catch (error) {
            console.warn('Failed to encode adoption cat payload', error);
        }
        const label = plan?.labelEl?.textContent?.trim() || `Cat ${plan.index ?? index + 1}`;
        return {
            label,
            index: index,
            encoded: encoded || null,
            catData: payload,
            params
        };
    }

    cloneState(state) {
        return {
            ...state,
            accessorySlots: [...state.accessorySlots],
            scarSlots: [...state.scarSlots],
            tortieLayers: state.tortieLayers.map(layer => layer ? { ...layer } : null)
        };
    }

    buildDefaults() {
        return {
            colour: this.parameterOptions?.colour?.[0] || 'GINGER',
            skinColour: this.parameterOptions?.skinColour?.[0] || 'PINK',
            eyeColour: this.parameterOptions?.eyeColour?.[0] || 'BLUE'
        };
    }

    async getParameterOptions() {
        await spriteMapper.init();

        const peltNames = spriteMapper.getPeltNames();
        const fallbackPelts = ['SingleColour', 'TwoColour', 'Tabby', 'Marbled', 'Rosette', 'Smoke', 'Ticked', 'Speckled', 'Bengal', 'Mackerel', 'Classic', 'Sokoke', 'Agouti', 'Singlestripe', 'Masked'];
        const tortieMasks = spriteMapper.getTortieMasks();
        const fallbackMasks = ['ONE', 'TWO', 'THREE', 'FOUR', 'REDTAIL', 'DELILAH', 'MINIMALONE', 'MINIMALTWO', 'MINIMALTHREE', 'MINIMALFOUR', 'HALF', 'OREO', 'SWOOP', 'MOTTLED', 'SIDEMASK', 'EYEDOT', 'BANDANA', 'PACMAN', 'STREAMSTRIKE', 'ORIOLE', 'CHIMERA'];

        return {
            colour: this.getColourOptions(),
            peltName: peltNames.length > 0 ? peltNames : fallbackPelts,
            eyeColour: spriteMapper.getEyeColours(),
            eyeColour2: [...spriteMapper.getEyeColours(), 'none'],
            tint: ['none', ...spriteMapper.getTints()],
            skinColour: spriteMapper.getSkinColours(),
            whitePatches: ['none', ...spriteMapper.getWhitePatches()],
            points: ['none', ...spriteMapper.getPoints()],
            whitePatchesTint: this.getWhitePatchTintOptions(),
            vitiligo: ['none', ...spriteMapper.getVitiligo()],
            accessory: ['none', ...spriteMapper.getAccessories()],
            scar: ['none', ...spriteMapper.getScars()],
            tortieMask: tortieMasks.length > 0 ? tortieMasks : fallbackMasks,
            tortiePattern: peltNames.length > 0 ? peltNames : fallbackPelts,
            tortieColour: this.getColourOptions(),
            shading: [true, false],
            reverse: [true, false],
            spriteNumber: this.spriteOptions
        };
    }

    getColourOptions(mode = this.getExperimentalModeValue()) {
        const experimental = typeof spriteMapper.getExperimentalColoursByMode === 'function'
            ? spriteMapper.getExperimentalColoursByMode(mode) || []
            : [];
        const base = this.includeBaseColours && typeof spriteMapper.getColours === 'function'
            ? spriteMapper.getColours()
            : [];
        const combined = new Set();
        base.forEach(colour => combined.add(colour));
        experimental.forEach(colour => combined.add(colour));
        return Array.from(combined);
    }

    getWhitePatchTintOptions(mode = this.whitePatchColourMode) {
        if (!spriteMapper.getWhitePatchColourOptions) {
            return ['none'];
        }
        const includeModes = Array.from(this.selectedExtendedModes);
        const raw = spriteMapper.getWhitePatchColourOptions(mode, includeModes) || ['none'];
        const seen = new Set();
        const ordered = [];
        for (const option of raw) {
            if (!option) continue;
            const key = String(option);
            if (seen.has(key)) continue;
            seen.add(key);
            ordered.push(option);
        }
        if (!ordered.includes('none')) {
            ordered.unshift('none');
        }
        return ordered;
    }

    getExperimentalModeValue() {
        const modes = Array.from(this.selectedExtendedModes);
        return modes.length === 0 ? 'off' : modes;
    }

    hasActivePalettes() {
        return this.includeBaseColours || this.selectedExtendedModes.size > 0;
    }

    updateGenerateButtonState() {
        if (!this.generateButton) return;
        const shouldEnable = !this.isGenerating && this.hasActivePalettes();
        this.generateButton.disabled = !shouldEnable;
        this.generateButton.textContent = this.isGenerating ? 'Rolling…' : 'Generate Adoption';
    }

    onPaletteChange() {
        this.updateExtendedPaletteButtons();
        if (this.parameterOptions) {
            this.parameterOptions.colour = this.getColourOptions();
            this.parameterOptions.tortieColour = this.getColourOptions();
            this.parameterOptions.whitePatchesTint = this.getWhitePatchTintOptions();
        }
        this.updateGenerateButtonState();
    }

    updateExtendedPaletteButtons() {
        if (!this.paletteButtons.length) return;
        this.paletteButtons.forEach(btn => {
            const mode = btn.dataset.extendedMode;
            if (!mode) return;
            let isActive;
            if (mode === 'base') {
                isActive = this.includeBaseColours;
            } else {
                isActive = this.selectedExtendedModes.has(mode);
            }
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    ensureLayerDepth(params, layerConfig) {
        const pick = (arr) => {
            if (!Array.isArray(arr) || arr.length === 0) return null;
            const index = Math.floor(Math.random() * arr.length);
            return arr[index] ?? null;
        };

        const accessoriesPool = ((this.parameterOptions?.accessory) || spriteMapper.getAccessories() || [])
            .filter(item => item && item !== 'none');
        const scarsPool = ((this.parameterOptions?.scar) || spriteMapper.getScars() || [])
            .filter(item => item && item !== 'none');
        const tortieMaskPool = ((this.parameterOptions?.tortieMask) || spriteMapper.getTortieMasks() || [])
            .filter(item => item && item !== 'none');
        const tortiePatternPool = ((this.parameterOptions?.tortiePattern) || spriteMapper.getPeltNames() || [])
            .filter(item => item && item !== 'none');
        const tortieColourPool = ((this.parameterOptions?.tortieColour) || this.getColourOptions() || [])
            .filter(item => item && item !== 'none');

        if (layerConfig.accessoryCount > 0 && accessoriesPool.length) {
            params.accessories = [];
            for (let i = 0; i < layerConfig.accessoryCount; i++) {
                const pickValue = pick(accessoriesPool);
                if (pickValue) {
                    params.accessories.push(pickValue);
                }
            }
            params.accessory = params.accessories[0] || undefined;
        } else {
            params.accessories = [];
            params.accessory = undefined;
        }

        if (layerConfig.scarCount > 0 && scarsPool.length) {
            params.scars = [];
            for (let i = 0; i < layerConfig.scarCount; i++) {
                const pickValue = pick(scarsPool);
                if (pickValue) {
                    params.scars.push(pickValue);
                }
            }
            params.scar = params.scars[0] || undefined;
        } else {
            params.scars = [];
            params.scar = undefined;
        }

        if (layerConfig.tortieCount > 0 && tortieMaskPool.length && tortiePatternPool.length && tortieColourPool.length) {
            params.tortie = [];
            for (let i = 0; i < layerConfig.tortieCount; i++) {
                const mask = pick(tortieMaskPool);
                const pattern = pick(tortiePatternPool);
                const colour = pick(tortieColourPool);
                if (mask && pattern && colour) {
                    params.tortie.push({ mask, pattern, colour });
                }
            }
            params.isTortie = params.tortie.length > 0;
            if (params.isTortie) {
                params.tortieMask = params.tortie[0].mask;
                params.tortiePattern = params.tortie[0].pattern;
                params.tortieColour = params.tortie[0].colour;
            } else {
                params.tortieMask = undefined;
                params.tortiePattern = undefined;
                params.tortieColour = undefined;
            }
        } else {
            params.tortie = [];
            params.isTortie = false;
            params.tortieMask = undefined;
            params.tortiePattern = undefined;
            params.tortieColour = undefined;
        }
    }

    async openDetailOverlay(plan) {
        if (!plan || !this.overlay) return;
        const token = Symbol('detail');
        this.detailRenderToken = token;
        this.currentDetailPlan = plan;
        this.detailShareUrl = '';
        if (this.overlayCopyShareBtn) {
            this.overlayCopyShareBtn.disabled = true;
            if (this.overlayCopyShareBtn.dataset.originalText) {
                this.overlayCopyShareBtn.textContent = this.overlayCopyShareBtn.dataset.originalText;
            }
        }
        if (this.overlayOpenViewerBtn) {
            this.overlayOpenViewerBtn.disabled = true;
            if (this.overlayOpenViewerBtn.dataset.originalText) {
                this.overlayOpenViewerBtn.textContent = this.overlayOpenViewerBtn.dataset.originalText;
            }
        }
        this.overlay.classList.add('open');
        this.overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('overlay-open');
        await this.renderDetailOverlay(plan, token);
    }

    async renderDetailOverlay(plan, token) {
        if (!plan || !this.overlayCanvas) return;
        try {
            const params = this.buildRenderParams(plan.state);
            const result = await catGenerator.generateCat(params);
            if (this.detailRenderToken !== token) return;
            const ctx = this.overlayCanvas.getContext('2d');
            if (ctx) {
                const size = 700;
                if (this.overlayCanvas.width !== size) {
                    this.overlayCanvas.width = size;
                    this.overlayCanvas.height = size;
                }
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(result.canvas, 0, 0, size, size);
            }
            if (this.overlayTitle) {
                this.overlayTitle.textContent = `Cat ${plan.index}`;
            }
            this.populateDetailTable(plan, params);
            const sharePromise = this.buildDetailShareUrl(plan, params);
            await this.prepareSpriteGallery(params, token);
            const shareUrl = await sharePromise;
            if (this.detailRenderToken !== token) return;
            this.detailShareUrl = shareUrl;
            if (this.overlayCopyShareBtn) {
                this.overlayCopyShareBtn.disabled = !shareUrl;
                if (!this.overlayCopyShareBtn.dataset.originalText) {
                    this.overlayCopyShareBtn.dataset.originalText = this.overlayCopyShareBtn.textContent;
                }
            }
            if (this.overlayOpenViewerBtn) {
                this.overlayOpenViewerBtn.disabled = !shareUrl;
                if (!this.overlayOpenViewerBtn.dataset.originalText) {
                    this.overlayOpenViewerBtn.dataset.originalText = this.overlayOpenViewerBtn.textContent;
                }
            }
            this.currentDetailParams = params;
        } catch (error) {
            console.error('Failed to render detail overlay:', error);
        }
    }

    populateDetailTable(plan, params) {
        if (!this.overlayTable) return;
        this.overlayTable.innerHTML = '';

        const addRow = (label, value, { formatted = false, always = false } = {}) => {
            if (value === undefined || value === null) {
                if (!always) return;
            }
            const display = formatted ? value : this.formatValue(value);
            if (!always && (display === 'None' || display === '')) {
                return;
            }
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.innerHTML = `
                <span class="param-name">${label}</span>
                <span class="param-value">${display}</span>
            `;
            this.overlayTable.appendChild(row);
        };

        const eyesDisplay = params.eyeColour2 && params.eyeColour2 !== params.eyeColour
            ? `${this.formatValue(params.eyeColour)} / ${this.formatValue(params.eyeColour2)}`
            : this.formatValue(params.eyeColour);

        addRow('Colour', params.colour, { always: true });
        addRow('Pelt', params.peltName, { always: true });
        addRow('Eyes', eyesDisplay, { formatted: true, always: true });
        if (params.eyeColour2 && params.eyeColour2 !== params.eyeColour) {
            addRow('Eye Colour 2', params.eyeColour2, { always: true });
        }

        const tortieSlots = plan.state?.tortieLayers || [];
        const maxTortie = Math.max(tortieSlots.length, plan.tortieSlots?.length || 0);
        for (let i = 0; i < maxTortie; i++) {
            const layer = tortieSlots[i] || plan.tortieSlots?.[i] || null;
            const text = layer
                ? `${this.formatValue(layer.mask)} • ${this.formatValue(layer.pattern)} • ${this.formatValue(layer.colour)}`
                : 'None';
            addRow(`Tortie ${i + 1}`, text, { formatted: true, always: true });
        }

        addRow('Tint', params.tint, { always: true });
        addRow('Skin', params.skinColour, { always: true });
        addRow('White Patches', params.whitePatches, { always: true });
        addRow('Points', params.points, { always: true });
        addRow('Patches Tint', params.whitePatchesTint, { always: true });
        addRow('Vitiligo', params.vitiligo, { always: true });

        const accessories = plan.state?.accessorySlots || plan.accessorySlots || [];
        accessories.forEach((value, index) => {
            addRow(`Accessory ${index + 1}`, value, { always: true });
        });

        const scars = plan.state?.scarSlots || plan.scarSlots || [];
        scars.forEach((value, index) => {
            addRow(`Scar ${index + 1}`, value, { always: true });
        });

        addRow('Shading', params.shading ? 'Yes' : 'No', { formatted: true, always: true });
        addRow('Reverse', params.reverse ? 'Yes' : 'No', { formatted: true, always: true });
        addRow('Dark Forest', params.darkForest ? 'Yes' : 'No', { formatted: true, always: true });
        addRow('Star Clan', params.dead ? 'Yes' : 'No', { formatted: true, always: true });

        const spriteLabel = this.spriteNames[params.spriteNumber] || `Sprite ${params.spriteNumber}`;
        addRow('Sprite', spriteLabel, { formatted: true, always: true });
    }

    async prepareSpriteGallery(params, token, options = {}) {
        if (!params) return;
        const force = options.force === true;

        this.spriteGalleryPreviews = [];
        if (this.spriteGalleryOverlay && this.spriteGalleryOverlay.classList.contains('open')) {
            this.renderSpriteGallery();
        } else if (this.spriteGalleryGrid) {
            this.spriteGalleryGrid.innerHTML = '';
        }

        const previews = [];
        const tasks = this.spriteOptions.map(async (spriteNumber) => {
            try {
                const spriteParams = { ...params, spriteNumber };
                const result = await catGenerator.generateCat(spriteParams);
                if (!force && this.detailRenderToken !== token) return;
                if (!result || !result.canvas) return;
                const previewCanvas = document.createElement('canvas');
                previewCanvas.width = 120;
                previewCanvas.height = 120;
                const ctx = previewCanvas.getContext('2d');
                if (!ctx) return;
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, 120, 120);
                ctx.drawImage(result.canvas, 0, 0, 120, 120);
                const dataUrl = previewCanvas.toDataURL('image/png');
                previews.push({
                    spriteNumber,
                    name: this.spriteNames[spriteNumber] || `Sprite ${spriteNumber}`,
                    dataUrl,
                });
            } catch (error) {
                console.error('Failed to render sprite variation:', error);
            }
        });

        await Promise.all(tasks);

        if (!force && this.detailRenderToken !== token) {
            return;
        }

        previews.sort((a, b) => a.spriteNumber - b.spriteNumber);
        this.spriteGalleryPreviews = previews;

        if (this.spriteGalleryOverlay && this.spriteGalleryOverlay.classList.contains('open')) {
            this.renderSpriteGallery();
        } else if (this.spriteGalleryGrid) {
            this.spriteGalleryGrid.innerHTML = '';
        }
    }

    renderSpriteGallery() {
        if (!this.spriteGalleryGrid) return;
        this.spriteGalleryGrid.innerHTML = '';

        if (!this.spriteGalleryPreviews.length) {
            const empty = document.createElement('p');
            empty.className = 'text-sm text-muted-foreground';
            empty.textContent = 'Roll a cat to generate sprite previews.';
            this.spriteGalleryGrid.appendChild(empty);
            return;
        }

        const activeSprite = this.currentDetailParams?.spriteNumber ?? null;

        this.spriteGalleryPreviews.forEach((preview) => {
            const item = document.createElement('div');
            item.className = 'overlay-sprite-item';
            if (preview.spriteNumber === activeSprite) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <div class="sprite-header">${preview.name}</div>
                <div class="sprite-canvas-wrap">
                    <img src="${preview.dataUrl}" alt="${preview.name}" class="sprite-canvas sprite-image" />
                </div>
                <div class="sprite-actions">
                    <button class="overlay-btn sprite-copy" data-size="120">Copy 120×120</button>
                    <button class="overlay-btn sprite-copy" data-size="700">Copy 700×700</button>
                </div>
            `;

            const copyButtons = item.querySelectorAll('.sprite-copy');
            copyButtons.forEach((button) => {
                button.addEventListener('click', async () => {
                    const size = parseInt(button.dataset.size, 10);
                    await this.copySpriteVariation(preview.spriteNumber, size, button);
                });
            });

            this.spriteGalleryGrid.appendChild(item);
        });
    }

    openSpriteGallery() {
        if (!this.spriteGalleryOverlay) return;
        if (!this.spriteGalleryOverlay.classList.contains('open')) {
            this.renderSpriteGallery();
            this.spriteGalleryOverlay.classList.add('open');
            this.spriteGalleryOverlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('overlay-open');
        } else {
            this.renderSpriteGallery();
        }
    }

    closeSpriteGallery(force = false) {
        if (!this.spriteGalleryOverlay) return;
        if (!force && !this.spriteGalleryOverlay.classList.contains('open')) return;
        this.spriteGalleryOverlay.classList.remove('open');
        this.spriteGalleryOverlay.setAttribute('aria-hidden', 'true');
        if (!this.overlay || !this.overlay.classList.contains('open')) {
            document.body.classList.remove('overlay-open');
        }
    }

    async copySpriteVariation(spriteNumber, size, button) {
        if (!this.currentDetailParams) return;
        try {
            const params = { ...this.currentDetailParams, spriteNumber };
            const result = await catGenerator.generateCat(params);
            if (!result || !result.canvas) throw new Error('Sprite canvas unavailable');
            await this.copyCanvasToClipboard(result.canvas, size);
            this.flashButton(button, 'Copied!');
        } catch (error) {
            console.error('Failed to copy sprite:', error);
            this.flashButton(button, 'Copy failed');
        }
    }

    async buildDetailShareUrl(plan, params) {
        try {
            const sharedPayload = this.buildSharePayload(plan, params);
            const viewerUrl = this.buildViewerUrl();

            let shareSlug = null;
            try {
                const shareRecord = await createCatShare(sharedPayload);
                if (shareRecord?.slug) {
                    shareSlug = shareRecord.slug;
                    sharedPayload.shareSlug = shareSlug;
                }
            } catch (shareError) {
                console.warn('Failed to create adoption cat share slug', shareError);
            }

            if (this.persistCat) {
                try {
                    const persistResult = await this.persistCat(sharedPayload, { plan, params });
                    const resolved = this.resolvePersistResult(persistResult, viewerUrl);
                    if (resolved) {
                        return resolved;
                    }
                } catch (error) {
                    console.warn('Failed to persist share payload, falling back to local share options.', error);
                }
            }

            if (shareSlug) {
                const builderUrl = new URL(`/visual-builder?share=${encodeURIComponent(shareSlug)}`, viewerUrl);
                return builderUrl.toString();
            }

            const encoded = encodeCatShare(sharedPayload);
            if (encoded) {
                const fallbackUrl = new URL(viewerUrl.toString());
                fallbackUrl.searchParams.set('cat', encoded);
                return fallbackUrl.toString();
            }
            return '';
        } catch (error) {
            console.error('Failed to construct share URL:', error);
            return '';
        }
    }

    buildViewerUrl() {
        if (typeof window === 'undefined') {
            return new URL(this.viewerBasePath || '/view', 'http://localhost');
        }
        const origin = window.location.origin || window.location.href;
        const basePath = this.viewerBasePath || '/view';
        return new URL(basePath, origin);
    }

    resolvePersistResult(result, viewerUrl) {
        if (!result) return null;
        if (typeof result === 'string') {
            const url = new URL(viewerUrl.toString());
            url.searchParams.set('id', result);
            return url.toString();
        }
        if (result.url) {
            return result.url;
        }
        const url = new URL(viewerUrl.toString());
        if (result.shareToken) {
            url.pathname = this.joinViewerPath(url.pathname, result.shareToken);
            return url.toString();
        }
        if (result.url) {
            return result.url;
        }
        if (result.slug) {
            url.pathname = this.joinViewerPath(url.pathname, result.slug);
            return url.toString();
        }
        if (result.id) {
            url.searchParams.set('id', result.id);
            return url.toString();
        }
        if (result.encoded) {
            url.searchParams.set('cat', result.encoded);
            return url.toString();
        }
        return null;
    }

    joinViewerPath(pathname, slug) {
        const base = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
        const cleanedSlug = slug.startsWith('/') ? slug.slice(1) : slug;
        return `${base}/${cleanedSlug}`;
    }

    closeDetailOverlay(force = false) {
        if (!this.overlay) return;
        if (!force && !this.overlay.classList.contains('open')) return;
        this.overlay.classList.remove('open');
        this.overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('overlay-open');
        this.currentDetailPlan = null;
        this.currentDetailParams = null;
        this.detailShareUrl = '';
        this.detailRenderToken = null;
        this.closeSpriteGallery(true);
        this.spriteGalleryPreviews = [];
        if (this.overlayCopyBigBtn && this.overlayCopyBigBtn.dataset.originalText) {
            this.overlayCopyBigBtn.textContent = this.overlayCopyBigBtn.dataset.originalText;
            this.overlayCopyBigBtn.disabled = false;
        }
        if (this.overlayCopyShareBtn) {
            this.overlayCopyShareBtn.disabled = false;
            if (this.overlayCopyShareBtn.dataset.originalText) {
                this.overlayCopyShareBtn.textContent = this.overlayCopyShareBtn.dataset.originalText;
            }
        }
        if (this.overlayOpenViewerBtn) {
            this.overlayOpenViewerBtn.disabled = true;
            if (this.overlayOpenViewerBtn.dataset.originalText) {
                this.overlayOpenViewerBtn.textContent = this.overlayOpenViewerBtn.dataset.originalText;
            }
        }
    }

    createQuickPreviewPopup() {
        const popup = document.createElement('div');
        popup.className = 'quick-preview-popup';
        popup.setAttribute('aria-hidden', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'quick-preview-backdrop';
        backdrop.addEventListener('click', () => this.closeQuickPreview());

        const content = document.createElement('div');
        content.className = 'quick-preview-content';

        const canvas = document.createElement('canvas');
        canvas.className = 'quick-preview-canvas';
        canvas.width = 700;
        canvas.height = 700;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'quick-preview-close';
        closeBtn.type = 'button';
        closeBtn.title = 'Close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => this.closeQuickPreview());

        content.appendChild(canvas);
        content.appendChild(closeBtn);
        popup.appendChild(backdrop);
        popup.appendChild(content);

        document.body.appendChild(popup);
        this.quickPreviewPopup = popup;
        this.quickPreviewCanvas = canvas;

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.quickPreviewPopup?.classList.contains('open')) {
                this.closeQuickPreview();
            }
        });
    }

    async openQuickPreview(plan) {
        if (!this.quickPreviewPopup || !this.quickPreviewCanvas || !plan) return;

        this.quickPreviewPopup.classList.add('open');
        this.quickPreviewPopup.setAttribute('aria-hidden', 'false');

        // Draw at full canvas size (700x700)
        const params = this.buildRenderParams(plan.state);
        const result = await catGenerator.generateCat(params);
        const ctx = this.quickPreviewCanvas.getContext('2d');
        const size = this.quickPreviewCanvas.width;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(result.canvas, 0, 0, size, size);
    }

    closeQuickPreview() {
        if (!this.quickPreviewPopup) return;
        this.quickPreviewPopup.classList.remove('open');
        this.quickPreviewPopup.setAttribute('aria-hidden', 'true');
    }

    async copyCanvasToClipboard(canvas, size = null) {
        if (!canvas) throw new Error('Canvas missing');
        if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
            throw new Error('Clipboard API unavailable');
        }

        let sourceCanvas = canvas;
        if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
            const converted = document.createElement('canvas');
            converted.width = canvas.width;
            converted.height = canvas.height;
            const convertedCtx = converted.getContext('2d');
            convertedCtx.drawImage(canvas, 0, 0);
            sourceCanvas = converted;
        }

        let targetCanvas = sourceCanvas;
        if (size && sourceCanvas.width !== size) {
            targetCanvas = document.createElement('canvas');
            targetCanvas.width = size;
            targetCanvas.height = size;
            const ctx = targetCanvas.getContext('2d');
            if (!ctx) {
                throw new Error('Canvas context unavailable');
            }
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sourceCanvas, 0, 0, size, size);
        }

        const blob = await new Promise((resolve, reject) => {
            targetCanvas.toBlob((result) => {
                if (result) resolve(result);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/png');
        });

        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
    }

    flashButton(button, message) {
        if (!button) return;
        const original = button.dataset.originalText || button.textContent;
        button.dataset.originalText = original;
        button.textContent = message;
        button.disabled = true;
        setTimeout(() => {
            button.textContent = button.dataset.originalText || original;
            button.disabled = false;
        }, 1500);
    }

    formatValue(value) {
        if (!value || value === 'none') return 'None';
        let text = value.toString().replace(/_/g, ' ');
        let prefixEnd = 0;
        while (prefixEnd < text.length && text[prefixEnd] >= '0' && text[prefixEnd] <= '9') {
            prefixEnd++;
        }
        while (prefixEnd < text.length && (text[prefixEnd] === ' ' || text[prefixEnd] === '-')) {
            prefixEnd++;
        }
        text = text.slice(prefixEnd);
        const words = text.split(' ').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
        return words.length ? words.join(' ') : 'None';
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export function createAdoptionGenerator(options = {}) {
    return new AdoptionGenerator(options);
}
export default AdoptionGenerator;
