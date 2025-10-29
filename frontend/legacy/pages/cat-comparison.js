/**
 * Perfect Cat Finder - Find your ideal cat through comparisons
 * Uses Bradley-Terry model with per-parameter preference tracking
 */

import catGenerator from '../core/catGeneratorV2.js';

class CatComparison {
    constructor() {
        this.generator = null; // Will be initialized asynchronously
        this.comparisonCount = 0;
        this.temperature = 0.8;
        this.epsilon = 0.1;
        this.learningRate = 0.3;
        
        // Initialize utilities for all parameters
        this.initializeUtilities();
        
        // Current cats being compared
        this.catAParams = null;
        this.catBParams = null;
        this.perfectParams = null;
        
        // UI elements
        this.initializeElements();
        
        // Load state from URL if present
        this.loadStateFromURL();
        
        // Initialize asynchronously
        this.initialize();
    }
    
    async initialize() {
        // Use the cat generator singleton directly
        this.generator = catGenerator;
        
        // Generate initial cats
        await this.generateNewComparison();
        
        // Attach event listeners
        this.attachEventListeners();
    }
    
    initializeUtilities() {
        // Parameter value counts for initialization
        const paramCounts = {
            spriteNumber: 15,     // Allowed sprites
            peltName: 14,         // Pelt patterns
            colour: 19,           // Colors
            tint: 15,             // Tints including dilutes
            skinColour: 18,       // Skin colors
            eyeColour: 21,        // Eye colors
            eyeColour2: 22,       // Eye colors + empty
            isTortie: 2,          // Boolean
            tortieMask: 44,       // Tortie masks
            tortieColour: 19,     // Colors for tortie
            tortiePattern: 14,    // Patterns for tortie
            shading: 2,           // Boolean
            reverse: 2            // Boolean
        };
        
        // Initialize all utilities to 0 (uniform distribution)
        this.utilities = {};
        for (const [param, count] of Object.entries(paramCounts)) {
            this.utilities[param] = new Float32Array(count);
        }
    }
    
    initializeElements() {
        // Canvases
        this.canvasA = document.getElementById('catA');
        this.canvasB = document.getElementById('catB');
        this.canvasPerfect = document.getElementById('perfectCat');
        
        // Loading indicators
        this.loadingA = document.getElementById('loadingA');
        this.loadingB = document.getElementById('loadingB');
        this.loadingPerfect = document.getElementById('loadingPerfect');
        
        // Buttons
        this.chooseA = document.getElementById('chooseA');
        this.chooseB = document.getElementById('chooseB');
        this.shareButton = document.getElementById('shareButton');
        this.resetButton = document.getElementById('resetButton');
        this.skipButton = document.getElementById('skipButton');
        
        // Stats
        this.comparisonCountEl = document.getElementById('comparisonCount');
        this.confidenceEl = document.getElementById('confidence');
        
        // Sections
        this.differencesGrid = document.getElementById('differencesGrid');
        this.progressGrid = document.getElementById('progressGrid');
        
        // Toast
        this.toast = document.getElementById('toast');
    }
    
    attachEventListeners() {
        this.chooseA.addEventListener('click', () => this.handleChoice('A'));
        this.chooseB.addEventListener('click', () => this.handleChoice('B'));
        this.shareButton.addEventListener('click', () => this.shareURL());
        this.resetButton.addEventListener('click', () => this.reset());
        this.skipButton.addEventListener('click', () => this.generateNewComparison());
        
        // Update URL on state change
        window.addEventListener('hashchange', () => this.loadStateFromURL());
    }
    
    async generateNewComparison() {
        try {
            // Show loading
            this.showLoading(true);
            
            // Generate two different cats using random params for now
            // TODO: Implement weighted parameter generation based on utilities
            this.catAParams = await this.generator.generateRandomParams();
            
            // Generate B ensuring it's different from A in key parameters
            let attempts = 0;
            do {
                this.catBParams = await this.generator.generateRandomParams();
                attempts++;
            } while (attempts < 10 && this.areTooSimilar(this.catAParams, this.catBParams));
            
            // Generate a "perfect" cat using random params for now
            // TODO: Implement perfect parameter generation based on utilities
            this.perfectParams = await this.generator.generateRandomParams();
            
            // Render all three cats
            await Promise.all([
                this.renderCat(this.canvasA, this.catAParams),
                this.renderCat(this.canvasB, this.catBParams),
                this.renderCat(this.canvasPerfect, this.perfectParams)
            ]);
            
            // Update differences display
            this.updateDifferences();
            
            // Update progress display
            this.updateProgress();
            
            // Hide loading
            this.showLoading(false);
        } catch (error) {
            console.error('Error generating comparison:', error);
            this.showLoading(false);
            alert('Error generating cats. Check console for details.');
        }
    }
    
    areTooSimilar(paramsA, paramsB) {
        // Check if cats are too similar (fewer than 3 differences in major params)
        let differences = 0;
        const majorParams = ['peltName', 'colour', 'eyeColour', 'isTortie'];
        
        for (const param of majorParams) {
            if (paramsA[param] !== paramsB[param]) {
                differences++;
            }
        }
        
        return differences < 2;
    }
    
    async renderCat(canvas, params) {
        try {
            const result = await this.generator.generateCat(params);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false; // Keep pixelated look
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Scale up the tiny pixel art to fill the canvas
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Error rendering cat:', error, params);
            throw error;
        }
    }
    
    handleChoice(choice) {
        const winnerParams = choice === 'A' ? this.catAParams : this.catBParams;
        const loserParams = choice === 'A' ? this.catBParams : this.catAParams;
        
        // Update utilities based on choice
        this.updateUtilities(winnerParams, loserParams);
        
        // Increment comparison count
        this.comparisonCount++;
        this.comparisonCountEl.textContent = this.comparisonCount;
        
        // Update confidence
        this.updateConfidence();
        
        // Save state to URL
        this.saveStateToURL();
        
        // Generate new comparison
        this.generateNewComparison();
    }
    
    updateUtilities(winnerParams, loserParams) {
        // Update utility scores for parameters that differ
        for (const param in winnerParams) {
            if (winnerParams[param] !== loserParams[param]) {
                const winIdx = this.getValueIndex(param, winnerParams[param]);
                const loseIdx = this.getValueIndex(param, loserParams[param]);
                
                if (winIdx !== -1 && loseIdx !== -1) {
                    // Update with learning rate and clamp to [-4, 4]
                    this.utilities[param][winIdx] = Math.min(4, 
                        this.utilities[param][winIdx] + this.learningRate);
                    this.utilities[param][loseIdx] = Math.max(-4, 
                        this.utilities[param][loseIdx] - this.learningRate);
                }
            }
        }
    }
    
    getValueIndex(param, value) {
        // Map parameter values to indices
        const mappings = {
            spriteNumber: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18],
            peltName: ["SingleColour", "TwoColour", "Tabby", "Marbled", "Rosette", "Smoke", 
                      "Ticked", "Speckled", "Bengal", "Mackerel", "Classic", "Sokoke", 
                      "Agouti", "Singlestripe"],
            colour: ["CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", 
                    "GREY", "DARKGREY", "GHOST", "BLACK", "WHITE", "PALEGREY", "SILVER", 
                    "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"],
            tint: ["none", "pink", "gray", "red", "black", "orange", "yellow", "purple", 
                  "blue", "dilute", "warmdilute", "cooldilute"],
            skinColour: ["BLACK", "PINK", "DARKBROWN", "BROWN", "LIGHTBROWN", "DARK", 
                        "DARKGREY", "GREY", "DARKSALMON", "SALMON", "PEACH", "DARKMARBLED", 
                        "MARBLED", "LIGHTMARBLED", "DARKBLUE", "BLUE", "LIGHTBLUE", "RED"],
            eyeColour: ["YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", "DARKBLUE", 
                       "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", "COPPER", 
                       "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", "GREENYELLOW", 
                       "BRONZE", "SILVER"],
            eyeColour2: ["", "YELLOW", "AMBER", "HAZEL", "PALEGREEN", "GREEN", "BLUE", 
                        "DARKBLUE", "GREY", "CYAN", "EMERALD", "HEATHERBLUE", "SUNLITICE", 
                        "COPPER", "SAGE", "COBALT", "PALEBLUE", "PALEYELLOW", "GOLD", 
                        "GREENYELLOW", "BRONZE", "SILVER"],
            isTortie: [false, true],
            shading: [false, true],
            reverse: [false, true],
            tortieMask: ["ONE", "TWO", "THREE", "FOUR", "REDTAIL", "DELILAH", "MINIMALONE", 
                        "MINIMALTWO", "MINIMALTHREE", "MINIMALFOUR", "HALF", "OREO", "SWOOP", 
                        "MOTTLED", "SIDEMASK", "EYEDOT", "BANDANA", "PACMAN", "STREAMSTRIKE", 
                        "ORIOLE", "CHIMERA", "DAUB", "EMBER", "BLANKET", "ROBIN", "BRINDLE", 
                        "PAIGE", "ROSETAIL", "SAFI", "SMUDGED", "DAPPLENIGHT", "STREAK", 
                        "MASK", "CHEST", "ARMTAIL", "SMOKE", "GRUMPYFACE", "BRIE", "BELOVED", 
                        "BODY", "SHILOH", "FRECKLED", "HEARTBEAT"],
            tortieColour: ["CREAM", "PALEGINGER", "GOLDEN", "GINGER", "DARKGINGER", "SIENNA", 
                          "GREY", "DARKGREY", "GHOST", "BLACK", "WHITE", "PALEGREY", "SILVER", 
                          "LIGHTBROWN", "LILAC", "BROWN", "GOLDEN-BROWN", "DARKBROWN", "CHOCOLATE"],
            tortiePattern: ["SingleColour", "TwoColour", "Tabby", "Marbled", "Rosette", "Smoke", 
                           "Ticked", "Speckled", "Bengal", "Mackerel", "Classic", "Sokoke", 
                           "Agouti", "Singlestripe"]
        };
        
        const values = mappings[param];
        if (!values) return -1;
        
        // Handle undefined values for optional params
        if (value === undefined) {
            if (param === 'eyeColour2') return 0; // Empty option
            return -1;
        }
        
        return values.indexOf(value);
    }
    
    updateDifferences() {
        // Show key differences between cats A and B
        const differences = [];
        const importantParams = ['spriteNumber', 'peltName', 'colour', 'eyeColour', 'isTortie', 'tint', 'skinColour'];
        
        for (const param of importantParams) {
            if (this.catAParams[param] !== this.catBParams[param]) {
                const label = this.getParamLabel(param);
                const valueA = this.getParamDisplayValue(param, this.catAParams[param]);
                const valueB = this.getParamDisplayValue(param, this.catBParams[param]);
                differences.push({ label, valueA, valueB });
            }
        }
        
        // Update UI
        this.differencesGrid.innerHTML = differences.map(diff => `
            <div class="difference-item">
                <div class="diff-label">${diff.label}</div>
                <div class="diff-values">
                    <span class="value-a">${diff.valueA}</span>
                    <span class="vs">vs</span>
                    <span class="value-b">${diff.valueB}</span>
                </div>
            </div>
        `).join('');
    }
    
    getParamLabel(param) {
        const labels = {
            spriteNumber: 'Pose',
            peltName: 'Pattern',
            colour: 'Color',
            eyeColour: 'Eyes',
            eyeColour2: 'Eye 2',
            isTortie: 'Tortie',
            tint: 'Tint',
            skinColour: 'Skin',
            shading: 'Shading',
            reverse: 'Flipped'
        };
        return labels[param] || param;
    }
    
    getParamDisplayValue(param, value) {
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }
        if (value === undefined || value === '') {
            return 'None';
        }
        if (param === 'spriteNumber') {
            // Show pose number in a friendly way
            return `Pose ${value}`;
        }
        return value.toString().toLowerCase().replace(/-/g, ' ');
    }
    
    updateProgress() {
        // Calculate and display confidence for each parameter
        const progressItems = [];
        const mainParams = ['spriteNumber', 'peltName', 'colour', 'eyeColour', 'isTortie', 'tint', 'skinColour'];
        
        for (const param of mainParams) {
            const entropy = this.calculateEntropy(this.utilities[param]);
            const maxEntropy = Math.log(this.utilities[param].length);
            const confidence = maxEntropy > 0 ? (1 - entropy / maxEntropy) * 100 : 0;
            
            progressItems.push({
                label: this.getParamLabel(param),
                confidence: Math.round(confidence)
            });
        }
        
        // Update UI
        this.progressGrid.innerHTML = progressItems.map(item => `
            <div class="progress-item">
                <div class="progress-label">${item.label}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.confidence}%"></div>
                </div>
                <div class="progress-value">${item.confidence}%</div>
            </div>
        `).join('');
    }
    
    calculateEntropy(utilityArray) {
        // Calculate Shannon entropy of the probability distribution
        const scores = Array.from(utilityArray).map(u => Math.exp(u / this.temperature));
        const sum = scores.reduce((a, b) => a + b, 0);
        if (sum === 0) return 0;
        
        const probs = scores.map(s => s / sum);
        let entropy = 0;
        
        for (const p of probs) {
            if (p > 0) {
                entropy -= p * Math.log(p);
            }
        }
        
        return entropy;
    }
    
    updateConfidence() {
        // Calculate overall confidence
        const mainParams = ['spriteNumber', 'peltName', 'colour', 'eyeColour', 'isTortie'];
        let totalConfidence = 0;
        
        for (const param of mainParams) {
            const entropy = this.calculateEntropy(this.utilities[param]);
            const maxEntropy = Math.log(this.utilities[param].length);
            const confidence = maxEntropy > 0 ? (1 - entropy / maxEntropy) : 0;
            totalConfidence += confidence;
        }
        
        const avgConfidence = Math.round((totalConfidence / mainParams.length) * 100);
        this.confidenceEl.textContent = `${avgConfidence}%`;
    }
    
    saveStateToURL() {
        // Encode utilities to base64 for URL storage
        const encoded = this.encodeUtilities();
        const state = {
            v: 1, // Version
            c: this.comparisonCount,
            u: encoded
        };
        
        window.location.hash = btoa(JSON.stringify(state));
    }
    
    loadStateFromURL() {
        if (!window.location.hash || window.location.hash.length < 2) {
            return;
        }
        
        try {
            const state = JSON.parse(atob(window.location.hash.substring(1)));
            
            if (state.v === 1 && state.u) {
                this.decodeUtilities(state.u);
                this.comparisonCount = state.c || 0;
                this.comparisonCountEl.textContent = this.comparisonCount;
                this.updateConfidence();
                this.generateNewComparison();
            }
        } catch (e) {
            console.error('Failed to load state from URL:', e);
        }
    }
    
    encodeUtilities() {
        // Quantize utilities to 4-bit values and pack
        const bytes = [];
        
        for (const param in this.utilities) {
            const utils = this.utilities[param];
            for (let i = 0; i < utils.length; i += 2) {
                // Pack two 4-bit values into one byte
                const val1 = this.quantize(utils[i]);
                const val2 = i + 1 < utils.length ? this.quantize(utils[i + 1]) : 0;
                bytes.push((val1 << 4) | val2);
            }
        }
        
        // Convert to base64
        const uint8 = new Uint8Array(bytes);
        const binary = String.fromCharCode.apply(null, uint8);
        return btoa(binary);
    }
    
    decodeUtilities(encoded) {
        // Decode from base64 and unpack
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        let byteIdx = 0;
        for (const param in this.utilities) {
            const utils = this.utilities[param];
            for (let i = 0; i < utils.length; i += 2) {
                if (byteIdx < bytes.length) {
                    const byte = bytes[byteIdx++];
                    utils[i] = this.dequantize((byte >> 4) & 0x0F);
                    if (i + 1 < utils.length) {
                        utils[i + 1] = this.dequantize(byte & 0x0F);
                    }
                }
            }
        }
    }
    
    quantize(value) {
        // Map [-4, 4] to [0, 15] (4-bit)
        const clamped = Math.max(-4, Math.min(4, value));
        return Math.round((clamped + 4) * 15 / 8);
    }
    
    dequantize(value) {
        // Map [0, 15] back to [-4, 4]
        return (value * 8 / 15) - 4;
    }
    
    shareURL() {
        // Copy current URL to clipboard
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Link copied! Share it to show your perfect cat preferences.');
        });
    }
    
    reset() {
        if (confirm('Reset all preferences and start over?')) {
            this.initializeUtilities();
            this.comparisonCount = 0;
            this.comparisonCountEl.textContent = '0';
            this.confidenceEl.textContent = '0%';
            window.location.hash = '';
            this.generateNewComparison();
        }
    }
    
    showLoading(show) {
        const display = show ? 'flex' : 'none';
        this.loadingA.style.display = display;
        this.loadingB.style.display = display;
        this.loadingPerfect.style.display = display;
        
        // Disable buttons while loading
        this.chooseA.disabled = show;
        this.chooseB.disabled = show;
        this.skipButton.disabled = show;
    }
    
    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CatComparison();
});

// ESC to go back (unless typing)
document.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || 
                     document.activeElement.isContentEditable;
    if (!isTyping && e.key === 'Escape') {
        window.location.href = '../index.html';
    }
});