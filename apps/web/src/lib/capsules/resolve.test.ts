import { describe, expect, it } from "vitest";
import { resolvePatientCapsules } from "./resolve";

const CAREGIVER = "user-1";
// A valid capsule object key is `<caregiver>/<uuid>.<ext>`; keep a stable uuid per logical name so
// assertions on signed paths are deterministic.
const UUID: Record<string, string> = {
  a: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  own: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "cap-1": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
const own = (name: string) => `${CAREGIVER}/${UUID[name] ?? name}.jpg`;

interface Row {
  id: string;
  kind: string;
  caption: string | null;
  storage_path: string;
}
interface SignCall {
  bucket: string;
  path: string;
  ttl: number;
}

/** Minimal Supabase stub: one `memory_capsules` select + a storage signer. */
function makeSupabase(
  rows: { data: Row[] | null; error: unknown },
  sign: (path: string) => { data: { signedUrl: string } | null; error: unknown } = (path) => ({
    data: { signedUrl: `https://signed/${path}` },
    error: null,
  }),
) {
  const signCalls: SignCall[] = [];
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return Promise.resolve(rows);
    },
  };
  const storage = {
    from(bucket: string) {
      return {
        createSignedUrl(path: string, ttl: number) {
          signCalls.push({ bucket, path, ttl });
          return Promise.resolve(sign(path));
        },
      };
    },
  };
  return { client: { from: () => builder, storage } as never, signCalls };
}

const ROW = (over: Partial<Row> = {}): Row => ({
  id: "cap-1",
  kind: "photo",
  caption: null,
  storage_path: own("cap-1"),
  ...over,
});

describe("resolvePatientCapsules", () => {
  it("signs each owned capsule with a short TTL on the private bucket, in listed order", async () => {
    const { client, signCalls } = makeSupabase({
      data: [ROW({ id: "a", storage_path: own("a") }), ROW({ id: "b", storage_path: own("b") })],
      error: null,
    });
    const out = await resolvePatientCapsules(client, CAREGIVER, "p-1");
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
    expect(out[0]?.url).toBe(`https://signed/${own("a")}`);
    expect(signCalls).toEqual([
      { bucket: "memory-capsules", path: own("a"), ttl: 3600 },
      { bucket: "memory-capsules", path: own("b"), ttl: 3600 },
    ]);
  });

  it("returns [] on a read error (graceful absence — session shows no reward)", async () => {
    const { client, signCalls } = makeSupabase({ data: null, error: { message: "boom" } });
    expect(await resolvePatientCapsules(client, CAREGIVER, "p-1")).toEqual([]);
    expect(signCalls).toHaveLength(0);
  });

  it("returns [] when the patient has no capsules", async () => {
    const { client } = makeSupabase({ data: [], error: null });
    expect(await resolvePatientCapsules(client, CAREGIVER, "p-1")).toEqual([]);
  });

  it("drops a capsule whose object key belongs to ANOTHER caregiver (never signs it)", async () => {
    const foreign = "99999999-9999-4999-8999-999999999999/x.jpg";
    const { client, signCalls } = makeSupabase({
      data: [
        ROW({ id: "own", storage_path: own("own") }),
        ROW({ id: "bad", storage_path: foreign }),
      ],
      error: null,
    });
    const out = await resolvePatientCapsules(client, CAREGIVER, "p-1");
    expect(out.map((c) => c.id)).toEqual(["own"]); // foreign row dropped
    expect(signCalls.map((s) => s.path)).toEqual([own("own")]); // never asked to sign the foreign key
  });

  it("drops a capsule whose signing fails, keeping the rest", async () => {
    const { client } = makeSupabase(
      {
        data: [ROW({ id: "a", storage_path: own("a") }), ROW({ id: "b", storage_path: own("b") })],
        error: null,
      },
      (path) =>
        path === own("a")
          ? { data: null, error: { message: "sign fail" } }
          : { data: { signedUrl: `https://signed/${path}` }, error: null },
    );
    const out = await resolvePatientCapsules(client, CAREGIVER, "p-1");
    expect(out.map((c) => c.id)).toEqual(["b"]);
  });

  it("never throws even if the storage client throws", async () => {
    const { client } = makeSupabase({ data: [ROW()], error: null }, () => {
      throw new Error("storage exploded");
    });
    await expect(resolvePatientCapsules(client, CAREGIVER, "p-1")).resolves.toEqual([]);
  });
});
