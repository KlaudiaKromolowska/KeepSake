import { createIndexedDbQueueStore } from "./indexeddb-store";
import { createMemoryQueueStore } from "./memory-store";
import type { QueueStore } from "./write-queue";

let singleton: QueueStore | null = null;

/** One queue store per tab, lazily created on first use (never during SSR). */
export function getQueueStore(): QueueStore {
  if (!singleton) {
    singleton =
      typeof indexedDB !== "undefined" ? createIndexedDbQueueStore() : createMemoryQueueStore();
  }
  return singleton;
}
