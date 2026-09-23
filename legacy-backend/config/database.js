const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILES = {
    users: path.join(DATA_DIR, 'users.json'),
    orders: path.join(DATA_DIR, 'orders.json'),
    wallets: path.join(DATA_DIR, 'wallets.json'),
    chats: path.join(DATA_DIR, 'chats.json'),
    documents: path.join(DATA_DIR, 'documents.json')
};

// Shared in-memory cache for all instances
const memoryCache = {};

// Initialize cache from files
Object.entries(DB_FILES).forEach(([key, file]) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify([], null, 2));
        memoryCache[key] = [];
    } else {
        try {
            memoryCache[key] = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            memoryCache[key] = [];
            fs.writeFileSync(file, JSON.stringify([], null, 2));
        }
    }
});

class Database {
    constructor(collection) {
        this.collection = collection;
        this.file = DB_FILES[collection];
        // Use shared cache
        if (!memoryCache[collection]) {
            memoryCache[collection] = [];
        }
    }

    _read() {
        // Always read from shared cache (in-memory)
        return memoryCache[this.collection] || [];
    }

    _write() {
        // Write both to cache and file
        memoryCache[this.collection] = this._read();
        try {
            fs.writeFileSync(this.file, JSON.stringify(memoryCache[this.collection], null, 2));
        } catch (err) {
            console.error('Database write error:', err.message);
        }
    }

    find(query = {}) {
        const data = this._read();
        if (Object.keys(query).length === 0) return data;
        return data.filter(item => {
            return Object.entries(query).every(([key, value]) => {
                // Handle $ne operator
                if (value && typeof value === 'object' && value.$ne !== undefined) {
                    return item[key] !== value.$ne;
                }
                // Handle $in operator
                if (value && typeof value === 'object' && Array.isArray(value.$in)) {
                    return value.$in.includes(item[key]);
                }
                return item[key] === value;
            });
        });
    }

    findOne(query = {}) {
        return this.find(query)[0] || null;
    }

    findById(id) {
        return this._read().find(item => item.id === id);
    }

    insert(doc) {
        const data = this._read();
        const newDoc = { ...doc, createdAt: new Date().toISOString() };
        data.push(newDoc);
        this._write();
        return newDoc;
    }

    update(query, update) {
        const data = this._read();
        const index = data.findIndex(item => {
            return Object.entries(query).every(([key, value]) => item[key] === value);
        });
        if (index === -1) return null;
        data[index] = { ...data[index], ...update, updatedAt: new Date().toISOString() };
        this._write();
        return data[index];
    }

    updateById(id, update) {
        const data = this._read();
        const index = data.findIndex(item => item.id === id);
        if (index === -1) return null;
        data[index] = { ...data[index], ...update, updatedAt: new Date().toISOString() };
        this._write();
        return data[index];
    }

    delete(query) {
        const data = this._read();
        const initialLength = data.length;
        const filtered = data.filter(item => {
            return !Object.entries(query).every(([key, value]) => item[key] === value);
        });
        memoryCache[this.collection] = filtered;
        this._write();
        return initialLength !== filtered.length;
    }

    deleteById(id) {
        const data = this._read();
        const initialLength = data.length;
        const filtered = data.filter(item => item.id !== id);
        memoryCache[this.collection] = filtered;
        this._write();
        return initialLength !== filtered.length;
    }

    count(query = {}) {
        return this.find(query).length;
    }
}

module.exports = Database;
