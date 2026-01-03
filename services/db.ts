import { InventoryItem, OutboundRecord } from '../types';

const DB_NAME = 'PyroTrackDB';
const DB_VERSION = 1;
const STORE_INVENTORY = 'inventory';
const STORE_HISTORY = 'history';

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_INVENTORY)) {
        db.createObjectStore(STORE_INVENTORY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const dbService = {
  // Save all items (Overwrite strategy for syncing with React State)
  saveAll: async (storeName: string, items: any[]) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      // Clear existing to match current state exactly
      const clearReq = store.clear();

      clearReq.onsuccess = () => {
        // Bulk add could be optimized, but loop is fine for client-side amounts
        items.forEach(item => {
          store.put(item);
        });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  getAll: async <T>(storeName: string): Promise<T[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  },

  // Expose store names constants
  STORES: {
    INVENTORY: STORE_INVENTORY,
    HISTORY: STORE_HISTORY
  }
};