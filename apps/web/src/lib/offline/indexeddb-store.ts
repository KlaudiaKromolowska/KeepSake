import type { DeadLetteredWrite, QueuedWrite, QueueStore } from "./write-queue";

const DB_NAME = "keepsake-offline-queue";
const STORE_NAME = "writes";
const DEAD_LETTER_STORE = "dead-letters";
// v2 adds the dead-letter store (non-retryable replay failures) alongside the original queue.
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DEAD_LETTER_STORE)) {
        db.createObjectStore(DEAD_LETTER_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Durable `QueueStore` backed by IndexedDB — survives page reload, navigation, and tab close,
 * which is the whole point (a caregiver closing the kiosk tab mid-outage must not lose the
 * queued trial). Stores only `QueuedWrite` records: an action name + its exact replay input,
 * nothing else — no extra patient data is cached here.
 */
export function createIndexedDbQueueStore(): QueueStore {
  const db = openDb();
  return {
    async list() {
      const conn = await db;
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result as QueuedWrite[]);
        req.onerror = () => reject(req.error);
      });
    },
    async put(write) {
      const conn = await db;
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(write);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async remove(id) {
      const conn = await db;
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async deadLetter(write, reason) {
      const conn = await db;
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([STORE_NAME, DEAD_LETTER_STORE], "readwrite");
        tx.objectStore(STORE_NAME).delete(write.id);
        tx.objectStore(DEAD_LETTER_STORE).put({ ...write, reason } satisfies DeadLetteredWrite);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async listDeadLetters() {
      const conn = await db;
      return new Promise((resolve, reject) => {
        const tx = conn.transaction(DEAD_LETTER_STORE, "readonly");
        const req = tx.objectStore(DEAD_LETTER_STORE).getAll();
        req.onsuccess = () => resolve(req.result as DeadLetteredWrite[]);
        req.onerror = () => reject(req.error);
      });
    },
  };
}
