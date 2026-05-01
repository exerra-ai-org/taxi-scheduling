import { test, expect, describe } from "bun:test";
import { resolveSafeUploadPath } from "../../src/lib/safeUploadPath";

const ROOT = "/srv/app/uploads";

describe("resolveSafeUploadPath", () => {
  test("accepts a normal filename", () => {
    expect(resolveSafeUploadPath(ROOT, "abc-123.jpg")).toBe(
      "/srv/app/uploads/abc-123.jpg",
    );
  });

  test("rejects empty filename", () => {
    expect(resolveSafeUploadPath(ROOT, "")).toBeNull();
  });

  test("rejects parent traversal with ..", () => {
    expect(resolveSafeUploadPath(ROOT, "../etc/passwd")).toBeNull();
  });

  test("rejects nested traversal", () => {
    expect(resolveSafeUploadPath(ROOT, "a/../../etc/passwd")).toBeNull();
  });

  test("rejects absolute paths", () => {
    expect(resolveSafeUploadPath(ROOT, "/etc/passwd")).toBeNull();
  });

  test("rejects paths with subdirectories", () => {
    expect(resolveSafeUploadPath(ROOT, "subdir/file.jpg")).toBeNull();
  });

  test("rejects backslash separators", () => {
    expect(resolveSafeUploadPath(ROOT, "..\\windows\\system32")).toBeNull();
    expect(resolveSafeUploadPath(ROOT, "subdir\\file.jpg")).toBeNull();
  });

  test("rejects null bytes (truncates lookups in some libc filesystems)", () => {
    expect(resolveSafeUploadPath(ROOT, "abc.jpg\0.evil")).toBeNull();
  });

  test("rejects URL-encoded traversal", () => {
    // The route layer should already URL-decode, but defense in depth.
    expect(resolveSafeUploadPath(ROOT, "..%2Fetc%2Fpasswd")).toBeNull();
    expect(resolveSafeUploadPath(ROOT, "..%5cwindows")).toBeNull();
  });

  test("rejects leading dot file (hidden file)", () => {
    expect(resolveSafeUploadPath(ROOT, ".env")).toBeNull();
  });

  test("rejects whitespace-only", () => {
    expect(resolveSafeUploadPath(ROOT, "   ")).toBeNull();
  });

  test("rejects when filename ends up equal to root after resolution", () => {
    expect(resolveSafeUploadPath(ROOT, ".")).toBeNull();
    expect(resolveSafeUploadPath(ROOT, "./")).toBeNull();
  });
});
