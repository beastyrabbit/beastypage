/**
 * ClanGen History Explorer - Main Controller
 * Manages the UI and coordinates between parser, database, and views
 */

import { ClanGenParser } from '../core/clangenParser.js';
import { ClanGenDatabase } from '../core/clangenDatabase.js';
import { CatGenerator } from '../core/catGeneratorV2.js';

class ClanGenHistoryExplorer {
    constructor() {
        this.parser = new ClanGenParser();
        this.database = new ClanGenDatabase();
        this.catGenerator = new CatGenerator();
        
        this.currentClanId = null;
        this.currentView = 'timeline';
        this.isLifeGen = false;
        this.playerCatId = null;
        this.playerCat = null;
        this.viewMode = 'clan'; // 'clan' or 'personal'
        this.filters = {
            search: '',
            // Moon filters removed - events are chronological, not moon-based
            eventTypes: ['birth', 'death', 'ceremony', 'relationship', 'health', 'misc'],
            density: 'all',  // Changed from 'important' to match HTML default
            showDeadCats: false,
            playerEventsOnly: false,
            playerInvolved: false
        };
        
        this.virtualScroller = null;
        this.timelineData = [];
        this.catsData = [];
        this.familyData = null;
        
        // Performance optimization: debounce timers
        this.filterDebounceTimer = null;
        this.searchDebounceTimer = null;
        
        this.init();
    }
    
    checkDeveloperMode() {
        // Check URL parameters for dev mode
        const urlParams = new URLSearchParams(window.location.search);
        const devPath = urlParams.get('dev_path');
        const devClan = urlParams.get('dev_clan');
        
        if (devPath) {
            // Add a small dev indicator
            const devIndicator = document.createElement('div');
            devIndicator.style.cssText = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                background: rgba(255, 0, 0, 0.2);
                color: #ff6b6b;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                z-index: 10000;
                cursor: pointer;
            `;
            devIndicator.textContent = '🔧 DEV MODE';
            devIndicator.title = `Auto-load path: ${devPath}\nClick to load`;
            document.body.appendChild(devIndicator);
            
            // Auto-load functionality - use the same loadFromPath as normal users
            devIndicator.addEventListener('click', async () => {
                try {
                    devIndicator.textContent = '⏳ Loading...';
                    
                    // Simply use the loadFromPath function - exactly like manual path entry
                    // This ensures developer mode behaves 100% like normal upload
                    let pathToLoad = '';
                    
                    if (devPath === 'lifegen') {
                        pathToLoad = '/clangen/lifegen-saves';
                    } else if (devPath === 'clangen') {
                        pathToLoad = '/clangen/clangen-saves';
                    } else {
                        // Allow any custom path
                        pathToLoad = devPath;
                    }
                    
                    // Use the exact same function as manual path loading
                    await this.loadFromPath(pathToLoad);
                    
                    devIndicator.textContent = '✅ Loaded';
                    
                    // If a specific clan was requested, load it
                    if (devClan) {
                        setTimeout(async () => {
                            const clans = await this.database.getClans();
                            const targetClan = clans.find(c => 
                                c.name.toLowerCase() === devClan.toLowerCase() ||
                                c.displayName?.toLowerCase() === devClan.toLowerCase()
                            );
                            if (targetClan) {
                                await this.loadExistingClan(targetClan.id);
                            }
                        }, 500);
                    }
                } catch (error) {
                    console.error('Dev mode load error:', error);
                    devIndicator.textContent = '❌ Error';
                }
            });
            
            // Auto-click if auto=true is set
            if (urlParams.get('auto') === 'true') {
                setTimeout(() => devIndicator.click(), 1000);
            }
        }
        
        // Also expose app globally for testing
        window.app = this;
    }
    
    async loadFromPath(basePath, clearExisting = false) {
        try {
            if (clearExisting) {
                // Clear IndexedDB if requested
                console.log('Clearing old database for fresh load...');
                this.showToast('Clearing old data...');
                indexedDB.deleteDatabase('ClanGenHistory');
                
                // Small delay to ensure database is deleted
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Re-initialize database
                this.database = new ClanGenDatabase();
                await this.database.init();
                console.log('Database re-initialized');
            }
            
            console.log('Loading from path:', basePath);
            
            this.showLoading('Loading files from path...');
            
            const files = [];
            const filesToLoad = [];
            
            // Convert absolute path to relative path for web server
            let relativePath = basePath;
            
            // Convert absolute file system paths to web paths
            if (basePath.startsWith('/home/beasty/projects/spinner-wheel/')) {
                relativePath = basePath.replace('/home/beasty/projects/spinner-wheel/', '/');
            } else if (basePath.startsWith('/mnt/storage/workspace/projects/spinner-wheel/')) {
                relativePath = basePath.replace('/mnt/storage/workspace/projects/spinner-wheel/', '/');
            } else if (basePath.startsWith('/clangen/')) {
                // Already a valid web path
                relativePath = basePath;
            } else if (basePath.startsWith('/')) {
                // Assume it's already a web path
                relativePath = basePath;
            } else {
                // If no leading slash, add one
                relativePath = '/' + basePath;
            }
            
            console.log(`Converting path: ${basePath} -> ${relativePath}`);
            
            // First detect which clans exist by listing directory contents
            const detectedClans = [];
            
            // Fetch directory listing to dynamically find all folders
            try {
                // Try to get directory listing (requires server to support directory indexing)
                const listResp = await fetch(relativePath);
                if (listResp.ok) {
                    const html = await listResp.text();
                    // Parse directory listing HTML to find folders
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const links = doc.querySelectorAll('a');
                    
                    for (const link of links) {
                        const href = link.getAttribute('href');
                        if (href && href.endsWith('/') && !href.startsWith('..')) {
                            // Decode URL-encoded folder names (e.g., "Stone%20-%20Copy" -> "Stone - Copy")
                            const folderName = decodeURIComponent(href.replace(/\/$/, ''));
                            // Check if this folder has clan_cats.json
                            try {
                                const url = `${relativePath}/${encodeURIComponent(folderName)}/clan_cats.json`;
                                console.log(`Checking for clan at: ${url}`);
                                const catsResp = await fetch(url);
                                if (catsResp.ok) {
                                    detectedClans.push(folderName);
                                    console.log(`Found clan folder: ${folderName}`);
                                }
                            } catch (e) {
                                console.log(`${folderName} is not a clan folder`);
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Could not list directory, falling back to known folders');
                // Fallback: try some common names if directory listing fails
                const fallbackNames = ['Stone', 'Dawn', 'Stone - Copy', 'old'];
                for (const clanName of fallbackNames) {
                    try {
                        const url = `${relativePath}/${clanName}/clan_cats.json`;
                        const catsResp = await fetch(url);
                        if (catsResp.ok) {
                            detectedClans.push(clanName);
                            console.log(`Found clan: ${clanName}`);
                        }
                    } catch (e) {
                        // Not found
                    }
                }
            }
            
            if (detectedClans.length === 0) {
                // Try if this is the saves folder directly
                try {
                    const resp = await fetch(`${relativePath}/clan_cats.json`);
                    if (resp.ok) {
                        // It's a single clan folder
                        const pathParts = relativePath.split('/');
                        const clanName = pathParts[pathParts.length - 1];
                        detectedClans.push('');
                        console.log(`Direct clan folder: ${clanName}`);
                    }
                } catch (e) {
                    console.log('No clans found');
                }
            }
            
            // Now load files for detected clans
            for (const clanName of detectedClans) {
                const clanPath = clanName ? `${relativePath}/${clanName}` : relativePath;
                const folderName = clanName || relativePath.split('/').pop();
                
                // Load main files
                const mainFiles = [
                    { path: `${clanPath}/clan_cats.json`, name: `${folderName}/clan_cats.json` },
                    { path: `${clanPath}/events.json`, name: `${folderName}/events.json` },
                    { path: `${relativePath}/${folderName}clan.json`, name: `${folderName}clan.json` },
                    { path: `${relativePath}/Stoneclan.json`, name: 'Stoneclan.json' },
                    { path: `${relativePath}/Dawnclan.json`, name: 'Dawnclan.json' }
                ];
                
                for (const fileInfo of mainFiles) {
                    try {
                        const resp = await fetch(fileInfo.path);
                        if (resp.ok) {
                            filesToLoad.push(fileInfo);
                        }
                    } catch (e) {
                        // File doesn't exist
                    }
                }
                
                // Load cats to get their IDs for relationships and history
                try {
                    const catsResp = await fetch(`${clanPath}/clan_cats.json`);
                    if (catsResp.ok) {
                        const catsData = await catsResp.json();
                        const catIds = catsData.map(cat => String(cat.ID));
                        
                        // Load relationships for known cats only
                        for (const catId of catIds) {
                            try {
                                const relPath = `${clanPath}/relationships/${catId}_relations.json`;
                                const resp = await fetch(relPath);
                                if (resp.ok) {
                                    filesToLoad.push({
                                        path: relPath,
                                        name: `${folderName}/relationships/${catId}_relations.json`
                                    });
                                }
                            } catch (e) {
                                // No relations for this cat
                            }
                        }
                        
                        // Load history for known cats only
                        for (const catId of catIds) {
                            try {
                                const histPath = `${clanPath}/history/${catId}_history.json`;
                                const resp = await fetch(histPath);
                                if (resp.ok) {
                                    filesToLoad.push({
                                        path: histPath,
                                        name: `${folderName}/history/${catId}_history.json`
                                    });
                                }
                            } catch (e) {
                                // No history for this cat
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error loading cat IDs:', e);
                }
            }
            
            // Convert to File objects
            for (const fileInfo of filesToLoad) {
                const response = await fetch(fileInfo.path);
                const blob = await response.blob();
                const file = new File([blob], fileInfo.name, { type: 'application/json' });
                Object.defineProperty(file, 'webkitRelativePath', {
                    value: fileInfo.name,
                    writable: false
                });
                files.push(file);
            }
            
            if (files.length > 0) {
                console.log(`Loaded ${files.length} files from path`);
                await this.handleFileSelect(files);
            } else {
                this.showError('No ClanGen files found at this path');
            }
        } catch (error) {
            console.error('Error loading from path:', error);
            this.showError('Failed to load files from path: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async init() {
        try {
            // Initialize database
            await this.database.init();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Developer mode: Check for auto-load parameter
            this.checkDeveloperMode();
            
            // Check for existing clans
            const existingClans = await this.database.getClans();
            if (existingClans.length > 0) {
                // Show saved clans directly on the upload screen
                const uploadSection = document.getElementById('uploadSection');
                if (uploadSection) {
                    const savedClansDiv = document.createElement('div');
                    savedClansDiv.style.cssText = 'margin-top: 30px; padding: 20px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px;';
                    
                    let clansHTML = '<h3 style="margin-bottom: 15px; color: var(--purple);">Saved Clans</h3>';
                    clansHTML += '<div style="display: flex; flex-direction: column; gap: 10px;">';
                    
                    for (const clan of existingClans) {
                        clansHTML += `
                            <button class="saved-clan-btn" data-clan-id="${clan.id}" style="
                                padding: 12px 20px;
                                background: rgba(255, 255, 255, 0.05);
                                border: 1px solid var(--border);
                                border-radius: 8px;
                                color: var(--text);
                                cursor: pointer;
                                text-align: left;
                                transition: all 0.2s ease;
                            ">
                                <strong>${clan.displayName || clan.name}</strong> - 
                                <span style="color: var(--muted);">Age ${clan.age}, ${clan.totalCats} cats</span>
                            </button>
                        `;
                    }
                    
                    clansHTML += '</div>';
                    savedClansDiv.innerHTML = clansHTML;
                    uploadSection.querySelector('.upload-card').appendChild(savedClansDiv);
                    
                    // Add click handlers for saved clan buttons
                    savedClansDiv.querySelectorAll('.saved-clan-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const clanId = btn.dataset.clanId;
                            console.log('Loading existing clan:', clanId);
                            await this.loadExistingClan(clanId);
                        });
                    });
                    
                    // Add click handlers for saved clan buttons
                    savedClansDiv.querySelectorAll('.saved-clan-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const clanId = parseInt(btn.dataset.clanId);
                            await this.loadExistingClan(clanId);
                        });
                        
                        // Add hover effect
                        btn.addEventListener('mouseenter', () => {
                            btn.style.background = 'rgba(255, 255, 255, 0.1)';
                            btn.style.transform = 'translateY(-2px)';
                        });
                        
                        btn.addEventListener('mouseleave', () => {
                            btn.style.background = 'rgba(255, 255, 255, 0.05)';
                            btn.style.transform = 'translateY(0)';
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showError('Failed to initialize the application');
        }
    }

    setupEventListeners() {
        // File upload
        const folderInput = document.getElementById('folderInput');
        const selectFolderBtn = document.getElementById('selectFolderBtn');
        const dropZone = document.getElementById('dropZone');
        const clearDatabaseBtn = document.getElementById('clearDatabaseBtn');
        const loadPathBtn = document.getElementById('loadPathBtn');
        const directPathInput = document.getElementById('directPathInput');
        
        selectFolderBtn.addEventListener('click', () => folderInput.click());
        folderInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
        
        // Direct path loading
        if (loadPathBtn && directPathInput) {
            // Load last used path from localStorage
            const lastPath = localStorage.getItem('lastClanGenPath');
            if (lastPath) {
                directPathInput.value = lastPath;
            }
            
            loadPathBtn.addEventListener('click', async () => {
                const path = directPathInput.value.trim();
                if (path) {
                    // Save path to localStorage for future use
                    localStorage.setItem('lastClanGenPath', path);
                    // Clear existing data when manually loading
                    await this.loadFromPath(path, true);
                }
            });
            
            // Allow Enter key to trigger load
            directPathInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    loadPathBtn.click();
                }
            });
        }
        
        // Clear database button
        if (clearDatabaseBtn) {
            clearDatabaseBtn.addEventListener('click', async () => {
                if (confirm('This will delete all saved clan data. Are you sure?')) {
                    try {
                        // Clear all clans
                        const clans = await this.database.getClans();
                        for (const clan of clans) {
                            await this.database.clearClan(clan.id);
                        }
                        this.showToast('All saved data cleared');
                        location.reload();
                    } catch (error) {
                        console.error('Error clearing database:', error);
                        this.showError('Failed to clear database');
                    }
                }
            });
        }
        
        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            this.handleFileSelect(files);
        });
        
        // View toggle
        const viewOptions = document.querySelectorAll('.view-option');
        viewOptions.forEach(option => {
            option.addEventListener('click', () => {
                const view = option.dataset.view;
                this.switchView(view);
            });
        });
        
        // Filters
        const searchInput = document.getElementById('searchInput');
        // Moon filters removed - events are chronological
        const densitySelect = document.getElementById('densitySelect');
        const resetFilters = document.getElementById('resetFilters');
        
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            // Debounce search for better performance with longer delay
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.applyFilters();
            }, 500);  // Increased from 300ms to 500ms
        });
        
        // Moon filters removed - events are chronological, not moon-based
        
        densitySelect.addEventListener('change', (e) => {
            this.filters.density = e.target.value;
            this.applyFilters();
        });
        
        // Event type checkboxes
        const eventTypeCheckboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
        eventTypeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.filters.eventTypes = Array.from(eventTypeCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                this.applyFilters();
            });
        });
        
        resetFilters.addEventListener('click', () => {
            this.resetFilters();
        });
        
        // Cat view controls
        const showDeadCats = document.getElementById('showDeadCats');
        const catSort = document.getElementById('catSort');
        
        if (showDeadCats) {
            showDeadCats.addEventListener('change', (e) => {
                this.filters.showDeadCats = e.target.checked;
                this.renderCatsView();
            });
        }
        
        if (catSort) {
            catSort.addEventListener('change', () => {
                this.renderCatsView();
            });
        }
        
        // Export button - commented out as button doesn't exist in HTML
        // const exportButton = document.getElementById('exportButton');
        // if (exportButton) {
        //     exportButton.addEventListener('click', () => this.exportTimeline());
        // }
        
        // Modal close - use event delegation for dynamic elements
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close')) {
                e.stopPropagation();
                this.closeModal();
            }
            // Also close modal when clicking outside
            if (e.target.id === 'catModal') {
                this.closeModal();
            }
        });
    }

    async handleFileSelect(files) {
        try {
            // Show loading
            this.showLoading('Parsing save files...');
            
            // Parse files
            const { clans, fileMap } = await this.parser.parseFiles(files);
            
            if (clans.length === 0) {
                this.hideLoading();
                this.showError('No valid ClanGen saves found');
                return;
            }
            
            // Store fileMap for later use
            this.fileMap = fileMap;
            
            // Auto-save ALL clans to database
            this.updateProgress('Saving all clans to database...', 10);
            const savedClanIds = [];
            
            for (let i = 0; i < clans.length; i++) {
                const clan = clans[i];
                this.updateProgress(`Processing ${clan.name}Clan (${i + 1}/${clans.length})...`, 10 + (80 * i / clans.length));
                
                try {
                    const clanData = await this.parser.parseClan(clan.name, fileMap);
                    // Ensure folder name is preserved as unique identifier
                    clanData.stats.folderName = clan.name;
                    const clanId = await this.database.saveClan(clanData);
                    savedClanIds.push({ id: clanId, name: clan.name, data: clanData });
                } catch (error) {
                    console.error(`Failed to save clan ${clan.name}:`, error);
                }
            }
            
            this.updateProgress('Complete!', 100);
            
            if (savedClanIds.length === 1) {
                // Load single clan directly
                this.currentClanId = savedClanIds[0].id;
                await this.loadTimelineData();
                setTimeout(() => {
                    this.hideLoading();
                    this.showMainApp(savedClanIds[0].data.stats);
                }, 500);
            } else if (savedClanIds.length > 1) {
                // Show clan selector for saved clans
                this.hideLoading();
                const allClans = await this.database.getClans();
                this.showClanSelector(allClans);
            } else {
                this.hideLoading();
                this.showError('Failed to save any clans');
            }
        } catch (error) {
            console.error('Error parsing files:', error);
            this.hideLoading();
            this.showError('Failed to parse save files');
        }
    }

    async loadClan(clanName, fileMap) {
        try {
            this.updateProgress('Processing clan data...', 25);
            
            // Parse clan data
            const clanData = await this.parser.parseClan(clanName, fileMap);
            
            // Add folder name to stats for unique identification
            clanData.stats.folderName = clanName;
            
            this.updateProgress('Saving to database...', 50);
            
            // Save to database
            console.log('Saving clan data to database:', {
                folderName: clanName,
                relationships: clanData.relationships?.length || 0,
                cats: clanData.cats?.length || 0,
                events: clanData.events?.length || 0
            });
            this.currentClanId = await this.database.saveClan(clanData);
            
            this.updateProgress('Building timeline...', 75);
            
            // Load initial data
            await this.loadTimelineData();
            
            this.updateProgress('Complete!', 100);
            
            // Show main app
            setTimeout(() => {
                this.hideLoading();
                this.showMainApp(clanData.stats);
            }, 500);
            
        } catch (error) {
            console.error('Error loading clan:', error);
            this.hideLoading();
            this.showError('Failed to load clan data');
        }
    }

    async loadTimelineData() {
        if (!this.currentClanId) {
            console.error('No clan ID set');
            return;
        }
        
        console.log('Loading timeline for clan', this.currentClanId);
        
        try {
            // First try to get moon-based timeline from database
            const timelineData = await this.database.getTimelineRange(
                this.currentClanId,
                0,
                9999,
                {
                    eventTypes: this.filters.eventTypes && this.filters.eventTypes.length > 0 
                        ? this.filters.eventTypes 
                        : undefined
                }
            );
            
            if (timelineData && timelineData.length > 0) {
                // We have moon-based timeline data
                console.log(`Loaded ${timelineData.length} moon groups from timeline`);
                this.timelineData = timelineData;
            } else {
                // Fallback to chronological events if no timeline data
                console.log('No timeline data, falling back to chronological events');
                const allEvents = await this.database.getEvents(this.currentClanId);
                
                // Filter by event types if needed
                let filteredEvents = allEvents;
                if (this.filters.eventTypes && this.filters.eventTypes.length > 0) {
                    filteredEvents = allEvents.filter(e => 
                        this.filters.eventTypes.includes(e.eventType)
                    );
                }
                
                // Return as a single event stream
                this.timelineData = [{
                    isEventStream: true,
                    events: filteredEvents
                }];
            }
            
            console.log('Timeline data loaded:', this.timelineData.length, 'groups');
            this.renderTimeline();
        } catch (error) {
            console.error('Error loading timeline:', error);
            this.showError('Failed to load timeline');
        }
    }

    renderTimeline() {
        const container = document.getElementById('timelineContainer');
        container.innerHTML = '';
        
        let html = '';
        
        console.log('Rendering timeline with data:', this.timelineData);
        
        // Check if we have any data
        if (!this.timelineData || this.timelineData.length === 0) {
            html = `<div class="timeline-empty">
                <p>No moon-based events found.</p>
                <p class="note">Moon-timestamped events from history files will appear here. Check the Events tab for relationship and interaction events.</p>
            </div>`;
        } else {
            // Moon-based rendering from history files
            let hasEvents = false;
            let totalEventCount = 0;
            
            // Check if we have any non-null moon entries
            const hasMoonData = this.timelineData.some(moonData => 
                moonData.moon !== null && moonData.moon !== undefined
            );
            
            if (hasMoonData) {
                // We have proper moon-based timeline
                html += `<div class="timeline-container">`;
                html += `<div class="stream-note" style="margin-bottom: 20px;">
                    <strong>Timeline:</strong> Events organized by moon from cat history files.
                    ${this.timelineData.length} moons with events recorded.
                </div>`;
                
                for (const moonData of this.timelineData) {
                    const moonHtml = this.renderMoonGroup(moonData);
                    if (moonHtml) {
                        html += moonHtml;
                        hasEvents = true;
                        totalEventCount += (moonData.events || []).length;
                    }
                }
                html += `</div>`;
            } else {
                // Special handling for mixed/additional events without moon data
                for (const moonData of this.timelineData) {
                    if (moonData.label) {
                        html += `<div class="event-section">`;
                        html += `<h3 class="section-header">${moonData.label}</h3>`;
                    }
                    
                    const events = this.filterEventsByDensity(moonData.events || []);
                    for (const event of events) {
                        html += this.renderEvent(event);
                        hasEvents = true;
                        totalEventCount++;
                    }
                    
                    if (moonData.label) {
                        html += `</div>`;
                    }
                }
            }
            
            if (!hasEvents) {
                html = `<div class="timeline-empty">
                    <p>No events match the current filters.</p>
                    <p class="note">Try selecting "Show All" in the Density filter or adjusting your event type filters.</p>
                </div>`;
            } else {
                console.log(`Rendered ${totalEventCount} total events`);
            }
        }
        
        container.innerHTML = html;
        
        // Add click handlers for cat chips
        this.attachCatChipHandlers();
    }

    renderEventStream(streamData) {
        const events = this.filterEventsByDensity(streamData.events || []);
        
        if (events.length === 0) {
            return `<div class="timeline-empty">
                <p>No events found in this save file.</p>
                <p class="note">ClanGen saves events chronologically without moon timestamps.</p>
            </div>`;
        }
        
        let html = `<div class="event-stream">`;
        
        // Add explanation note
        html += `<div class="stream-note">
            <strong>Note:</strong> ClanGen doesn't store moon numbers with events. 
            Events are shown in the order they were recorded.
        </div>`;
        
        // Group events into sections for better readability
        const totalEvents = events.length;
        const sections = [
            { label: 'Early Events', start: 0, end: Math.floor(totalEvents * 0.33) },
            { label: 'Middle Events', start: Math.floor(totalEvents * 0.33), end: Math.floor(totalEvents * 0.67) },
            { label: 'Recent Events', start: Math.floor(totalEvents * 0.67), end: totalEvents }
        ];
        
        for (const section of sections) {
            const sectionEvents = events.slice(section.start, section.end);
            if (sectionEvents.length > 0) {
                html += `<div class="event-section">`;
                html += `<h3 class="section-header">${section.label}</h3>`;
                
                for (const event of sectionEvents) {
                    html += this.renderEvent(event);
                }
                
                html += `</div>`;
            }
        }
        
        html += '</div>';
        return html;
    }
    
    renderMoonGroup(moonData) {
        const events = this.filterEventsByDensity(moonData.events);
        
        if (events.length === 0) return '';
        
        let html = '';
        
        // Only show moon marker if we have valid moon data
        if (moonData.moon !== null && moonData.moon !== undefined) {
            // Create moon marker as a timeline entry with visual point
            html += `<div class="timeline-moon" data-moon="${moonData.moon}">`;
            html += `<div class="timeline-moon-marker">`;
            html += `<span class="moon-label">Moon ${moonData.moon}</span>`;
            html += `</div>`;
            
            // Nest events under the moon marker
            html += `<div class="moon-events">`;
            for (const event of events) {
                html += this.renderEvent(event);
            }
            html += `</div>`;
            html += `</div>`;
        } else {
            // No moon data, just render events directly
            for (const event of events) {
                html += this.renderEvent(event);
            }
        }
        
        return html;
    }

    renderEvent(event) {
        const icon = this.getEventIcon(event.eventType);
        const isPlayerEvent = this.isLifeGen && event.involvesPlayer;
        const isPlayerPrimary = this.isLifeGen && event.isPlayerPrimary;
        
        const catChips = event.catsInvolved.map(catId => {
            const isPlayer = this.isLifeGen && catId === this.playerCatId;
            return `<span class="cat-chip ${isPlayer ? 'player-chip' : ''}" data-cat-id="${catId}">
                <span class="cat-avatar"></span>
                <span class="cat-name">Cat ${catId}</span>
            </span>`;
        }).join('');
        
        return `
            <div class="timeline-event ${isPlayerEvent ? 'player-event' : ''} ${isPlayerPrimary ? 'player-primary' : ''}">
                <div class="event-card">
                    <div class="event-header">
                        <span class="event-icon ${event.eventType}">${icon}</span>
                        <span class="event-title">${this.getEventTitle(event)}</span>
                        ${isPlayerPrimary ? '<span class="player-badge">Your Event</span>' : ''}
                    </div>
                    <div class="event-text">${event.text}</div>
                    ${catChips ? `<div class="event-cats">${catChips}</div>` : ''}
                </div>
            </div>
        `;
    }

    filterEventsByDensity(events) {
        // If no events, return empty array
        if (!events || events.length === 0) {
            console.log('No events to filter');
            return [];
        }
        
        console.log(`Filtering ${events.length} events with density: ${this.filters.density}`);
        
        // Show all events - no filtering
        if (this.filters.density === 'all' || !this.filters.density) {
            console.log('Showing all events (no filtering)');
            return events;
        }
        
        // Major events only - high importance
        if (this.filters.density === 'major') {
            const filtered = events.filter(e => {
                // If importance field exists, use it
                if (e.importance) {
                    return e.importance === 'high';
                }
                // Fallback: major event types
                return ['birth', 'death', 'ceremony'].includes(e.eventType);
            });
            console.log(`Major events: ${filtered.length} of ${events.length}`);
            return filtered;
        }
        
        // Important only - exclude low importance
        if (this.filters.density === 'important') {
            const filtered = events.filter(e => {
                // If importance field exists, use it
                if (e.importance) {
                    return e.importance !== 'low';
                }
                // Fallback: show important event types
                return ['birth', 'death', 'ceremony', 'new_cat', 'relationship'].includes(e.eventType);
            });
            console.log(`Important events: ${filtered.length} of ${events.length}`);
            return filtered;
        }
        
        // Default to showing all if density is not recognized
        console.log('Unknown density filter, showing all');
        return events;
    }

    getEventIcon(type) {
        const icons = {
            birth: '👶',
            death: '💀',
            ceremony: '🎖️',
            relationship: '💕',
            health: '🏥',
            misc: '📝'
        };
        return icons[type] || '📝';
    }
    
    getEventTypeLabel(type) {
        const labels = {
            birth: 'Birth',
            death: 'Death',
            ceremony: 'Ceremony',
            relationship: 'Relationship',
            health: 'Health',
            misc: 'Other Event'
        };
        return labels[type] || 'Event';
    }
    
    getEventTypeLabel(type) {
        const labels = {
            birth: 'Birth',
            death: 'Death',
            ceremony: 'Ceremony',
            relationship: 'Relationship',
            health: 'Health',
            misc: 'Other Event'
        };
        return labels[type] || 'Event';
    }

    getEventTitle(event) {
        const titles = {
            birth: 'Birth',
            death: 'Death',
            ceremony: 'Ceremony',
            relationship: 'Relationship',
            health: 'Health',
            misc: 'Event'
        };
        return titles[event.eventType] || 'Event';
    }

    attachCatChipHandlers() {
        const catChips = document.querySelectorAll('.cat-chip');
        catChips.forEach(chip => {
            chip.addEventListener('click', async (e) => {
                e.stopPropagation();
                const catId = chip.dataset.catId;
                await this.showCatProfile(catId);
            });
        });
        
        // Load cat names asynchronously
        this.loadCatNames();
    }

    async loadCatNames() {
        const catChips = document.querySelectorAll('.cat-chip');
        
        for (const chip of catChips) {
            const catId = chip.dataset.catId;
            const cat = await this.database.getCat(this.currentClanId, catId);
            
            if (cat) {
                const nameElement = chip.querySelector('.cat-name');
                if (nameElement) {
                    nameElement.textContent = cat.name;
                }
                
                // Generate mini sprite (later)
                // const avatarElement = chip.querySelector('.cat-avatar');
                // this.generateMiniSprite(cat, avatarElement);
            }
        }
    }

    async showCatProfile(catId) {
        const cat = await this.database.getCat(this.currentClanId, catId);
        if (!cat) return;
        
        // Store current cat for tab switching
        this.currentCatId = catId;
        this.currentCat = cat;
        
        // Show modal
        const modal = document.getElementById('catModal');
        modal.style.display = 'flex';
        
        // Update cat info
        document.getElementById('modalCatName').textContent = cat.name;
        
        const params = this.convertToCatParams(cat);
        const editorUrl = this.buildVisualEditorUrl(params);
        
        const details = `
            <div>Status: ${cat.status}</div>
            <div>Age: ${cat.age} moons</div>
            <div>Gender: ${cat.gender}</div>
            <div>Trait: ${cat.trait}</div>
            ${cat.isDead ? '<div>Status: Dead</div>' : ''}
            <div style="margin-top: 10px;">
                <a href="${editorUrl}" target="_blank" class="visual-editor-btn">
                    🎨 Open in Visual Editor
                </a>
            </div>
        `;
        document.getElementById('modalCatDetails').innerHTML = details;
        
        // Generate sprite
        await this.generateCatSprite(cat, 'modalCatSprite');
        
        // Load cat's personal timeline
        await this.loadCatTimeline(catId);
        
        // Load relationships
        console.log(`Loading relationships for cat ${catId} in clan ${this.currentClanId}`);
        const relationships = await this.database.getCatRelationships(this.currentClanId, catId);
        console.log(`Found ${relationships.length} relationships:`, relationships);
        this.renderCatRelationships(relationships);
        
        // Load all sprites
        this.loadCatSprites(cat);
        
        // Set up tab switching
        this.setupModalTabs();
    }

    async generateMiniSprite(params, element) {
        // Create a small sprite for avatars
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 20;
        
        try {
            const imageUrl = await this.catGenerator.generateCat(params);
            const img = new Image();
            img.onload = () => {
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 20, 20);
                element.style.backgroundImage = `url(${canvas.toDataURL()})`;
            };
            img.src = imageUrl;
        } catch (error) {
            console.error('Failed to generate mini sprite:', error);
        }
    }
    
    async generateCatSprite(cat, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        // Convert ClanGen data to cat generator params
        const params = this.convertToCatParams(cat);
        
        try {
            const result = await this.catGenerator.generateCat(params);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Error generating sprite:', error);
        }
    }

    convertToCatParams(cat) {
        return {
            spriteNumber: cat.sprites.adult || 9,
            peltName: cat.pelt.name || 'SingleColour',
            colour: cat.pelt.color || 'GREY',
            eyeColour: cat.eyes.color1 || 'YELLOW',
            eyeColour2: cat.eyes.color2 || '',
            tint: cat.tint || 'none',
            skinColour: cat.skin || 'PINK',
            isTortie: cat.tortie.enabled,
            tortieColour: cat.tortie.color || 'GINGER',
            tortiePattern: cat.tortie.pattern || 'SingleColour',
            shading: true,  // Default to shading for visual consistency
            reverse: false   // Standard orientation unless cat data specifies otherwise
        };
    }

    buildVisualEditorUrl(params) {
        const baseUrl = '/pages/cat-builder.html';
        const urlParams = new URLSearchParams();
        
        // Only include non-default values to keep URLs cleaner
        if (params.spriteNumber !== undefined) urlParams.set('spriteNumber', params.spriteNumber);
        if (params.peltName) urlParams.set('peltName', params.peltName);
        if (params.colour) urlParams.set('colour', params.colour);
        if (params.eyeColour) urlParams.set('eyeColour', params.eyeColour);
        if (params.eyeColour2) urlParams.set('eyeColour2', params.eyeColour2);
        if (params.tint && params.tint !== 'none') urlParams.set('tint', params.tint);
        if (params.skinColour) urlParams.set('skinColour', params.skinColour);
        if (params.isTortie) {
            urlParams.set('isTortie', 'true');
            if (params.tortieColour) urlParams.set('tortieColour', params.tortieColour);
            if (params.tortiePattern) urlParams.set('tortiePattern', params.tortiePattern);
        }
        if (params.shading !== undefined) urlParams.set('shading', params.shading);
        if (params.reverse) urlParams.set('reverse', 'true');
        
        return `${baseUrl}?${urlParams.toString()}`;
    }

    async loadCatTimeline(catId) {
        const container = document.getElementById('catTimeline');
        if (!container) {
            console.error('Cat timeline container not found');
            return;
        }
        
        console.log(`Loading timeline for cat ${catId} in clan ${this.currentClanId}`);
        
        const catEvents = [];
        const catIdStr = String(catId);
        
        // Try getting events from database
        try {
            const allEvents = await this.database.getTimelineRange(this.currentClanId, 0, 9999, {});
            console.log(`Database returned ${allEvents.length} timeline entries`);
            
            for (const moonGroup of allEvents) {
                if (!moonGroup) continue;
                
                const events = moonGroup.events || [];
                for (const event of events) {
                    if (event.catsInvolved && Array.isArray(event.catsInvolved)) {
                        const involvedCats = event.catsInvolved.map(id => String(id));
                        if (involvedCats.includes(catIdStr)) {
                            catEvents.push({
                                ...event,
                                moon: moonGroup.moon
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading from database:', error);
        }
        
        // Also check in-memory timeline data as fallback
        if (catEvents.length === 0 && this.timelineData && this.timelineData.length > 0) {
            console.log('Checking in-memory timeline data');
            for (const group of this.timelineData) {
                const events = group.events || [];
                for (const event of events) {
                    if (event.catsInvolved && Array.isArray(event.catsInvolved)) {
                        const involvedCats = event.catsInvolved.map(id => String(id));
                        if (involvedCats.includes(catIdStr)) {
                            catEvents.push(event);
                        }
                    }
                }
            }
        }
        
        console.log(`Found ${catEvents.length} events for cat ${catId}`);
        
        // Render timeline
        let html = '<div class="cat-timeline">';
        
        if (catEvents.length === 0) {
            html += '<div class="no-events">No events found for this cat in the current data.</div>';
            html += '<div class="timeline-note" style="margin-top: 10px; font-size: 12px; opacity: 0.7;">Note: Events are only available if they were included in the save file.</div>';
        } else {
            html += `<div class="timeline-note">Found ${catEvents.length} events involving ${this.currentCat ? this.currentCat.name : 'this cat'}:</div>`;
            
            // Sort events if they have moon numbers
            catEvents.sort((a, b) => (a.moon || 0) - (b.moon || 0));
            
            for (const event of catEvents) {
                const icon = this.getEventIcon(event.eventType);
                const moonText = event.moon !== null && event.moon !== undefined ? ` (Moon ${event.moon})` : '';
                html += `
                    <div class="cat-timeline-event">
                        <div class="event-icon ${event.eventType}">${icon}</div>
                        <div class="event-text">${event.text || 'Event details unavailable'}${moonText}</div>
                    </div>
                `;
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    loadCatSprites(cat) {
        const container = document.getElementById('catSprites');
        
        let html = '<div class="sprites-grid">';
        
        // Define sprite stages
        const stages = [
            { name: 'Kitten', sprite: cat.sprites.kitten },
            { name: 'Adolescent', sprite: cat.sprites.adolescent },
            { name: 'Adult', sprite: cat.sprites.adult },
            { name: 'Senior', sprite: cat.sprites.senior }
        ];
        
        for (const stage of stages) {
            if (stage.sprite !== null && stage.sprite !== undefined) {
                html += `
                    <div class="sprite-stage">
                        <div class="stage-name">${stage.name}</div>
                        <canvas class="sprite-canvas" id="sprite-${stage.name.toLowerCase()}" width="150" height="150"></canvas>
                    </div>
                `;
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Generate sprites for each stage
        setTimeout(() => {
            for (const stage of stages) {
                if (stage.sprite !== null && stage.sprite !== undefined) {
                    const params = this.convertToCatParams(cat);
                    params.spriteNumber = stage.sprite;
                    this.generateCatSpriteForStage(params, `sprite-${stage.name.toLowerCase()}`);
                }
            }
        }, 100);
    }
    
    async generateCatSpriteForStage(params, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        try {
            const result = await this.catGenerator.generateCat(params);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Error generating sprite for stage:', error);
        }
    }
    
    renderCatRelationships(relationships) {
        const container = document.getElementById('catRelationships');
        
        if (!relationships || relationships.length === 0) {
            container.innerHTML = '<div class="no-relationships">No relationships data available</div>';
            return;
        }
        
        let html = '<div class="relationships-grid">';
        
        // Group relationships by type
        const mates = [];
        const family = [];
        const friends = [];
        
        for (const rel of relationships) {
            if (rel.isMate) {
                mates.push(rel);
            } else if (rel.isFamily) {
                family.push(rel);
            } else {
                friends.push(rel);
            }
        }
        
        // Render each group
        if (mates.length > 0) {
            html += '<div class="rel-section"><h4>Mates</h4>';
            for (const rel of mates) {
                html += this.renderRelationshipItem(rel);
            }
            html += '</div>';
        }
        
        if (family.length > 0) {
            html += '<div class="rel-section"><h4>Family</h4>';
            for (const rel of family) {
                html += this.renderRelationshipItem(rel);
            }
            html += '</div>';
        }
        
        if (friends.length > 0) {
            html += '<div class="rel-section"><h4>Relationships</h4>';
            for (const rel of friends) {
                html += this.renderRelationshipItem(rel);
            }
            html += '</div>';
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Load cat names for relationships
        this.loadRelationshipNames();
    }
    
    renderRelationshipItem(rel) {
        const romanticBar = rel.romanticLove ? `
            <div class="rel-bar">
                <span class="rel-label">❤️ Love:</span>
                <div class="rel-progress">
                    <div class="rel-fill romantic" style="width: ${Math.min(rel.romanticLove, 100)}%"></div>
                </div>
                <span class="rel-value">${rel.romanticLove}</span>
            </div>
        ` : '';
        
        const platonicBar = rel.platonicLike ? `
            <div class="rel-bar">
                <span class="rel-label">👫 Like:</span>
                <div class="rel-progress">
                    <div class="rel-fill platonic" style="width: ${Math.min(rel.platonicLike, 100)}%"></div>
                </div>
                <span class="rel-value">${rel.platonicLike}</span>
            </div>
        ` : '';
        
        const dislikeBar = rel.dislike ? `
            <div class="rel-bar">
                <span class="rel-label">😠 Dislike:</span>
                <div class="rel-progress">
                    <div class="rel-fill dislike" style="width: ${Math.min(rel.dislike, 100)}%"></div>
                </div>
                <span class="rel-value">${rel.dislike}</span>
            </div>
        ` : '';
        
        return `
            <div class="relationship-item">
                <div class="rel-cat-name" data-cat-id="${rel.otherCatId}">Cat ${rel.otherCatId}</div>
                ${romanticBar}
                ${platonicBar}
                ${dislikeBar}
            </div>
        `;
    }
    
    async loadRelationshipNames() {
        const nameElements = document.querySelectorAll('.rel-cat-name');
        for (const elem of nameElements) {
            const catId = elem.dataset.catId;
            const cat = await this.database.getCat(this.currentClanId, catId);
            if (cat) {
                elem.textContent = cat.name;
                elem.style.cursor = 'pointer';
                elem.addEventListener('click', () => this.showCatProfile(catId));
            }
        }
    }

    setupModalTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        
        // Remove any existing event listeners first
        tabButtons.forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
        });
        
        // Re-query after replacing
        const newTabButtons = document.querySelectorAll('.tab-button');
        
        newTabButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const tab = button.dataset.tab;
                
                // Update active states
                newTabButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                
                // Show/hide content
                document.querySelectorAll('.tab-content').forEach(content => {
                    if (content.id === `cat${tab.charAt(0).toUpperCase() + tab.slice(1)}`) {
                        content.style.display = 'block';
                    } else {
                        content.style.display = 'none';
                    }
                });
                
                // Load data for the selected tab if needed
                if (tab === 'relationships' && this.currentCatId) {
                    const relationships = await this.database.getCatRelationships(this.currentClanId, this.currentCatId);
                    this.renderCatRelationships(relationships);
                } else if (tab === 'sprites' && this.currentCat) {
                    this.loadCatSprites(this.currentCat);
                }
            });
        });
    }

    closeModal() {
        const modal = document.getElementById('catModal');
        modal.style.display = 'none';
    }

    async switchView(view) {
        this.currentView = view;
        
        // Update active state
        document.querySelectorAll('.view-option').forEach(option => {
            option.classList.toggle('active', option.dataset.view === view);
        });
        
        // Show/hide views
        document.querySelectorAll('.view-panel').forEach(panel => {
            panel.style.display = 'none';
        });
        
        // Handle sidebar visibility
        const sidebar = document.querySelector('.sidebar');
        const mainView = document.querySelector('.main-view');
        
        if (view === 'timeline') {
            // Show sidebar for timeline view
            if (sidebar) sidebar.style.display = 'block';
            if (mainView) mainView.classList.remove('full-width');
            
            document.getElementById('timelineView').style.display = 'block';
            // Reload timeline data if not already loaded or if empty
            if (!this.timelineData || this.timelineData.length === 0) {
                console.log('Reloading timeline data');
                await this.loadTimelineData();
            }
            this.renderTimeline();
        } else if (view === 'family') {
            // Hide sidebar for family tree view
            if (sidebar) sidebar.style.display = 'none';
            if (mainView) mainView.classList.add('full-width');
            
            document.getElementById('familyView').style.display = 'block';
            await this.renderFamilyTree();
        } else if (view === 'cats') {
            // Hide sidebar for cats view
            if (sidebar) sidebar.style.display = 'none';
            if (mainView) mainView.classList.add('full-width');
            
            document.getElementById('catsView').style.display = 'block';
            await this.renderCatsView();
        } else if (view === 'events') {
            // Show sidebar for events view (for filtering)
            if (sidebar) sidebar.style.display = 'block';
            if (mainView) mainView.classList.remove('full-width');
            
            document.getElementById('eventsView').style.display = 'block';
            await this.renderEventsView();
        }
    }

    buildFamilyTreeStructure(cats) {
        // Create a map of cats by ID for quick lookup
        const catMap = new Map();
        cats.forEach(cat => catMap.set(cat.id, cat));
        
        // Find all mating pairs and their children
        const families = new Map(); // Key: "parent1_parent2", Value: {parents: [], children: []}
        const processedCats = new Set();
        
        cats.forEach(cat => {
            if (cat.parent1 || cat.parent2) {
                const familyKey = [cat.parent1, cat.parent2].filter(p => p).sort().join('_');
                
                if (!families.has(familyKey)) {
                    families.set(familyKey, {
                        parents: [],
                        children: []
                    });
                    
                    // Add parents
                    if (cat.parent1 && catMap.has(cat.parent1)) {
                        families.get(familyKey).parents.push(catMap.get(cat.parent1));
                        processedCats.add(cat.parent1);
                    }
                    if (cat.parent2 && catMap.has(cat.parent2)) {
                        families.get(familyKey).parents.push(catMap.get(cat.parent2));
                        processedCats.add(cat.parent2);
                    }
                }
                
                families.get(familyKey).children.push(cat);
                processedCats.add(cat.id);
            }
        });
        
        // Add cats without families (singles)
        const singles = cats.filter(cat => !processedCats.has(cat.id));
        
        return { families: Array.from(families.values()), singles };
    }
    
    async renderFamilyTree() {
        const container = document.getElementById('familyTree');
        
        // Show loading with paw spinner
        const loadingHtml = `
            <g transform="translate(400, 300)">
                <image href="../assets/images/paw.png" x="-25" y="-25" width="50" height="50" 
                       style="animation: spin 1s linear infinite; transform-origin: center;"/>
                <text y="40" text-anchor="middle" fill="white" font-size="14">Loading family tree...</text>
            </g>
        `;
        container.innerHTML = loadingHtml;
        
        // Small delay to show loading
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get all cats and their relationships
        const cats = await this.database.getCats(this.currentClanId, { showDead: true });
        
        if (!cats || cats.length === 0) {
            container.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="white">No cats found</text>';
            return;
        }
        
        // Build family connections
        const nodes = new Map();
        const links = [];
        
        // Create nodes for each cat with better positioning
        // First, build generation levels
        const generations = new Map();
        const processedCats = new Set();
        
        // Find cats without parents (founders)
        const founders = cats.filter(cat => !cat.parent1 && !cat.parent2);
        founders.forEach(cat => {
            generations.set(cat.id, 0);
            processedCats.add(cat.id);
        });
        
        // Assign generation levels
        let currentGen = 0;
        while (processedCats.size < cats.length && currentGen < 10) {
            currentGen++;
            cats.forEach(cat => {
                if (!processedCats.has(cat.id)) {
                    const parent1Gen = cat.parent1 ? generations.get(cat.parent1) : null;
                    const parent2Gen = cat.parent2 ? generations.get(cat.parent2) : null;
                    
                    if (parent1Gen !== undefined || parent2Gen !== undefined) {
                        const parentGen = Math.max(parent1Gen ?? -1, parent2Gen ?? -1);
                        generations.set(cat.id, parentGen + 1);
                        processedCats.add(cat.id);
                    }
                }
            });
        }
        
        // Cats without determined generation go at the bottom
        cats.forEach(cat => {
            if (!generations.has(cat.id)) {
                generations.set(cat.id, currentGen + 1);
            }
        });
        
        // Group cats by generation
        const genGroups = new Map();
        cats.forEach(cat => {
            const gen = generations.get(cat.id) || 0;
            if (!genGroups.has(gen)) {
                genGroups.set(gen, []);
            }
            genGroups.get(gen).push(cat);
        });
        
        // Position cats in a tree layout
        const levelHeight = 150;
        const baseY = 100;
        
        cats.forEach(cat => {
            const gen = generations.get(cat.id) || 0;
            const genCats = genGroups.get(gen) || [];
            const index = genCats.indexOf(cat);
            const spacing = 800 / (genCats.length + 1);
            
            nodes.set(cat.id, {
                id: cat.id,
                name: cat.name,
                status: cat.status,
                isDead: cat.isDead,
                spriteData: cat.spriteData || null,
                x: spacing * (index + 1),
                y: baseY + (gen * levelHeight)
            });
        });
        
        // Build proper family tree structure
        const familyTree = this.buildFamilyTreeStructure(cats);
        
        // Render the family tree
        this.renderFamilyTreeSVG(container, familyTree, cats);
    }
    
    renderFamilyTreeSVG(container, treeData, allCats) {
        // Clear existing content
        container.innerHTML = '';
        
        const { families, singles } = treeData;
        
        // Calculate dimensions based on content
        const nodeWidth = 100;
        const nodeHeight = 120;
        const horizontalSpacing = 20;
        const verticalSpacing = 80;
        const familySpacing = 150;
        
        // Calculate total width needed
        let totalWidth = 100;
        families.forEach(family => {
            const familyWidth = Math.max(family.parents.length, family.children.length) * (nodeWidth + horizontalSpacing);
            totalWidth += familyWidth + familySpacing;
        });
        totalWidth += singles.length * (nodeWidth + horizontalSpacing);
        
        const width = Math.max(container.clientWidth || 800, totalWidth);
        const height = 600;
        
        // Initialize zoom and pan variables
        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isPanning = false;
        let startX = 0;
        let startY = 0;
        
        container.setAttribute('viewBox', `0 0 ${width} ${height}`);
        container.style.background = '#1a1a2e';
        
        // Create main group for all elements (for pan/zoom transforms)
        const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Create groups for organizing elements
        const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        linkGroup.setAttribute('class', 'links');
        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.setAttribute('class', 'nodes');
        
        // Position and render families
        let currentX = 50;
        
        families.forEach(family => {
            const familyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            // Calculate family layout
            const parentY = 100;
            const childY = parentY + nodeHeight + verticalSpacing;
            
            // Position parents
            const parentStartX = currentX;
            family.parents.forEach((parent, index) => {
                const x = parentStartX + index * (nodeWidth + horizontalSpacing);
                this.renderFamilyNode(nodeGroup, parent, x, parentY, nodeWidth, nodeHeight);
            });
            
            // Draw marriage line between parents
            if (family.parents.length === 2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', parentStartX + nodeWidth/2);
                line.setAttribute('y1', parentY);
                line.setAttribute('x2', parentStartX + nodeWidth + horizontalSpacing + nodeWidth/2);
                line.setAttribute('y2', parentY);
                line.setAttribute('stroke', '#ec4899');
                line.setAttribute('stroke-width', '3');
                line.setAttribute('opacity', '0.6');
                linkGroup.appendChild(line);
            }
            
            // Position children
            const childrenWidth = family.children.length * (nodeWidth + horizontalSpacing);
            const childStartX = currentX + (Math.max(family.parents.length, family.children.length) * (nodeWidth + horizontalSpacing) - childrenWidth) / 2;
            
            family.children.forEach((child, index) => {
                const x = childStartX + index * (nodeWidth + horizontalSpacing);
                this.renderFamilyNode(nodeGroup, child, x, childY, nodeWidth, nodeHeight);
                
                // Draw parent-child connections
                const parentCenterX = parentStartX + (family.parents.length * (nodeWidth + horizontalSpacing) - horizontalSpacing) / 2;
                
                // Vertical line from parents
                const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                vLine.setAttribute('x1', parentCenterX);
                vLine.setAttribute('y1', parentY + 35);
                vLine.setAttribute('x2', parentCenterX);
                vLine.setAttribute('y2', childY - 35);
                vLine.setAttribute('stroke', '#a855f7');
                vLine.setAttribute('stroke-width', '2');
                vLine.setAttribute('opacity', '0.6');
                linkGroup.appendChild(vLine);
                
                // Horizontal line to child
                const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                hLine.setAttribute('x1', parentCenterX);
                hLine.setAttribute('y1', childY - 35);
                hLine.setAttribute('x2', x + nodeWidth/2);
                hLine.setAttribute('y2', childY - 35);
                hLine.setAttribute('stroke', '#a855f7');
                hLine.setAttribute('stroke-width', '2');
                hLine.setAttribute('opacity', '0.6');
                linkGroup.appendChild(hLine);
                
                // Vertical line to child
                const cLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                cLine.setAttribute('x1', x + nodeWidth/2);
                cLine.setAttribute('y1', childY - 35);
                cLine.setAttribute('x2', x + nodeWidth/2);
                cLine.setAttribute('y2', childY);
                cLine.setAttribute('stroke', '#a855f7');
                cLine.setAttribute('stroke-width', '2');
                cLine.setAttribute('opacity', '0.6');
                linkGroup.appendChild(cLine);
            });
            
            currentX += Math.max(family.parents.length, family.children.length) * (nodeWidth + horizontalSpacing) + familySpacing;
        });
        
        // Render singles at the bottom
        singles.forEach((cat, index) => {
            const x = currentX + index * (nodeWidth + horizontalSpacing);
            const y = 400;
            this.renderFamilyNode(nodeGroup, cat, x, y, nodeWidth, nodeHeight);
        });
        
        mainGroup.appendChild(linkGroup);
        mainGroup.appendChild(nodeGroup);
        container.appendChild(mainGroup);
        
        // Add pan and zoom functionality
        this.addFamilyTreeInteraction(container, mainGroup);
    }
    
    renderFamilyNode(container, cat, x, y, width, height) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${x}, ${y})`);
        g.style.cursor = 'pointer';
        
        // Card background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', cat.isDead ? '#2a2a3a' : '#3a3a4a');
        rect.setAttribute('stroke', cat.isDead ? '#666' : '#a855f7');
        rect.setAttribute('stroke-width', '2');
        g.appendChild(rect);
        
        // Add cat sprite using foreignObject for canvas
        const spriteSize = 60;
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('x', (width - spriteSize) / 2);
        foreignObject.setAttribute('y', 5);
        foreignObject.setAttribute('width', spriteSize);
        foreignObject.setAttribute('height', spriteSize);
        
        const canvas = document.createElement('canvas');
        canvas.width = spriteSize;
        canvas.height = spriteSize;
        canvas.style.width = spriteSize + 'px';
        canvas.style.height = spriteSize + 'px';
        canvas.style.imageRendering = 'pixelated';
        canvas.style.imageRendering = 'crisp-edges';
        canvas.id = `family-sprite-${cat.id}`;
        
        foreignObject.appendChild(canvas);
        g.appendChild(foreignObject);
        
        // Generate sprite asynchronously
        if (cat.spriteData || cat.pelt) {
            this.generateFamilyNodeSprite(cat, canvas);
        } else {
            // Fallback circle if no sprite data
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', width/2);
            circle.setAttribute('cy', 35);
            circle.setAttribute('r', '25');
            circle.setAttribute('fill', '#4a4a5a');
            circle.setAttribute('stroke', cat.isDead ? '#666' : '#9333ea');
            circle.setAttribute('stroke-width', '2');
            g.appendChild(circle);
        }
        
        // Cat name
        const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameText.setAttribute('x', width/2);
        nameText.setAttribute('y', 75);
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('fill', 'white');
        nameText.setAttribute('font-size', '14');
        nameText.setAttribute('font-weight', 'bold');
        nameText.textContent = cat.name || 'Unknown';
        g.appendChild(nameText);
        
        // Status
        const statusText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        statusText.setAttribute('x', width/2);
        statusText.setAttribute('y', 95);
        statusText.setAttribute('text-anchor', 'middle');
        statusText.setAttribute('fill', '#aaa');
        statusText.setAttribute('font-size', '11');
        statusText.textContent = cat.isDead ? '✝ StarClan' : cat.status || '';
        g.appendChild(statusText);
        
        // Click handler - show full cat profile modal
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showCatProfile(cat.id);
        });
        
        container.appendChild(g);
    }
    
    async generateFamilyNodeSprite(cat, canvas) {
        try {
            const params = this.convertToCatParams(cat);
            const result = await this.catGenerator.generateCat(params);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
        } catch (error) {
            console.error('Failed to generate sprite for', cat.name, error);
            // Draw fallback circle on canvas
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#4a4a5a';
            ctx.beginPath();
            ctx.arc(canvas.width/2, canvas.height/2, canvas.width/2 - 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    
    addFamilyTreeInteraction(svg, mainGroup) {
        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isPanning = false;
        let startX = 0;
        let startY = 0;
        
        // Mouse wheel zoom
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            scale *= delta;
            scale = Math.max(0.1, Math.min(scale, 5)); // Limit zoom
            
            // Get mouse position relative to SVG
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
            
            // Adjust translation to zoom on mouse position
            translateX = svgP.x - (svgP.x - translateX) * delta;
            translateY = svgP.y - (svgP.y - translateY) * delta;
            
            mainGroup.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        });
        
        // Mouse drag to pan
        svg.addEventListener('mousedown', (e) => {
            // Don't start panning if clicking on a node
            if (e.target.closest('.nodes')) return;
            
            isPanning = true;
            startX = e.clientX;
            startY = e.clientY;
            svg.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        // Track animation frame ID to avoid multiple requests
        let animationFrameId = null;
        
        svg.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            
            // Direct 1:1 mouse movement for smooth dragging
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            translateX += dx;
            translateY += dy;
            
            startX = e.clientX;
            startY = e.clientY;
            
            // Cancel previous frame if still pending
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            
            // Use requestAnimationFrame for smoother updates
            animationFrameId = requestAnimationFrame(() => {
                // Use transform style instead of setAttribute for better performance
                mainGroup.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                animationFrameId = null;
            });
        });
        
        svg.addEventListener('mouseup', () => {
            isPanning = false;
            svg.style.cursor = 'grab';
        });
        
        svg.addEventListener('mouseleave', () => {
            isPanning = false;
            svg.style.cursor = 'grab';
        });
        
        // Zoom controls buttons
        document.getElementById('zoomIn')?.addEventListener('click', () => {
            scale *= 1.2;
            scale = Math.min(scale, 5);
            mainGroup.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        });
        
        document.getElementById('zoomOut')?.addEventListener('click', () => {
            scale *= 0.8;
            scale = Math.max(scale, 0.1);
            mainGroup.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        });
        
        document.getElementById('resetZoom')?.addEventListener('click', () => {
            scale = 1;
            translateX = 0;
            translateY = 0;
            mainGroup.style.transform = `translate(0px, 0px) scale(1)`;
        });
    }
    
    async renderCatsView() {
        const cats = await this.database.getCats(this.currentClanId, {
            showDead: this.filters.showDeadCats
        });
        
        // Sort cats
        const sortBy = document.getElementById('catSort')?.value || 'name';
        cats.sort((a, b) => {
            switch (sortBy) {
                case 'age':
                    return b.age - a.age;
                case 'birth':
                    return (a.birthMoon || 0) - (b.birthMoon || 0);
                case 'rank':
                    return a.status.localeCompare(b.status);
                default:
                    return a.name.localeCompare(b.name);
            }
        });
        
        const container = document.getElementById('catsGrid');
        let html = '';
        
        for (const cat of cats) {
            html += `
                <div class="cat-card" data-cat-id="${cat.id}">
                    <canvas class="cat-sprite" id="sprite_${cat.id}" width="100" height="100"></canvas>
                    <div class="cat-name">${cat.name}</div>
                    <div class="cat-info">
                        ${cat.status} • ${cat.age} moons
                        ${cat.isDead ? ' • Dead' : ''}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Add click handlers
        container.querySelectorAll('.cat-card').forEach(card => {
            card.addEventListener('click', () => {
                const catId = card.dataset.catId;
                this.showCatProfile(catId);
            });
        });
        
        // Generate sprites (lazy load)
        this.lazyLoadCatSprites(cats);
    }

    async renderEventsView() {
        console.log('Rendering Events view for clan:', this.currentClanId);
        
        // Get all events from the database
        const events = await this.database.getEvents(this.currentClanId);
        console.log('Events retrieved from database:', events ? events.length : 0);
        
        const container = document.getElementById('eventsContainer');
        if (!container) {
            console.error('Events container not found');
            return;
        }
        
        if (!events || events.length === 0) {
            console.log('No events found, showing empty message');
            container.innerHTML = `
                <div class="timeline-empty">
                    <p>No events found</p>
                    <p class="note">Events from events.json will appear here</p>
                </div>
            `;
            return;
        }
        
        console.log('Processing', events.length, 'events');
        
        // Group events by type
        const eventsByType = {};
        events.forEach(event => {
            const type = event.eventType || 'misc';
            if (!eventsByType[type]) {
                eventsByType[type] = [];
            }
            eventsByType[type].push(event);
        });
        
        // Render grouped events
        let html = '';
        const typeLabels = {
            'relationship': '💕 Relationships',
            'health': '🏥 Health',
            'ceremony': '🎉 Ceremonies',
            'birth': '👶 Births',
            'death': '💀 Deaths',
            'misc': '📝 Miscellaneous'
        };
        
        for (const [type, typeEvents] of Object.entries(eventsByType)) {
            const label = typeLabels[type] || `📝 ${type}`;
            html += `
                <div class="event-section">
                    <h3 class="section-header">${label}</h3>
                    <div class="events-list">
            `;
            
            for (const event of typeEvents) {
                const icon = this.getEventIcon(event.eventType);
                html += `
                    <div class="timeline-event">
                        <div class="event-card">
                            <div class="event-header">
                                <div class="event-icon ${event.eventType}">${icon}</div>
                                <div class="event-title">${this.getEventTypeLabel(event.eventType)}</div>
                            </div>
                            <div class="event-text">${event.text}</div>
                `;
                
                // Add involved cats
                if (event.catsInvolved && event.catsInvolved.length > 0) {
                    html += '<div class="event-cats">';
                    for (const catId of event.catsInvolved) {
                        const cat = await this.database.getCat(this.currentClanId, catId);
                        if (cat) {
                            html += `
                                <span class="cat-chip" data-cat-id="${catId}">
                                    <span class="cat-avatar" id="chip_avatar_${catId}"></span>
                                    ${cat.name}
                                </span>
                            `;
                        }
                    }
                    html += '</div>';
                }
                
                html += '</div></div>';
            }
            
            html += '</div></div>';
        }
        
        // Set the HTML content
        container.innerHTML = html;
        
        // Add click handlers for cat chips
        this.attachCatChipHandlers();
        
        // Generate mini sprites for cat chips
        container.querySelectorAll('.cat-chip').forEach(async chip => {
            const catId = chip.dataset.catId;
            const cat = await this.database.getCat(this.currentClanId, catId);
            if (cat) {
                const avatarEl = chip.querySelector(`#chip_avatar_${catId}`);
                if (avatarEl) {
                    const params = this.convertToCatParams(cat);
                    await this.generateMiniSprite(params, avatarEl);
                }
            }
        });
        
        container.innerHTML = html;
        
        // Add click handlers for cat chips
        this.attachCatChipHandlers();
        
        // Generate mini sprites for cat chips
        container.querySelectorAll('.cat-chip').forEach(async chip => {
            const catId = chip.dataset.catId;
            const cat = await this.database.getCat(this.currentClanId, catId);
            if (cat) {
                const avatarEl = chip.querySelector(`#chip_avatar_${catId}`);
                if (avatarEl) {
                    await this.generateMiniSprite(cat, avatarEl);
                }
            }
        });
    }

    async lazyLoadCatSprites(cats) {
        // Load sprites for visible cats first
        const loadFirstBatch = async () => {
            for (let i = 0; i < Math.min(10, cats.length); i++) {
                await this.generateCatSprite(cats[i], `sprite_${cats[i].id}`);
                // Give browser time to breathe
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        };
        
        await loadFirstBatch();
        
        // Load rest in background with requestAnimationFrame
        let index = 10;
        const loadNext = () => {
            if (index < cats.length) {
                this.generateCatSprite(cats[index], `sprite_${cats[index].id}`);
                index++;
                requestAnimationFrame(loadNext);
            }
        };
        
        if (index < cats.length) {
            requestAnimationFrame(loadNext);
        }
    }


    applyFilters() {
        // Debounce filter application for better performance
        clearTimeout(this.filterDebounceTimer);
        this.filterDebounceTimer = setTimeout(() => {
            if (this.currentView === 'timeline') {
                this.loadTimelineData();
            } else if (this.currentView === 'cats') {
                this.renderCatsView();
            }
        }, 300);  // Increased from 150ms to 300ms for better performance
    }

    resetFilters() {
        // Reset all filters
        this.filters = {
            search: '',
            eventTypes: ['birth', 'death', 'ceremony', 'relationship', 'health', 'misc'],
            density: 'all',  // Changed from 'important' to match HTML default
            showDeadCats: false
        };
        
        // Reset UI
        document.getElementById('searchInput').value = '';
        document.getElementById('densitySelect').value = 'all';
        const showDeadCats = document.getElementById('showDeadCats');
        if (showDeadCats) {
            showDeadCats.checked = false;
        }
        
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
        });
        
        this.applyFilters();
    }

    exportTimeline() {
        // Placeholder for export functionality
        this.showToast('Export feature coming soon!');
    }

    showClanSelector(clans) {
        // This is for existing clans in database
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('clanSelector').style.display = 'flex';
        
        const clanList = document.getElementById('clanList');
        let html = '';
        
        for (const clan of clans) {
            // Use displayName if available, otherwise fall back to name
            const clanDisplayName = clan.displayName || clan.name;
            const displayName = clanDisplayName === 'Unknown' ? clanDisplayName : 
                               (clanDisplayName.toLowerCase().endsWith('clan') ? clanDisplayName : `${clanDisplayName}Clan`);
            // Show folder name if different from clan name
            const folderInfo = clan.folderName && clan.folderName !== clanDisplayName 
                ? ` (folder: ${clan.folderName})` 
                : '';
            const lifeGenBadge = clan.isLifeGen ? ' <span style="color: #f59e0b; font-size: 12px; font-weight: bold;">[LifeGen]</span>' : '';
            html += `
                <div class="clan-option" data-clan-id="${clan.id}">
                    <div style="flex: 1;">
                        <div class="clan-name">${displayName}${folderInfo}${lifeGenBadge}</div>
                        <div class="clan-info" style="line-height: 1.5;">
                            <div>${clan.age} moons</div>
                            <div>${clan.totalCats || 0} cats</div>
                            <div>${clan.totalEvents || 0} events</div>
                        </div>
                    </div>
                    <button class="delete-clan-btn" data-clan-id="${clan.id}" style="
                        background: rgba(239, 68, 68, 0.15);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        color: #f87171;
                        padding: 6px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Delete</button>
                </div>
            `;
        }
        
        clanList.innerHTML = html;
        
        // Style clan options to be flex containers
        clanList.querySelectorAll('.clan-option').forEach(option => {
            option.style.display = 'flex';
            option.style.alignItems = 'center';
            option.style.justifyContent = 'space-between';
        });
        
        // Add click handlers for loading clans
        clanList.querySelectorAll('.clan-option').forEach(option => {
            option.addEventListener('click', async (e) => {
                // Don't load if delete button was clicked
                if (e.target.classList.contains('delete-clan-btn')) return;
                
                const clanId = parseInt(option.dataset.clanId);
                await this.loadExistingClan(clanId);
            });
        });
        
        // Add delete handlers
        clanList.querySelectorAll('.delete-clan-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const clanId = parseInt(btn.dataset.clanId);
                const clan = clans.find(c => c.id === clanId);
                
                if (confirm(`Delete ${clan.name}Clan? This cannot be undone.`)) {
                    try {
                        await this.database.clearClan(clanId);
                        this.showToast(`${clan.name}Clan deleted`);
                        
                        // Refresh the list
                        const remainingClans = await this.database.getClans();
                        if (remainingClans.length > 0) {
                            this.showClanSelector(remainingClans);
                        } else {
                            location.reload();
                        }
                    } catch (error) {
                        console.error('Error deleting clan:', error);
                        this.showError('Failed to delete clan');
                    }
                }
            });
        });
    }
    
    showClanSelectorWithFiles(clans, fileMap) {
        // This is for newly uploaded clans - we have the files
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('clanSelector').style.display = 'flex';
        
        const clanList = document.getElementById('clanList');
        let html = '';
        
        for (const clan of clans) {
            html += `
                <div class="clan-option" data-clan="${clan.name}">
                    <div class="clan-name">${clan.name}Clan</div>
                    <div class="clan-info">
                        ${clan.hasEvents ? 'Events ✓' : ''} 
                        ${clan.historyCount > 0 ? `${clan.historyCount} histories` : ''}
                    </div>
                </div>
            `;
        }
        
        clanList.innerHTML = html;
        
        // Add click handlers for new clans with files
        clanList.querySelectorAll('.clan-option').forEach(option => {
            option.addEventListener('click', async () => {
                const clanName = option.dataset.clan;
                document.getElementById('clanSelector').style.display = 'none';
                await this.loadClan(clanName, fileMap);
            });
        });
    }
    
    async loadExistingClan(clanId) {
        try {
            this.currentClanId = clanId;
            document.getElementById('clanSelector').style.display = 'none';
            
            // Get clan info from database
            const clans = await this.database.getClans();
            const clan = clans.find(c => c.id === clanId);
            
            if (clan) {
                // Check for LifeGen data
                this.isLifeGen = clan.isLifeGen || false;
                this.playerCatId = clan.playerCatId || null;
                
                console.log('Loading existing clan:', {
                    name: clan.name,
                    age: clan.age,
                    isLifeGen: clan.isLifeGen,
                    playerCatId: clan.playerCatId
                });
                
                await this.loadTimelineData();
                this.showMainApp({
                    clanName: clan.name,
                    clanAge: clan.age || 0,
                    totalCats: clan.totalCats || 0,
                    livingCats: clan.livingCats || 0,
                    deadCats: clan.deadCats || 0,
                    totalEvents: clan.totalEvents || 0,
                    isLifeGen: clan.isLifeGen || false,
                    playerCatId: clan.playerCatId || null
                });
            }
        } catch (error) {
            console.error('Error loading existing clan:', error);
            this.showError('Failed to load clan from database');
        }
    }

    showMainApp(stats) {
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('clanSelector').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        // Show view toggle and switch clan button now that we have a clan loaded
        const viewToggle = document.getElementById('viewToggle');
        const switchClanBtn = document.getElementById('switchClanBtn');
        
        if (viewToggle) {
            viewToggle.style.display = 'inline-flex'; // Use inline-flex for proper display
        }
        if (switchClanBtn) {
            switchClanBtn.style.display = 'inline-block';
        }
        
        // Store current data for later use
        this.currentData = { stats };
        
        // Update stats with better formatting
        // Hide clan age if no meaningful data (events don't have moon data)
        const clanAgeElement = document.getElementById('clanAge');
        if (clanAgeElement) {
            const ageParent = clanAgeElement.parentElement;
            if (stats.clanAge && stats.clanAge > 0) {
                ageParent.style.display = '';
                clanAgeElement.textContent = `${stats.clanAge} moons`;
            } else {
                ageParent.style.display = 'none'; // Hide if no meaningful age data
            }
        }
        document.getElementById('totalCats').textContent = stats.totalCats;
        document.getElementById('livingCats').textContent = stats.livingCats;
        document.getElementById('totalEvents').textContent = stats.totalEvents;
        
        // Setup switch clan button handler
        if (switchClanBtn) {
            switchClanBtn.onclick = () => {
                this.currentClanId = null;
                this.currentData = null;
                location.reload(); // Reload to go back to clan selector
            };
        }
        
        // Check if this is a LifeGen save
        if (stats.isLifeGen && stats.playerCatId) {
            this.isLifeGen = true;
            this.playerCatId = stats.playerCatId;
            this.enableLifeGenMode();
        }
    }
    
    async enableLifeGenMode() {
        // Show LifeGen indicator
        const brand = document.querySelector('.brand h1');
        if (brand && !brand.querySelector('.lifegen-badge')) {
            brand.innerHTML += ' <span class="lifegen-badge">LifeGen Mode</span>';
        }
        
        // Load player cat data
        this.playerCat = await this.database.getCat(this.currentClanId, this.playerCatId);
        
        // Add mode toggle button if not exists
        this.addModeToggle();
        
        // Add player-specific filters
        this.addPlayerFilters();
        
        // Show player info in stats
        if (this.playerCat) {
            const statsBar = document.querySelector('.stats-bar');
            if (statsBar && !document.getElementById('playerInfo')) {
                const playerInfo = document.createElement('div');
                playerInfo.id = 'playerInfo';
                playerInfo.className = 'stat-item player-info';
                playerInfo.innerHTML = `
                    <span class="stat-label">Your Cat:</span>
                    <span class="stat-value">${this.playerCat.name}</span>
                `;
                statsBar.appendChild(playerInfo);
            }
        }
    }
    
    addModeToggle() {
        // Removed - Personal Journey not needed since events don't have proper moon/timeline data
        return;
    }
    
    addPlayerFilters() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && !document.getElementById('playerFilters')) {
            const filterSection = document.createElement('div');
            filterSection.id = 'playerFilters';
            filterSection.className = 'sidebar-section';
            filterSection.innerHTML = `
                <h3>Player Focus</h3>
                <div class="filter-group">
                    <label class="filter-option">
                        <input type="checkbox" id="playerEventsOnly">
                        <span>My Events Only</span>
                    </label>
                    <label class="filter-option">
                        <input type="checkbox" id="playerInvolved">
                        <span>Events I'm In</span>
                    </label>
                </div>
            `;
            
            // Insert after the search section
            const searchSection = sidebar.querySelector('.sidebar-section');
            if (searchSection) {
                searchSection.after(filterSection);
            }
            
            // Add event listeners
            document.getElementById('playerEventsOnly').addEventListener('change', (e) => {
                this.filters.playerEventsOnly = e.target.checked;
                if (e.target.checked) {
                    document.getElementById('playerInvolved').checked = false;
                    this.filters.playerInvolved = false;
                }
                this.applyFilters();
            });
            
            document.getElementById('playerInvolved').addEventListener('change', (e) => {
                this.filters.playerInvolved = e.target.checked;
                if (e.target.checked) {
                    document.getElementById('playerEventsOnly').checked = false;
                    this.filters.playerEventsOnly = false;
                }
                this.applyFilters();
            });
        }
    }
    
    switchViewMode(mode) {
        this.viewMode = mode;
        
        // Update button states
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Reload timeline with appropriate filter
        if (mode === 'personal') {
            this.filters.playerInvolved = true;
            if (document.getElementById('playerInvolved')) {
                document.getElementById('playerInvolved').checked = true;
            }
        } else {
            this.filters.playerInvolved = false;
            this.filters.playerEventsOnly = false;
            if (document.getElementById('playerInvolved')) {
                document.getElementById('playerInvolved').checked = false;
            }
            if (document.getElementById('playerEventsOnly')) {
                document.getElementById('playerEventsOnly').checked = false;
            }
        }
        
        this.applyFilters();
    }

    showLoading(message) {
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('loadingSection').style.display = 'flex';
        document.getElementById('progressText').textContent = message;
    }

    hideLoading() {
        document.getElementById('loadingSection').style.display = 'none';
    }

    updateProgress(message, percent) {
        document.getElementById('progressText').textContent = message;
        document.getElementById('progressFill').style.width = `${percent}%`;
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ClanGenHistoryExplorer();
});