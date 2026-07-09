import { describe, expect, it, vi } from "vitest";
import { buildUploadForm, submitRemove, submitUpload } from "./manage-form";

const PATIENT = "11111111-1111-4111-8111-111111111111";
const CAP = "22222222-2222-4222-8222-222222222222";
const file = () => new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

describe("buildUploadForm", () => {
  it("carries the file under `photo` and the owning patient", () => {
    const fd = buildUploadForm(PATIENT, file(), "");
    expect(fd.get("photo")).toBeInstanceOf(File);
    expect(fd.get("patientId")).toBe(PATIENT);
  });

  it("trims a caption and omits it when blank (data minimization)", () => {
    expect(buildUploadForm(PATIENT, file(), "  Seaside  ").get("caption")).toBe("Seaside");
    expect(buildUploadForm(PATIENT, file(), "   ").has("caption")).toBe(false);
    expect(buildUploadForm(PATIENT, file(), "").has("caption")).toBe(false);
  });
});

describe("submitUpload", () => {
  it("posts the built form to the injected upload action", async () => {
    const action = vi.fn().mockResolvedValue({ data: { id: "new" }, error: null });
    const res = await submitUpload(action, PATIENT, file(), "Beach");

    expect(res).toEqual({ data: { id: "new" }, error: null });
    expect(action).toHaveBeenCalledTimes(1);
    const fd = action.mock.calls[0][0] as FormData;
    expect(fd.get("patientId")).toBe(PATIENT);
    expect(fd.get("caption")).toBe("Beach");
    expect(fd.get("photo")).toBeInstanceOf(File);
  });
});

describe("submitRemove", () => {
  it("calls the injected remove action with the capsule id shape it validates", async () => {
    const action = vi.fn().mockResolvedValue({ data: null, error: null });
    const res = await submitRemove(action, CAP);

    expect(res).toEqual({ data: null, error: null });
    expect(action).toHaveBeenCalledWith({ capsuleId: CAP });
  });
});
