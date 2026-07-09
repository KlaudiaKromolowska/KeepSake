import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/actions";
import { removeCapsuleAction, uploadCapsuleAction } from "./actions";

vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type RequireUserResult = Awaited<ReturnType<typeof requireUser>>;

const USER = "user-1";
const PATIENT = "11111111-1111-4111-8111-111111111111";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Call {
  table: string;
  verb?: string;
  payload?: unknown;
  filters: Record<string, unknown>;
}
interface StorageCall {
  op: "upload" | "remove";
  bucket: string;
  path?: string;
  paths?: string[];
}

/**
 * Chainable Supabase stub tailored to the capsule actions. `route` decides the result per table+verb;
 * `storage` records upload/remove and lets a test force an upload failure.
 */
function makeSupabase(
  route: (c: Call) => { data: unknown; error: unknown },
  uploadError: unknown = null,
) {
  const calls: Call[] = [];
  const storageCalls: StorageCall[] = [];
  function builder(table: string) {
    const state: Call = { table, filters: {} };
    const exec = () => {
      calls.push(state);
      return route(state) ?? { data: null, error: null };
    };
    const b: Record<string, unknown> = {
      select() {
        state.verb ??= "select";
        return b;
      },
      insert(p: unknown) {
        state.verb = "insert";
        state.payload = p;
        return b;
      },
      delete() {
        state.verb = "delete";
        return b;
      },
      eq(k: string, v: unknown) {
        state.filters[k] = v;
        return b;
      },
      maybeSingle: () => Promise.resolve(exec()),
      single: () => Promise.resolve(exec()),
      // biome-ignore lint/suspicious/noThenProperty: mirror Supabase's thenable builder.
      then: <R>(onF: (v: { data: unknown; error: unknown }) => R) =>
        Promise.resolve(exec()).then(onF),
    };
    return b;
  }
  const storage = {
    from(bucket: string) {
      return {
        upload(path: string) {
          storageCalls.push({ op: "upload", bucket, path });
          return Promise.resolve({ error: uploadError });
        },
        remove(paths: string[]) {
          storageCalls.push({ op: "remove", bucket, paths });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client: { from: builder, storage }, calls, storageCalls };
}

function mockUser(client: unknown) {
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: USER },
    supabase: client,
  } as unknown as RequireUserResult);
}

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const pngFile = () => new File([PNG], "x.png", { type: "image/png" });

beforeEach(() => vi.clearAllMocks());

describe("uploadCapsuleAction", () => {
  it("rejects when the caller does not own the target patient — nothing is uploaded", async () => {
    const { client, storageCalls } = makeSupabase((c) =>
      c.table === "patients" ? { data: null, error: null } : { data: null, error: null },
    );
    mockUser(client);

    const res = await uploadCapsuleAction(form({ photo: pngFile(), patientId: PATIENT }));

    expect(res.data).toBeNull();
    expect(res.error).toEqual(expect.any(String));
    expect(storageCalls).toHaveLength(0); // ownership gate ran BEFORE storing any bytes
  });

  it("rejects a non-uuid patientId without touching storage or the DB", async () => {
    const { client, calls, storageCalls } = makeSupabase(() => ({ data: null, error: null }));
    mockUser(client);
    const res = await uploadCapsuleAction(form({ photo: pngFile(), patientId: "nope" }));
    expect(res.data).toBeNull();
    expect(calls).toHaveLength(0);
    expect(storageCalls).toHaveLength(0);
  });

  it("rejects a disallowed file type by magic bytes (client Content-Type is not trusted)", async () => {
    // A file lying about its type: .png name + image/png header, but GIF magic bytes inside.
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], "x.png", {
      type: "image/png",
    });
    const { client, storageCalls } = makeSupabase((c) =>
      c.table === "patients" ? { data: { id: PATIENT }, error: null } : { data: null, error: null },
    );
    mockUser(client);
    const res = await uploadCapsuleAction(form({ photo: gif, patientId: PATIENT }));
    expect(res.error).toEqual(expect.any(String));
    expect(storageCalls).toHaveLength(0);
  });

  it("owned patient + valid photo → stores under the caller's own folder key and inserts the row", async () => {
    const { client, calls, storageCalls } = makeSupabase((c) => {
      if (c.table === "patients") return { data: { id: PATIENT }, error: null };
      if (c.table === "memory_capsules" && c.verb === "insert")
        return { data: { id: "cap-new" }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const res = await uploadCapsuleAction(
      form({ photo: pngFile(), patientId: PATIENT, caption: "Seaside" }),
    );

    expect(res).toEqual({ data: { id: "cap-new" }, error: null });
    // Object key is <user.id>/<uuid>.png — the caller's own folder (storage RLS ownership key).
    const upload = storageCalls.find((s) => s.op === "upload");
    expect(upload?.bucket).toBe("memory-capsules");
    expect(upload?.path?.startsWith(`${USER}/`)).toBe(true);
    expect(upload?.path?.endsWith(".png")).toBe(true);
    // The inserted row records created_by = caller, the same storage_path, kind, and trimmed caption.
    const insert = calls.find((c) => c.table === "memory_capsules" && c.verb === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.created_by).toBe(USER);
    expect(payload.patient_id).toBe(PATIENT);
    expect(payload.storage_path).toBe(upload?.path);
    expect(payload.kind).toBe("photo");
    expect(payload.caption).toBe("Seaside");
  });

  it("removes the just-stored object if the metadata insert fails (no orphan)", async () => {
    const { client, storageCalls } = makeSupabase((c) => {
      if (c.table === "patients") return { data: { id: PATIENT }, error: null };
      if (c.table === "memory_capsules" && c.verb === "insert")
        return { data: null, error: { message: "insert boom" } };
      return { data: null, error: null };
    });
    mockUser(client);

    const res = await uploadCapsuleAction(form({ photo: pngFile(), patientId: PATIENT }));

    expect(res.data).toBeNull();
    expect(res.error).toEqual(expect.any(String));
    const upload = storageCalls.find((s) => s.op === "upload");
    const remove = storageCalls.find((s) => s.op === "remove");
    expect(remove?.paths).toEqual([upload?.path]); // the orphan was cleaned up
  });
});

describe("removeCapsuleAction", () => {
  const CAP = "22222222-2222-4222-8222-222222222222";

  it("rejects a non-uuid capsuleId", async () => {
    mockUser(makeSupabase(() => ({ data: null, error: null })).client);
    const res = await removeCapsuleAction({ capsuleId: "nope" });
    expect(res.data).toBeNull();
    expect(res.error).toEqual(expect.any(String));
  });

  it("idempotent no-op when the row is absent (or not the caller's, hidden by RLS)", async () => {
    const { client, storageCalls } = makeSupabase((c) =>
      c.table === "memory_capsules" && c.verb === "select"
        ? { data: null, error: null }
        : { data: null, error: null },
    );
    mockUser(client);
    const res = await removeCapsuleAction({ capsuleId: CAP });
    expect(res).toEqual({ data: null, error: null });
    expect(storageCalls).toHaveLength(0); // nothing to delete
  });

  it("owned row → removes its storage object then deletes the row", async () => {
    const path = `${USER}/${CAP}.jpg`;
    const { client, calls, storageCalls } = makeSupabase((c) => {
      if (c.table === "memory_capsules" && c.verb === "select")
        return { data: { id: CAP, storage_path: path }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const res = await removeCapsuleAction({ capsuleId: CAP });

    expect(res).toEqual({ data: null, error: null });
    expect(storageCalls).toEqual([{ op: "remove", bucket: "memory-capsules", paths: [path] }]);
    expect(calls.some((c) => c.table === "memory_capsules" && c.verb === "delete")).toBe(true);
  });

  it("does NOT hand a foreign-folder path to storage (ownership re-gate), still deletes the row", async () => {
    const foreign = "99999999-9999-4999-8999-999999999999/x.jpg";
    const { client, calls, storageCalls } = makeSupabase((c) => {
      if (c.table === "memory_capsules" && c.verb === "select")
        return { data: { id: CAP, storage_path: foreign }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const res = await removeCapsuleAction({ capsuleId: CAP });

    expect(res).toEqual({ data: null, error: null });
    expect(storageCalls).toHaveLength(0); // never asked storage to touch a foreign key
    expect(calls.some((c) => c.table === "memory_capsules" && c.verb === "delete")).toBe(true);
  });
});
