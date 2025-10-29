/**
 * ClanGen IndexedDB Database Layer
 * Manages client-side storage and caching for ClanGen data
 */

export class ClanGenDatabase {
    constructor() {
        this.dbName = 'ClanGenHistory';
        this.dbVersion = 5; // Force new schema for folder-based uniqueness
        this.db = null;
    }

    /**
     * Initialize and open the database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error('Failed to open IndexedDB'));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                this.createStores(db);
            };
        });
    }

    /**
     * Create object stores and indexes
     */
    createStores(db) {
        // Clans store
        if (!db.objectStoreNames.contains('clans')) {
            const clansStore = db.createObjectStore('clans', { keyPath: 'id', autoIncrement: true });
            clansStore.createIndex('byName', 'name', { unique: false }); // Allow duplicates for different folders
            clansStore.createIndex('byDisplayName', 'displayName', { unique: false });
            clansStore.createIndex('byLastOpened', 'lastOpened', { unique: false });
        }

        // Cats store
        if (!db.objectStoreNames.contains('cats')) {
            const catsStore = db.createObjectStore('cats', { keyPath: 'compositeId' });
            catsStore.createIndex('byClanId', 'clanId', { unique: false });
            catsStore.createIndex('byName', 'nameLower', { unique: false });
            catsStore.createIndex('byStatus', 'status', { unique: false });
            catsStore.createIndex('byBirthMoon', 'birthMoon', { unique: false });
            catsStore.createIndex('byDeathMoon', 'deathMoon', { unique: false });
        }

        // Events store
        if (!db.objectStoreNames.contains('events')) {
            const eventsStore = db.createObjectStore('events', { keyPath: 'compositeId' });
            eventsStore.createIndex('byClanId', 'clanId', { unique: false });
            eventsStore.createIndex('byMoon', 'moon', { unique: false });
            eventsStore.createIndex('byType', 'eventType', { unique: false });
            eventsStore.createIndex('byImportance', 'importance', { unique: false });
            eventsStore.createIndex('byCatId', 'catsInvolved', { unique: false, multiEntry: true });
        }

        // Relationships store
        if (!db.objectStoreNames.contains('relationships')) {
            const relStore = db.createObjectStore('relationships', { keyPath: 'compositeId' });
            relStore.createIndex('byClanId', 'clanId', { unique: false });
            relStore.createIndex('byCatId', 'catId', { unique: false });
            relStore.createIndex('byOtherCatId', 'otherCatId', { unique: false });
            relStore.createIndex('byType', 'type', { unique: false });
        }

        // Sprites cache store
        if (!db.objectStoreNames.contains('sprites')) {
            const spritesStore = db.createObjectStore('sprites', { keyPath: 'cacheKey' });
            spritesStore.createIndex('byCatId', 'catId', { unique: false });
            spritesStore.createIndex('byLastUsed', 'lastUsed', { unique: false });
            spritesStore.createIndex('byCreated', 'created', { unique: false });
        }

        // Timeline cache store
        if (!db.objectStoreNames.contains('timeline')) {
            const timelineStore = db.createObjectStore('timeline', { keyPath: 'compositeId' });
            timelineStore.createIndex('byClanId', 'clanId', { unique: false });
            timelineStore.createIndex('byMoon', 'moon', { unique: false });
        }
    }

    /**
     * Save clan data to database
     */
    async saveClan(clanData) {
        const clanId = await this.saveClanInfo(clanData.clan, clanData.stats);
        
        // Save cats with clan reference
        await this.saveCats(clanId, clanData.cats);
        
        // Save events
        await this.saveEvents(clanId, clanData.events);
        
        // Save relationships
        await this.saveRelationships(clanId, clanData.relationships);
        
        // Save timeline
        await this.saveTimeline(clanId, clanData.timeline);
        
        return clanId;
    }

    /**
     * Save clan info
     */
    async saveClanInfo(clan, stats) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clans'], 'readwrite');
            const store = transaction.objectStore('clans');
            
            // When loading from folders, check for existing entry by folderName
            if (stats.folderName) {
                // First check if clan with this folder name already exists
                const checkRequest = store.index('byName').getAll();
                
                checkRequest.onsuccess = () => {
                    const allClans = checkRequest.result;
                    const existingClan = allClans.find(c => c.folderName === stats.folderName);
                    
                    const clanRecord = {
                        name: stats.folderName, // Use folder name as unique identifier
                        displayName: stats.clanName || stats.folderName || 'Unknown', // Display the actual clan name
                        folderName: stats.folderName, // Store folder name separately
                        age: stats.clanAge || 0,
                        biome: stats.biome || 'Unknown',
                        totalCats: stats.totalCats || 0,
                        livingCats: stats.livingCats || 0,
                        deadCats: stats.deadCats || 0,
                        totalEvents: stats.totalEvents || 0,
                        lastOpened: Date.now(),
                        isLifeGen: stats.isLifeGen || false,
                        playerCatId: stats.playerCatId || null,
                        data: clan
                    };
                    
                    if (existingClan) {
                        // Update existing clan
                        clanRecord.id = existingClan.id; // Keep existing ID
                        console.log('Updating existing clan from folder in DB:', clanRecord);
                        
                        const request = store.put(clanRecord);
                        
                        request.onsuccess = () => {
                            resolve(existingClan.id);
                        };
                        
                        request.onerror = () => {
                            reject(new Error('Failed to update clan info'));
                        };
                    } else {
                        // Add new clan
                        console.log('Adding new clan from folder to DB:', clanRecord);
                        
                        const request = store.add(clanRecord);
                        
                        request.onsuccess = () => {
                            resolve(request.result);
                        };
                        
                        request.onerror = () => {
                            reject(new Error('Failed to add clan info'));
                        };
                    }
                };
                
                checkRequest.onerror = () => {
                    reject(new Error('Failed to check for existing clan'));
                };
            } else {
                // Original logic for non-folder based saves
                const lookupName = stats.clanName;
                const checkRequest = store.index('byName').get(lookupName);
                
                checkRequest.onsuccess = () => {
                    const existingClan = checkRequest.result;
                    
                    if (existingClan) {
                        // Update existing clan
                        const clanRecord = {
                            id: existingClan.id, // Keep existing ID
                            name: lookupName,
                            displayName: stats.clanName || 'Unknown',
                            age: stats.clanAge || 0,
                            biome: stats.biome || 'Unknown',
                            totalCats: stats.totalCats || 0,
                            livingCats: stats.livingCats || 0,
                            deadCats: stats.deadCats || 0,
                            totalEvents: stats.totalEvents || 0,
                            lastOpened: Date.now(),
                            isLifeGen: stats.isLifeGen || false,
                            playerCatId: stats.playerCatId || null,
                            data: clan
                        };
                        
                        console.log('Updating clan in DB:', clanRecord);
                        
                        const request = store.put(clanRecord);
                        
                        request.onsuccess = () => {
                            resolve(existingClan.id);
                        };
                        
                        request.onerror = () => {
                            reject(new Error('Failed to update clan info'));
                        };
                    } else {
                        // Add new clan
                        const clanRecord = {
                            name: lookupName,
                            displayName: stats.clanName || 'Unknown',
                            age: stats.clanAge || 0,
                            biome: stats.biome || 'Unknown',
                            totalCats: stats.totalCats || 0,
                            livingCats: stats.livingCats || 0,
                            deadCats: stats.deadCats || 0,
                            totalEvents: stats.totalEvents || 0,
                            lastOpened: Date.now(),
                            isLifeGen: stats.isLifeGen || false,
                            playerCatId: stats.playerCatId || null,
                            data: clan
                        };
                        
                        console.log('Adding new clan to DB:', clanRecord);
                        
                        const request = store.add(clanRecord);
                        
                        request.onsuccess = () => {
                            resolve(request.result);
                        };
                        
                        request.onerror = () => {
                            reject(new Error('Failed to add clan info'));
                        };
                    }
                };
                
                checkRequest.onerror = () => {
                    reject(new Error('Failed to check existing clan'));
                };
            }
        });
    }

    /**
     * Save cats in batches
     */
    async saveCats(clanId, cats) {
        const batchSize = 100;
        
        for (let i = 0; i < cats.length; i += batchSize) {
            const batch = cats.slice(i, i + batchSize);
            await this.saveCatBatch(clanId, batch);
        }
    }

    async saveCatBatch(clanId, cats) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cats'], 'readwrite');
            const store = transaction.objectStore('cats');
            
            for (const cat of cats) {
                const catRecord = {
                    ...cat,
                    compositeId: `${clanId}_${cat.id}`,
                    clanId
                };
                store.put(catRecord);
            }
            
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error('Failed to save cats'));
        });
    }

    /**
     * Save events in batches
     */
    async saveEvents(clanId, events) {
        const batchSize = 200;
        
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            await this.saveEventBatch(clanId, batch);
        }
    }

    async saveEventBatch(clanId, events) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            for (const event of events) {
                const eventRecord = {
                    ...event,
                    compositeId: `${clanId}_${event.id}`,
                    clanId
                };
                store.put(eventRecord);
            }
            
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error('Failed to save events'));
        });
    }

    /**
     * Save relationships
     */
    async saveRelationships(clanId, relationships) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['relationships'], 'readwrite');
            const store = transaction.objectStore('relationships');
            
            for (const { catId, relations } of relationships) {
                for (const rel of relations) {
                    const relRecord = {
                        compositeId: `${clanId}_${rel.fromId}_${rel.toId}`,
                        clanId,
                        catId: rel.fromId,
                        otherCatId: rel.toId,
                        type: rel.isMate ? 'mate' : rel.isFamily ? 'family' : 'friend',
                        ...rel
                    };
                    store.put(relRecord);
                }
            }
            
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error('Failed to save relationships'));
        });
    }

    /**
     * Save timeline
     */
    async saveTimeline(clanId, timeline) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['timeline'], 'readwrite');
            const store = transaction.objectStore('timeline');
            
            for (const entry of timeline) {
                const timelineRecord = {
                    compositeId: `${clanId}_${entry.moon}`,
                    clanId,
                    moon: entry.moon,
                    events: entry.events
                };
                store.put(timelineRecord);
            }
            
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error('Failed to save timeline'));
        });
    }

    /**
     * Get player-specific events for LifeGen mode
     */
    async getPlayerEvents(clanId, playerCatId, filters = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const index = store.index('byClanId');
            
            const request = index.getAll(clanId);
            
            request.onsuccess = () => {
                let results = request.result || [];
                
                // Filter for events involving the player
                results = results.filter(event => 
                    event.involvesPlayer || 
                    (event.catsInvolved && event.catsInvolved.includes(playerCatId))
                );
                
                // Apply additional filters
                if (filters.onlyPrimary) {
                    results = results.filter(e => e.isPlayerPrimary);
                }
                
                if (filters.eventTypes && filters.eventTypes.length > 0) {
                    results = results.filter(e => 
                        filters.eventTypes.includes(e.eventType)
                    );
                }
                
                // Sort by moon/time
                results.sort((a, b) => (a.moon || 0) - (b.moon || 0));
                
                resolve(results);
            };
            
            request.onerror = () => reject(new Error('Failed to get player events'));
        });
    }
    
    /**
     * Get all events for a clan
     */
    async getEvents(clanId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const index = store.index('byClanId');
            
            const request = index.getAll(clanId);
            
            request.onsuccess = () => {
                const events = request.result || [];
                // Sort by chronological index if available
                events.sort((a, b) => {
                    if (a.chronologicalIndex !== undefined && b.chronologicalIndex !== undefined) {
                        return a.chronologicalIndex - b.chronologicalIndex;
                    }
                    return 0;
                });
                resolve(events);
            };
            
            request.onerror = () => reject(new Error('Failed to get events'));
        });
    }
    
    /**
     * Get timeline range
     */
    async getTimelineRange(clanId, fromMoon, toMoon, filters = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['timeline'], 'readonly');
            const store = transaction.objectStore('timeline');
            const index = store.index('byClanId');
            
            // Simply get all entries for the clan first
            const request = index.getAll(clanId);
            
            request.onsuccess = () => {
                let results = request.result || [];
                
                // Filter by moon range
                results = results.filter(entry => 
                    entry.moon >= fromMoon && entry.moon <= toMoon
                );
                
                // Apply other filters
                results = results.map(entry => {
                    let filteredEvents = entry.events || [];
                    
                    if (filters.eventTypes && filters.eventTypes.length > 0) {
                        filteredEvents = filteredEvents.filter(e => 
                            filters.eventTypes.includes(e.eventType)
                        );
                    }
                    
                    if (filters.importance) {
                        filteredEvents = filteredEvents.filter(e => 
                            e.importance === filters.importance || 
                            (filters.importance === 'important' && e.importance !== 'low')
                        );
                    }
                    
                    return {
                        moon: entry.moon,
                        events: filteredEvents
                    };
                }).filter(entry => entry.events.length > 0);
                
                // Sort by moon
                results.sort((a, b) => a.moon - b.moon);
                
                resolve(results);
            };
            
            request.onerror = () => reject(new Error('Failed to get timeline'));
        });
    }

    /**
     * Get cat by ID
     */
    async getCat(clanId, catId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cats'], 'readonly');
            const store = transaction.objectStore('cats');
            
            const request = store.get(`${clanId}_${catId}`);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to get cat'));
            };
        });
    }

    /**
     * Get all cats for a clan
     */
    async getCats(clanId, filters = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cats'], 'readonly');
            const store = transaction.objectStore('cats');
            const index = store.index('byClanId');
            
            const request = index.getAll(clanId);
            
            request.onsuccess = () => {
                let cats = request.result;
                
                // Apply filters
                if (filters.status) {
                    cats = cats.filter(c => c.status === filters.status);
                }
                
                if (filters.showDead === false) {
                    cats = cats.filter(c => !c.isDead);
                }
                
                if (filters.search) {
                    const searchLower = filters.search.toLowerCase();
                    cats = cats.filter(c => 
                        c.nameLower.includes(searchLower)
                    );
                }
                
                resolve(cats);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to get cats'));
            };
        });
    }

    /**
     * Search cats by name
     */
    async searchCats(clanId, searchText) {
        const searchLower = searchText.toLowerCase();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cats'], 'readonly');
            const store = transaction.objectStore('cats');
            const index = store.index('byClanId');
            
            const request = index.openCursor(IDBKeyRange.only(clanId));
            const results = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const cat = cursor.value;
                    if (cat.nameLower.includes(searchLower)) {
                        results.push(cat);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            
            request.onerror = () => reject(new Error('Failed to search cats'));
        });
    }

    /**
     * Get cat relationships
     */
    async getCatRelationships(clanId, catId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['relationships'], 'readonly');
            const store = transaction.objectStore('relationships');
            const index = store.index('byCatId');
            
            const request = index.getAll(catId);
            
            request.onsuccess = () => {
                const relations = request.result.filter(r => r.clanId === clanId);
                resolve(relations);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to get relationships'));
            };
        });
    }

    /**
     * Save sprite to cache
     */
    async saveSprite(catId, spriteData, cacheKey) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sprites'], 'readwrite');
            const store = transaction.objectStore('sprites');
            
            const spriteRecord = {
                cacheKey,
                catId,
                data: spriteData,
                created: Date.now(),
                lastUsed: Date.now()
            };
            
            const request = store.put(spriteRecord);
            
            request.onsuccess = resolve;
            request.onerror = () => reject(new Error('Failed to save sprite'));
        });
    }

    /**
     * Get sprite from cache
     */
    async getSprite(cacheKey) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sprites'], 'readonly');
            const store = transaction.objectStore('sprites');
            
            const request = store.get(cacheKey);
            
            request.onsuccess = () => {
                const sprite = request.result;
                if (sprite) {
                    // Update last used time
                    this.updateSpriteLastUsed(cacheKey);
                }
                resolve(sprite);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to get sprite'));
            };
        });
    }

    /**
     * Update sprite last used time
     */
    async updateSpriteLastUsed(cacheKey) {
        const transaction = this.db.transaction(['sprites'], 'readwrite');
        const store = transaction.objectStore('sprites');
        
        const request = store.get(cacheKey);
        
        request.onsuccess = () => {
            const sprite = request.result;
            if (sprite) {
                sprite.lastUsed = Date.now();
                store.put(sprite);
            }
        };
    }

    /**
     * Clean old sprites (LRU eviction)
     */
    async cleanOldSprites(maxAge = 7 * 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAge;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sprites'], 'readwrite');
            const store = transaction.objectStore('sprites');
            const index = store.index('byLastUsed');
            
            const range = IDBKeyRange.upperBound(cutoff);
            const request = index.openCursor(range);
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error('Failed to clean sprites'));
        });
    }

    /**
     * Get available clans
     */
    async getClans() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clans'], 'readonly');
            const store = transaction.objectStore('clans');
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to get clans'));
            };
        });
    }

    /**
     * Clear all data for a clan
     */
    async clearClan(clanId) {
        const stores = ['cats', 'events', 'relationships', 'timeline'];
        
        for (const storeName of stores) {
            await this.clearStoreForClan(storeName, clanId);
        }
        
        // Remove clan info
        const transaction = this.db.transaction(['clans'], 'readwrite');
        const store = transaction.objectStore('clans');
        store.delete(clanId);
    }

    async clearStoreForClan(storeName, clanId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore([storeName]);
            const index = store.index('byClanId');
            
            const request = index.openCursor(IDBKeyRange.only(clanId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
        });
    }

    /**
     * Get database size estimate
     */
    async getStorageEstimate() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                percentage: (estimate.usage / estimate.quota * 100).toFixed(2)
            };
        }
        return null;
    }
}