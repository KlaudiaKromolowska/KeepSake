import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capsule } from "@/lib/capsules/reward";

// The page trusts the (app) layout's auth boundary and the active-patient/capsule resolvers; mocking
// them keeps this focused on the page's own rendering (populated / empty / no-patient states).
const { requireUserMock, activePatientMock, capsulesMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  activePatientMock: vi.fn(),
  capsulesMock: vi.fn(),
}));
vi.mock("@/lib/actions", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/patients/active", () => ({ resolveActivePatient: activePatientMock }));
vi.mock("@/lib/capsules/resolve", () => ({ resolvePatientCapsules: capsulesMock }));
// CapsuleManager is a client component using useRouter; stub it so the tree renders without an app
// router context (the manager's own logic is unit-tested in manage-form.test.ts).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import CapsulesPage from "./page";

const PATIENT = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Maria",
  timezone: "Europe/Warsaw",
  etiology: "alzheimers" as const,
};

const render = async () => renderToStaticMarkup(await CapsulesPage());

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: {} });
  activePatientMock.mockResolvedValue(PATIENT);
  capsulesMock.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("CapsulesPage", () => {
  it("prompts to choose a patient when none is active — no manager rendered", async () => {
    activePatientMock.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Choose someone to care for first, then add their capsules here.");
    expect(html).not.toContain("Add a photo or short video");
    expect(capsulesMock).not.toHaveBeenCalled();
  });

  it("shows the empty state + upload form for an active patient with no capsules", async () => {
    const html = await render();
    expect(html).toContain("For Maria");
    expect(html).toContain("Add a photo or short video");
    expect(html).toContain("No capsules yet");
    expect(html).toContain("never shared with a clinician"); // consent copy
  });

  it("renders a photo thumbnail, a video, and their captions", async () => {
    const capsules: Capsule[] = [
      { id: "c1", kind: "photo", caption: "Seaside day", url: "https://signed.example/photo.jpg" },
      { id: "c2", kind: "video", caption: null, url: "https://signed.example/clip.mp4" },
    ];
    capsulesMock.mockResolvedValue(capsules);

    const html = await render();
    expect(html).toContain("<img");
    expect(html).toContain("https://signed.example/photo.jpg");
    expect(html).toContain("Seaside day");
    expect(html).toContain("<video");
    expect(html).toContain("https://signed.example/clip.mp4");
    expect(html).not.toContain("No capsules yet");
  });

  it("passes the resolved patient id to the capsule resolver", async () => {
    await render();
    expect(capsulesMock).toHaveBeenCalledWith({}, "u1", PATIENT.id);
  });

  it("never names the condition in-product (wellness-safe framing)", async () => {
    capsulesMock.mockResolvedValue([
      { id: "c1", kind: "photo", caption: "Garden", url: "https://signed.example/p.jpg" },
    ]);
    const html = await render();
    expect(html.toLowerCase()).not.toMatch(/dementia|alzheimer/);
  });
});
