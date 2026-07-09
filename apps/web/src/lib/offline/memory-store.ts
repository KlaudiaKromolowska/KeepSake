import type { QueuedWrite, QueueStore } from "./write-queue";

/** In-memory `QueueStore` — the unit-test double, and the fallback when IndexedDB is unavailable
 * (e.g. private browsing). Durability degrades gracefully instead of crashing the kiosk session. */
export function createMemoryQueueStore(): QueueStore {
  const items = new Map<string, QueuedWrite>();
  return {
    async list() {
      return [...items.values()];
    },
    async put(write) {
      items.set(write.id, write);
    },
    async remove(id) {
      items.delete(id);
    },
  };
}
