import { describe, expect, it } from "vitest";
import { mediaTypeFor, qaPhotoInputSchema, resolveImagePath } from "./vision-schema";

describe("path validation — allowlist regex + canonical-path confinement", () => {
  it("accepts a well-formed images path", () => {
    expect(qaPhotoInputSchema.safeParse({ imagePath: "/images/lena.jpg" }).success).toBe(true);
    expect(resolveImagePath("/images/lena.jpg")).not.toBeNull();
  });

  it.each([
    ["jpeg extension", "/images/lena.jpeg"],
    ["png extension", "/images/lena.png"],
    ["webp extension", "/images/lena.webp"],
    ["hyphenated name", "/images/lena-group.jpg"],
  ])("accepts %s", (_label, path) => {
    expect(qaPhotoInputSchema.safeParse({ imagePath: path }).success).toBe(true);
    expect(resolveImagePath(path)).not.toBeNull();
  });

  it.each([
    ["traversal via dot-dot", "/images/../secrets.jpg"],
    ["traversal reaching outside public", "/images/../../etc/passwd.jpg"],
    ["encoded traversal segment", "/images/..%2f..%2fsecret.jpg"],
    ["bad extension", "/images/lena.exe"],
    ["missing extension", "/images/lena"],
    ["uppercase filename", "/images/LENA.jpg"],
    ["uppercase extension", "/images/lena.JPG"],
    ["subdirectory", "/images/sub/lena.jpg"],
    ["absolute outside images", "/etc/passwd"],
    ["no leading slash", "images/lena.jpg"],
    ["empty string", ""],
    ["dot in filename stem", "/images/lena.v2.jpg"],
    ["spaces", "/images/le na.jpg"],
    ["trailing slash", "/images/lena.jpg/"],
  ])("rejects %s", (_label, path) => {
    expect(qaPhotoInputSchema.safeParse({ imagePath: path }).success).toBe(false);
    expect(resolveImagePath(path)).toBeNull();
  });

  it("rejects unknown input fields (strict schema)", () => {
    const res = qaPhotoInputSchema.safeParse({ imagePath: "/images/lena.jpg", extra: "x" });
    expect(res.success).toBe(false);
  });

  it("resolves inside the images directory, not merely the public directory", () => {
    const abs = resolveImagePath("/images/lena.jpg");
    expect(abs).toMatch(/[/\\]public[/\\]images[/\\]lena\.jpg$/);
  });
});

describe("mediaTypeFor", () => {
  it.each([
    ["lena.jpg", "image/jpeg"],
    ["lena.jpeg", "image/jpeg"],
    ["lena.png", "image/png"],
    ["lena.webp", "image/webp"],
  ])("maps %s to %s", (path, expected) => {
    expect(mediaTypeFor(path)).toBe(expected);
  });
});
