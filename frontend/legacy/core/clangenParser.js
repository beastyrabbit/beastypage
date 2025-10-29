/**
 * ClanGen Save File Parser
 * Parses ClanGen save files and normalizes data for the history explorer
 */

export class ClanGenParser {
    constructor() {
        this.clanData = null;
        this.cats = new Map();
        this.events = [];
        this.relationships = new Map();
        this.histories = new Map();
        this.isLifeGen = false;
        this.playerCatId = null;
        this.folderName = null;
    }

    /**
     * Parse all files from a ClanGen save folder
     * @param {FileList|File[]} files - Files from folder selection
     * @returns {Object} Parsed and normalized clan data
     */
    async parseFiles(files) {
        const fileMap = this.organizeFiles(files);
        
        // Find available clans
        const clans = this.detectClans(fileMap);
        
        if (clans.length === 0) {
            throw new Error('No valid ClanGen saves found in the selected folder');
        }
        
        return { clans, fileMap };
    }

    /**
     * Parse a specific clan's data
     * @param {string} clanName - Name of the clan to parse
     * @param {Map} fileMap - Organized file map
     * @returns {Object} Complete parsed clan data
     */
    async parseClan(clanName, fileMap) {
        const clanFiles = fileMap.get(clanName);
        if (!clanFiles) {
            throw new Error(`Clan ${clanName} not found`);
        }
        
        // Debug: Log what files we have for this clan
        console.log(`Parsing clan ${clanName}:`, {
            hasMain: !!clanFiles.main,
            hasCats: !!clanFiles.cats,
            hasEvents: !!clanFiles.events,
            historyCount: Object.keys(clanFiles.history || {}).length,
            relationshipCount: Object.keys(clanFiles.relationships || {}).length
        });

        // Reset data
        this.cats.clear();
        this.events = [];
        this.relationships.clear();
        this.histories.clear();
        this.folderName = clanName; // Store the folder name as fallback

        // Parse main clan file
        if (clanFiles.main) {
            const content = await this.readFileAsText(clanFiles.main);
            this.clanData = JSON.parse(content);
            
            // Detect LifeGen save
            if (this.clanData.your_cat) {
                this.isLifeGen = true;
                this.playerCatId = String(this.clanData.your_cat);
                console.log(`LifeGen save detected! Player cat ID: ${this.playerCatId}`);
            }
            
            // Debug logging
            console.log('Clan data loaded:', {
                name: this.clanData.clanname,
                age: this.clanData.clanage,
                clan_age: this.clanData.clan_age,
                your_cat: this.clanData.your_cat,
                isLifeGen: this.isLifeGen
            });
        } else {
            console.log(`No main clan file found for ${clanName}, using defaults`);
            // Create minimal clan data with folder name
            this.clanData = {
                clanname: clanName,
                clanage: 0
            };
        }

        // Parse clan_cats.json
        if (clanFiles.cats) {
            const content = await this.readFileAsText(clanFiles.cats);
            const catsArray = JSON.parse(content);
            this.parseCats(catsArray);
        }

        // Parse events.json
        if (clanFiles.events) {
            const content = await this.readFileAsText(clanFiles.events);
            const eventsArray = JSON.parse(content);
            this.parseEvents(eventsArray);
        }

        // Parse history files
        for (const [catId, file] of Object.entries(clanFiles.history || {})) {
            const content = await this.readFileAsText(file);
            const history = JSON.parse(content);
            this.histories.set(catId, history);
        }

        // Parse relationship files
        console.log(`Processing ${Object.keys(clanFiles.relationships || {}).length} relationship files`);
        for (const [catId, file] of Object.entries(clanFiles.relationships || {})) {
            const content = await this.readFileAsText(file);
            const relations = JSON.parse(content);
            this.parseRelationships(catId, relations);
        }

        // Build normalized data structure
        const normalizedData = this.buildNormalizedData();
        console.log('Parser returning normalized data:', {
            clanName: normalizedData.stats?.clanName,
            relationships: normalizedData.relationships?.length || 0,
            relationshipSample: normalizedData.relationships?.[0]
        });
        return normalizedData;
    }

    /**
     * Organize files into a structured map
     */
    organizeFiles(files) {
        const fileMap = new Map();
        console.log(`Organizing ${files.length} files...`);
        
        // First pass: identify main clan JSON files at root level
        const mainClanFiles = new Map();
        for (const file of files) {
            const path = file.webkitRelativePath || file.name;
            const parts = path.split('/');
            const fileName = parts[parts.length - 1];
            
            // Check for main clan files (e.g., Stoneclan.json, Dawnclan.json)
            if (fileName.endsWith('clan.json') && !fileName.includes('_')) {
                // Extract clan name from filename (remove 'clan.json' suffix)
                const clanNameFromFile = fileName.replace(/clan\.json$/i, '');
                mainClanFiles.set(clanNameFromFile.toLowerCase(), file);
                console.log(`Found main clan file: ${fileName} -> ${clanNameFromFile.toLowerCase()}`);
            }
        }
        
        // Second pass: organize files by folder structure
        for (const file of files) {
            const path = file.webkitRelativePath || file.name;
            const parts = path.split('/');
            
            // Skip if not enough path parts
            if (parts.length < 2) continue;
            
            const fileName = parts[parts.length - 1];
            
            // Skip main clan files in this pass
            if (fileName.endsWith('clan.json') && !fileName.includes('_')) {
                continue;
            }
            
            // Detect clan folders
            let clanName = null;
            
            // Try multiple detection methods
            // Method 1: Look for 'saves' folder
            const savesIndex = parts.findIndex(p => p.toLowerCase() === 'saves');
            if (savesIndex !== -1 && parts[savesIndex + 1]) {
                clanName = parts[savesIndex + 1];
            }
            
            // Method 2: Look for known clan files
            if (!clanName && (fileName === 'clan_cats.json' || fileName === 'events.json' || 
                fileName.endsWith('_history.json') || fileName.endsWith('_relations.json'))) {
                // Use the parent folder as clan name
                const parentFolder = parts[parts.length - 2];
                
                // If parent is relationships/history subfolder, go up one more level
                if (parentFolder === 'relationships' || parentFolder === 'history') {
                    if (parts.length > 2) {
                        clanName = parts[parts.length - 3];
                        console.log(`Setting clanName to ${clanName} from path ${path} (went up from ${parentFolder})`);
                    }
                } else {
                    clanName = parentFolder;
                }
            }
            
            // Method 3: For relationship/history files in subfolders
            if (!clanName && (parts.includes('relationships') || parts.includes('history'))) {
                // Go back from relationships/history folder to find clan folder
                const relIndex = Math.max(parts.indexOf('relationships'), parts.indexOf('history'));
                if (relIndex > 0) {
                    clanName = parts[relIndex - 1];
                    console.log(`Detected clan ${clanName} from relationships/history path: ${path}`);
                }
            }
            
            if (!clanName) continue;
            
            if (!fileMap.has(clanName)) {
                fileMap.set(clanName, {
                    main: null,
                    cats: null,
                    events: null,
                    history: {},
                    relationships: {}
                });
            }
            
            const clanFiles = fileMap.get(clanName);
            
            // Categorize files
            if (fileName === 'clan_cats.json') {
                clanFiles.cats = file;
                console.log(`Found cats file for ${clanName}`);
            } else if (fileName === 'events.json') {
                clanFiles.events = file;
            } else if (fileName.endsWith('_history.json')) {
                const catId = fileName.replace('_history.json', '');
                clanFiles.history[catId] = file;
                console.log(`Found history file for cat ${catId} in ${clanName}`);
            } else if (fileName.endsWith('_relations.json')) {
                const catId = fileName.replace('_relations.json', '');
                clanFiles.relationships[catId] = file;
                console.log(`Found relations file for cat ${catId} in ${clanName}`);
            }
        }
        
        // Third pass: link main clan files to their folders
        for (const [clanName, clanFiles] of fileMap.entries()) {
            // Skip non-clan folders
            if (clanName === 'settings.json' || clanName === 'currentclan.txt') {
                continue;
            }
            
            // Try to find matching main clan file
            const cleanName = clanName.toLowerCase()
                .replace(' - copy', '')
                .replace('-copy', '')
                .replace(' ', '')
                .trim();
            
            // Look for exact match first
            let matched = false;
            
            // Try exact match with clan name
            if (mainClanFiles.has(cleanName)) {
                clanFiles.main = mainClanFiles.get(cleanName);
                console.log(`Linked ${cleanName}clan.json to folder ${clanName}`);
                matched = true;
            } else if (mainClanFiles.has(cleanName + 'clan')) {
                clanFiles.main = mainClanFiles.get(cleanName + 'clan');
                console.log(`Linked ${cleanName + 'clan'}clan.json to folder ${clanName}`);
                matched = true;
            } else {
                // Special handling for specific clans
                if (cleanName === 'stone' && mainClanFiles.has('stone')) {
                    clanFiles.main = mainClanFiles.get('stone');
                    matched = true;
                } else if (cleanName === 'dawn' && mainClanFiles.has('dawn')) {
                    clanFiles.main = mainClanFiles.get('dawn');
                    matched = true;
                } else if (cleanName === 'old' && mainClanFiles.has('old')) {
                    clanFiles.main = mainClanFiles.get('old');
                    matched = true;
                }
                
                if (matched) {
                    console.log(`Linked main clan file to folder ${clanName}`);
                }
            }
            
            if (!matched) {
                console.log(`No main clan file found for folder: ${clanName}`);
            }
        }
        
        return fileMap;
    }

    /**
     * Detect available clans from file map
     */
    detectClans(fileMap) {
        const clans = [];
        
        for (const [name, files] of fileMap.entries()) {
            // Must have at least clan_cats.json to be valid
            if (files.cats) {
                clans.push({
                    name,
                    hasMain: !!files.main,
                    hasEvents: !!files.events,
                    historyCount: Object.keys(files.history).length,
                    relationshipCount: Object.keys(files.relationships).length
                });
                console.log(`Found clan: ${name} (main: ${!!files.main}, cats: ${!!files.cats}, events: ${!!files.events})`);
            } else {
                console.log(`Skipping folder ${name} - no clan_cats.json found`);
            }
        }
        
        if (clans.length === 0) {
            console.error('No valid clans found. FileMap contents:', Array.from(fileMap.keys()));
        }
        
        return clans;
    }

    /**
     * Parse cats array into Map
     */
    parseCats(catsArray) {
        for (const cat of catsArray) {
            // Normalize cat data
            const normalizedCat = {
                id: String(cat.ID),  // Ensure ID is string for consistency
                name: this.getCatName(cat),
                nameLower: this.getCatName(cat).toLowerCase(),
                status: cat.status,
                gender: cat.gender,
                pronouns: cat.pronouns?.[0] || {},
                age: cat.moons,
                birthMoon: this.calculateBirthMoon(cat),
                deathMoon: cat.dead ? (cat.moons + (cat.dead_moons || 0)) : null,
                isDead: cat.dead,
                trait: cat.trait,
                backstory: cat.backstory,
                
                // Appearance
                pelt: {
                    name: cat.pelt_name,
                    color: cat.pelt_color,
                    length: cat.pelt_length,
                    pattern: cat.pattern
                },
                eyes: {
                    color1: cat.eye_colour,
                    color2: cat.eye_colour2
                },
                skin: cat.skin,
                tint: cat.tint,
                tortie: {
                    enabled: cat.tortie_base ? true : false,
                    base: cat.tortie_base,
                    color: cat.tortie_color,
                    pattern: cat.tortie_pattern
                },
                
                // Sprites
                sprites: {
                    kitten: cat.sprite_kitten,
                    adolescent: cat.sprite_adolescent,
                    adult: cat.sprite_adult,
                    senior: cat.sprite_senior,
                    para_adult: cat.sprite_para_adult
                },
                
                // Relationships
                parent1: cat.parent1,
                parent2: cat.parent2,
                adoptiveParents: cat.adoptive_parents || [],
                mentor: cat.mentor,
                formerMentor: cat.former_mentor || [],
                apprentice: cat.current_apprentice || [],
                formerApprentices: cat.former_apprentices || [],
                mate: cat.mate || [],
                
                // Other
                skills: cat.skill_dict,
                scars: cat.scars || [],
                accessories: cat.accessories || [],
                experience: cat.experience || 0
            };
            
            // Store with string ID for consistency
            this.cats.set(String(cat.ID), normalizedCat);
        }
    }

    /**
     * Parse events array
     */
    parseEvents(eventsArray) {
        let eventId = 0;
        
        // ClanGen events don't have moon numbers - they're stored chronologically
        // We'll store them with their index position for ordering
        for (let i = 0; i < eventsArray.length; i++) {
            const event = eventsArray[i];
            
            // Determine event type from text or types array
            const eventType = this.determineEventType(event);
            const importance = this.calculateEventImportance(event);
            const catsInvolved = event.cats_involved || [];
            
            // Check if player is involved (for LifeGen)
            // Convert both to strings for comparison
            const playerIdStr = String(this.playerCatId);
            const catsInvolvedStr = catsInvolved.map(id => String(id));
            const involvesPlayer = this.isLifeGen && 
                this.playerCatId && 
                catsInvolvedStr.includes(playerIdStr);
            
            this.events.push({
                id: `event_${eventId++}`,
                text: event.text,
                types: event.types || [],
                eventType,
                importance,
                catsInvolved,
                chronologicalIndex: i,  // Store original position
                totalEvents: eventsArray.length,  // Store total for context
                moon: null,  // No moon data available
                involvesPlayer,
                isPlayerPrimary: involvesPlayer && String(catsInvolved[0]) === playerIdStr
            });
        }
    }

    /**
     * Parse relationships for a cat
     */
    parseRelationships(catId, relations) {
        const catRelations = [];
        
        console.log(`Parsing ${relations.length} relationships for cat ${catId}`);
        
        for (const relation of relations) {
            catRelations.push({
                fromId: relation.cat_from_id,
                toId: relation.cat_to_id,
                isMate: relation.mates,
                isFamily: relation.family,
                romanticLove: relation.romantic_love,
                platonicLike: relation.platonic_like,
                dislike: relation.dislike,
                admiration: relation.admiration,
                trust: relation.trust,
                log: relation.log || []
            });
        }
        
        this.relationships.set(catId, catRelations);
        console.log(`Stored ${catRelations.length} relationships for cat ${catId}`);
    }

    /**
     * Build normalized data structure for the app
     */
    buildNormalizedData() {
        // Calculate clan statistics - handle both uppercase and lowercase
        // Use folder name as fallback if clan data is missing
        const clanName = this.clanData?.clanname || this.clanData?.clanName || this.folderName || 'Unknown';
        // Check all possible clan age property names
        // Note: clan_age in LifeGen is text like "established", so prefer clanage which is numeric
        let clanAge = this.clanData?.clanage || this.clanData?.clanAge || 0;
        
        // Only use clan_age if it's numeric
        if (!clanAge && this.clanData?.clan_age && typeof this.clanData.clan_age === 'number') {
            clanAge = this.clanData.clan_age;
        }
        
        // Validate player cat exists if this is LifeGen
        let validatedPlayerCatId = null;
        if (this.isLifeGen && this.playerCatId) {
            // Try both string and number versions of the ID
            const playerIdStr = String(this.playerCatId);
            const playerIdNum = Number(this.playerCatId);
            
            if (this.cats.has(playerIdStr)) {
                validatedPlayerCatId = playerIdStr;
            } else if (this.cats.has(playerIdNum)) {
                validatedPlayerCatId = playerIdNum;
            } else {
                console.warn(`LifeGen player cat ${this.playerCatId} not found in cats list. Available IDs:`, Array.from(this.cats.keys()).slice(0, 10));
                this.isLifeGen = false;
            }
        }
        
        const stats = {
            clanName: clanName,
            folderName: this.folderName, // Pass folder name for unique identification
            clanAge: clanAge,
            biome: this.clanData?.biome || 'Unknown',
            totalCats: this.cats.size,
            livingCats: Array.from(this.cats.values()).filter(c => !c.isDead).length,
            deadCats: Array.from(this.cats.values()).filter(c => c.isDead).length,
            totalEvents: this.events.length,
            isLifeGen: this.isLifeGen,
            playerCatId: validatedPlayerCatId
        };
        
        console.log('Final stats built:', stats);

        // Build family connections
        const families = this.buildFamilyConnections();

        // Build timeline
        const timeline = this.buildTimeline();

        const result = {
            clan: this.clanData,
            stats,
            cats: Array.from(this.cats.values()),
            events: this.events,
            relationships: Array.from(this.relationships.entries()).map(([catId, rels]) => ({
                catId,
                relations: rels
            })),
            histories: Array.from(this.histories.entries()).map(([catId, hist]) => ({
                catId,
                history: hist
            })),
            families,
            timeline
        };
        
        console.log('Building normalized data - relationships:', {
            count: this.relationships.size,
            keys: Array.from(this.relationships.keys()),
            firstEntry: this.relationships.entries().next().value
        });
        
        return result;
    }

    /**
     * Build family tree connections
     */
    buildFamilyConnections() {
        const connections = [];
        
        for (const cat of this.cats.values()) {
            // Parent connections
            if (cat.parent1) {
                connections.push({
                    type: 'parent',
                    from: cat.parent1,
                    to: cat.id
                });
            }
            if (cat.parent2) {
                connections.push({
                    type: 'parent',
                    from: cat.parent2,
                    to: cat.id
                });
            }
            
            // Adoptive parent connections
            for (const adoptiveParent of cat.adoptiveParents) {
                connections.push({
                    type: 'adoptive',
                    from: adoptiveParent,
                    to: cat.id
                });
            }
            
            // Mate connections
            for (const mate of cat.mate) {
                connections.push({
                    type: 'mate',
                    from: cat.id,
                    to: mate
                });
            }
            
            // Mentor connections
            if (cat.mentor) {
                connections.push({
                    type: 'mentor',
                    from: cat.mentor,
                    to: cat.id
                });
            }
        }
        
        return connections;
    }

    /**
     * Build timeline from cat history files only (moon-based events)
     */
    buildTimeline() {
        const moonEvents = new Map();
        
        // Process history files which DO have moon data!
        for (const [catId, history] of this.histories.entries()) {
            const cat = this.cats.get(catId);
            const catName = cat ? cat.name : `Cat ${catId}`;
            
            // Add beginning event (birth/joining)
            if (history.beginning && history.beginning.moon !== undefined) {
                const moon = history.beginning.moon;
                if (!moonEvents.has(moon)) {
                    moonEvents.set(moon, []);
                }
                
                const birthText = history.beginning.clan_born 
                    ? `${catName} was born in the clan`
                    : `${catName} joined the clan at age ${history.beginning.age} moons`;
                    
                moonEvents.get(moon).push({
                    text: birthText,
                    moon: moon,
                    eventType: history.beginning.clan_born ? 'birth' : 'new_cat',
                    catsInvolved: [catId],
                    fromHistory: true,
                    importance: 'high'
                });
            }
            
            // Add apprentice ceremony
            if (history.app_ceremony && history.app_ceremony.moon !== undefined) {
                const moon = history.app_ceremony.moon;
                if (!moonEvents.has(moon)) {
                    moonEvents.set(moon, []);
                }
                
                moonEvents.get(moon).push({
                    text: `${catName} became an apprentice (honored for ${history.app_ceremony.honor})`,
                    moon: moon,
                    eventType: 'ceremony',
                    catsInvolved: [catId],
                    fromHistory: true,
                    importance: 'high'
                });
            }
            
            // Add leader ceremony
            if (history.lead_ceremony && history.lead_ceremony.moon !== undefined) {
                const moon = history.lead_ceremony.moon;
                if (!moonEvents.has(moon)) {
                    moonEvents.set(moon, []);
                }
                
                moonEvents.get(moon).push({
                    text: `${catName} became leader`,
                    moon: moon,
                    eventType: 'ceremony',
                    catsInvolved: [catId],
                    fromHistory: true,
                    importance: 'high'
                });
            }
            
            // Add death events
            if (history.died_by && Array.isArray(history.died_by)) {
                for (const death of history.died_by) {
                    if (death.moon !== undefined) {
                        const moon = death.moon;
                        if (!moonEvents.has(moon)) {
                            moonEvents.set(moon, []);
                        }
                        
                        moonEvents.get(moon).push({
                            text: death.text.replace('m_c', catName),
                            moon: moon,
                            eventType: 'death',
                            catsInvolved: [catId, death.involved].filter(Boolean),
                            fromHistory: true,
                            importance: 'high'
                        });
                    }
                }
            }
            
            // Add scar events
            if (history.scar_events && Array.isArray(history.scar_events)) {
                for (const scar of history.scar_events) {
                    if (scar.moon !== undefined) {
                        const moon = scar.moon;
                        if (!moonEvents.has(moon)) {
                            moonEvents.set(moon, []);
                        }
                        
                        moonEvents.get(moon).push({
                            text: scar.text ? scar.text.replace('m_c', catName) : `${catName} got a scar`,
                            moon: moon,
                            eventType: 'health',
                            catsInvolved: [catId, scar.involved].filter(Boolean),
                            fromHistory: true,
                            importance: 'medium'
                        });
                    }
                }
            }
        }
        
        // If we have moon events, create a proper timeline
        if (moonEvents.size > 0) {
            const timeline = [];
            const sortedMoons = Array.from(moonEvents.keys()).sort((a, b) => a - b);
            
            for (const moon of sortedMoons) {
                timeline.push({
                    moon: moon,
                    events: moonEvents.get(moon)
                });
            }
            
            return timeline;
        } else {
            // Return empty timeline if no history data
            return [];
        }
    }

    // Helper methods
    getCatName(cat) {
        const prefix = cat.name_prefix || '';
        const suffix = cat.name_suffix || '';
        return prefix + suffix;
    }

    calculateBirthMoon(cat) {
        // If clan age is known, calculate birth moon
        if (this.clanData?.clanage) {
            return Math.max(0, this.clanData.clanage - cat.moons);
        }
        return null;
    }

    determineEventType(event) {
        const text = event.text.toLowerCase();
        const types = event.types || [];
        
        // Check types array first
        if (types.includes('birth')) return 'birth';
        if (types.includes('death')) return 'death';
        if (types.includes('ceremony')) return 'ceremony';
        if (types.includes('relation')) return 'relationship';
        if (types.includes('health')) return 'health';
        
        // Fallback to text analysis
        if (text.includes('born') || text.includes('kit')) return 'birth';
        if (text.includes('died') || text.includes('death')) return 'death';
        if (text.includes('ceremony') || text.includes('apprentice') || text.includes('warrior')) return 'ceremony';
        if (text.includes('mate') || text.includes('love') || text.includes('friend')) return 'relationship';
        if (text.includes('sick') || text.includes('injured') || text.includes('healed')) return 'health';
        
        return 'misc';
    }

    calculateEventImportance(event) {
        const types = event.types || [];
        
        if (types.includes('death') || types.includes('birth')) return 'high';
        if (types.includes('ceremony') || types.includes('alert')) return 'medium';
        
        return 'low';
    }

    extractMoonFromEvent(event) {
        // ClanGen events don't have moon numbers, so we need to distribute them
        // For now, return null and handle distribution in buildNormalizedData
        return null;
    }

    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}