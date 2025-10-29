import catGenerator from '../core/catGeneratorV2.js';
import spriteMapper from '../core/spriteMapper.js';
import mapperApi from '../convex/mapper-api.js';

class CatBuilderWizard {
    constructor() {
        /* Completed Checklist
         * 1. Removed preview spinner overlay now that renders complete instantly.
         * 2. Added sprite thumbnails and extended palette controls for tortie layers.
         * 3. Split markings into white patches, points, and vitiligo with sprite previews.
         * 4. Added sprite previews for skin tinting options to highlight their effect.
         * 5. Converted accessories and scars to multi-select grids with live previews.
         * 6. Moved the creation timeline to a shareable viewer backed by ConvexAPI.
         * 7. Enabled the Finish button on the Age & Pose step once a pose is chosen.
         */
        this.generator = catGenerator;
        this.currentParams = this.getDefaultParams();
        this.tortieLayers = [];
        this.desiredTortieLayers = 0;
        this.previewRequestId = 0;
        this.globalEventsBound = false;
        this.experimentalColourMode = 'off';
        this.tortiePaletteMode = 'off';

        this.stepNodes = new Map();
        this.unlockedSteps = new Set();
        this.timelineRecords = new Map();
        this.currentTimelineShareUrl = null;
        this.stepCompletion = new Map();
        this.activeStepId = null;

        this.poseOptions = [];
        this.peltOptions = [];
        this.colourOptions = [];
        this.eyeOptions = [];
        this.whitePatchOptions = [];
        this.pointOptions = [];
        this.vitiligoOptions = [];
        this.skinOptions = [];
        this.tintOptions = [];
        this.whiteTintOptions = [];
        this.plantAccessories = [];
        this.wildAccessories = [];
        this.collarAccessories = [];
        this.scarCategories = { battle: [], missing: [], environmental: [] };

        this.canvas = null;
        this.previewCtx = null;
        this.stepIndexLabel = null;
        this.stepTitle = null;
        this.stepDescription = null;
        this.optionsContainer = null;
        this.stepStatus = null;
        this.prevButton = null;
        this.nextButton = null;
        this.downloadButton = null;
        this.shareButton = null;
        this.resetButton = null;
        this.stepTree = null;
        this.toast = null;

        this.steps = [];

        this.init();
    }

    getDefaultParams() {
        return {
            spriteNumber: 8,
            peltName: 'SingleColour',
            colour: 'WHITE',
            isTortie: false,
            tortiePattern: undefined,
            tortieColour: undefined,
            tortieMask: undefined,
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
            scars: []
        };
    }

    async init() {
        await spriteMapper.init();
        this.cacheElements();
        this.loadOptionData();
        this.buildSteps();
        this.buildTree();
        this.bindGlobalEvents();
        this.unlockStep('colour', { select: true });
        await this.updatePreview();
    }

    cacheElements() {
        this.canvas = document.getElementById('wizardCanvas');
        this.previewCtx = this.canvas?.getContext('2d');
        this.stepIndexLabel = document.getElementById('stepIndex');
        this.stepTitle = document.getElementById('stepTitle');
        this.stepDescription = document.getElementById('stepDescription');
        this.optionsContainer = document.getElementById('optionsContainer');
        this.stepStatus = document.getElementById('stepStatus');
        this.prevButton = document.getElementById('prevStepBtn');
        this.nextButton = document.getElementById('nextStepBtn');
        this.downloadButton = document.getElementById('downloadCat');
        this.shareButton = document.getElementById('copyShareLink');
        this.resetButton = document.getElementById('resetWizard');
        this.stepTree = document.getElementById('stepTree');
        this.toast = document.getElementById('toast');
    }

    loadOptionData() {
        const forbiddenSprites = new Set([0, 1, 2, 3, 4, 19, 20]);
        this.poseOptions = spriteMapper.getSprites().filter(sprite => !forbiddenSprites.has(sprite));
        this.peltOptions = spriteMapper.getPeltNames();
        this.eyeOptions = spriteMapper.getEyeColours();
        this.whitePatchOptions = spriteMapper.getWhitePatches();
        this.pointOptions = spriteMapper.getPoints();
        this.vitiligoOptions = spriteMapper.getVitiligo();
        this.skinOptions = spriteMapper.getSkinColours();
        this.tintOptions = spriteMapper.getTints();
        this.whiteTintOptions = spriteMapper.getWhiteTints();
        this.plantAccessories = spriteMapper.getPlantAccessories();
        this.wildAccessories = spriteMapper.getWildAccessories();
        this.collarAccessories = spriteMapper.getCollars();
        this.scarCategories = {
            battle: spriteMapper.getScarsByCategory(1) || [],
            missing: spriteMapper.getScarsByCategory(2) || [],
            environmental: spriteMapper.getScarsByCategory(3) || []
        };
    }

    buildSteps() {
        this.steps = [
            { id: 'colour', title: 'Base Colour', navLabel: 'Base Colour', description: 'Choose the base coat colour that sets the mood for the cat.', type: 'colour-grid' },
            { id: 'pattern', title: 'Pattern', navLabel: 'Pattern', description: 'Select the primary fur pattern.', type: 'sprite-grid' },
            { id: 'tortie', title: 'Tortie Layers', navLabel: 'Tortie', description: 'Decide if you want to add layered tortie colours.', type: 'tortie-choice' },
            { id: 'tortie-layer-1', title: 'Tortie Layer 1', navLabel: 'Layer 1', description: 'Shape the first tortie layer.', type: 'tortie-layer', parent: 'tortie', layerIndex: 0 },
            { id: 'tortie-layer-2', title: 'Tortie Layer 2', navLabel: 'Layer 2', description: 'Add a second tortie layer for extra depth.', type: 'tortie-layer', parent: 'tortie', layerIndex: 1 },
            { id: 'tortie-layer-3', title: 'Tortie Layer 3', navLabel: 'Layer 3', description: 'Optional final tortie layer.', type: 'tortie-layer', parent: 'tortie', layerIndex: 2 },
            { id: 'eyes', title: 'Eyes', navLabel: 'Eyes', description: 'Pick the primary and optional secondary eye colours.', type: 'eyes' },
            { id: 'accents', title: 'Markings', navLabel: 'Markings', description: 'Add white patches, points, or vitiligo accents.', type: 'accents' },
            { id: 'skin-tint', title: 'Skin & Tint', navLabel: 'Skin & Tint', description: 'Choose skin tone, overall tint, and white patch tinting.', type: 'skin-tint' },
            { id: 'accessories', title: 'Accessories', navLabel: 'Accessories', description: 'Finish the look with plants, wild accessories, or collars.', type: 'accessories' },
            { id: 'scars', title: 'Scars & Stories', navLabel: 'Scars', description: 'Add battle, environmental, or history scars.', type: 'scars' },
            { id: 'pose', title: 'Age & Pose', navLabel: 'Age & Pose', description: 'Pick the sprite pose to showcase your cat.', type: 'sprite-grid' }
        ];
    }

    buildTree() {
        if (!this.stepTree) return;
        this.stepTree.innerHTML = '';
        this.stepNodes.clear();
        this.unlockedSteps.clear();

        for (const step of this.steps) {
            const node = document.createElement('li');
            node.className = 'step-node is-hidden';
            node.dataset.stepId = step.id;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'step-link';
            button.textContent = step.navLabel || step.title;
            button.addEventListener('click', () => {
                if (node.classList.contains('is-hidden')) return;
                this.goToStep(step.id, { fromTree: true });
            });

            node.appendChild(button);
            this.stepNodes.set(step.id, node);

            if (step.parent) {
                const parentNode = this.stepNodes.get(step.parent);
                if (parentNode) {
                    let subtree = parentNode.querySelector(':scope > ul.step-subtree');
                    if (!subtree) {
                        subtree = document.createElement('ul');
                        subtree.className = 'step-subtree';
                        parentNode.appendChild(subtree);
                    }
                    subtree.appendChild(node);
                } else {
                    this.stepTree.appendChild(node);
                }
            } else {
                this.stepTree.appendChild(node);
            }
        }
    }

    bindGlobalEvents() {
        if (this.globalEventsBound) return;
        this.prevButton?.addEventListener('click', () => this.goToPreviousStep());
        this.nextButton?.addEventListener('click', () => this.handleNextStep());
        this.resetButton?.addEventListener('click', () => this.resetWizard());
        this.shareButton?.addEventListener('click', () => this.copyTimelineShareLink());
        this.downloadButton?.addEventListener('click', () => this.downloadCurrentCat());
        this.globalEventsBound = true;
    }

    unlockStep(stepId, { select = false } = {}) {
        const step = this.steps.find(s => s.id === stepId);
        if (!step) return;

        if (step.parent) {
            this.unlockStep(step.parent);
        }

        const node = this.stepNodes.get(stepId);
        if (!node) return;

        if (!this.unlockedSteps.has(stepId)) {
            this.unlockedSteps.add(stepId);
        }

        node.classList.remove('is-hidden');
        node.classList.add('unlocked');

        if (select) {
            this.goToStep(stepId, { force: true });
        }
    }

    lockStep(stepId) {
        const node = this.stepNodes.get(stepId);
        if (!node) return;
        node.classList.add('is-hidden');
        node.classList.remove('unlocked', 'active', 'completed');
        this.unlockedSteps.delete(stepId);
        this.stepCompletion.delete(stepId);
        this.timelineRecords.delete(stepId);
        this.currentTimelineShareUrl = null;
    }

    goToStep(stepId, { force = false } = {}) {
        if (!force && !this.unlockedSteps.has(stepId)) return;
        const step = this.steps.find(s => s.id === stepId);
        if (!step) return;

        this.activeStepId = stepId;
        this.updateStepHeader(step);
        this.renderStep(step);
        this.updateNavigationState();
        this.selectTreeItem(stepId);
    }

    updateStepHeader(step) {
        if (this.stepIndexLabel) {
            const order = this.getUnlockedSteps();
            const index = order.indexOf(step.id);
            this.stepIndexLabel.textContent = index >= 0 ? `Step ${index + 1}` : 'Step';
        }
        if (this.stepTitle) {
            this.stepTitle.textContent = step.title;
        }
        if (this.stepDescription) {
            this.stepDescription.textContent = step.description;
        }
    }

    selectTreeItem(stepId) {
        for (const node of this.stepNodes.values()) {
            node.classList.remove('active');
        }
        const current = this.stepNodes.get(stepId);
        if (current) {
            current.classList.add('active');
        }
    }

    renderStep(step) {
        if (!this.optionsContainer) return;
        this.optionsContainer.innerHTML = '';
        if (this.stepStatus) {
            this.stepStatus.textContent = 'Make a choice to continue.';
        }

        switch (step.type) {
            case 'sprite-grid':
                this.renderSpriteGrid(step);
                break;
            case 'colour-grid':
                this.renderColourGrid();
                break;
            case 'tortie-choice':
                this.renderTortieChoice();
                break;
            case 'tortie-layer':
                this.renderTortieLayer(step);
                break;
            case 'eyes':
                this.renderEyesStep();
                break;
            case 'accents':
                this.renderAccentsStep();
                break;
            case 'skin-tint':
                this.renderSkinTintStep();
                break;
            case 'accessories':
                this.renderAccessoriesStep();
                break;
            case 'scars':
                this.renderScarsStep();
                break;
            default:
                this.optionsContainer.textContent = 'Step coming soon.';
        }

        const { isComplete, summary } = this.validateCurrentStep();
        if (isComplete && summary) {
            this.markStepComplete(step.id, summary);
        }
    }

    renderSpriteGrid(step) {
        const grid = document.createElement('div');
        grid.className = 'option-grid';
        const isPose = step.id === 'pose';
        const options = isPose ? this.poseOptions : this.peltOptions;
        const selectedValue = isPose ? this.currentParams.spriteNumber : this.currentParams.peltName;

        for (const option of options) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'option-card';
            card.dataset.value = typeof option === 'number' ? String(option) : option;

            const thumb = document.createElement('div');
            thumb.className = 'option-thumbnail';
            const label = document.createElement('div');
            label.className = 'option-title';
            label.textContent = this.formatName(option);

            card.append(thumb, label);
            if (option === selectedValue) {
                card.classList.add('selected');
            }

            card.addEventListener('click', () => {
                if (isPose) {
                    this.currentParams.spriteNumber = option;
                } else {
                    this.currentParams.peltName = option;
                }
                this.refreshSpriteGridSelection(grid, option);
                const { isComplete, summary } = this.validateCurrentStep();
                if (isComplete) {
                    this.markStepComplete(step.id, summary || this.formatName(option));
                }
                this.updatePreview();
            });

            grid.appendChild(card);
            this.generateOptionPreview(thumb, previewParams => {
                if (isPose) {
                    previewParams.spriteNumber = option;
                } else {
                    previewParams.peltName = option;
                }
            });
        }

        this.optionsContainer.appendChild(grid);
    }

    createPaletteControls(currentMode, onModeChange) {
        const container = document.createElement('div');
        container.className = 'palette-controls';

        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = 'Palette:';
        container.appendChild(label);

        const modes = [
            { id: 'off', label: 'Classic' },
            { id: 'mood', label: 'Mood' },
            { id: 'bold', label: 'Bold' },
            { id: 'darker', label: 'Darker' },
            { id: 'blackout', label: 'Blackout' }
        ];

        for (const mode of modes) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'palette-button';
            button.textContent = mode.label;
            if (currentMode === mode.id) {
                button.classList.add('active');
            }

            button.addEventListener('click', () => {
                if (currentMode === mode.id) return;
                onModeChange?.(mode.id);
            });

            container.appendChild(button);
        }

        return container;
    }

    getColourPalette(mode = 'off') {
        return spriteMapper.getColourOptions(mode) || spriteMapper.getColours();
    }

    ensureBaseColourValid() {
        const palette = this.getColourPalette(this.experimentalColourMode);
        const fallbackColour = palette[0] || (spriteMapper.getColours ? spriteMapper.getColours()[0] : null) || this.currentParams.colour;
        let changed = false;
        if (!palette.includes(this.currentParams.colour)) {
            this.currentParams.colour = fallbackColour;
            changed = true;
        }
        return changed;
    }

    ensureTortieColoursValid() {
        const palette = this.getColourPalette(this.tortiePaletteMode);
        const fallbackColour = palette[0] || this.currentParams.colour;
        let changed = false;
        for (const layer of this.tortieLayers) {
            if (!layer) continue;
            if (!layer.colour || !palette.includes(layer.colour)) {
                layer.colour = fallbackColour;
                changed = true;
            }
        }
        if (changed) {
            this.syncTortieLayers();
        }
        return changed;
    }

    refreshSpriteGridSelection(grid, value) {
        grid.querySelectorAll('.option-card').forEach(card => {
            const key = typeof value === 'number' ? String(value) : value;
            card.classList.toggle('selected', card.dataset.value === key);
        });
    }

    async generateOptionPreview(container, mutator) {
        if (!container) return;
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        container.appendChild(canvas);

        const params = JSON.parse(JSON.stringify(this.currentParams));
        try {
            mutator?.(params);
            const result = await this.generator.generateCat(params);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Failed to build preview', error);
        }
    }

    renderColourGrid() {
        this.ensureBaseColourValid();

        const controls = this.createPaletteControls(this.experimentalColourMode, newMode => {
            if (this.experimentalColourMode === newMode) return;
            this.experimentalColourMode = newMode;
            const changed = this.ensureBaseColourValid();
            this.goToStep('colour', { force: true });
            if (changed) {
                this.updatePreview();
            }
        });
        if (controls) {
            this.optionsContainer.appendChild(controls);
        }

        const palette = this.getColourPalette(this.experimentalColourMode);
        const grid = document.createElement('div');
        grid.className = 'option-grid';
        const selected = this.currentParams.colour;

        for (const colour of palette) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'option-card';

            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.background = this.getColourSwatch(colour);
            const label = document.createElement('div');
            label.className = 'option-title';
            label.textContent = this.formatName(colour);

            card.append(swatch, label);
            if (colour === selected) {
                card.classList.add('selected');
            }

            card.addEventListener('click', () => {
                this.currentParams.colour = colour;
                grid.querySelectorAll('.option-card').forEach(btn => btn.classList.remove('selected'));
                card.classList.add('selected');
                const { isComplete, summary } = this.validateCurrentStep();
                if (isComplete) {
                    this.markStepComplete('colour', summary || this.formatName(colour));
                }
                this.updatePreview();
            });

            grid.appendChild(card);
        }

        this.optionsContainer.appendChild(grid);
    }

    renderTortieChoice() {
        const wrapper = document.createElement('div');
        wrapper.className = 'option-grid';

        const yesCard = this.createChoiceCard('Add tortie layers', 'Blend additional patterns and colours.', this.currentParams.isTortie);
        const noCard = this.createChoiceCard('Single coat only', 'Keep things simple with one pattern.', !this.currentParams.isTortie);

        yesCard.addEventListener('click', () => {
            this.currentParams.isTortie = true;
            this.desiredTortieLayers = Math.max(1, this.desiredTortieLayers || 1);
            this.ensureTortieLayer(0);
            this.unlockStep('tortie-layer-1');
            yesCard.classList.add('selected');
            noCard.classList.remove('selected');
            const { isComplete, summary } = this.validateCurrentStep();
            if (isComplete) this.markStepComplete('tortie', summary);
            this.updatePreview();
        });

        noCard.addEventListener('click', () => {
            this.currentParams.isTortie = false;
            this.desiredTortieLayers = 0;
            this.tortieLayers = [];
            this.currentParams.tortie = [];
            this.currentParams.tortiePattern = undefined;
            this.currentParams.tortieColour = undefined;
            this.currentParams.tortieMask = undefined;
            this.lockStep('tortie-layer-1');
            this.lockStep('tortie-layer-2');
            this.lockStep('tortie-layer-3');
            yesCard.classList.remove('selected');
            noCard.classList.add('selected');
            const { isComplete, summary } = this.validateCurrentStep();
            if (isComplete) this.markStepComplete('tortie', summary);
            this.updatePreview();
        });

        wrapper.append(yesCard, noCard);
        this.optionsContainer.appendChild(wrapper);
    }

    renderTortieLayer(step) {
        if (!this.currentParams.isTortie) {
            if (this.stepStatus) {
                this.stepStatus.textContent = 'Enable tortie layers to configure them.';
            }
            if (this.nextButton) this.nextButton.disabled = true;
            return;
        }

        const layer = this.ensureTortieLayer(step.layerIndex);
        const container = document.createElement('div');
        container.className = 'options-container';

        this.ensureTortieColoursValid();
        const paletteControls = this.createPaletteControls(this.tortiePaletteMode, newMode => {
            if (this.tortiePaletteMode === newMode) return;
            this.tortiePaletteMode = newMode;
            const changed = this.ensureTortieColoursValid();
            this.goToStep(step.id, { force: true });
            if (changed) {
                this.updatePreview();
            }
        });
        container.appendChild(paletteControls);

        container.appendChild(this.createSectionHeading(`Layer ${step.layerIndex + 1} pattern`));
        container.appendChild(this.createSpriteOptionGrid(this.peltOptions, {
            selectedChecker: value => layer.pattern === value,
            mutatePreview: (params, value) => {
                this.applyTortiePreview(params, step.layerIndex, previewLayer => {
                    previewLayer.pattern = value;
                });
            },
            onSelect: value => {
                layer.pattern = value;
                this.syncTortieLayers();
                const { isComplete, summary } = this.validateCurrentStep();
                if (isComplete) this.markStepComplete(step.id, summary);
                this.updatePreview();
            }
        }));

        container.appendChild(this.createSectionHeading(`Layer ${step.layerIndex + 1} colour`));
        const tortiePalette = this.getColourPalette(this.tortiePaletteMode);
        container.appendChild(this.createSpriteOptionGrid(tortiePalette, {
            selectedChecker: value => layer.colour === value,
            mutatePreview: (params, value) => {
                this.applyTortiePreview(params, step.layerIndex, previewLayer => {
                    previewLayer.colour = value;
                });
            },
            onSelect: value => {
                layer.colour = value;
                this.syncTortieLayers();
                const { isComplete, summary } = this.validateCurrentStep();
                if (isComplete) this.markStepComplete(step.id, summary);
                this.updatePreview();
            }
        }));

        container.appendChild(this.createSectionHeading(`Layer ${step.layerIndex + 1} mask`));
        const tortieMasks = spriteMapper.getTortieMasks();
        container.appendChild(this.createSpriteOptionGrid(tortieMasks, {
            selectedChecker: value => layer.mask === value,
            mutatePreview: (params, value) => {
                this.applyTortiePreview(params, step.layerIndex, previewLayer => {
                    previewLayer.mask = value;
                });
            },
            onSelect: value => {
                layer.mask = value;
                this.syncTortieLayers();
                const { isComplete, summary } = this.validateCurrentStep();
                if (isComplete) this.markStepComplete(step.id, summary);
                this.updatePreview();
            }
        }));

        if (step.layerIndex < 2) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'soft-btn';
            addBtn.textContent = 'Add another tortie layer';
            addBtn.disabled = step.layerIndex + 1 < this.desiredTortieLayers;
            addBtn.style.alignSelf = 'flex-start';
            addBtn.addEventListener('click', () => {
                this.desiredTortieLayers = Math.min(3, step.layerIndex + 2);
                const nextId = `tortie-layer-${step.layerIndex + 2}`;
                this.unlockStep(nextId);
            });
            container.appendChild(addBtn);
        }

        this.optionsContainer.appendChild(container);
    }

    renderEyesStep() {
        const container = document.createElement('div');
        container.className = 'options-container';

        container.appendChild(this.createSectionHeading('Primary eye colour'));
        container.appendChild(this.createChipGroup(this.eyeOptions, this.currentParams.eyeColour, value => {
            this.currentParams.eyeColour = value;
            const { isComplete, summary } = this.validateCurrentStep();
            if (isComplete) this.markStepComplete('eyes', summary);
            this.updatePreview();
        }, true));

        container.appendChild(this.createSectionHeading('Secondary eye colour (optional)'));
        const heterochromiaChoices = ['none', ...this.eyeOptions];
        container.appendChild(this.createChipGroup(heterochromiaChoices, this.currentParams.eyeColour2 || 'none', value => {
            this.currentParams.eyeColour2 = value === 'none' ? undefined : value;
            const { isComplete, summary } = this.validateCurrentStep();
            if (isComplete) this.markStepComplete('eyes', summary);
            this.updatePreview();
        }, true));

        this.optionsContainer.appendChild(container);
    }

    renderAccentsStep() {
        const container = document.createElement('div');
        container.className = 'options-container';

        const registerSelection = () => {
            const { summary } = this.validateCurrentStep();
            this.markStepComplete('accents', summary);
            this.updatePreview();
        };

        const whiteOptions = ['none', ...this.whitePatchOptions];
        container.appendChild(this.createSectionHeading('White patches'));
        container.appendChild(this.createSpriteOptionGrid(whiteOptions, {
            selectedChecker: value => (this.currentParams.whitePatches || 'none') === value,
            mutatePreview: (params, value) => {
                params.whitePatches = value === 'none' ? undefined : value;
            },
            onSelect: value => {
                this.currentParams.whitePatches = value === 'none' ? undefined : value;
                registerSelection();
            }
        }));

        const pointOptions = ['none', ...this.pointOptions];
        container.appendChild(this.createSectionHeading('Colour points'));
        container.appendChild(this.createSpriteOptionGrid(pointOptions, {
            selectedChecker: value => (this.currentParams.points || 'none') === value,
            mutatePreview: (params, value) => {
                params.points = value === 'none' ? undefined : value;
            },
            onSelect: value => {
                this.currentParams.points = value === 'none' ? undefined : value;
                registerSelection();
            }
        }));

        const vitiligoOptions = ['none', ...this.vitiligoOptions];
        container.appendChild(this.createSectionHeading('Vitiligo'));
        container.appendChild(this.createSpriteOptionGrid(vitiligoOptions, {
            selectedChecker: value => (this.currentParams.vitiligo || 'none') === value,
            mutatePreview: (params, value) => {
                params.vitiligo = value === 'none' ? undefined : value;
            },
            onSelect: value => {
                this.currentParams.vitiligo = value === 'none' ? undefined : value;
                registerSelection();
            }
        }));

        this.optionsContainer.appendChild(container);
        if (this.nextButton) this.nextButton.disabled = false;
        if (this.stepStatus) this.stepStatus.textContent = 'All set! You can fine-tune or continue.';
    }

    renderSkinTintStep() {
        const container = document.createElement('div');
        container.className = 'options-container';
        const register = () => {
            const { isComplete, summary } = this.validateCurrentStep();
            if (isComplete) this.markStepComplete('skin-tint', summary);
            this.updatePreview();
        };

        container.appendChild(this.createSectionHeading('Skin colour'));
        container.appendChild(this.createSpriteOptionGrid(this.skinOptions, {
            selectedChecker: value => this.currentParams.skinColour === value,
            mutatePreview: (params, value) => {
                params.skinColour = value;
            },
            onSelect: value => {
                this.currentParams.skinColour = value;
                register();
            }
        }));

        container.appendChild(this.createSectionHeading('Overall tint'));
        container.appendChild(this.createSpriteOptionGrid(this.tintOptions, {
            selectedChecker: value => (this.currentParams.tint || 'none') === value,
            mutatePreview: (params, value) => {
                params.tint = value;
            },
            onSelect: value => {
                this.currentParams.tint = value;
                register();
            }
        }));

        container.appendChild(this.createSectionHeading('White patch tint'));
        const tintChoices = Array.from(new Set(['none', ...spriteMapper.getWhitePatchColourOptions('default', null)]));
        container.appendChild(this.createSpriteOptionGrid(tintChoices, {
            selectedChecker: value => (this.currentParams.whitePatchesTint || 'none') === value,
            mutatePreview: (params, value) => {
                params.whitePatchesTint = value;
            },
            onSelect: value => {
                this.currentParams.whitePatchesTint = value;
                register();
            }
        }));

        this.optionsContainer.appendChild(container);
        if (this.nextButton) this.nextButton.disabled = false;
        if (this.stepStatus) this.stepStatus.textContent = 'Skin details saved.';
    }

    renderAccessoriesStep() {
        const container = document.createElement('div');
        container.className = 'options-container';

        const register = () => {
            const { summary } = this.validateCurrentStep();
            this.markStepComplete('accessories', summary);
            this.updatePreview();
        };

        const renderAccessoryCategory = (title, options) => {
            const optionSet = new Set(options);
            container.appendChild(this.createSectionHeading(title));
            const values = ['none', ...options];
            container.appendChild(this.createSpriteOptionGrid(values, {
                multiSelect: true,
                selectedChecker: value => {
                    const selected = (this.currentParams.accessories || []).filter(acc => optionSet.has(acc));
                    if (value === 'none') return selected.length === 0;
                    return selected.includes(value);
                },
                mutatePreview: (params, value) => {
                    const retained = (this.currentParams.accessories || []).filter(acc => !optionSet.has(acc));
                    if (value !== 'none') {
                        retained.push(value);
                    }
                    params.accessories = retained;
                    params.accessory = retained[0];
                },
                onSelect: (value, enabled) => {
                    if (value === 'none') {
                        this.clearAccessories(options);
                    } else {
                        this.toggleAccessory(value, enabled);
                    }
                    register();
                }
            }));
        };

        renderAccessoryCategory('Plant accessories', this.plantAccessories);
        renderAccessoryCategory('Wild accessories', this.wildAccessories);
        renderAccessoryCategory('Collars', this.collarAccessories);

        this.optionsContainer.appendChild(container);
        if (this.nextButton) this.nextButton.disabled = false;
        if (this.stepStatus) this.stepStatus.textContent = 'Accessories updated.';
    }

    renderScarsStep() {
        const container = document.createElement('div');
        container.className = 'options-container';
        const register = () => {
            const { summary } = this.validateCurrentStep();
            this.markStepComplete('scars', summary);
            this.updatePreview();
        };

        const renderScarCategory = (title, options) => {
            const optionSet = new Set(options);
            container.appendChild(this.createSectionHeading(title));
            const values = ['none', ...options];
            container.appendChild(this.createSpriteOptionGrid(values, {
                multiSelect: true,
                selectedChecker: value => {
                    const selected = (this.currentParams.scars || []).filter(scar => optionSet.has(scar));
                    if (value === 'none') return selected.length === 0;
                    return selected.includes(value);
                },
                mutatePreview: (params, value) => {
                    const retained = (this.currentParams.scars || []).filter(scar => !optionSet.has(scar));
                    if (value !== 'none') {
                        retained.push(value);
                    }
                    params.scars = retained;
                    params.scar = retained[0];
                },
                onSelect: (value, enabled) => {
                    if (value === 'none') {
                        this.clearScars(options);
                    } else {
                        this.toggleScar(value, enabled);
                    }
                    register();
                }
            }));
        };

        renderScarCategory('Battle scars', this.scarCategories.battle);
        renderScarCategory('Missing parts', this.scarCategories.missing);
        renderScarCategory('Environmental scars', this.scarCategories.environmental);

        this.optionsContainer.appendChild(container);
        if (this.nextButton) this.nextButton.disabled = false;
        if (this.stepStatus) this.stepStatus.textContent = 'Scars applied. Continue when ready.';
    }

    createChoiceCard(title, subtitle, selected) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'option-card';
        if (selected) card.classList.add('selected');

        const heading = document.createElement('div');
        heading.className = 'option-title';
        heading.textContent = title;
        const sub = document.createElement('div');
        sub.textContent = subtitle;
        sub.style.color = 'var(--muted)';
        sub.style.fontSize = '0.9rem';
        sub.style.lineHeight = '1.4';
        card.append(heading, sub);
        return card;
    }

    createSectionHeading(text) {
        const heading = document.createElement('h4');
        heading.textContent = text;
        heading.style.fontSize = '1rem';
        heading.style.fontWeight = '600';
        heading.style.margin = '12px 0 6px';
        heading.style.color = 'var(--muted-strong)';
        return heading;
    }

    createChipGroup(options, selectedValue, onSelect, showColour = false) {
        const group = document.createElement('div');
        group.className = 'option-chip-group';

        for (const option of options) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'option-chip';
            chip.dataset.value = option;
            chip.classList.toggle('selected', option === selectedValue);

            if (showColour) {
                const swatch = document.createElement('span');
                swatch.className = 'color-swatch';
                swatch.style.marginRight = '8px';
                swatch.style.background = this.getColourSwatch(option);
                const label = document.createElement('span');
                label.textContent = option === 'none' ? 'None' : this.formatName(option);
                chip.append(swatch, label);
            } else {
                chip.textContent = option === 'none' ? 'None' : this.formatName(option);
            }

            chip.addEventListener('click', () => {
                group.querySelectorAll('.option-chip').forEach(btn => btn.classList.remove('selected'));
                chip.classList.add('selected');
                onSelect(option);
            });

            group.appendChild(chip);
        }

        return group;
    }

    createSpriteOptionGrid(options, config = {}) {
        const {
            selectedChecker,
            onSelect,
            mutatePreview,
            formatLabel,
            multiSelect = false
        } = config;

        const grid = document.createElement('div');
        grid.className = 'option-grid';

        for (const option of options) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'option-card';

            const thumb = document.createElement('div');
            thumb.className = 'option-thumbnail';
            const label = document.createElement('div');
            label.className = 'option-title';
            label.textContent = formatLabel ? formatLabel(option) : (option === 'none' ? 'None' : this.formatName(option));

            card.append(thumb, label);

            if (selectedChecker?.(option)) {
                card.classList.add('selected');
            }

            this.generateOptionPreview(thumb, params => mutatePreview?.(params, option));

            card.addEventListener('click', () => {
                const alreadySelected = selectedChecker?.(option) ?? false;

                if (multiSelect) {
                    onSelect?.(option, !alreadySelected);
                    this.goToStep(this.activeStepId, { force: true });
                    return;
                }

                if (alreadySelected) return;

                onSelect?.(option, true);
                grid.querySelectorAll('.option-card').forEach(btn => btn.classList.remove('selected'));
                card.classList.add('selected');
            });

            grid.appendChild(card);
        }

        return grid;
    }

    applyTortiePreview(params, layerIndex, layerMutator) {
        params.isTortie = true;
        const layers = this.tortieLayers.map(layer => layer ? { ...layer } : null);
        const palette = this.getColourPalette(this.tortiePaletteMode);
        const fallbackColour = palette[0] || this.currentParams.colour;
        const fallbackPattern = this.currentParams.peltName;
        const fallbackMask = 'ONE';

        while (layers.length <= layerIndex) {
            layers.push({ pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask });
        }

        const previewLayer = layers[layerIndex] || { pattern: fallbackPattern, colour: fallbackColour, mask: fallbackMask };
        if (!previewLayer.pattern) previewLayer.pattern = fallbackPattern;
        if (!previewLayer.colour) previewLayer.colour = fallbackColour;
        if (!previewLayer.mask) previewLayer.mask = fallbackMask;

        layerMutator?.(previewLayer);
        layers[layerIndex] = previewLayer;

        const validLayers = layers.filter(layer => layer && layer.pattern && layer.colour && layer.mask);
        params.tortie = validLayers.length ? validLayers : [previewLayer];

        const primary = params.tortie[0];
        params.tortiePattern = primary.pattern;
        params.tortieColour = primary.colour;
        params.tortieMask = primary.mask;
    }

    ensureTortieLayer(index) {
        while (this.tortieLayers.length <= index) {
            this.tortieLayers.push({ pattern: undefined, colour: undefined, mask: undefined });
        }
        this.desiredTortieLayers = Math.max(this.desiredTortieLayers, index + 1);
        return this.tortieLayers[index];
    }

    syncTortieLayers() {
        const validLayers = this.tortieLayers.filter(layer => layer.pattern && layer.colour && layer.mask).map(layer => ({ ...layer }));
        this.currentParams.tortie = validLayers;
        if (validLayers.length > 0) {
            const [first] = validLayers;
            this.currentParams.tortiePattern = first.pattern;
            this.currentParams.tortieColour = first.colour;
            this.currentParams.tortieMask = first.mask;
        } else {
            this.currentParams.tortiePattern = undefined;
            this.currentParams.tortieColour = undefined;
            this.currentParams.tortieMask = undefined;
        }
    }

    validateCurrentStep() {
        const step = this.steps.find(s => s.id === this.activeStepId);
        if (!step) return { isComplete: false, summary: '' };

        let isComplete = false;
        let summary = '';

        switch (step.id) {
            case 'colour':
                isComplete = Boolean(this.currentParams.colour);
                summary = this.formatName(this.currentParams.colour);
                break;
            case 'pattern':
                isComplete = Boolean(this.currentParams.peltName);
                summary = this.formatName(this.currentParams.peltName);
                break;
            case 'tortie':
                isComplete = true;
                summary = this.currentParams.isTortie ? 'Tortie enabled' : 'Single coat';
                break;
            case 'tortie-layer-1':
            case 'tortie-layer-2':
            case 'tortie-layer-3': {
                const layer = this.tortieLayers[step.layerIndex];
                isComplete = layer && layer.pattern && layer.colour && layer.mask;
                summary = isComplete ? `${this.formatName(layer.pattern)} · ${this.formatName(layer.colour)} · ${this.formatName(layer.mask)}` : '';
                break;
            }
            case 'eyes':
                isComplete = Boolean(this.currentParams.eyeColour);
                summary = this.buildEyeSummary();
                break;
            case 'accents':
                isComplete = true;
                summary = this.buildAccentsSummary();
                break;
            case 'skin-tint':
                isComplete = Boolean(this.currentParams.skinColour);
                summary = this.buildSkinSummary();
                break;
            case 'accessories':
                isComplete = true;
                summary = this.buildAccessorySummary();
                break;
            case 'scars':
                isComplete = true;
                summary = this.buildScarSummary();
                break;
            case 'pose':
                isComplete = typeof this.currentParams.spriteNumber === 'number';
                summary = `Pose ${this.currentParams.spriteNumber}`;
                break;
            default:
                isComplete = true;
        }

        if (this.nextButton) {
            const unlocked = this.getUnlockedSteps();
            const index = unlocked.indexOf(this.activeStepId);
            const isLast = index === unlocked.length - 1;
            this.nextButton.textContent = isLast ? 'Finish' : 'Next Step';
            this.nextButton.disabled = !isComplete;
        }

        if (this.stepStatus) {
            this.stepStatus.textContent = isComplete ? 'Ready to continue.' : 'Make a choice to continue.';
        }

        return { isComplete, summary };
    }

    markStepComplete(stepId, summary) {
        if (!summary) return;
        this.stepCompletion.set(stepId, true);
        const node = this.stepNodes.get(stepId);
        node?.classList.add('completed');
        const stepMeta = this.steps.find(s => s.id === stepId);
        this.timelineRecords.set(stepId, {
            id: stepId,
            title: stepMeta?.title || stepId,
            summary,
            params: JSON.parse(JSON.stringify(this.currentParams))
        });
        this.currentTimelineShareUrl = null;
        this.unlockNextRelevantStep(stepId);
        if (this.activeStepId === stepId) {
            this.validateCurrentStep();
        }
    }

    buildEyeSummary() {
        const primary = this.formatName(this.currentParams.eyeColour);
        const secondary = this.currentParams.eyeColour2 ? this.formatName(this.currentParams.eyeColour2) : 'None';
        return `Primary: ${primary}, Secondary: ${secondary}`;
    }

    buildAccentsSummary() {
        const parts = [];
        if (this.currentParams.whitePatches) parts.push(`White patches: ${this.formatName(this.currentParams.whitePatches)}`);
        if (this.currentParams.points) parts.push(`Points: ${this.formatName(this.currentParams.points)}`);
        if (this.currentParams.vitiligo) parts.push(`Vitiligo: ${this.formatName(this.currentParams.vitiligo)}`);
        return parts.length ? parts.join(' · ') : 'No extra markings';
    }

    buildSkinSummary() {
        const skin = this.formatName(this.currentParams.skinColour);
        const tint = this.currentParams.tint && this.currentParams.tint !== 'none' ? this.formatName(this.currentParams.tint) : 'No tint';
        const whiteTint = this.currentParams.whitePatchesTint && this.currentParams.whitePatchesTint !== 'none'
            ? this.formatName(this.currentParams.whitePatchesTint)
            : 'No white tint';
        return `${skin} skin · ${tint} · ${whiteTint}`;
    }

    buildAccessorySummary() {
        const accessories = this.currentParams.accessories || [];
        if (!accessories.length) return 'No accessories';
        return `Accessories: ${accessories.map(acc => this.formatName(acc)).join(', ')}`;
    }

    toggleAccessory(value, enabled) {
        const list = new Set(this.currentParams.accessories || []);
        if (enabled) {
            list.add(value);
        } else {
            list.delete(value);
        }
        this.currentParams.accessories = Array.from(list);
        this.currentParams.accessory = this.currentParams.accessories[0];
        if (!this.currentParams.accessories.length) {
            this.currentParams.accessory = undefined;
        }
    }

    clearAccessories(options) {
        const set = new Set(options);
        this.currentParams.accessories = (this.currentParams.accessories || []).filter(acc => !set.has(acc));
        this.currentParams.accessory = this.currentParams.accessories[0];
        if (!this.currentParams.accessories.length) {
            this.currentParams.accessory = undefined;
        }
    }

    buildScarSummary() {
        const scars = this.currentParams.scars || [];
        if (!scars.length) return 'No scars chosen';
        return `Scars: ${scars.map(scar => this.formatName(scar)).join(', ')}`;
    }

    toggleScar(value, enabled) {
        const list = new Set(this.currentParams.scars || []);
        if (enabled) {
            list.add(value);
        } else {
            list.delete(value);
        }
        this.currentParams.scars = Array.from(list);
        this.currentParams.scar = this.currentParams.scars[0];
        if (!this.currentParams.scars.length) {
            this.currentParams.scar = undefined;
        }
    }

    clearScars(options) {
        const set = new Set(options);
        this.currentParams.scars = (this.currentParams.scars || []).filter(scar => !set.has(scar));
        this.currentParams.scar = this.currentParams.scars[0];
        if (!this.currentParams.scars.length) {
            this.currentParams.scar = undefined;
        }
    }

    getUnlockedSteps() {
        const order = [];
        for (const step of this.steps) {
            if (this.unlockedSteps.has(step.id)) {
                order.push(step.id);
            }
        }
        return order;
    }

    getPreviousUnlockedStep(stepId) {
        const unlocked = this.getUnlockedSteps();
        const index = unlocked.indexOf(stepId);
        return index > 0 ? unlocked[index - 1] : null;
    }

    goToPreviousStep() {
        const previous = this.getPreviousUnlockedStep(this.activeStepId);
        if (previous) {
            this.goToStep(previous);
        }
    }

    handleNextStep() {
        const step = this.steps.find(s => s.id === this.activeStepId);
        if (!step) return;

        const { isComplete, summary } = this.validateCurrentStep();
        if (isComplete && summary) {
            this.markStepComplete(step.id, summary);
        }

        this.unlockNextRelevantStep(step.id);
        const unlocked = this.getUnlockedSteps();
        const index = unlocked.indexOf(step.id);
        const nextStep = unlocked[index + 1];
        if (nextStep) {
            this.goToStep(nextStep);
        } else {
            this.handleFinish();
        }
    }

    unlockNextRelevantStep(afterStepId) {
        const currentIndex = this.steps.findIndex(step => step.id === afterStepId);
        for (let i = currentIndex + 1; i < this.steps.length; i++) {
            const candidate = this.steps[i];
            if (candidate.type === 'tortie-layer') {
                if (!this.currentParams.isTortie) continue;
                if (candidate.layerIndex >= this.desiredTortieLayers) continue;
            }
            this.unlockStep(candidate.id);
            break;
        }
    }

    updateNavigationState() {
        if (!this.prevButton) return;
        const unlocked = this.getUnlockedSteps();
        const index = unlocked.indexOf(this.activeStepId);
        this.prevButton.disabled = index <= 0;
    }

    async updatePreview() {
        if (!this.previewCtx) return;
        const requestId = ++this.previewRequestId;
        try {
            const params = JSON.parse(JSON.stringify(this.currentParams));
            const result = await this.generator.generateCat(params);
            if (this.previewRequestId !== requestId) return;
            this.previewCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.previewCtx.imageSmoothingEnabled = false;
            this.previewCtx.drawImage(result.canvas, 0, 0, this.canvas.width, this.canvas.height);
            if (this.downloadButton) this.downloadButton.disabled = false;
        } catch (error) {
            console.error('Failed to update preview', error);
        } finally {
            // No fallback overlay needed now that renders are fast.
        }
    }

    downloadCurrentCat() {
        if (!this.canvas) return;
        const link = document.createElement('a');
        link.download = 'guided-cat.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    buildTimelinePayload() {
        const steps = [];
        for (const step of this.steps) {
            const record = this.timelineRecords.get(step.id);
            if (!record) continue;
            steps.push({
                id: record.id,
                title: record.title,
                summary: record.summary,
                params: record.params
            });
        }

        return {
            mode: 'wizard-timeline',
            version: 1,
            basePalette: this.experimentalColourMode,
            tortiePalette: this.tortiePaletteMode,
            steps,
            finalParams: JSON.parse(JSON.stringify(this.currentParams))
        };
    }

    encodeTimelinePayload(payload) {
        try {
            const json = JSON.stringify(payload);
            if (typeof btoa === 'function') {
                return btoa(unescape(encodeURIComponent(json)));
            }
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(json, 'utf-8').toString('base64');
            }
        } catch (error) {
            console.error('Failed to encode timeline payload:', error);
        }
        return null;
    }

    async persistTimelinePayload(payload) {
        const record = await mapperApi.create(payload);
        return record?.id || null;
    }

    async buildTimelineShareUrl() {
        if (this.currentTimelineShareUrl) {
            return this.currentTimelineShareUrl;
        }

        const payload = this.buildTimelinePayload();
        if (!payload.steps.length) {
            this.showToast('Complete at least one step before sharing');
            return '';
        }
        const viewerUrl = new URL('./cat-builder-wizard-viewer.html', window.location.href);

        try {
            const id = await this.persistTimelinePayload(payload);
            if (id) {
                viewerUrl.searchParams.set('id', id);
                this.currentTimelineShareUrl = viewerUrl.toString();
                return this.currentTimelineShareUrl;
            }
        } catch (error) {
            console.warn('Failed to persist timeline payload, falling back to encoded data.', error);
        }

        const encoded = this.encodeTimelinePayload(payload);
        if (encoded) {
            viewerUrl.searchParams.set('data', encoded);
            this.currentTimelineShareUrl = viewerUrl.toString();
            return this.currentTimelineShareUrl;
        }

        return '';
    }

    async copyTimelineShareLink() {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            this.showToast('Clipboard not available in this browser');
            return;
        }

        try {
            const url = await this.buildTimelineShareUrl();
            if (!url) return;
            await navigator.clipboard.writeText(url);
            this.showToast('Timeline link copied!');
        } catch (error) {
            console.error('Copy failed', error);
            this.showToast('Unable to copy link');
        }
    }

    async handleFinish() {
        try {
            const url = await this.buildTimelineShareUrl();
            if (!url) return;
            const opened = window.open(url, '_blank', 'noopener=yes');
            if (!opened) {
                this.showToast('Viewer blocked by popup settings');
            } else {
                this.showToast('Opened timeline viewer');
            }
        } catch (error) {
            console.error('Failed to open viewer', error);
            this.showToast('Unable to open viewer');
        }
    }

    showToast(message) {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.classList.add('show');
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => this.toast.classList.remove('show'), 2200);
    }

    resetWizard() {
        this.currentParams = this.getDefaultParams();
        this.tortieLayers = [];
        this.desiredTortieLayers = 0;
        this.timelineRecords.clear();
        this.stepCompletion.clear();
        this.currentTimelineShareUrl = null;
        this.buildTree();
        this.unlockStep('colour', { select: true });
        this.updatePreview();
    }

    getColourSwatch(name) {
        const base = {
            WHITE: '#f8f8f8',
            PALEGREY: '#d9dee5',
            SILVER: '#cbd2db',
            GREY: '#a9b0bc',
            DARKGREY: '#7a8090',
            GHOST: '#edf2ff',
            BLACK: '#1d1f27',
            CREAM: '#f6e1b5',
            PALEGINGER: '#f8c78c',
            GOLDEN: '#d9a441',
            GINGER: '#e2763f',
            DARKGINGER: '#b1582d',
            SIENNA: '#8a4b34',
            LIGHTBROWN: '#ad7a4f',
            LILAC: '#b99ad9',
            BROWN: '#6f4630',
            'GOLDEN-BROWN': '#c28b46',
            DARKBROWN: '#4b2e1f',
            CHOCOLATE: '#402820'
        };
        if (base[name]) return base[name];
        const experimental = spriteMapper.getExperimentalColourDefinition(name);
        if (experimental?.multiply) {
            const [r, g, b] = experimental.multiply;
            return `rgb(${r}, ${g}, ${b})`;
        }
        return '#888888';
    }

    formatName(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') return `#${value}`;
        return value
            .toString()
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new CatBuilderWizard();
});
