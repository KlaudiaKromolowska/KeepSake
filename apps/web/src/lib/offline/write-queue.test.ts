import { describe, expect, it } from "vitest";
import { createMemoryQueueStore } from "./memory-store";
import { flushQueue, type QueuedWrite, saveOrQueue } from "./write-queue";

function write(id: string, enqueuedAt: number): QueuedWrite {
  return { id, action: "recordTrial", input: { id }, enqueuedAt };
}

describe("saveOrQueue", () => {
  it("online-first: a successful network try never touches the store", async () => {
    const store = createMemoryQueueStore();
    const ok = await saveOrQueue(store, write("a", 1), async () => true);
    expect(ok).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("queues the write when the network try returns false", async () => {
    const store = createMemoryQueueStore();
    const w = write("a", 1);
    const ok = await saveOrQueue(store, w, async () => false);
    expect(ok).toBe(false);
    expect(await store.list()).toEqual([w]);
  });

  it("queues the write when the network try throws (offline)", async () => {
    const store = createMemoryQueueStore();
    const w = write("a", 1);
    const ok = await saveOrQueue(store, w, async () => {
      throw new Error("network drop");
    });
    expect(ok).toBe(false);
    expect(await store.list()).toEqual([w]);
  });
});

describe("flushQueue", () => {
  it("replays queued writes oldest-first and removes each on success", async () => {
    const store = createMemoryQueueStore();
    await store.put(write("b", 2));
    await store.put(write("a", 1)); // enqueued later in the store, but earlier by enqueuedAt

    const order: string[] = [];
    const remaining = await flushQueue(store, async (w) => {
      order.push(w.id);
      return true;
    });

    expect(order).toEqual(["a", "b"]);
    expect(remaining).toEqual([]);
  });

  it("stops at the first failure and leaves later writes queued (preserves trial order)", async () => {
    const store = createMemoryQueueStore();
    await store.put(write("a", 1));
    await store.put(write("b", 2));
    await store.put(write("c", 3));

    const attempted: string[] = [];
    const remaining = await flushQueue(store, async (w) => {
      attempted.push(w.id);
      return w.id !== "b"; // b fails (still offline)
    });

    expect(attempted).toEqual(["a", "b"]); // c is never attempted once b fails
    expect(remaining.map((w) => w.id)).toEqual(["b", "c"]);
  });

  it("a replay that throws is treated as a failure, not a crash", async () => {
    const store = createMemoryQueueStore();
    await store.put(write("a", 1));

    const remaining = await flushQueue(store, async () => {
      throw new Error("still offline");
    });

    expect(remaining.map((w) => w.id)).toEqual(["a"]);
  });

  it("idempotent replay: a write already applied server-side is removed without a second effect", async () => {
    // Simulates the real guarantee: recordTrialAction's trialId dedupe key means a replay of an
    // already-landed write is a no-op server-side (ON CONFLICT DO NOTHING) and reports success —
    // the queue must still drop it exactly once, never re-attempt it, and never apply it twice.
    const store = createMemoryQueueStore();
    const w = write("trial-1", 1);
    await store.put(w);

    const serverRows = new Map<string, number>(); // id -> apply count, as the "server" would see it
    const replay = async (queued: QueuedWrite) => {
      serverRows.set(queued.id, (serverRows.get(queued.id) ?? 0) + 1); // upsert semantics: idempotent
      return true;
    };

    await flushQueue(store, replay);
    expect(serverRows.get("trial-1")).toBe(1);
    expect(await store.list()).toEqual([]);

    // A second flush (e.g. a duplicate 'online' event) finds nothing left to replay.
    await flushQueue(store, replay);
    expect(serverRows.get("trial-1")).toBe(1); // unchanged — never double-applied
  });
});

describe("createMemoryQueueStore", () => {
  it("put/list/remove round-trip, keyed by id (a re-put with the same id overwrites, not duplicates)", async () => {
    const store = createMemoryQueueStore();
    await store.put(write("a", 1));
    await store.put(write("a", 1)); // same id — must not create a second entry
    expect(await store.list()).toHaveLength(1);
    await store.remove("a");
    expect(await store.list()).toEqual([]);
  });
});
