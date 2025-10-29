// Gold Gold Gold Cat Spinner - Using native cat generator

// Import the native cat generator singleton
import catGenerator from '../core/catGeneratorV2.js';

// Cryptographically secure random selection system
function getSecureRandomInt100() {
    const array = new Uint8Array(1);
    let value;
    do {
        crypto.getRandomValues(array);
        value = array[0];
    } while (value >= 200); // Reject values >= 200 to avoid modulo bias
    return value % 100; // Returns 0-99
}

// Simple secure rarity selection 
function selectRaritySecure() {
    const random = getSecureRandomInt100(); // 0-99
    
    // Direct threshold checks for Linear Decrease distribution
    if (random < 40) return prizes[0]; // 0-39: Moondust (40%)
    if (random < 65) return prizes[1]; // 40-64: Starborn (25%) 
    if (random < 80) return prizes[2]; // 65-79: Lunara (15%)
    if (random < 90) return prizes[3]; // 80-89: Celestara (10%)
    if (random < 96) return prizes[4]; // 90-95: Divinara (6%)
    if (random < 99) return prizes[5]; // 96-98: Holo Nova (3%)
    return prizes[6]; // 99: Singularity (1%)
}

// Prize configuration
const prizes = [
    { name: 'Moondust', chance: 40, color: '#8b8b7a', cssClass: 'rarity-moondust' },
    { name: 'Starborn', chance: 25, color: '#6b8e4e', cssClass: 'rarity-starborn' },
    { name: 'Lunara', chance: 15, color: '#9b7c5d', cssClass: 'rarity-lunara' },
    { name: 'Celestara', chance: 10, color: '#7a8ca5', cssClass: 'rarity-celestara' },
    { name: 'Divinara', chance: 6, color: '#c97743', cssClass: 'rarity-divinara' },
    { name: 'Holo Nova', chance: 3, color: '#f4e4c1', cssClass: 'rarity-holo-nova' },
    { name: 'Singularity', chance: 1, color: '#d4af37', cssClass: 'rarity-singularity' }
];

// Fixed landing position - the winner is always at position 60 in each repetition
const ITEMS_BEFORE_WINNER = 60;   // Items before the winner
const ITEMS_AFTER_WINNER = 40;    // Items after for smooth scrolling

class CSGOSpinnerV3 {
    constructor() {
        this.catGenerator = null; // Will be initialized asynchronously
        this.spinnersWrapper = document.getElementById('spinners-wrapper');
        this.spinButton = document.getElementById('spinButton');
        this.wheelButtons = document.querySelectorAll('.wheel-button');
        this.resultsContainer = document.getElementById('results-container');
        this.resultsGrid = document.getElementById('results-grid');
        this.modal = document.getElementById('catModal');
        this.modalContent = document.getElementById('modalContent');
        this.closeModal = document.querySelector('.close');
        this.spinnerContainer = document.querySelector('.spinner-container');
        this.allCatsContainer = document.getElementById('all-cats-container');
        this.allCatsGrid = document.getElementById('all-cats-grid');
        this.legacyModal = document.getElementById('legacySpinnerModal');
        this.legacyDismiss = document.getElementById('legacySpinnerDismiss');
        this.legacyModalOpen = false;

        // Arrays to hold tracks for each wheel
        this.idleTracks = [];
        this.gameTracks = [];
        this.spinnerViewports = [];
        
        this.isSpinning = false;
        this.isRegenerating = false;
        this.generatedCatsPerWheel = []; // Array of arrays - one array of 24 cats per wheel
        this.predeterminedWinners = [];
        this.spinResults = [];
        this.loadedCats = 0;
        this.currentWheelIndex = 0;
        this.wheelCount = 1;
        
        this.init();
    }
    
    async init() {
        // Use the cat generator singleton directly
        this.catGenerator = catGenerator;
        
        // Disable spin button initially
        this.spinButton.disabled = true;
        this.spinButton.textContent = 'GENERATING CATS...';
        
        // Initialize first spinner
        this.createSpinners();

        // Event listeners
        this.spinButton.addEventListener('click', () => {
            if (this.spinButton.getAttribute('data-spin-again') === 'true') {
                this.regenerateAndSpin();
            } else {
                this.startSpinProcess();
            }
        });
        this.closeModal.addEventListener('click', () => this.hideModal());

        // Close modal when clicking outside
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });

        this.setupLegacyModal();
        this.showLegacyModal();

        // Wheel button selection - ALWAYS clear and regenerate
        this.wheelButtons.forEach(button => {
            button.addEventListener('click', () => {
                console.log(`Wheel button clicked for ${button.getAttribute('data-wheels')} wheel(s), clearing everything...`);
                
                // Update button states
                this.wheelButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                
                // Update wheel count
                this.wheelCount = parseInt(button.getAttribute('data-wheels'));
                
                // Clear ALL state - always start fresh
                this.spinButton.removeAttribute('data-spin-again');
                this.spinResults = [];
                this.currentWheelIndex = 0;
                this.predeterminedWinners = [];
                this.generatedCatsPerWheel = [];
                this.loadedCats = 0;
                
                // Hide results container
                this.resultsContainer.style.display = 'none';
                
                // Remove ALL old navigation elements from both containers
                const oldResultsNav = this.resultsContainer.querySelector('.all-cats-navigation');
                if (oldResultsNav) {
                    oldResultsNav.remove();
                }
                const oldAllCatsNav = this.allCatsContainer.querySelector('.all-cats-navigation');
                if (oldAllCatsNav) {
                    oldAllCatsNav.remove();
                }
                
                // Reset UI
                this.spinButton.textContent = 'GENERATING CATS...';
                this.spinButton.disabled = true;
                
                // Recreate spinners for new wheel count
                this.createSpinners();
                
                // Start fresh generation
                this.showCatSlotsWithLoading();
            });
        });
        
        // Initialize debug status
        window.forceRarity = null;
        window.currentSpinner = this; // For navigation callbacks
        
        // Show all cat slots immediately with loading indicators
        this.showCatSlotsWithLoading();
        
        // Regenerate idle wheel rarities periodically
        this.idleRegenerationInterval = setInterval(() => {
            if (!this.isSpinning && this.generatedCatsPerWheel[0] && this.generatedCatsPerWheel[0].length === 24) {
                this.regenerateIdleWheel();
            }
        }, 60000); // Every 60 seconds
    }
    
    // Create spinner viewports for each wheel
    createSpinners() {
        // Clear existing spinners
        this.spinnersWrapper.innerHTML = '';
        this.idleTracks = [];
        this.gameTracks = [];
        this.spinnerViewports = [];
        
        // Create a spinner for each wheel
        for (let i = 0; i < this.wheelCount; i++) {
            const spinnerDiv = document.createElement('div');
            spinnerDiv.className = 'single-spinner-container';
            
            // Create viewport
            const viewport = document.createElement('div');
            viewport.className = 'spinner-viewport';
            
            // Create dual tracks for this spinner
            const idleTrack = document.createElement('div');
            idleTrack.className = 'spinner-track idle-track';
            idleTrack.id = `idle-track-${i}`;
            
            const gameTrack = document.createElement('div');
            gameTrack.className = 'spinner-track game-track';
            gameTrack.id = `game-track-${i}`;
            
            viewport.appendChild(idleTrack);
            viewport.appendChild(gameTrack);
            spinnerDiv.appendChild(viewport);
            
            this.spinnersWrapper.appendChild(spinnerDiv);
            
            // Store references
            this.idleTracks.push(idleTrack);
            this.gameTracks.push(gameTrack);
            this.spinnerViewports.push(viewport);
        }
    }
    
    // Show all cat slots with loading spinners
    showCatSlotsWithLoading() {
        // wheelCount is already set by button click or default
        this.allCatsGrid.innerHTML = '';
        this.allCatsContainer.style.display = 'block';
        
        // Update header to show we're generating for multiple wheels
        let header = this.allCatsContainer.querySelector('h3');
        if (!header) {
            header = document.createElement('h3');
            this.allCatsContainer.insertBefore(header, this.allCatsContainer.firstChild);
        }
        header.textContent = this.wheelCount > 1 
            ? `Generating ${24 * this.wheelCount} Cats for ${this.wheelCount} Wheels...`
            : 'Generating 24 Cats...';
        
        // Create 24 loading slots (we'll still show 24 at a time, but generate more)
        for (let i = 0; i < 24; i++) {
            const catSlot = document.createElement('div');
            catSlot.className = 'cat-slot loading';
            catSlot.id = `cat-slot-${i}`;
            
            // Create spinning paw loader using the actual paw image
            const loader = document.createElement('div');
            loader.className = 'cat-paw-loader';
            loader.innerHTML = `<img src="../assets/images/paw.png" alt="Loading..." width="60" height="60">`;
            
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Generating...';
            
            catSlot.appendChild(loader);
            catSlot.appendChild(loadingText);
            this.allCatsGrid.appendChild(catSlot);
        }
        
        // Show spinner with placeholder items (CSS animation will handle movement)
        this.showSpinnerWithPlaceholders();
        
        // Start generating cats immediately
        this.generateCatsParallel();
    }
    
    // Generate all cats in parallel using the native cat generator
    async generateCatsParallel() {
        const totalCats = 24 * this.wheelCount;
        console.log(`Need ${totalCats} cats for ${this.wheelCount} wheels`);
        
        // Clear previous cats
        this.generatedCatsPerWheel = [];
        for (let i = 0; i < this.wheelCount; i++) {
            this.generatedCatsPerWheel[i] = [];
        }
        
        const allCatPromises = [];
        
        // Generate all cats
        for (let wheelIndex = 0; wheelIndex < this.wheelCount; wheelIndex++) {
            for (let catIndex = 0; catIndex < 24; catIndex++) {
                const catPromise = (async (index, wheel) => {
                    try {
                        // Generate cat using native generator
                        const params = await this.catGenerator.generateRandomParams();
                        const result = await this.catGenerator.generateCat(params);
                        result.params = params;
                        
                        // Create cat data object matching expected format
                        const catData = {
                            canvas: result.canvas,
                            dataUrl: result.canvas.toDataURL(),
                            spriteNumber: result.params.spriteNumber,
                            colour: result.params.colour,
                            peltName: result.params.peltName,
                            tint: result.params.tint,
                            skinColour: result.params.skinColour,
                            eyeColour: result.params.eyeColour,
                            eyeColour2: result.params.eyeColour2,
                            whitePatches: result.params.whitePatches,
                            points: result.params.points,
                            vitiligo: result.params.vitiligo,
                            whitePatchesTint: result.params.whitePatchesTint,
                            accessory: result.params.accessory,
                            scar: result.params.scar,
                            isTortie: result.params.isTortie,
                            tortiePattern: result.params.tortiePattern,
                            tortieColour: result.params.tortieColour,
                            tortieMask: result.params.tortieMask,
                            shading: result.params.shading,
                            reverse: result.params.reverse,
                            index: index,
                            wheel: wheel
                        };
                        
                        // Generate URL for the cat
                        catData.url = this.catGenerator.buildCatURL(result.params);
                        
                        // Store the cat
                        this.generatedCatsPerWheel[wheel][index] = catData;
                        
                        // Display cats in loading slots (only show current wheel)
                        if (wheel === this.currentWheelIndex) {
                            this.displayLoadedCat(catData, index);
                        }
                        
                        // Replace placeholders in the spinner for this wheel
                        this.replaceIdleTrackPlaceholder(catData, index, wheel);
                        
                        this.loadedCats++;
                        
                        return catData;
                    } catch (e) {
                        console.error(`Error generating cat ${index} for wheel ${wheel}:`, e);
                        return null;
                    }
                })(catIndex, wheelIndex);
                
                allCatPromises.push(catPromise);
            }
        }
        
        // Wait for all cats to complete
        const results = await Promise.allSettled(allCatPromises);
        
        // Process results to filter out failed ones
        const successfulCats = results
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);
            
        console.log(`Generated ${successfulCats.length} cats successfully`);
        
        // Check for any failures
        const failedCats = results.filter(r => r.status === 'rejected' || !r.value).length;
        if (failedCats > 0) {
            console.warn(`${failedCats} cats failed to generate`);
        }
        
        // Clean up and fill any missing cats for each wheel
        for (let wheelIndex = 0; wheelIndex < this.wheelCount; wheelIndex++) {
            // Clean up nulls
            this.generatedCatsPerWheel[wheelIndex] = this.generatedCatsPerWheel[wheelIndex].filter(c => c);
            
            // If we still don't have 24 cats, fill with duplicates or generate new ones
            if (this.generatedCatsPerWheel[wheelIndex].length < 24) {
                console.warn(`Only generated ${this.generatedCatsPerWheel[wheelIndex].length} cats for wheel ${wheelIndex}, filling...`);
                const existingCats = [...this.generatedCatsPerWheel[wheelIndex]];
                
                // If we have no cats at all, we need to generate at least one
                if (existingCats.length === 0) {
                    console.error('No cats generated for wheel', wheelIndex);
                    // Generate one cat synchronously to avoid infinite loop
                    try {
                        const params = await this.catGenerator.generateRandomParams();
                        const result = await this.catGenerator.generateCat(params);
                        result.params = params;
                        const catData = {
                            canvas: result.canvas,
                            dataUrl: result.canvas.toDataURL(),
                            spriteNumber: result.params.spriteNumber,
                            colour: result.params.colour,
                            peltName: result.params.peltName,
                            tint: result.params.tint,
                            skinColour: result.params.skinColour,
                            eyeColour: result.params.eyeColour,
                            eyeColour2: result.params.eyeColour2,
                            whitePatches: result.params.whitePatches,
                            points: result.params.points,
                            vitiligo: result.params.vitiligo,
                            whitePatchesTint: result.params.whitePatchesTint,
                            accessory: result.params.accessory,
                            scar: result.params.scar,
                            isTortie: result.params.isTortie,
                            tortiePattern: result.params.tortiePattern,
                            tortieColour: result.params.tortieColour,
                            tortieMask: result.params.tortieMask,
                            shading: result.params.shading,
                            reverse: result.params.reverse,
                            index: 0,
                            wheel: wheelIndex,
                            url: this.catGenerator.buildCatURL(result.params)
                        };
                        existingCats.push(catData);
                        this.generatedCatsPerWheel[wheelIndex].push(catData);
                    } catch (e) {
                        console.error('Failed to generate emergency cat:', e);
                        break; // Exit to avoid infinite loop
                    }
                }
                
                // Now fill with duplicates
                while (this.generatedCatsPerWheel[wheelIndex].length < 24 && existingCats.length > 0) {
                    const randomCat = existingCats[Math.floor(Math.random() * existingCats.length)];
                    if (randomCat) {
                        // Create a duplicate with new index
                        const duplicateCat = { 
                            ...randomCat, 
                            index: this.generatedCatsPerWheel[wheelIndex].length,
                            isDuplicate: true 
                        };
                        this.generatedCatsPerWheel[wheelIndex].push(duplicateCat);
                        if (wheelIndex === this.currentWheelIndex) {
                            this.displayLoadedCat(duplicateCat, duplicateCat.index);
                        }
                        this.replaceIdleTrackPlaceholder(duplicateCat, duplicateCat.index, wheelIndex);
                    }
                }
            }
        }
        
        // Apply cats to all spinner placeholders
        for (let wheelIndex = 0; wheelIndex < this.wheelCount; wheelIndex++) {
            if (this.generatedCatsPerWheel[wheelIndex]) {
                this.generatedCatsPerWheel[wheelIndex].forEach((cat, index) => {
                    if (cat) {
                        this.replaceIdleTrackPlaceholder(cat, index, wheelIndex);
                    }
                });
            }
        }
        
        // Build initial spinner tracks and assign rarities
        this.buildAllSpinnerTracks();
        this.assignRarities();
        
        // Update UI
        this.spinButton.textContent = 'SPIN';
        this.spinButton.disabled = false;
        
        // Update header to show completion
        const header = this.allCatsContainer.querySelector('h3');
        if (header) {
            if (this.wheelCount > 1) {
                header.textContent = `All ${this.wheelCount} Wheels Generated! Showing Wheel 1 of ${this.wheelCount}`;
            } else {
                header.textContent = 'All 24 Cats Generated!';
            }
        }
        
        // Add navigation if multiple wheels
        if (this.wheelCount > 1) {
            this.addAllCatsNavigation();
        }
    }
    
    // Add navigation for all cats view
    addAllCatsNavigation() {
        if (this.allCatsContainer.querySelector('.all-cats-navigation')) return;
        
        const navContainer = document.createElement('div');
        navContainer.className = 'all-cats-navigation result-navigation';
        navContainer.innerHTML = `
            <button class="nav-button nav-prev" onclick="window.currentSpinner.navigateAllCats(-1)">←</button>
            <span class="nav-indicator">Wheel <span id="all-cats-current-wheel">1</span> of ${this.wheelCount}</span>
            <button class="nav-button nav-next" onclick="window.currentSpinner.navigateAllCats(1)">→</button>
        `;
        this.allCatsContainer.insertBefore(navContainer, this.allCatsGrid);
    }
    
    // Generate additional cats for new wheels
    async generateAdditionalCats(fromWheel, toWheel) {
        const promises = [];
        
        for (let wheelIndex = fromWheel; wheelIndex < toWheel; wheelIndex++) {
            this.generatedCatsPerWheel[wheelIndex] = [];
            
            for (let catIndex = 0; catIndex < 24; catIndex++) {
                const catPromise = (async (index, wheel) => {
                    try {
                        // Generate cat using native generator
                        const params = await this.catGenerator.generateRandomParams();
                        const result = await this.catGenerator.generateCat(params);
                        result.params = params;
                        
                        // Create cat data object
                        const catData = {
                            canvas: result.canvas,
                            dataUrl: result.canvas.toDataURL(),
                            spriteNumber: result.params.spriteNumber,
                            colour: result.params.colour,
                            peltName: result.params.peltName,
                            tint: result.params.tint,
                            skinColour: result.params.skinColour,
                            eyeColour: result.params.eyeColour,
                            eyeColour2: result.params.eyeColour2,
                            whitePatches: result.params.whitePatches,
                            points: result.params.points,
                            vitiligo: result.params.vitiligo,
                            whitePatchesTint: result.params.whitePatchesTint,
                            accessory: result.params.accessory,
                            scar: result.params.scar,
                            isTortie: result.params.isTortie,
                            tortiePattern: result.params.tortiePattern,
                            tortieColour: result.params.tortieColour,
                            tortieMask: result.params.tortieMask,
                            shading: result.params.shading,
                            reverse: result.params.reverse,
                            index: index,
                            wheel: wheel
                        };
                        
                        // Generate URL for the cat
                        catData.url = this.catGenerator.buildCatURL(result.params);
                        
                        this.generatedCatsPerWheel[wheel][index] = catData;
                        this.replaceIdleTrackPlaceholder(catData, index, wheel);
                        
                        return catData;
                    } catch (e) {
                        console.error(`Error generating cat ${index} for wheel ${wheel}:`, e);
                        return null;
                    }
                })(catIndex, wheelIndex);
                
                promises.push(catPromise);
            }
        }
        
        await Promise.all(promises);
        
        // Rebuild tracks for new wheels
        this.buildAllSpinnerTracks();
        this.assignRarities();
    }
    
    // Show spinner with placeholder items
    showSpinnerWithPlaceholders() {
        this.spinnerContainer.style.display = 'block';
        
        // Create placeholders for each spinner
        this.idleTracks.forEach((idleTrack, wheelIndex) => {
            idleTrack.innerHTML = '';
        
        // Add placeholder items with visual variety
        const totalItems = ITEMS_BEFORE_WINNER + 1 + ITEMS_AFTER_WINNER;
        const placeholderItems = [];
        
        // Use Linear Decrease distribution for idle spinner
        const guaranteedRarities = [
            { rarityClass: 'rarity-moondust', count: Math.round(totalItems * 0.40) }, // 40%
            { rarityClass: 'rarity-starborn', count: Math.round(totalItems * 0.25) }, // 25%
            { rarityClass: 'rarity-lunara', count: Math.round(totalItems * 0.15) }, // 15%
            { rarityClass: 'rarity-celestara', count: Math.round(totalItems * 0.10) }, // 10%
            { rarityClass: 'rarity-divinara', count: Math.round(totalItems * 0.06) }, // 6%
            { rarityClass: 'rarity-holo-nova', count: Math.round(totalItems * 0.03) }, // 3%
            { rarityClass: 'rarity-singularity', count: Math.round(totalItems * 0.01) } // 1%
        ];
        
        // Calculate total guaranteed items
        const totalGuaranteed = guaranteedRarities.reduce((sum, r) => sum + r.count, 0);
        
        // Build array of rarities to distribute
        let rarityPool = [];
        guaranteedRarities.forEach(r => {
            for (let i = 0; i < r.count; i++) {
                rarityPool.push(r.rarityClass);
            }
        });
        
        // Create a properly distributed array
        let distributedItems = new Array(totalItems).fill('rarity-moondust');
        
        // Function to find valid positions (not adjacent to rare cats)
        const findValidPosition = (usedPositions) => {
            let attempts = 0;
            while (attempts < 100) {
                const pos = Math.floor(Math.random() * totalItems);
                if (usedPositions.has(pos)) {
                    attempts++;
                    continue;
                }
                
                // Check adjacent positions
                const prevPos = (pos - 1 + totalItems) % totalItems;
                const nextPos = (pos + 1) % totalItems;
                
                const prevRarity = distributedItems[prevPos];
                const nextRarity = distributedItems[nextPos];
                
                // If adjacent positions have rare cats, skip this position
                if ((prevRarity && prevRarity !== 'rarity-moondust') || 
                    (nextRarity && nextRarity !== 'rarity-moondust')) {
                    attempts++;
                    continue;
                }
                
                return pos;
            }
            // If no valid position found, return a random unused one
            for (let i = 0; i < totalItems; i++) {
                if (!usedPositions.has(i)) return i;
            }
            return -1;
        };
        
        // Distribute all non-grey rarities
        const usedPositions = new Set();
        rarityPool.forEach(rarity => {
            if (rarity !== 'rarity-moondust') {
                const pos = findValidPosition(usedPositions);
                if (pos !== -1) {
                    distributedItems[pos] = rarity;
                    usedPositions.add(pos);
                }
            }
        });
        
        // Create items with the distributed rarities
        let previousRarity = null;
        for (let i = 0; i < totalItems; i++) {
            const item = document.createElement('div');
            const rarityClass = distributedItems[i];
            
            item.className = `cat-item placeholder ${rarityClass}`;
            // Map to cat indices 0-23 (cycling through all 24 cats)
            item.setAttribute('data-placeholder-index', String(i % 24));
            
            const spriteWrapper = document.createElement('div');
            spriteWrapper.className = 'cat-sprite-wrapper';
            
            const placeholder = document.createElement('div');
            placeholder.className = 'cat-placeholder';
            placeholder.innerHTML = '🐱';
            
            spriteWrapper.appendChild(placeholder);
            item.appendChild(spriteWrapper);
            placeholderItems.push(item);
            
            previousRarity = rarityClass;
        }
        
        // Add the last 5 items at the beginning for seamless start
        const prefixItems = 5;
        for (let i = totalItems - prefixItems; i < totalItems; i++) {
            const clonedItem = placeholderItems[i].cloneNode(true);
            idleTrack.appendChild(clonedItem);
        }
        
        // Add items three times for seamless loop (need more for fast scrolling)
        for (let repeat = 0; repeat < 3; repeat++) {
            placeholderItems.forEach(item => {
                const clonedItem = item.cloneNode(true);
                idleTrack.appendChild(clonedItem);
            });
        }
        
        // Start animation at position that shows the prefix items
        idleTrack.style.transform = `translateX(-${170 * prefixItems}px)`;
        
        // Placeholders ready
        });
    }
    
    // Display a loaded cat in its slot
    displayLoadedCat(cat, index) {
        const slot = document.getElementById(`cat-slot-${index}`);
        if (slot) {
            slot.innerHTML = '';
            slot.className = 'cat-slot loaded';
            
            const catItem = document.createElement('div');
            catItem.className = 'all-cat-item';
            catItem.onclick = () => this.showCatDetails(cat);
            
            const canvas = document.createElement('canvas');
            canvas.className = 'all-cat-sprite';
            canvas.width = 120;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(cat.canvas, 0, 0, 120, 120);
            
            catItem.appendChild(canvas);
            slot.appendChild(catItem);
        }
    }
    
    // Replace idle track placeholder with actual cat
    replaceIdleTrackPlaceholder(cat, index, wheelIndex = 0) {
        const idleTrack = this.idleTracks[wheelIndex];
        if (!idleTrack) return;
        
        // Find all placeholders with this index in idle track
        const placeholders = idleTrack.querySelectorAll(`.cat-item.placeholder[data-placeholder-index="${index}"]`);
        
        if (!cat.canvas) {
            console.error(`Cat ${index} has no canvas!`);
            return;
        }
        
        placeholders.forEach((placeholder, i) => {
            // Replace placeholder content with actual cat
            const spriteWrapper = placeholder.querySelector('.cat-sprite-wrapper');
            if (spriteWrapper) {
                // Preserve the visual rarity class
                const rarityClasses = Array.from(placeholder.classList).filter(c => c.startsWith('rarity-'));
                
                spriteWrapper.innerHTML = '';
                
                const canvas = document.createElement('canvas');
                canvas.className = 'cat-sprite';
                canvas.width = 120;
                canvas.height = 120;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                
                try {
                    ctx.drawImage(cat.canvas, 0, 0, 120, 120);
                } catch (e) {
                    console.error(`Failed to draw cat ${index}:`, e);
                }
                
                spriteWrapper.appendChild(canvas);
                placeholder.classList.remove('placeholder');
            }
        });
    }
    
    // Regenerate idle wheel with new rarities
    regenerateIdleWheel() {
        if (this.isSpinning) return;
        
        console.log('Regenerating idle wheels with new rarities...');
        
        // Save current positions for all tracks
        const currentTransforms = this.idleTracks.map(track => 
            track ? window.getComputedStyle(track).transform : null
        );
        
        // Generate new placeholders with different rarities
        this.showSpinnerWithPlaceholders();
        
        // Restore positions and re-apply cats for all wheels
        this.idleTracks.forEach((track, wheelIndex) => {
            if (track && currentTransforms[wheelIndex] && currentTransforms[wheelIndex] !== 'none') {
                track.style.transform = currentTransforms[wheelIndex];
            }
            
            // Re-apply cat sprites to new placeholders
            if (this.generatedCatsPerWheel[wheelIndex]) {
                this.generatedCatsPerWheel[wheelIndex].forEach((cat, index) => {
                    if (cat) {
                        this.replaceIdleTrackPlaceholder(cat, index, wheelIndex);
                    }
                });
            }
        });
    }
    
    // Update the header for all cats display
    updateAllCatsHeader() {
        const header = this.allCatsContainer.querySelector('h3');
        if (header) {
            if (this.wheelCount > 1) {
                header.textContent = `Wheel ${this.currentWheelIndex + 1} of ${this.wheelCount} - 24 Generated Cats`;
            } else {
                header.textContent = 'All 24 Generated Cats (What Could Have Been):';
            }
        }
    }
    
    // Update all cats display to show current wheel
    updateAllCatsDisplay() {
        const wheelCats = this.generatedCatsPerWheel[this.currentWheelIndex];
        if (!wheelCats) return;
        
        // Update header
        this.updateAllCatsHeader();
        
        // Add navigation if needed
        if (this.wheelCount > 1 && !this.allCatsContainer.querySelector('.all-cats-navigation')) {
            const navContainer = document.createElement('div');
            navContainer.className = 'all-cats-navigation result-navigation';
            navContainer.innerHTML = `
                <button class="nav-button nav-prev" onclick="window.currentSpinner.navigateAllCats(-1)">←</button>
                <span class="nav-indicator">Wheel <span id="all-cats-current-wheel">1</span> of ${this.wheelCount}</span>
                <button class="nav-button nav-next" onclick="window.currentSpinner.navigateAllCats(1)">→</button>
            `;
            
            // Insert after header
            const header = this.allCatsContainer.querySelector('h3');
            if (header && header.nextSibling) {
                this.allCatsContainer.insertBefore(navContainer, header.nextSibling);
            } else {
                this.allCatsContainer.insertBefore(navContainer, this.allCatsGrid);
            }
        }
        
        // Update navigation indicator
        const indicator = document.getElementById('all-cats-current-wheel');
        if (indicator) {
            indicator.textContent = this.currentWheelIndex + 1;
        }
        
        // Clear and repopulate the grid
        this.allCatsGrid.innerHTML = '';
        
        wheelCats.forEach((cat, index) => {
            if (!cat) return;
            
            const catSlot = document.createElement('div');
            catSlot.className = 'cat-slot loaded';
            catSlot.id = `cat-slot-${index}`;
            
            const catItem = document.createElement('div');
            catItem.className = 'all-cat-item';
            catItem.onclick = () => this.showCatDetails(cat);
            
            const canvas = document.createElement('canvas');
            canvas.className = 'all-cat-sprite';
            canvas.width = 120;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(cat.canvas, 0, 0, 120, 120);
            
            catItem.appendChild(canvas);
            catSlot.appendChild(catItem);
            this.allCatsGrid.appendChild(catSlot);
        });
    }
    
    // Navigate between all cats displays
    navigateAllCats(direction) {
        const newIndex = this.currentWheelIndex + direction;
        if (newIndex >= 0 && newIndex < this.wheelCount) {
            this.currentWheelIndex = newIndex;
            this.updateAllCatsDisplay();
            
            // Update navigation buttons
            const prevBtn = this.allCatsContainer.querySelector('.nav-prev');
            const nextBtn = this.allCatsContainer.querySelector('.nav-next');
            if (prevBtn) prevBtn.disabled = newIndex === 0;
            if (nextBtn) nextBtn.disabled = newIndex === this.wheelCount - 1;
        }
    }
    
    // Update spinner track with loaded cats
    updateSpinnerTrack() {
        // Don't update if we're spinning
        if (this.isSpinning) return;
        
        // We'll fully rebuild the track in prepareSpinner
    }
    
    // Prepare the spinner with fixed position system
    prepareSpinner() {
        // Assign rarities and determine winners
        this.assignRarities();
        
        // Build the spinner tracks for all wheels
        this.buildAllSpinnerTracks();
        
        // Show the spinner once it's ready
        this.spinnerContainer.style.display = 'block';
    }
    
    // Build spinner tracks for all wheels
    buildAllSpinnerTracks() {
        for (let wheelIndex = 0; wheelIndex < this.wheelCount; wheelIndex++) {
            this.buildFixedSpinnerTrack(wheelIndex);
        }
    }
    
    // Assign rarity to cats and determine winners
    assignRarities() {
        this.predeterminedWinners = [];
        const spinCount = this.wheelCount;
        
        // Track recent high rarities to prevent clustering
        const recentHighRarities = [];
        const HIGH_RARITY_THRESHOLD = 8; // Rarities with < 8% chance
        const MIN_DISTANCE = 3; // Minimum spins between high rarities
        
        for (let spin = 0; spin < spinCount; spin++) {
            // Select a random cat from the appropriate wheel
            const wheelIndex = spin % this.wheelCount;
            const wheelCats = this.generatedCatsPerWheel[wheelIndex] || [];
            const catIndex = Math.floor(Math.random() * wheelCats.length);
            const cat = { ...wheelCats[catIndex] };
            
            // Check if rarity is forced (debug mode) - only for the FIRST spin
            let selectedPrize;
            let wasCheated = false;
            if (window.forceRarity && spin === 0) {
                selectedPrize = prizes.find(p => p.name === window.forceRarity);
                if (selectedPrize) {
                    console.log(`Debug: Forcing rarity to ${window.forceRarity} for first spin`);
                    document.getElementById('forceRarityStatus').textContent = `First spin forced to: ${window.forceRarity}`;
                    wasCheated = true;
                    // Clear force after using it for the first spin
                    window.forceRarity = null;
                    setTimeout(() => {
                        document.getElementById('forceRarityStatus').textContent = '';
                    }, 3000);
                }
            }
            
            if (!selectedPrize) {
                // Determine rarity based on actual probabilities
                let attempts = 0;
                do {
                    const random = Math.random() * 100;
                    let cumulative = 0;
                    selectedPrize = prizes[0];
                    
                    for (const prize of prizes) {
                        cumulative += prize.chance;
                        if (random <= cumulative) {
                            selectedPrize = prize;
                            break;
                        }
                    }
                    
                    // Check if this is a high rarity
                    if (selectedPrize.chance < HIGH_RARITY_THRESHOLD) {
                        // Check if too close to another high rarity
                        const tooClose = recentHighRarities.some(highSpin => 
                            Math.abs(spin - highSpin) < MIN_DISTANCE
                        );
                        
                        if (tooClose && attempts < 10) {
                            selectedPrize = null; // Try again
                            attempts++;
                        } else {
                            // Add to recent high rarities
                            recentHighRarities.push(spin);
                            // Keep only recent ones
                            if (recentHighRarities.length > 5) {
                                recentHighRarities.shift();
                            }
                            break;
                        }
                    } else {
                        break; // Common rarity, no restrictions
                    }
                } while (!selectedPrize && attempts < 10);
                
                // Fallback to common if we couldn't find a good rare
                if (!selectedPrize) {
                    selectedPrize = prizes[0]; // Moondust
                }
            }
            
            cat.rarity = selectedPrize.name;
            cat.rarityData = selectedPrize;
            cat.spinIndex = spin;
            cat.wasCheated = wasCheated;
            
            console.log(`Winner ${spin}: Cat ${cat.index} assigned rarity ${cat.rarity}${wasCheated ? ' (CHEATED)' : ''}`);
            
            this.predeterminedWinners.push(cat);
        }
    }
    
    // Build spinner track with fixed winner positions
    buildFixedSpinnerTrack(wheelIndex = 0) {
        const gameTrack = this.gameTracks[wheelIndex];
        if (!gameTrack) return;
        
        gameTrack.innerHTML = '';
        
        // Get the winner for this wheel (ensure we have one)
        let currentWinner = this.predeterminedWinners[wheelIndex];
        
        // If no winner for this wheel, pick a random one from generated cats
        if (!currentWinner && this.generatedCatsPerWheel[wheelIndex]) {
            const wheelCats = this.generatedCatsPerWheel[wheelIndex];
            if (wheelCats && wheelCats.length > 0) {
                const randomIndex = Math.floor(Math.random() * wheelCats.length);
                currentWinner = wheelCats[randomIndex];
                // Assign a rarity if not already assigned
                if (!currentWinner.rarityData) {
                    // Use proper rarity determination with high rarity prevention
                    const HIGH_RARITY_THRESHOLD = 8; // Rarities with < 8% chance
                    let selectedPrize;
                    let attempts = 0;
                    
                    do {
                        const random = Math.random() * 100;
                        let cumulative = 0;
                        selectedPrize = prizes[0]; // Default to Moondust
                        
                        for (const prize of prizes) {
                            cumulative += prize.chance;
                            if (random <= cumulative) {
                                selectedPrize = prize;
                                break;
                            }
                        }
                        
                        // For now, accept any rarity since we don't have the full context
                        // In the real implementation, this would check against recent high rarities
                        break;
                    } while (!selectedPrize && attempts < 10);
                    
                    // Fallback to common if we couldn't find a good rare
                    if (!selectedPrize) {
                        selectedPrize = prizes[0]; // Moondust
                    }
                    
                    currentWinner.rarityData = selectedPrize;
                    currentWinner.rarity = selectedPrize.name;
                }
                // Store it for consistency
                this.predeterminedWinners[wheelIndex] = currentWinner;
            }
        }
        
        if (!currentWinner) {
            console.error('No winner found for wheel', wheelIndex);
            return;
        }
        
        // Helper function to get a cat that's different from the previous one
        const getRandomCatNotMatching = (previousCat, forceRare = false, forceCommon = false) => {
            let attempts = 0;
            let cat;
            
            // Check if previous cat was rare (anything not Moondust/grey)
            const prevWasRare = previousCat && previousCat.visualRarityData && previousCat.visualRarityData.name !== 'Moondust';
            
            do {
                // Use cats from this specific wheel
                const wheelCats = this.generatedCatsPerWheel[wheelIndex] || [];
                if (wheelCats.length === 0) {
                    // No cats generated yet, return a placeholder
                    return {
                        index: Math.floor(Math.random() * 24),
                        sprite: null,
                        rarity: 'Moondust',
                        rarityData: prizes[0],
                        visualRarity: 'Moondust',
                        visualRarityData: prizes[0]
                    };
                }
                cat = wheelCats[Math.floor(Math.random() * wheelCats.length)];
                
                // Make sure cat exists and has required properties
                if (!cat) {
                    cat = {
                        index: Math.floor(Math.random() * 24),
                        sprite: null,
                        rarity: 'Moondust',
                        rarityData: prizes[0]
                    };
                }
                
                // If previous was rare, force this one to be common
                if (prevWasRare || forceCommon) {
                    cat = { ...cat, visualRarity: 'Moondust', visualRarityData: prizes[0] };
                }
                // If we want rare and previous wasn't rare, add rare visual
                else if (forceRare && Math.random() < 0.25 && attempts < 10 && !prevWasRare) {
                    const rareOptions = prizes.filter(p => p.name !== 'Moondust');
                    const rareRarity = rareOptions[Math.floor(Math.random() * rareOptions.length)];
                    cat = { ...cat, visualRarity: rareRarity.name, visualRarityData: rareRarity };
                }
                // Default to common
                else {
                    cat = { ...cat, visualRarity: 'Moondust', visualRarityData: prizes[0] };
                }
                
                attempts++;
            } while (previousCat && cat.index === previousCat.index && attempts < 20);
            
            return cat;
        };
        
        // Build track FIVE times to ensure we never hit the end
        for (let repeat = 0; repeat < 5; repeat++) {
            let previousCat = null;
            let itemIndex = 0;
            
            // Add exactly ITEMS_BEFORE_WINNER items before winner
            for (let i = 0; i < ITEMS_BEFORE_WINNER; i++) {
                const cat = getRandomCatNotMatching(previousCat, true);
                const item = this.createSpinnerItem(cat, itemIndex + (repeat * (ITEMS_BEFORE_WINNER + 1 + ITEMS_AFTER_WINNER)));
                gameTrack.appendChild(item);
                previousCat = cat;
                itemIndex++;
            }
            
            // Add the winner at exactly position ITEMS_BEFORE_WINNER (60)
            const winnerItem = this.createSpinnerItem(currentWinner, itemIndex + (repeat * (ITEMS_BEFORE_WINNER + 1 + ITEMS_AFTER_WINNER)), true);
            gameTrack.appendChild(winnerItem);
            previousCat = currentWinner;
            itemIndex++;
            
            // Add items after winner
            for (let i = 0; i < ITEMS_AFTER_WINNER; i++) {
                const cat = getRandomCatNotMatching(previousCat, true);
                const item = this.createSpinnerItem(cat, itemIndex + (repeat * (ITEMS_BEFORE_WINNER + 1 + ITEMS_AFTER_WINNER)));
                gameTrack.appendChild(item);
                previousCat = cat;
                itemIndex++;
            }
        }
    }
    
    // Create a spinner item
    createSpinnerItem(cat, index, isWinner = false) {
        // Handle undefined cat
        if (!cat) {
            console.error('Undefined cat passed to createSpinnerItem');
            cat = {
                index: index,
                sprite: null,
                rarity: 'Moondust',
                rarityData: prizes[0],
                visualRarity: 'Moondust',
                visualRarityData: prizes[0]
            };
        }
        
        const item = document.createElement('div');
        
        // Assign visual rarity
        let visualRarity, visualRarityData;
        
        if (isWinner) {
            // Winner shows actual rarity
            visualRarity = cat.rarity;
            visualRarityData = cat.rarityData;
        } else if (cat.visualRarity && cat.visualRarityData) {
            // Use pre-assigned visual rarity from buildFixedSpinnerTrack
            visualRarity = cat.visualRarity;
            visualRarityData = cat.visualRarityData;
        } else {
            // Default to common rarity
            visualRarity = 'Moondust';
            visualRarityData = prizes[0];
        }
        
        item.className = `cat-item ${visualRarityData.cssClass}`;
        item.dataset.index = index;
        item.dataset.isWinner = isWinner;
        
        const spriteWrapper = document.createElement('div');
        spriteWrapper.className = 'cat-sprite-wrapper';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'cat-sprite';
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        // Only draw if cat has a canvas
        if (cat.canvas) {
            ctx.drawImage(cat.canvas, 0, 0, 120, 120);
        } else {
            // Draw placeholder
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, 120, 120);
            ctx.fillStyle = '#666';
            ctx.font = '20px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 60, 60);
        }
        
        spriteWrapper.appendChild(canvas);
        item.appendChild(spriteWrapper);
        
        return item;
    }
    
    // Start the spin process
    async startSpinProcess() {
        if (this.isSpinning || !this.generatedCatsPerWheel[0] || this.generatedCatsPerWheel[0].length < 24) return;
        
        this.isSpinning = true;
        this.spinButton.disabled = true;
        this.spinResults = [];
        
        const spinCount = this.wheelCount;
        
        this.resultsContainer.style.display = 'none';
        
        // Prepare spinner with winners
        this.prepareSpinner();
        
        // Speed up all idle tracks
        this.idleTracks.forEach(track => track.classList.add('speeding-up'));
        
        // Start all tracks spinning at the same time
        const trackTransitions = this.idleTracks.map((idleTrack, index) => {
            const gameTrack = this.gameTracks[index];
            
            // Get current position of idle track to match it
            const idleTransform = window.getComputedStyle(idleTrack).transform;
            let currentX = 0;
            if (idleTransform !== 'none') {
                const matrix = new DOMMatrix(idleTransform);
                currentX = matrix.m41;
            }
            
            // Set game track to same position and start spinning
            gameTrack.style.transition = 'none';
            gameTrack.style.transform = `translateX(${currentX}px)`;
            
            // Force reflow
            void gameTrack.offsetHeight;
            
            // Apply moderate spin for 2 seconds before crossfade (half speed)
            const fastSpinDistance = -170 * 30; // Spin through ~30 items at moderate speed
            gameTrack.style.transition = 'transform 2s linear';
            gameTrack.style.transform = `translateX(${currentX + fastSpinDistance}px)`;
            
            return { idleTrack, gameTrack };
        });
        
        // After 1.5s, start crossfade for all tracks
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        trackTransitions.forEach(({ idleTrack, gameTrack }) => {
            idleTrack.style.opacity = '0';
            gameTrack.style.opacity = '1';
        });
        
        // Wait for remaining spin and crossfade
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Perform all spins simultaneously
        await this.performAllSpins();
        
        // Show results
        this.showResults();
        
        this.isSpinning = false;
        this.spinButton.disabled = false;
    }
    
    // Perform all spins simultaneously
    performAllSpins() {
        return new Promise((resolve) => {
            // Clear any old results before starting new spins
            this.spinResults = [];
            
            const spinPromises = [];
            
            // Spin all tracks at the same time
            for (let wheelIndex = 0; wheelIndex < this.wheelCount; wheelIndex++) {
                const gameTrack = this.gameTracks[wheelIndex];
                const winner = this.predeterminedWinners[wheelIndex];
                
                if (!gameTrack || !winner) {
                    console.warn(`Skipping wheel ${wheelIndex}: gameTrack=${!!gameTrack}, winner=${!!winner}, wheelCount=${this.wheelCount}, predeterminedWinners.length=${this.predeterminedWinners.length}`);
                    continue;
                }
                
                // Calculate position to land at winner in the middle repetition
                const itemWidth = 170;  // 160px width + 10px total margin
                const trackPadding = 600; // CSS padding on the track
                
                // Get actual viewport width
                const viewport = this.spinnerViewports[wheelIndex];
                const viewportWidth = viewport ? viewport.offsetWidth : 1200;
                const viewportCenter = viewportWidth / 2;
                
                const totalItemsPerRepeat = ITEMS_BEFORE_WINNER + 1 + ITEMS_AFTER_WINNER;
                // In the 3rd repetition (index 2), the winner is at position ITEMS_BEFORE_WINNER (60)
                const middleRepetitionStart = totalItemsPerRepeat * 2;
                // The actual winner needs +1 offset
                const winnerIndexInTrack = middleRepetitionStart + ITEMS_BEFORE_WINNER + 1;
                
                // Calculate position to center the winner item exactly
                // We need to account for the track padding
                const winnerPixelPosition = winnerIndexInTrack * itemWidth + trackPadding;
                const targetPosition = -(winnerPixelPosition - viewportCenter - itemWidth / 2);
                
                // Apply deceleration to this track - very slow exponential deceleration
                // Using a custom cubic-bezier that slows down dramatically at the end
                gameTrack.style.transition = 'transform 13s cubic-bezier(0.25, 0.46, 0.05, 0.94)';
                gameTrack.style.transform = `translateX(${targetPosition}px)`;
                
                // Store result
                this.spinResults.push(winner);
                
                // Trigger confetti for rare wins
                if (winner.rarityData.chance < 1) {
                    setTimeout(() => this.triggerConfetti(), 13000);
                }
            }
            
            // Wait for all spins to complete
            setTimeout(() => {
                resolve();
            }, 13500); // 13.5s for all spins to complete
        });
    }
    
    // Show results
    showResults() {
        console.log(`Showing results for ${this.spinResults.length} spins (wheelCount=${this.wheelCount})`);
        
        // Clear any existing navigation first
        const existingNav = this.resultsContainer.querySelector('.result-navigation');
        if (existingNav) {
            existingNav.remove();
        }
        
        // Clear the results grid
        this.resultsGrid.innerHTML = '';
        
        // Reset current index
        this.currentWheelIndex = 0;
        
        // If multiple wheels, add navigation
        if (this.spinResults.length > 1) {  // Use actual results count, not wheelCount
            this.addResultNavigation();
        }
        
        // Show only the current wheel's result
        this.showResultAtIndex(0);
    }
    
    // Add navigation controls for results
    addResultNavigation() {
        // Remove any existing navigation first
        const existingNav = this.resultsContainer.querySelector('.result-navigation');
        if (existingNav) {
            existingNav.remove();
        }
        
        // Create navigation container
        const navContainer = document.createElement('div');
        navContainer.className = 'result-navigation';
        navContainer.innerHTML = `
            <button class="nav-button nav-prev" onclick="window.currentSpinner.navigateResult(-1)" disabled>←</button>
            <span class="nav-indicator">Wheel <span id="current-wheel">1</span> of ${this.spinResults.length}</span>
            <button class="nav-button nav-next" onclick="window.currentSpinner.navigateResult(1)" ${this.spinResults.length <= 1 ? 'disabled' : ''}>→</button>
        `;
        
        // Insert before results grid
        this.resultsContainer.insertBefore(navContainer, this.resultsGrid);
    }
    
    // Navigate between results
    navigateResult(direction) {
        const newIndex = this.currentWheelIndex + direction;
        if (newIndex >= 0 && newIndex < this.spinResults.length) {  // Use actual results length
            this.currentWheelIndex = newIndex;
            this.showResultAtIndex(newIndex);
            
            // Update navigation indicator
            const indicator = document.getElementById('current-wheel');
            if (indicator) {
                indicator.textContent = newIndex + 1;
            }
            
            // Update button states - be specific to results container
            const prevBtn = this.resultsContainer.querySelector('.nav-prev');
            const nextBtn = this.resultsContainer.querySelector('.nav-next');
            if (prevBtn) prevBtn.disabled = newIndex === 0;
            if (nextBtn) nextBtn.disabled = newIndex === this.spinResults.length - 1;
            
            // Also update the all cats display
            this.updateAllCatsDisplay();
        }
    }
    
    // Show result at specific index
    showResultAtIndex(index) {
        this.resultsGrid.innerHTML = '';
        this.currentWheelIndex = index;
        
        const result = this.spinResults[index];
        if (!result) return;
        
        // Original showResults code for single result:
        {
            const resultItem = document.createElement('div');
            resultItem.className = `result-item ${result.rarityData.cssClass}`;
            
            // Left side - Cat sprite
            const leftSide = document.createElement('div');
            leftSide.className = 'result-left-side';
            
            const spriteWrapper = document.createElement('div');
            spriteWrapper.className = 'result-cat-sprite-wrapper';
            
            const canvas = document.createElement('canvas');
            canvas.className = 'result-cat-sprite';
            // Make canvas square and as large as possible
            const size = Math.min(400, window.innerWidth * 0.3);
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, size, size);
            
            // Add copy image button
            const copyImageBtn = document.createElement('button');
            copyImageBtn.className = 'sprite-copy-button';
            copyImageBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
            `;
            copyImageBtn.title = 'Copy image to clipboard';
            copyImageBtn.onclick = async () => {
                try {
                    canvas.toBlob(async (blob) => {
                        const item = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([item]);
                        copyImageBtn.innerHTML = '✓';
                        setTimeout(() => {
                            copyImageBtn.innerHTML = `
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                </svg>
                            `;
                        }, 2000);
                    });
                } catch (err) {
                    console.error('Failed to copy image:', err);
                }
            };
            
            spriteWrapper.appendChild(canvas);
            spriteWrapper.appendChild(copyImageBtn);
            leftSide.appendChild(spriteWrapper);
            
            // Right side - Cat attributes
            const rightSide = document.createElement('div');
            rightSide.className = 'result-right-side';
            
            // Rarity header
            const rarityHeader = document.createElement('div');
            rarityHeader.className = 'result-rarity-header';
            rarityHeader.innerHTML = `
                <h3 style="color: ${result.rarityData.color}; margin: 0; font-size: 1.5em;">${result.rarity}</h3>
                ${result.wasCheated ? '<div style="color: #f97316; font-size: 0.9em; margin-top: 5px;">🔧 Debug Mode Used</div>' : ''}
            `;
            
            // Attributes list
            const attributesList = document.createElement('div');
            attributesList.className = 'result-attributes';
            
            // Format attributes nicely
            const attributes = [
                { label: 'Sprite', value: result.spriteNumber || 'None' },
                { label: 'Pelt', value: result.peltName || 'None' },
                { label: 'Colour', value: result.colour || 'None' },
                { label: 'Tortie?', value: result.isTortie ? 'Yes' : 'No' },
                { label: 'Tortie Mask', value: result.isTortie && result.tortieMask ? result.tortieMask : 'None' },
                { label: 'Tortie Pattern', value: result.isTortie && result.tortiePattern ? result.tortiePattern : 'None' },
                { label: 'Tortie Colour', value: result.isTortie && result.tortieColour ? result.tortieColour : 'None' },
                { label: 'Tint', value: result.tint && result.tint !== 'none' ? result.tint : 'None' },
                { label: 'Eye Colour', value: result.eyeColour || 'None' },
                { label: 'Eye Colour 2', value: result.eyeColour2 || 'None' },
                { label: 'Skin', value: result.skinColour || 'None' },
                { label: 'White Patches', value: result.whitePatches || 'None' },
                { label: 'Points', value: result.points || 'None' },
                { label: 'White Patches Tint', value: result.whitePatchesTint && result.whitePatchesTint !== 'none' ? result.whitePatchesTint : 'None' },
                { label: 'Vitiligo', value: result.vitiligo || 'None' },
                { label: 'Accessory', value: result.accessory || 'None' },
                { label: 'Scar', value: result.scar || 'None' },
                { label: 'Lineart', value: 'Default' }, // This seems to always be default in the tool
                { label: 'Shading', value: result.shading ? 'Yes' : 'No' },
                { label: 'Reverse', value: result.reverse ? 'Yes' : 'No' }
            ];
            
            attributes.forEach(attr => {
                const attrItem = document.createElement('div');
                attrItem.className = 'attribute-item';
                attrItem.innerHTML = `<span class="attr-label">${attr.label}:</span> <span class="attr-value">${attr.value}</span>`;
                attributesList.appendChild(attrItem);
            });
            
            // Buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'result-buttons';
            
            const viewButton = document.createElement('a');
            viewButton.href = result.url;
            viewButton.target = '_blank';
            viewButton.className = 'result-view-button';
            viewButton.innerHTML = '<span>View in Cat Maker →</span>';
            
            const copyButton = document.createElement('button');
            copyButton.className = 'result-copy-button';
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
            `;
            copyButton.onclick = () => {
                navigator.clipboard.writeText(result.url);
                copyButton.innerHTML = '✓ Copied!';
                setTimeout(() => {
                    copyButton.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                    `;
                }, 2000);
            };
            
            buttonsContainer.appendChild(viewButton);
            buttonsContainer.appendChild(copyButton);
            
            rightSide.appendChild(rarityHeader);
            rightSide.appendChild(attributesList);
            rightSide.appendChild(buttonsContainer);
            
            resultItem.appendChild(leftSide);
            resultItem.appendChild(rightSide);
            
                this.resultsGrid.appendChild(resultItem);
        }
        
        this.resultsContainer.style.display = 'block';
        
        // Change spin button to "SPIN AGAIN"
        this.spinButton.textContent = 'SPIN AGAIN';
        this.spinButton.setAttribute('data-spin-again', 'true');
    }
    
    // Show cat details in modal
    showCatDetails(cat) {
        const modalHTML = document.createElement('div');
        modalHTML.innerHTML = `
            <h2>Cat Details</h2>
            <div class="${cat.rarityData ? cat.rarityData.cssClass : ''}" style="padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <div class="modal-cat-sprite-wrapper" style="width: 150px; height: 150px; margin: 0 auto; overflow: hidden; border-radius: 10px;">
                    <canvas id="modalCanvas" width="150" height="150" style="width: 100%; height: 100%; image-rendering: pixelated;"></canvas>
                </div>
            </div>
            ${cat.rarityData ? `
                <p style="color: ${cat.rarityData.color}; font-size: 1.2em; margin-bottom: 10px;">
                    <strong>${cat.rarity}</strong>
                </p>
                <p style="color: #888; margin-bottom: 20px;">
                    Chance: ${cat.rarityData.chance}%
                </p>
            ` : ''}
            <a href="${cat.url}" target="_blank" class="view-cat-button" style="display: inline-block; text-decoration: none;">
                View Full Cat in Cat Maker →
            </a>
        `;
        
        this.modalContent.innerHTML = '';
        this.modalContent.appendChild(modalHTML);
        
        // Draw cat on modal canvas
        const modalCanvas = document.getElementById('modalCanvas');
        const ctx = modalCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cat.canvas, 0, 0, 150, 150);
        
        this.modal.style.display = 'flex';
    }
    
    hideModal() {
        this.modal.style.display = 'none';
    }

    setupLegacyModal() {
        if (this.legacyDismiss) {
            this.legacyDismiss.addEventListener('click', () => this.hideLegacyModal());
        }
        if (this.legacyModal) {
            this.legacyModal.addEventListener('click', (event) => {
                if (event.target === this.legacyModal) {
                    this.hideLegacyModal();
                }
            });
        }
        this.handleLegacyEscape = (event) => {
            if (event.key === 'Escape' && this.isLegacyModalOpen()) {
                event.preventDefault();
                event.stopPropagation();
                this.hideLegacyModal();
            }
        };
        document.addEventListener('keydown', this.handleLegacyEscape, true);
        window.__legacySpinnerHideModal = () => this.hideLegacyModal();
        window.__legacySpinnerModalOpen = () => this.isLegacyModalOpen();
    }

    showLegacyModal() {
        if (!this.legacyModal) return;
        this.legacyModal.hidden = false;
        this.legacyModal.setAttribute('aria-hidden', 'false');
        this.legacyModalOpen = true;
        this.legacyDismiss?.focus?.();
    }

    hideLegacyModal() {
        if (!this.legacyModal) return;
        if (this.legacyModal.hidden) return;
        this.legacyModal.hidden = true;
        this.legacyModal.setAttribute('aria-hidden', 'true');
        this.legacyModalOpen = false;
    }

    isLegacyModalOpen() {
        return Boolean(this.legacyModal && !this.legacyModal.hidden && this.legacyModalOpen);
    }
    
    resetSpinner() {
        // Reset without reloading
        this.isSpinning = false;
        this.spinButton.disabled = false;
        this.spinResults = [];
        
        // Hide results
        this.resultsContainer.style.display = 'none';
        
        // Reset all tracks
        this.idleTracks.forEach((idleTrack, index) => {
            const gameTrack = this.gameTracks[index];
            if (idleTrack) {
                idleTrack.style.opacity = '1';
                idleTrack.classList.remove('speeding-up');
            }
            if (gameTrack) {
                gameTrack.style.opacity = '0';
                gameTrack.style.transform = 'translateX(0)';
            }
        });
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    async regenerateAndSpin() {
        // Prevent multiple regenerations
        if (this.isRegenerating) return;
        this.isRegenerating = true;
        
        // Disable button and show loading state
        this.spinButton.disabled = true;
        this.spinButton.textContent = 'REGENERATING CATS...';
        
        // Reset everything
        this.isSpinning = false;
        this.spinResults = [];
        this.generatedCatsPerWheel = [];
        this.loadedCats = 0;
        this.currentWheelIndex = 0;
        
        // Hide results and clear navigation
        this.resultsContainer.style.display = 'none';
        const navContainer = this.resultsContainer.querySelector('.result-navigation');
        if (navContainer) {
            navContainer.remove();
        }
        
        // Clear all cats navigation
        const allCatsNav = this.allCatsContainer.querySelector('.all-cats-navigation');
        if (allCatsNav) {
            allCatsNav.remove();
        }
        
        // Reset all tracks
        this.idleTracks.forEach((idleTrack, index) => {
            const gameTrack = this.gameTracks[index];
            if (idleTrack) {
                idleTrack.style.opacity = '1';
                idleTrack.classList.remove('speeding-up');
            }
            if (gameTrack) {
                gameTrack.style.opacity = '0';
                gameTrack.style.transform = 'translateX(0)';
            }
        });
        
        // Reset button state
        this.spinButton.removeAttribute('data-spin-again');
        
        // Show loading indicators and regenerate cats
        this.showCatSlotsWithLoading();
        
        // Wait for cats to be generated (showCatSlotsWithLoading calls generateCatsParallel)
        // Poll until all cats are loaded
        while (this.loadedCats < 24 * this.wheelCount) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Wait a bit after all cats are loaded
        this.spinButton.textContent = 'PREPARING TO SPIN...';
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reset button to normal state
        this.spinButton.textContent = 'SPIN';
        this.spinButton.disabled = false;
        
        // Automatically start the spin
        this.startSpinProcess();
        
        // Clear regenerating flag
        this.isRegenerating = false;
    }
    
    triggerConfetti() {
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        const confettiCount = 100;
        
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'fixed';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.top = '-10px';
            confetti.style.opacity = Math.random();
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            confetti.style.transition = `all ${2 + Math.random() * 2}s ease-out`;
            confetti.style.pointerEvents = 'none';
            confetti.style.zIndex = '9999';
            
            document.body.appendChild(confetti);
            
            setTimeout(() => {
                confetti.style.top = '100%';
                confetti.style.transform = `rotate(${Math.random() * 720}deg)`;
                confetti.style.opacity = '0';
            }, 10);
            
            setTimeout(() => {
                confetti.remove();
            }, 4000);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new CSGOSpinnerV3();
    });
} else {
    new CSGOSpinnerV3();
}

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (typeof window.__legacySpinnerModalOpen === 'function' && window.__legacySpinnerModalOpen()) {
            if (typeof window.__legacySpinnerHideModal === 'function') {
                window.__legacySpinnerHideModal();
            }
            e.preventDefault();
            return;
        }
    }

    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                     document.activeElement.isContentEditable;
    if (!isTyping && e.key === 'Escape') {
        window.location.href = '../index.html';
    }
});
