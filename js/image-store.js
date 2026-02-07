/**
 * ImageStore - IndexedDB Wrapper for Twitter Simulator
 * Used to store large image files that exceed LocalStorage limits.
 */

const ImageStore = {
    dbName: 'TwitterSimulatorDB',
    storeName: 'images',
    db: null,

    // Initialize Database
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("IndexedDB initialized");
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
                if (!db.objectStoreNames.contains('appState')) {
                    db.createObjectStore('appState');
                }
            };
        });
    },

    // Save Blob/Base64 and return ID
    async saveImage(data) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const request = store.put(data, id);

            request.onsuccess = () => {
                resolve(id);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    },

    // Get Blob by ID
    async getImage(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    },

    // Migrate existing data: Find base64 in tweets, save to DB, replace with ID
    async migrateData(tweets) {
        if (!this.db) await this.init();

        let hasChanges = false;
        const updatedTweets = JSON.parse(JSON.stringify(tweets)); // Deep copy

        const processTweet = async (tweet) => {
            if (tweet.media && tweet.media.url && tweet.media.url.startsWith('data:image')) {
                try {
                    console.log(`Migrating image for tweet ${tweet.id}...`);
                    // Convert base64 to blob? Actually we can store string in IDB too.
                    // But Blob is more efficient? Let's verify.
                    // Storing base64 string in IDB is fine, it handles large strings better than LocalStorage.
                    const id = await this.saveImage(tweet.media.url);
                    tweet.media.url = id; // Replace with ID
                    hasChanges = true;
                } catch (e) {
                    console.error("Migration failed for tweet", tweet.id, e);
                }
            }
        };

        for (const tweet of updatedTweets) {
            await processTweet(tweet);
        }

        return { hasChanges, updatedTweets };
    },

    // Clear all saved images from IndexedDB store
    async clearAllImages() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },

    // Delete the whole IndexedDB database
    async deleteDatabase() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
            request.onblocked = () => reject(new Error('Database deletion blocked'));
        });
    }
};

window.ImageStore = ImageStore;
