import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { MAX_VIDEO_BYTES } from "./capsule-file";

/**
 * A Server Action's body parser defaults to ~1 MiB, which would silently reject a 25 MiB capsule
 * video before our own validator runs. This guards that the transport gate is widened to clear the
 * server-side video cap (plus multipart overhead) — the review flag on PR #39.
 */
describe("next.config serverActions.bodySizeLimit", () => {
  const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;

  it("is configured", () => {
    expect(limit).toBe("26mb");
  });

  it('covers MAX_VIDEO_BYTES with headroom (Next parses "mb" as 1024²)', () => {
    const bytes = 26 * 1024 * 1024;
    expect(bytes).toBeGreaterThan(MAX_VIDEO_BYTES);
  });
});
