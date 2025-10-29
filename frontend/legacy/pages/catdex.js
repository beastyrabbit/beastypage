// Catdex - Dynamic cat collection viewer

class Catdex {
    constructor() {
        this.cats = [];
        this.baseCats = [];
        this.filteredCats = [];
        this.activeCat = null;
        this.seasons = [];
        this.seasonsMap = new Map();
        this.rarities = [];
        this.rarityMap = new Map();
        this.submitElements = {};
        this.apiBase = '/api';
        this.convexEnabled = true;
        this.pendingCount = 0;
        this.imageToggleButton = null;
        this.imageToggleWrap = null;
        this.activeImageVariant = 'default';
        this.globalImageVariant = 'default';
        this.globalToggleButton = null;
        this.hasCustomImages = false;
        this.massUploadElements = {};
        this.massUploadEntries = [];
        this.massUploadHoldTimer = null;
        this.massUploadHoldTriggered = false;
        this.massUploadEntryCounter = 0;
        this.massUploadHoldInitialized = false;
        this.latestSeasonId = null;

        // Rarity order for sorting
        this.rarityOrder = {
            'Moondust': 0,
            'Starborn': 1,
            'Lunara': 2,
            'Celestara': 3,
            'Divinara': 4,
            'Holo Nova': 5,
            'Singularity': 6,
            'Pending': 99
        };

        // Sample cat data - this will be replaced with dynamic loading
        this.sampleCats = [
            { year: 2025, name: 'frostwing', rarity: 'Starborn', number: 1 },
            { year: 2025, name: 'whisperwind', rarity: 'Starborn', number: 3 }
        ];

        this.initializeConvex();
        this.init();
    }

    initializeConvex() {
        if (!globalThis.ConvexAPI || !ConvexAPI.catdex) {
            console.warn('Convex API not found. Cat submissions require it.');
            this.convexEnabled = false;
            return;
        }
    }

    async init() {
        this.setupEventListeners();
        this.setupSubmitInteractions();
        await this.loadCats();
        await this.loadConvexData();
        this.populateFilters();
        this.filterAndSort();
        this.render();
    }

    parseCatFromFilename(filename, season, owner) {
        const parts = filename.replace('_web.png', '').split('_');
        
        let year, name, rarity, number;
        
        if (parts.length >= 4) {
            year = parseInt(parts[0]);
            name = parts[1];
            rarity = parts[2];
            
            // Handle multi-word rarities and special numbers
            if (parts[3]) {
                // Check if parts[3] is a number or special code (including XX1, XX2, etc.)
                const upperPart = parts[3].toUpperCase();
                if (upperPart === '00X' || upperPart.startsWith('XX')) {
                    number = upperPart;
                } else if (!isNaN(parseInt(parts[3]))) {
                    number = parseInt(parts[3]);
                } else {
                    // It's part of the rarity name
                    rarity = `${rarity} ${parts[3]}`;
                    if (parts[4]) {
                        const upperPart4 = parts[4].toUpperCase();
                        number = (upperPart4 === '00X' || upperPart4.startsWith('XX')) ? upperPart4 : parseInt(parts[4]);
                    } else {
                        number = 0;
                    }
                }
            } else {
                number = 0;
            }
        } else {
            year = 2025;
            name = parts[0] || 'Unknown';
            rarity = 'Starborn';
            number = 1;
        }
        
        return {
            id: `${season}_${owner}_${year}_${name}_${number}`,
            year,
            name: this.formatName(name),
            rarity: this.formatRarity(rarity),
            number,
            owner: owner,
            season: this.formatSeason(season),
            seasonShort: this.getSeasonShort(season),
            seasonRaw: season
        };
    }

    async loadCats() {
        this.cats = [];

        try {
            const loadedFromConvex = await this.loadConvexCatdex();
            if (loadedFromConvex) {
                return;
            }
        } catch (error) {
            console.warn('Unexpected error loading Convex catdex records:', error);
        }

        console.warn('Falling back to sample cat data; Convex catdex unavailable.');
        this.cats = this.sampleCats.map(cat => {
            const season = 'Season Preview';
            const name = this.formatName(cat.name);
            const rarity = this.formatRarity(cat.rarity);
            const rarityLabel = this.formatRarityWithStars(rarity, null);
            const placeholderImage = '../assets/images/paw.png';

            return {
                id: `sample_${cat.year}_${cat.name}_${cat.number}`,
                year: cat.year,
                name,
                rarity,
                number: cat.number,
                owner: 'Community',
                season,
                seasonShort: this.getSeasonShort(season),
                seasonRaw: season,
                image: placeholderImage,
                defaultImage: placeholderImage,
                customImage: null,
                approved: true,
                rarityLabel,
                rarityStars: null,
                source: 'sample'
            };
        });

        this.hasCustomImages = false;
        this.updateGlobalToggleVisibility();
        this.sortCatsByNumber(this.cats);
        this.baseCats = [...this.cats];
    }



    formatName(name) {
        // Capitalize first letter of each word
        return name.split(/[-_]/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }

    formatRarity(rarity) {
        // Format rarity names properly
        const rarityMap = {
            'moondust': 'Moondust',
            'starborn': 'Starborn',
            'lunara': 'Lunara',
            'celestara': 'Celestara',
            'divinara': 'Divinara',
            'holo nova': 'Holo Nova',
            'holonova': 'Holo Nova',
            'singularity': 'Singularity'
        };
        
        const lower = rarity.toLowerCase();
        return rarityMap[lower] || rarity;
    }

    formatSeason(season) {
        // Format season names nicely - use the part before underscore
        const parts = season.split('_');
        if (parts.length > 0) {
            return parts[0];
        }
        return season;
    }
    
    getSeasonShort(season) {
        // Get short version - use the part after underscore
        if (!season) return 'Unknown';

        const lowerSeason = season.toLowerCase();
        if (lowerSeason === 'pending season') {
            return 'Pending';
        }

        const parts = season.split('_');
        if (parts.length > 1) {
            return parts[1];
        }

        if (lowerSeason.startsWith('season ')) {
            const suffix = season.slice(7).trim();
            return suffix ? `S ${suffix}` : 'Season';
        }

        return season;
    }
    
    isSpecialSeason(season) {
        // Check if this is a special season like Beta
        const lowerSeason = season.toLowerCase();
        return lowerSeason.includes('beta');
    }

    isBetaSeasonRecord(seasonRecord) {
        // Hide Convex seasons that are marked as beta-only collections
        if (!seasonRecord) return false;
        const values = [seasonRecord.season_name, seasonRecord.short_name];
        return values.some(value => typeof value === 'string' && value.toLowerCase().includes('beta'));
    }

    populateFilters() {
        // Populate season filter
        const seasons = [...new Set(this.cats.map(cat => cat.season))].sort();
        const seasonFilter = document.getElementById('seasonFilter');
        if (seasonFilter) {
            seasonFilter.innerHTML = '<option value="all">All Seasons</option>';
            seasons.forEach(season => {
                const option = document.createElement('option');
                option.value = season;
                option.textContent = season;
                seasonFilter.appendChild(option);
            });
        }
        
        // Populate rarity filter dynamically from available data
        const rarityFilter = document.getElementById('rarityFilter');
        if (rarityFilter) {
            const rarityDisplay = new Map();

            this.cats.forEach(cat => {
                if (!cat.rarity) return;
                const label = cat.rarityLabel || cat.rarity;
                if (!rarityDisplay.has(cat.rarity)) {
                    rarityDisplay.set(cat.rarity, label);
                }
            });

            (this.rarities || []).forEach(rarity => {
                const name = rarity?.rarity_name;
                if (!name) return;
                if (!rarityDisplay.has(name)) {
                    const label = this.formatRarityWithStars(name, rarity?.stars ?? null);
                    rarityDisplay.set(name, label);
                }
            });

            const rarityOptions = Array.from(rarityDisplay.entries()).sort((a, b) => {
                const orderA = this.rarityOrder[a[0]] ?? 999;
                const orderB = this.rarityOrder[b[0]] ?? 999;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return a[0].localeCompare(b[0]);
            });
            rarityFilter.innerHTML = '<option value="all">All Rarities</option>';
            rarityOptions.forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                rarityFilter.appendChild(option);
            });
        }
    }

    setupEventListeners() {
        // Search
        document.getElementById('searchInput').addEventListener('input', () => {
            this.filterAndSort();
            this.render();
        });

        // Filters
        const seasonFilter = document.getElementById('seasonFilter');
        if (seasonFilter) {
            seasonFilter.addEventListener('change', () => {
                this.filterAndSort();
                this.render();
            });
        }
        
        document.getElementById('rarityFilter').addEventListener('change', () => {
            this.filterAndSort();
            this.render();
        });

        document.getElementById('sortBy').addEventListener('change', () => {
            this.filterAndSort();
            this.render();
        });

        this.globalToggleButton = document.getElementById('toggleImageVariant');
        if (this.globalToggleButton) {
            this.globalToggleButton.addEventListener('click', () => {
                this.toggleGlobalImageVariant();
            });
        }

        // Drawer
        document.getElementById('scrim').addEventListener('click', () => {
            this.closeDrawer();
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            this.closeDrawer();
        });

        this.imageToggleWrap = document.getElementById('imageVariantToggleWrap');
        this.imageToggleButton = document.getElementById('imageVariantToggle');
        if (this.imageToggleButton) {
            this.imageToggleButton.addEventListener('click', () => {
                if (!this.activeCat) return;
                const hasDefault = !!this.activeCat.defaultImage;
                const hasCustom = !!this.activeCat.customImage && this.activeCat.customImage !== this.activeCat.defaultImage;
                if (!hasCustom) {
                    return;
                }

                if (this.activeImageVariant === 'custom' && hasDefault) {
                    this.activeImageVariant = 'default';
                } else if (hasCustom) {
                    this.activeImageVariant = 'custom';
                }

                this.updateDrawerImage(this.activeCat);
            });
        }
    }

    setupSubmitInteractions() {
        const modal = document.getElementById('submitModal');
        const form = document.getElementById('submitCardForm');

        this.submitElements = {
            modal,
            scrim: document.getElementById('submitModalScrim'),
            openBtn: document.getElementById('openSubmitModal'),
            closeBtn: document.getElementById('closeSubmitModal'),
            form,
            seasonSelect: document.getElementById('submitSeason'),
            catNameInput: document.getElementById('submitCatName'),
            ownerInput: document.getElementById('submitOwner'),
            raritySelect: document.getElementById('submitRarity'),
            cardNumberInput: document.getElementById('submitCardNumber'),
            defaultFileInput: document.getElementById('submitDefaultFile'),
            customFileInput: document.getElementById('submitCustomFile'),
            submitBtn: document.getElementById('submitCardButton'),
            status: document.getElementById('submitFormStatus')
        };

        if (!modal || !form) {
            this.convexEnabled = false;
            return;
        }

        this.submitElements.openBtn?.addEventListener('click', () => this.openSubmitModal());
        this.submitElements.closeBtn?.addEventListener('click', () => this.closeSubmitModal());
        this.submitElements.scrim?.addEventListener('click', () => this.closeSubmitModal());

        form.addEventListener('submit', (event) => this.handleSubmit(event));

        this.setupMassUploadUI();
    }

    setupMassUploadUI() {
        const modal = document.getElementById('massUploadModal');
        if (!modal) return;

        const elements = {
            modal,
            scrim: document.getElementById('massUploadScrim'),
            form: document.getElementById('massUploadForm'),
            ownerInput: document.getElementById('massUploadOwner'),
            defaultInput: document.getElementById('massUploadDefaultFiles'),
            list: document.getElementById('massUploadList'),
            status: document.getElementById('massUploadStatus'),
            submitBtn: document.getElementById('massUploadSubmit'),
            cancelBtn: document.getElementById('massUploadCancel'),
            closeBtn: document.getElementById('closeMassUpload')
        };

        this.massUploadElements = elements;

        elements.scrim?.addEventListener('click', () => this.closeMassUploadModal());
        elements.closeBtn?.addEventListener('click', () => this.closeMassUploadModal());
        elements.cancelBtn?.addEventListener('click', () => this.closeMassUploadModal());

        elements.form?.addEventListener('submit', (event) => this.handleMassUploadSubmit(event));

        if (elements.defaultInput) {
            elements.defaultInput.addEventListener('change', (event) => this.handleMassUploadFileSelection(event));
        }

        this.setupMassUploadHold();
    }

    setupMassUploadHold() {
        const button = this.submitElements.openBtn;
        if (!button || this.massUploadHoldInitialized) return;

        this.massUploadHoldInitialized = true;
        const holdDuration = 5000;

        const startHold = () => {
            if (button.disabled) return;
            this.massUploadHoldTriggered = false;
            this.clearMassUploadHold();

            this.massUploadHoldTimer = window.setTimeout(() => {
                this.massUploadHoldTimer = null;
                this.massUploadHoldTriggered = true;
                this.openMassUploadModal();
            }, holdDuration);
        };

        const pointerDown = (event) => {
            if (event.button !== undefined && event.button !== 0) return;
            startHold();
        };

        const cancelHold = () => {
            this.clearMassUploadHold();
        };

        const keyDown = (event) => {
            if (event.repeat) return;
            if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return;
            startHold();
        };

        const keyUp = (event) => {
            if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return;
            cancelHold();
        };

        button.addEventListener('pointerdown', pointerDown);
        button.addEventListener('pointerup', cancelHold);
        button.addEventListener('pointerleave', cancelHold);
        button.addEventListener('pointercancel', cancelHold);
        button.addEventListener('contextmenu', cancelHold);
        button.addEventListener('keydown', keyDown);
        button.addEventListener('keyup', keyUp);
        button.addEventListener('blur', cancelHold);
        button.addEventListener('click', (event) => {
            if (!this.massUploadHoldTriggered) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.massUploadHoldTriggered = false;
        }, true);
    }

    clearMassUploadHold() {
        if (this.massUploadHoldTimer) {
            clearTimeout(this.massUploadHoldTimer);
            this.massUploadHoldTimer = null;
        }
    }

    async openMassUploadModal() {
        const elements = this.massUploadElements;
        if (!elements?.modal) return;

        this.clearMassUploadHold();

        if (this.submitElements.modal?.classList.contains('active')) {
            this.closeSubmitModal();
        }

        await this.ensureMassUploadLookups();

        this.resetMassUploadForm({ clearOwner: false, clearStatus: true, clearFiles: true });
        elements.submitBtn?.removeAttribute('disabled');

        if (!this.convexEnabled || !globalThis.ConvexAPI) {
            elements.submitBtn?.setAttribute('disabled', 'true');
            this.updateMassUploadStatus('Mass upload requires Convex to be configured.', 'error');
        } else {
            this.updateMassUploadStatus('Select your cards to get started.', 'info');
        }

        elements.modal.classList.add('active');
        elements.modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        if (elements.ownerInput && !elements.ownerInput.value) {
            const singleOwner = this.submitElements.ownerInput?.value?.trim();
            if (singleOwner) {
                elements.ownerInput.value = singleOwner;
            }
        }

        if (elements.ownerInput) {
            setTimeout(() => elements.ownerInput.focus(), 80);
        }
    }

    closeMassUploadModal(resetForm = true) {
        const elements = this.massUploadElements;
        if (!elements?.modal) return;

        elements.modal.classList.remove('active');
        elements.modal.setAttribute('aria-hidden', 'true');

        this.massUploadHoldTriggered = false;

        const submitModalActive = this.submitElements.modal?.classList.contains('active');
        if (!submitModalActive) {
            document.body.style.overflow = '';
        }

        if (resetForm) {
            this.resetMassUploadForm({ clearOwner: false });
        }
    }

    resetMassUploadForm({ clearOwner = false, clearStatus = false, clearFiles = true } = {}) {
        const elements = this.massUploadElements;
        if (!elements) return;

        if (clearOwner && elements.ownerInput) {
            elements.ownerInput.value = '';
        }

        if (clearFiles && elements.defaultInput) {
            elements.defaultInput.value = '';
        }

        if (elements.list) {
            elements.list.innerHTML = '';
            elements.list.setAttribute('hidden', '');
        }

        this.massUploadEntries.forEach(entry => {
            if (entry.objectUrl) {
                URL.revokeObjectURL(entry.objectUrl);
            }
        });
        this.massUploadEntries = [];

        if (clearStatus && elements.status) {
            elements.status.textContent = '';
            elements.status.classList.remove('mass-upload-status--error', 'mass-upload-status--success');
        }

        elements.submitBtn?.removeAttribute('disabled');
    }

    async ensureMassUploadLookups() {
        if (!this.convexEnabled || !globalThis.ConvexAPI) return;

        const pending = [];
        if (!this.seasons.length) {
            pending.push(this.fetchConvexSeasons());
        }
        if (!this.rarities.length) {
            pending.push(this.fetchConvexRarities());
        }

        if (pending.length) {
            try {
                await Promise.allSettled(pending);
            } catch (error) {
                console.warn('Unable to ensure mass upload lookups:', error);
            }
        }
    }

    handleMassUploadFileSelection(event) {
        const input = event?.target;
        const files = Array.from(input?.files || []);

        this.resetMassUploadForm({ clearOwner: false, clearStatus: false, clearFiles: false });

        if (!files.length) {
            return;
        }

        this.buildMassUploadList(files);
    }

    buildMassUploadList(files) {
        const elements = this.massUploadElements;
        if (!elements?.list) return;

        elements.list.innerHTML = '';

        const entries = files.map(file => this.createMassUploadItem(file)).filter(Boolean);
        this.massUploadEntries = entries;

        entries.forEach(entry => {
            elements.list.appendChild(entry.elements.container);
        });

        if (entries.length) {
            elements.list.removeAttribute('hidden');
            this.updateMassUploadStatus('Fill out each card and press Upload all when you are ready.', 'info');
        } else {
            elements.list.setAttribute('hidden', '');
            this.updateMassUploadStatus('Select the default card art images you want to submit.', 'info');
        }
    }

    getMassUploadNameSuggestion(filename) {
        if (!filename) return '';
        const withoutExtension = filename.replace(/\.[^/.]+$/, '');
        const cleaned = withoutExtension.replace(/[_-](web|default)$/i, '');
        const parts = cleaned.split(/[_-]/).filter(Boolean);
        const filtered = parts.filter(part => !/^\d+$/.test(part));
        if (!filtered.length) {
            return '';
        }
        return filtered
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
    }

    createMassUploadItem(file) {
        const elements = this.massUploadElements;
        if (!elements) return null;

        const entryId = `mass-${++this.massUploadEntryCounter}`;
        const container = document.createElement('div');
        container.className = 'mass-upload-item';
        container.dataset.entryId = entryId;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'mass-upload-item__remove';
        removeBtn.setAttribute('aria-label', 'Remove this card');
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => this.removeMassUploadEntry(entryId));

        const previewWrap = document.createElement('div');
        previewWrap.className = 'mass-upload-item__preview';
        const previewImg = document.createElement('img');
        const objectUrl = URL.createObjectURL(file);
        previewImg.src = objectUrl;
        previewImg.alt = file.name;
        previewWrap.appendChild(previewImg);

        const fieldsWrap = document.createElement('div');
        fieldsWrap.className = 'mass-upload-item__fields';

        const appendField = (labelText, fieldElement) => {
            const wrapper = document.createElement('label');
            const label = document.createElement('span');
            label.textContent = labelText;
            wrapper.appendChild(label);
            wrapper.appendChild(fieldElement);
            fieldsWrap.appendChild(wrapper);
        };

        const catNameInput = document.createElement('input');
        catNameInput.type = 'text';
        const nameSuggestion = this.getMassUploadNameSuggestion(file?.name);
        catNameInput.placeholder = nameSuggestion || 'Enter cat name';
        catNameInput.required = true;
        appendField('Cat name', catNameInput);

        const seasonSelect = this.createMassUploadSelect(this.submitElements.seasonSelect, 'Select a season...');
        seasonSelect.required = true;
        const latestSeasonValue = this.getLatestSeasonOptionValue(seasonSelect);
        if (latestSeasonValue) {
            seasonSelect.value = latestSeasonValue;
            Array.from(seasonSelect.options || []).forEach(option => {
                option.selected = option.value === latestSeasonValue;
            });
        }
        appendField('Season', seasonSelect);

        const raritySelect = this.createMassUploadSelect(this.submitElements.raritySelect, 'Select a rarity...');
        raritySelect.required = true;
        appendField('Rarity', raritySelect);

        const numberInput = document.createElement('input');
        numberInput.type = 'text';
        numberInput.placeholder = 'Official card number (optional)';
        appendField('Card number (optional)', numberInput);

        const customInput = document.createElement('input');
        customInput.type = 'file';
        customInput.accept = 'image/png,image/jpeg';
        appendField('Custom art (optional)', customInput);

        const footer = document.createElement('div');
        footer.className = 'mass-upload-item__footer';
        const status = document.createElement('span');
        status.className = 'mass-upload-item__status';
        footer.appendChild(status);
        fieldsWrap.appendChild(footer);

        container.appendChild(removeBtn);
        container.appendChild(previewWrap);
        container.appendChild(fieldsWrap);

        return {
            id: entryId,
            file,
            objectUrl,
            elements: {
                container,
                status,
                catNameInput,
                seasonSelect,
                raritySelect,
                numberInput,
                customInput
            }
        };
    }

    createMassUploadSelect(sourceSelect, placeholderText) {
        const select = document.createElement('select');
        if (sourceSelect) {
            Array.from(sourceSelect.options).forEach(option => {
                const clone = option.cloneNode(true);
                if (!clone.value) {
                    clone.selected = true;
                } else {
                    clone.selected = false;
                }
                select.appendChild(clone);
            });
        } else {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.selected = true;
            placeholder.textContent = placeholderText || 'Select an option';
            select.appendChild(placeholder);
        }
        return select;
    }

    removeMassUploadEntry(entryId) {
        const index = this.massUploadEntries.findIndex(entry => entry.id === entryId);
        if (index === -1) return;

        const [entry] = this.massUploadEntries.splice(index, 1);
        if (entry?.elements?.container?.parentElement) {
            entry.elements.container.parentElement.removeChild(entry.elements.container);
        }
        if (entry?.objectUrl) {
            URL.revokeObjectURL(entry.objectUrl);
        }

        if (!this.massUploadEntries.length) {
            this.massUploadElements.list?.setAttribute('hidden', '');
            this.updateMassUploadStatus('Select the default card art images you want to submit.', 'info');
        }
    }

    updateMassUploadStatus(message, type = 'info') {
        const status = this.massUploadElements.status;
        if (!status) return;

        status.textContent = message || '';
        status.classList.remove('mass-upload-status--error', 'mass-upload-status--success');

        if (type === 'error') {
            status.classList.add('mass-upload-status--error');
        } else if (type === 'success') {
            status.classList.add('mass-upload-status--success');
        }
    }

    async handleMassUploadSubmit(event) {
        event.preventDefault();

        const elements = this.massUploadElements;
        if (!elements?.submitBtn) return;

        if (!this.convexEnabled || !globalThis.ConvexAPI) {
            this.updateMassUploadStatus('Mass upload requires Convex to be configured.', 'error');
            return;
        }

        const ownerValueRaw = elements.ownerInput?.value.trim() || '';
        if (!ownerValueRaw) {
            this.updateMassUploadStatus('Please enter your Twitch username.', 'error');
            elements.ownerInput?.focus();
            return;
        }
        const ownerValue = ownerValueRaw.toLowerCase();

        if (!this.massUploadEntries.length) {
            this.updateMassUploadStatus('Select at least one official card image to upload.', 'error');
            elements.defaultInput?.focus();
            return;
        }

        elements.submitBtn.setAttribute('disabled', 'true');
        this.updateMassUploadStatus('Uploading cards...', 'info');

        let success = 0;
        let failure = 0;

        for (const entry of this.massUploadEntries) {
            const status = entry.elements.status;
            status.textContent = '';
            status.classList.remove('mass-upload-item__status--error', 'mass-upload-item__status--success');

            const catNameRaw = entry.elements.catNameInput?.value.trim() || '';
            const seasonValue = entry.elements.seasonSelect?.value || '';
            const rarityValue = entry.elements.raritySelect?.value || '';
            const numberValue = entry.elements.numberInput?.value.trim() || '';
            const customFile = entry.elements.customInput?.files?.[0] || null;

            const validations = [];
            if (!catNameRaw) {
                validations.push('Add the cat name.');
            }
            if (!seasonValue) {
                validations.push('Choose a season.');
            }
            if (!rarityValue) {
                validations.push('Choose a rarity.');
            }

            if (validations.length) {
                status.textContent = validations.join(' ');
                status.classList.add('mass-upload-item__status--error');
                failure += 1;
                continue;
            }

            const formData = new FormData();
            const catName = catNameRaw.toLowerCase();
            formData.append('season', seasonValue);
            formData.append('cat_name', catName);
            formData.append('twitch_user_name', ownerValue);
            formData.append('rarity', rarityValue);
            if (numberValue) {
                formData.append('card_number', numberValue);
            }
            formData.append('default_card', entry.file);
            if (customFile) {
                formData.append('custom_card', customFile);
            }
            formData.append('approved', 'false');

            try {
                await ConvexAPI.catdex.create(formData);
                status.textContent = 'Uploaded!';
                status.classList.add('mass-upload-item__status--success');
                success += 1;
            } catch (error) {
                console.error('Mass upload failed for file', entry.file?.name, error);
                const errorMessage = this.formatConvexError(error) || 'Upload failed.';
                status.textContent = errorMessage;
                status.classList.add('mass-upload-item__status--error');
                failure += 1;
            }
        }

        elements.submitBtn.removeAttribute('disabled');

        if (success) {
            await this.refreshPendingCount();
        }

        if (success && !failure) {
            this.updateMassUploadStatus(`${success} card${success === 1 ? '' : 's'} uploaded successfully.`, 'success');
            this.resetMassUploadForm({ clearOwner: false, clearStatus: false });
        } else if (success && failure) {
            this.updateMassUploadStatus(`${success} uploaded, ${failure} failed. Check the highlighted cards.`, 'info');
        } else {
            this.updateMassUploadStatus('No cards were uploaded. Fix the highlighted issues and try again.', 'error');
        }
    }

    formatConvexError(error) {
        if (!error) return '';
        if (typeof error === 'string') return error;
        if (error?.payload?.error) return error.payload.error;
        if (error?.message) return error.message;
        return '';
    }

    openSubmitModal() {
        if (!this.convexEnabled || !this.submitElements.modal || !globalThis.ConvexAPI) {
            this.updateSubmitStatus('Submissions are currently unavailable.', 'error');
            return;
        }

        this.submitElements.modal.classList.add('active');
        this.submitElements.modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        this.updateSubmitStatus('');

        if (this.seasons.length === 0) {
            this.fetchConvexSeasons();
        }
        if (this.rarities.length === 0) {
            this.fetchConvexRarities();
        }

        // Focus the first input for accessibility
        if (this.submitElements.catNameInput) {
            setTimeout(() => this.submitElements.catNameInput.focus(), 80);
        }
    }

    closeSubmitModal(resetForm = false) {
        if (!this.submitElements.modal) return;

        this.submitElements.modal.classList.remove('active');
        this.submitElements.modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        if (resetForm) {
            this.resetSubmitForm();
        }
    }

    resetSubmitForm(preserveStatus = false) {
        if (!this.submitElements.form) return;
        this.submitElements.form.reset();
        if (this.submitElements.seasonSelect) {
            this.submitElements.seasonSelect.value = '';
        }
        if (this.submitElements.raritySelect) {
            this.submitElements.raritySelect.value = '';
        }
        if (this.submitElements.catNameInput) {
            this.submitElements.catNameInput.value = '';
        }
        if (this.submitElements.defaultFileInput) {
            this.submitElements.defaultFileInput.value = '';
        }
        if (this.submitElements.customFileInput) {
            this.submitElements.customFileInput.value = '';
        }
        if (!preserveStatus) {
            this.updateSubmitStatus('');
        }
    }

    updateSubmitStatus(message = '', type = '') {
        const statusEl = this.submitElements.status;
        if (!statusEl) return;

        statusEl.textContent = message;
        statusEl.classList.remove('submit-form__status--error', 'submit-form__status--success');

        if (type === 'error') {
            statusEl.classList.add('submit-form__status--error');
        } else if (type === 'success') {
            statusEl.classList.add('submit-form__status--success');
        }
    }

    async loadConvexData() {
        if (!this.convexEnabled || !globalThis.ConvexAPI) {
            this.updatePendingCountDisplay(true);
            return;
        }

        await this.fetchConvexSeasons();
        await this.fetchConvexRarities();
        await this.refreshPendingCount();
    }

    async loadConvexCatdex() {
        if (!this.convexEnabled || !globalThis.ConvexAPI) {
            return false;
        }

        try {
            const result = await ConvexAPI.catdex.list({ page: 1, perPage: 500, includePending: true });
            const records = result?.items || [];
            const mapped = records.map(record => this.mapConvexCat(record)).filter(Boolean);

            this.sortCatsByNumber(mapped);
            this.cats = mapped;
            this.baseCats = [...mapped];
            this.hasCustomImages = mapped.some(cat => !!cat.customImage);
            this.updateGlobalToggleVisibility();
            return true;
        } catch (error) {
            console.warn('Unable to load catdex records from Convex:', error);
            this.hasCustomImages = false;
            this.updateGlobalToggleVisibility();
            return false;
        }
    }

    buildFileUrl(storageId) {
        if (!storageId || !globalThis.ConvexAPI || !ConvexAPI.files) return null;
        return ConvexAPI.files.url('catdex', null, null, storageId);
    }

    mapConvexCat(record) {
        if (!record) return null;

        let owner = (record.twitch_user_name || '').trim();
        if (!owner) {
            owner = 'Unknown';
        } else if (/[\-_]/.test(owner)) {
            owner = this.formatName(owner);
        }
        const seasonId = record.season?.id || record.season?.season || record.seasonId || record.season;
        const rarityId = record.rarity?.id || record.rarityId || record.rarity;
        const seasonRecord = record.season || (seasonId ? this.seasonsMap.get(seasonId) : null) || null;
        const rarityRecord = record.rarity || (rarityId ? this.rarityMap.get(rarityId) : null) || null;

        const seasonName = seasonRecord?.season_name || seasonRecord?.seasonName || 'Unknown Season';
        const seasonShortName = seasonRecord?.short_name || seasonRecord?.shortName || null;

        const defaultImage = record.default_card_url || (record.default_card_storage_id ? this.buildFileUrl(record.default_card_storage_id) : null) || (record.default_card ? this.buildFileUrl(record.default_card_storage_id || null) : null);
        const customImageRaw = record.custom_card_url || (record.custom_card_storage_id ? this.buildFileUrl(record.custom_card_storage_id) : null) || (record.custom_card ? this.buildFileUrl(record.custom_card_storage_id || null) : null);
        const customImage = customImageRaw && customImageRaw !== defaultImage ? customImageRaw : null;

        if (!defaultImage && !customImage) {
            return null;
        }

        const fallbackSource = record.default_card || record.custom_card || '';
        const fallback = fallbackSource
            ? this.parseCatFromFilename(fallbackSource, seasonName, owner)
            : null;

        let name = (record.cat_name || '').trim();
        if (!name) {
            name = fallback?.name || 'Unnamed Cat';
        } else if (/[\-_]/.test(name)) {
            name = this.formatName(name);
        }

        const rarityName = rarityRecord?.rarity_name || rarityRecord?.rarityName || fallback?.rarity || 'Unknown';
        const rarity = this.formatRarity(String(rarityName || ''));
        const rarityStars = this.parseStarsValue(rarityRecord?.stars ?? record.rarity_stars ?? null);
        const rarityChance = typeof rarityRecord?.chance_percent === 'number'
            ? Number(rarityRecord.chance_percent)
            : null;
        const rarityLabel = this.formatRarityWithStars(rarity, rarityStars);

        let number = record.card_number;
        if (number === undefined || number === null || number === '') {
            number = fallback?.number ?? 0;
        } else if (typeof number === 'string') {
            const trimmed = number.trim();
            if (trimmed.toUpperCase() === '00X') {
                number = '00X';
            } else {
                const parsed = parseInt(trimmed, 10);
                number = Number.isNaN(parsed) ? trimmed : parsed;
            }
        }

        const seasonShort = seasonShortName || fallback?.seasonShort || this.getSeasonShort(seasonName);

        return {
            id: `pb_${record.id}`,
            recordId: record.id,
            name,
            rarity,
            number,
            owner,
            season: seasonName,
            seasonShort,
            seasonRaw: seasonName,
            defaultImage,
            customImage,
            image: defaultImage || customImage,
            rarityLabel,
            rarityStars,
            rarityChance,
            approved: Boolean(record.approved),
            source: 'convex'
        };
    }

    formatRarityWithStars(name, stars) {
        if (!name) return 'Unknown';
        const n = this.parseStarsValue(stars);
        if (!n) return name;
        return `${name} (${n} ⭐)`;
    }

    parseStarsValue(value) {
        const num = parseInt(value, 10);
        if (Number.isFinite(num) && num > 0) {
            return num;
        }
        return null;
    }

    getRarityOrderValue(name) {
        if (!name) return 999;
        const normalized = this.formatRarity(name);
        if (Object.prototype.hasOwnProperty.call(this.rarityOrder, normalized)) {
            return this.rarityOrder[normalized];
        }
        if (Object.prototype.hasOwnProperty.call(this.rarityOrder, name)) {
            return this.rarityOrder[name];
        }
        return 999;
    }

    extractSeasonNumber(value) {
        if (!value) return null;
        const matches = String(value).match(/\d+/g);
        if (!matches) return null;
        const numbers = matches
            .map(part => parseInt(part, 10))
            .filter(num => Number.isFinite(num));
        if (!numbers.length) return null;
        return Math.max(...numbers);
    }

    getSeasonTimestamp(season) {
        if (!season) return Number.NaN;
        const dateValue = season.created || season.release_date || season.start_date || season.updated;
        if (!dateValue) return Number.NaN;
        const timestamp = Date.parse(dateValue);
        return Number.isFinite(timestamp) ? timestamp : Number.NaN;
    }

    compareSeasonsForLatest(a, b) {
        const createdA = this.getSeasonTimestamp(a);
        const createdB = this.getSeasonTimestamp(b);

        const hasCreatedA = !Number.isNaN(createdA);
        const hasCreatedB = !Number.isNaN(createdB);
        if (hasCreatedA || hasCreatedB) {
            if (!hasCreatedA) return -1;
            if (!hasCreatedB) return 1;
            if (createdA !== createdB) {
                return createdA - createdB;
            }
        }

        const numberA = this.extractSeasonNumber(a?.short_name) ?? this.extractSeasonNumber(a?.season_name);
        const numberB = this.extractSeasonNumber(b?.short_name) ?? this.extractSeasonNumber(b?.season_name);
        if (Number.isFinite(numberA) || Number.isFinite(numberB)) {
            const safeA = Number.isFinite(numberA) ? numberA : -Infinity;
            const safeB = Number.isFinite(numberB) ? numberB : -Infinity;
            if (safeA !== safeB) {
                return safeA - safeB;
            }
        }

        const nameA = (a?.season_name || '').toLowerCase();
        const nameB = (b?.season_name || '').toLowerCase();
        if (nameA !== nameB) {
            return nameA.localeCompare(nameB);
        }

        return 0;
    }

    updateLatestSeason() {
        if (!Array.isArray(this.seasons) || this.seasons.length === 0) {
            this.latestSeasonId = null;
            return;
        }

        const sorted = [...this.seasons].sort((a, b) => this.compareSeasonsForLatest(a, b));
        const newest = sorted[sorted.length - 1];
        this.latestSeasonId = newest?.id ?? null;
    }

    getLatestSeasonOptionValue(select) {
        if (!this.latestSeasonId) return '';
        if (!select) return this.latestSeasonId;
        const hasOption = Array.from(select.options || []).some(option => option.value === this.latestSeasonId);
        return hasOption ? this.latestSeasonId : '';
    }

    sortCatsByNumber(list) {
        if (!Array.isArray(list)) return;
        const normalize = (value) => {
            if (value === '00X') return 9999;
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string') {
                const parsed = parseInt(value, 10);
                return Number.isNaN(parsed) ? 9999 : parsed;
            }
            return 9999;
        };
        list.sort((a, b) => normalize(a.number) - normalize(b.number));
    }

    async fetchConvexSeasons() {
        if (!this.convexEnabled || !this.submitElements.seasonSelect || !globalThis.ConvexAPI) return;

        try {
            const items = await ConvexAPI.catdex.seasons();
            this.seasons = (items || []).filter(item => !this.isBetaSeasonRecord(item));
            this.seasonsMap = new Map(this.seasons.map(item => [item.id, item]));
            this.updateLatestSeason();
            this.populateSubmitSeasonOptions();
        } catch (error) {
            this.latestSeasonId = null;
            this.handleConvexUnavailable('season list', error);
        }
    }

    async fetchConvexRarities() {
        if (!this.convexEnabled || !this.submitElements.raritySelect || !globalThis.ConvexAPI) return;

        try {
            const items = await ConvexAPI.catdex.rarities();
            this.rarities = items || [];
            this.rarityMap = new Map(this.rarities.map(item => [item.id, item]));
            this.populateSubmitRarityOptions();
        } catch (error) {
            this.handleConvexUnavailable('rarity list', error);
        }
    }

    populateSubmitSeasonOptions() {
        const select = this.submitElements.seasonSelect;
        if (!select) return;

        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a season...';
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        this.seasons.forEach(season => {
            const option = document.createElement('option');
            option.value = season.id;
            const shortLabel = season.short_name ? ` (${season.short_name})` : '';
            option.textContent = (season.season_name || 'Unnamed season') + shortLabel;
            select.appendChild(option);
        });

        select.value = '';
    }

    populateSubmitRarityOptions() {
        const select = this.submitElements.raritySelect;
        if (!select) return;

        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a rarity...';
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        const sortedRarities = [...this.rarities].sort((a, b) => {
            const nameA = a?.rarity_name || '';
            const nameB = b?.rarity_name || '';
            const orderDiff = this.getRarityOrderValue(nameA) - this.getRarityOrderValue(nameB);
            if (orderDiff !== 0) {
                return orderDiff;
            }
            return nameA.localeCompare(nameB);
        });

        sortedRarities.forEach(rarity => {
            const option = document.createElement('option');
            option.value = rarity.id;
            const label = this.formatRarityWithStars(rarity.rarity_name || 'Unnamed rarity', rarity?.stars ?? null);
            option.textContent = label;
            select.appendChild(option);
        });

        select.value = '';
    }

    async refreshPendingCount() {
        if (!this.convexEnabled || !globalThis.ConvexAPI) {
            this.updatePendingCountDisplay(true);
            return;
        }

        try {
            this.pendingCount = await ConvexAPI.catdex.pendingCount();
            this.updatePendingCountDisplay();
        } catch (error) {
            console.warn('Unable to load pending submissions count:', error);
            this.pendingCount = 0;
            this.updatePendingCountDisplay(true);
        }
    }

    async handleSubmit(event) {
        event.preventDefault();
        if (!this.convexEnabled || !globalThis.ConvexAPI) {
            this.updateSubmitStatus('Submissions are currently disabled.', 'error');
            return;
        }

        const { seasonSelect, catNameInput, ownerInput, raritySelect, cardNumberInput, defaultFileInput, customFileInput, submitBtn } = this.submitElements;
        if (!seasonSelect || !catNameInput || !ownerInput || !raritySelect || !defaultFileInput) {
            this.updateSubmitStatus('Submission form is not ready.', 'error');
            return;
        }

        const ownerValueRaw = ownerInput.value.trim();
        const catNameValueRaw = catNameInput.value.trim();

        if (!seasonSelect.value) {
            this.updateSubmitStatus('Please choose a season.', 'error');
            seasonSelect.focus();
            return;
        }

        if (!catNameValueRaw) {
            this.updateSubmitStatus('Please add the cat name.', 'error');
            catNameInput.focus();
            return;
        }

        if (!ownerValueRaw) {
            this.updateSubmitStatus('Please add a Twitch username or name.', 'error');
            ownerInput.focus();
            return;
        }

        if (!raritySelect.value) {
            this.updateSubmitStatus('Please choose a rarity.', 'error');
            raritySelect.focus();
            return;
        }

        if (!defaultFileInput.files || defaultFileInput.files.length === 0) {
            this.updateSubmitStatus('Please upload the official card image so we can show the card.', 'error');
            defaultFileInput.focus();
            return;
        }

        const cardNumberValue = cardNumberInput?.value.trim();

        const formData = new FormData();
        const catNameValue = catNameValueRaw.toLowerCase();
        const ownerValue = ownerValueRaw.toLowerCase();

        formData.append('season', seasonSelect.value);
        formData.append('cat_name', catNameValue);
        formData.append('twitch_user_name', ownerValue);
        formData.append('rarity', raritySelect.value);
        if (cardNumberValue) {
            formData.append('card_number', cardNumberValue);
        }
        formData.append('default_card', defaultFileInput.files[0]);
        if (customFileInput?.files && customFileInput.files.length > 0) {
            formData.append('custom_card', customFileInput.files[0]);
        }
        formData.append('approved', 'false');

        this.updateSubmitStatus('Uploading your card...', '');
        submitBtn?.setAttribute('disabled', 'true');

        try {
            await ConvexAPI.catdex.create(formData);

            await this.refreshPendingCount();

            this.updateSubmitStatus('Thanks! Your card is pending approval.', 'success');
            this.resetSubmitForm(true);
        } catch (error) {
            console.error('Error submitting cat card:', error);
            this.updateSubmitStatus(this.formatConvexError(error) || 'Something went wrong while submitting.', 'error');
        } finally {
            submitBtn?.removeAttribute('disabled');
        }
    }

    updateGlobalToggleVisibility() {
        if (!this.globalToggleButton) return;
        const canToggle = this.hasCustomImages;
        if (!canToggle) {
            this.globalToggleButton.setAttribute('hidden', '');
            this.globalToggleButton.removeAttribute('title');
            this.globalToggleButton.removeAttribute('aria-label');
            const wasCustom = this.globalImageVariant === 'custom';
            this.globalImageVariant = 'default';
            if (wasCustom) {
                this.render();
                if (this.activeCat) {
                    this.activeImageVariant = 'default';
                    this.updateDrawerImage(this.activeCat);
                }
            }
            return;
        }

        this.globalToggleButton.removeAttribute('hidden');
        this.updateGlobalToggleButtonText();
    }

    updateGlobalToggleButtonText() {
        if (!this.globalToggleButton) return;
        const showingDefault = this.globalImageVariant !== 'custom';
        const label = showingDefault ? 'Show custom art' : 'Show default art';
        this.globalToggleButton.textContent = label;
        this.globalToggleButton.setAttribute('aria-label', label);
        this.globalToggleButton.setAttribute('title', label);
    }

    toggleGlobalImageVariant() {
        if (!this.hasCustomImages) return;
        this.globalImageVariant = this.globalImageVariant === 'custom' ? 'default' : 'custom';
        this.updateGlobalToggleButtonText();
        this.render();
        if (this.activeCat) {
            this.activeImageVariant = this.globalImageVariant;
            this.updateDrawerImage(this.activeCat);
        }
    }

    updatePendingCountDisplay(forceHide = false) {
        const badge = document.getElementById('submitPendingBadge');
        if (!badge) return;

        const shouldHide = forceHide || !this.convexEnabled || !globalThis.ConvexAPI || this.pendingCount <= 0;

        if (shouldHide) {
            badge.setAttribute('hidden', '');
            badge.removeAttribute('title');
            badge.removeAttribute('aria-label');
            delete badge.dataset.label;
            return;
        }

        badge.textContent = this.pendingCount;
        const label = `${this.pendingCount} card${this.pendingCount === 1 ? '' : 's'} awaiting approval`;
        badge.dataset.label = this.pendingCount === 1 ? 'card awaiting approval' : 'cards awaiting approval';
        badge.setAttribute('aria-label', label);
        badge.setAttribute('title', label);
        badge.removeAttribute('hidden');
    }

    isConvex403(error) {
        if (!error) return false;
        const status = error?.status || error?.payload?.status || error?.response?.status;
        return status === 403;
    }

    handleConvexUnavailable(context, error) {
        let message = `Unable to load ${context}. Submissions are unavailable right now.`;
        if (this.isConvex403(error)) {
            message = `Submissions are disabled: Convex denied access to the ${context} (HTTP 403). Adjust the collection rules or expose a read token.`;
        }

        console.warn(`Unable to load ${context}:`, error);
        this.updateSubmitStatus(message, 'error');
        this.convexEnabled = false;
        this.pendingCount = 0;
        this.updatePendingCountDisplay(true);
        if (this.submitElements.openBtn) {
            this.submitElements.openBtn.disabled = true;
            this.submitElements.openBtn.textContent = 'Submissions unavailable';
        }
    }

    filterAndSort() {
        const searchQuery = document.getElementById('searchInput').value.toLowerCase();
        const seasonFilter = document.getElementById('seasonFilter')?.value || 'all';
        const rarityFilter = document.getElementById('rarityFilter').value;
        const sortBy = document.getElementById('sortBy').value;

        // Start with all cats
        let filtered = [...this.cats];

        // Apply search filter
        if (searchQuery) {
            // Check if it's a range (e.g., "1-50" or "10-20")
            const rangeMatch = searchQuery.match(/^(\d+)\s*-\s*(\d+)$/);
            
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                filtered = filtered.filter(cat => 
                    cat.number >= start && cat.number <= end
                );
            } else {
                // Regular search
                filtered = filtered.filter(cat => 
                    cat.name.toLowerCase().includes(searchQuery) ||
                    cat.number.toString().includes(searchQuery) ||
                    (cat.rarity && cat.rarity.toLowerCase().includes(searchQuery)) ||
                    (cat.rarityLabel && cat.rarityLabel.toLowerCase().includes(searchQuery)) ||
                    (cat.season && cat.season.toLowerCase().includes(searchQuery)) ||
                    (cat.owner && cat.owner.toLowerCase().includes(searchQuery))
                );
            }
        }

        // Apply season filter
        if (seasonFilter !== 'all') {
            filtered = filtered.filter(cat => cat.season === seasonFilter);
        }

        // Apply rarity filter
        if (rarityFilter !== 'all') {
            // Don't show Beta cats when filtering by rarity
            filtered = filtered.filter(cat => {
                const isBeta = this.isSpecialSeason(cat.seasonRaw || cat.season);
                return !isBeta && cat.rarity === rarityFilter;
            });
        }

        // Apply sorting
        const [sortKey, sortDir] = sortBy.split(':');
        
        filtered.sort((a, b) => {
            let comparison = 0;
            
            switch(sortKey) {
                case 'number':
                    // Handle 00X as a special case - put it at the end
                    const aNum = a.number === '00X' ? 9999 : (typeof a.number === 'string' ? parseInt(a.number) || 9999 : a.number);
                    const bNum = b.number === '00X' ? 9999 : (typeof b.number === 'string' ? parseInt(b.number) || 9999 : b.number);
                    comparison = aNum - bNum;
                    break;
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'rarity':
                    const rarityOrderA = this.rarityOrder[a.rarity] ?? 999;
                    const rarityOrderB = this.rarityOrder[b.rarity] ?? 999;
                    comparison = rarityOrderA - rarityOrderB;
                    if (comparison === 0) {
                        comparison = a.rarity.localeCompare(b.rarity);
                    }
                    break;
            }
            
            return sortDir === 'asc' ? comparison : -comparison;
        });

        this.filteredCats = filtered;
        
        // Update stats
        document.getElementById('totalCount').textContent = this.cats.length;
        document.getElementById('showingCount').textContent = this.filteredCats.length;
    }

    render() {
        const grid = document.getElementById('catGrid');
        
        if (this.filteredCats.length === 0) {
            grid.innerHTML = `
                <div class="empty">
                    <span class="empty-emoji">😿</span>
                    <p>No cats found. Try adjusting your filters.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.filteredCats.map(cat => {
            const cardImage = this.getCatCardImage(cat);
            return `
            <article class="card" onclick="catdex.openDrawer('${cat.id}')">
                ${cat.approved === false ? '<div class="card-status">Pending approval</div>' : ''}
                <div class="card-glow"></div>
                <div class="card-media">
                    <img src="${cardImage}" alt="${cat.name}" loading="lazy" 
                         onerror="this.src='../assets/images/paw.png'; this.style.opacity='0.3';">
                </div>
                <div class="card-body">
                    <h3 class="card-title">${cat.name}</h3>
                    <div class="badges-row">
                        ${!this.isSpecialSeason(cat.seasonRaw || cat.season) ? `<span class="badge badge-${this.getRarityClass(cat.rarity)}" data-rarity="true" style="font-size: 10px;">${cat.rarity || 'Unknown'}</span>` : ''}
                        <span class="badge ${this.isSpecialSeason(cat.seasonRaw || cat.season) ? 'badge-beta' : ''}" style="${!this.isSpecialSeason(cat.seasonRaw || cat.season) ? 'border-color: var(--muted); color: var(--muted);' : ''} font-size: 10px;">${cat.seasonShort || cat.season}</span>
                        <span class="meta-pill" style="font-size: 10px;">${cat.number === '00X' ? '00X' : (typeof cat.number === 'string' ? cat.number : String(cat.number).padStart(3, '0'))}</span>
                    </div>
                </div>
            </article>
        `; }).join('');
    }

    getCatCardImage(cat) {
        if (!cat) return '../assets/images/paw.png';
        const preferCustom = this.globalImageVariant === 'custom';
        const defaultImage = cat.defaultImage || null;
        const customImage = cat.customImage && cat.customImage !== defaultImage ? cat.customImage : null;

        if (preferCustom && customImage) {
            return customImage;
        }
        if (!preferCustom && defaultImage) {
            return defaultImage;
        }

        return defaultImage || customImage || cat.image || '../assets/images/paw.png';
    }

    updateDrawerImage(cat) {
        if (!cat) return;
        const img = document.getElementById('drawerImg');
        if (!img) return;

        const defaultImage = cat.defaultImage || null;
        const customImage = cat.customImage && cat.customImage !== defaultImage ? cat.customImage : null;

        if (this.activeImageVariant === 'custom' && !customImage && defaultImage) {
            this.activeImageVariant = 'default';
        }

        if (this.activeImageVariant !== 'custom' && !defaultImage && customImage) {
            this.activeImageVariant = 'custom';
        }

        const selectedUrl = this.activeImageVariant === 'custom' && customImage
            ? customImage
            : (defaultImage || customImage || this.getCatCardImage(cat));

        img.src = selectedUrl || '../assets/images/paw.png';
        img.alt = cat.name || 'Cat card';

        if (this.imageToggleWrap && this.imageToggleButton) {
            const canToggle = Boolean(defaultImage && customImage);
            if (!canToggle) {
                this.imageToggleWrap.setAttribute('hidden', '');
            } else {
                this.imageToggleWrap.removeAttribute('hidden');
                const showingDefault = this.activeImageVariant !== 'custom';
                const label = showingDefault ? 'Show custom art' : 'Show default art';
                this.imageToggleButton.textContent = label;
                this.imageToggleButton.setAttribute('aria-label', label);
                this.imageToggleButton.setAttribute('title', label);
            }
        }
    }

    getRarityClass(rarity) {
        const classMap = {
            'Moondust': 'moondust',
            'Starborn': 'starborn',
            'Lunara': 'lunara',
            'Celestara': 'celestara',
            'Divinara': 'divinara',
            'Holo Nova': 'holo-nova',
            'Singularity': 'singularity'
        };
        return classMap[rarity] || 'moondust';
    }

    openDrawer(catId) {
        const cat = this.filteredCats.find(c => c.id === catId);
        if (!cat) return;

        this.activeCat = cat;

        if (this.globalImageVariant === 'custom' && cat.customImage) {
            this.activeImageVariant = 'custom';
        } else if (cat.defaultImage) {
            this.activeImageVariant = 'default';
        } else if (cat.customImage) {
            this.activeImageVariant = 'custom';
        } else {
            this.activeImageVariant = 'default';
        }

        this.updateDrawerImage(cat);

        // Update drawer content
        document.getElementById('drawerTitle').textContent = cat.name;
        const numberLabel = cat.number === '00X' ? '00X' : cat.number;
        let subtitle = `No. ${numberLabel}`;
        if (cat.approved === false) {
            subtitle += ' · Pending approval';
        }
        document.getElementById('drawerSubtitle').textContent = subtitle;

        // Handle rarity display for Beta vs normal cats
        const rarityContainer = document.getElementById('drawerRarity').parentElement.parentElement;
        const isBeta = this.isSpecialSeason(cat.seasonRaw || cat.season);
        
        if (isBeta) {
            // Hide rarity for Beta cats
            rarityContainer.style.display = 'none';
        } else {
            // Show rarity for normal cats
            rarityContainer.style.display = '';
            const rarityElement = document.getElementById('drawerRarity');
            rarityElement.textContent = cat.rarity || 'Unknown';
            const rarityClass = this.getRarityClass(cat.rarity);
            rarityElement.style.color = `var(--${rarityClass.replace('-', '-')}, var(--text))`;
        }
        
        // Handle special number formatting
        let numberText;
        if (cat.number === '00X') {
            numberText = '#00X';
        } else if (typeof cat.number === 'number') {
            numberText = `#${String(cat.number).padStart(3, '0')}`;
        } else if (!Number.isNaN(parseInt(cat.number, 10))) {
            numberText = `#${String(parseInt(cat.number, 10)).padStart(3, '0')}`;
        } else {
            numberText = 'Pending';
        }
        document.getElementById('drawerNumber').textContent = numberText;
        
        // Update season if element exists
        const seasonElement = document.getElementById('drawerSeason');
        if (seasonElement) {
            seasonElement.textContent = cat.season;
        }

        // Handle owner display
        const ownerElement = document.getElementById('drawerOwner');
        const ownerContainer = document.getElementById('ownerContainer');
        if (ownerElement && ownerContainer) {
            if (cat.owner) {
                ownerElement.textContent = cat.owner;
                ownerContainer.style.display = '';
            } else {
                ownerContainer.style.display = 'none';
            }
        }

        // Show drawer
        document.getElementById('scrim').classList.add('active');
        document.getElementById('drawer').classList.add('active');
    }

    closeDrawer() {
        document.getElementById('scrim').classList.remove('active');
        document.getElementById('drawer').classList.remove('active');
        this.activeCat = null;
        this.activeImageVariant = this.globalImageVariant;
        if (this.imageToggleWrap) {
            this.imageToggleWrap.setAttribute('hidden', '');
        }
    }
}

// Initialize when DOM is ready
let catdex;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        catdex = new Catdex();
    });
} else {
    catdex = new Catdex();
}

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                     document.activeElement.isContentEditable;
    if (e.key === 'Escape') {
        const massModal = document.getElementById('massUploadModal');
        if (massModal?.classList.contains('active')) {
            e.preventDefault();
            catdex?.closeMassUploadModal();
            return;
        }
        const submitModal = document.getElementById('submitModal');
        if (submitModal?.classList.contains('active')) {
            e.preventDefault();
            catdex?.closeSubmitModal();
            return;
        }
    }

    if (!isTyping && e.key === 'Escape') {
        window.location.href = '../index.html';
    }
});
