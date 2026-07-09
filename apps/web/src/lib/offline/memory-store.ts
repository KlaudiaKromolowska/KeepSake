import type { DeadLetteredWrite, QueuedWrite, QueueStore } from "./write-queue";

/** In-memory `QueueStore` — the unit-test double, and the fallback when IndexedDB is unavailable
 * (e.g. private browsing). Durability degrades gracefully instead of crashing the kiosk session. */
export function createMemoryQueueStore(): QueueStore {
  const items = new Map<string, QueuedWrite>();
  const deadLetters = new Map<string, DeadLetteredWrite>();
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
    async deadLetter(write, reason) {
      items.delete(write.id);
      deadLetters.set(write.id, { ...write, reason });
    },
    async listDeadLetters() {
      return [...deadLetters.values()];
    },
  };
}
