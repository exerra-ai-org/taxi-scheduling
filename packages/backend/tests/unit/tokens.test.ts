import { test, expect, describe } from "bun:test";
import {
  generateAuthToken,
  hashAuthToken,
  TOKEN_HASH_HEX_LENGTH,
} from "../../src/lib/tokens";

describe("auth tokens", () => {
  test("generateAuthToken returns 64-char hex hash and a non-empty raw value", () => {
    const { raw, hash } = generateAuthToken();
    expect(typeof raw).toBe("string");
    expect(raw.length).toBeGreaterThan(20);
    expect(hash.length).toBe(TOKEN_HASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("raw and hash differ — DB never sees the raw value", () => {
    const { raw, hash } = generateAuthToken();
    expect(raw).not.toBe(hash);
  });

  test("hashAuthToken is deterministic", () => {
    const a = hashAuthToken("hello");
    const b = hashAuthToken("hello");
    expect(a).toBe(b);
  });

  test("hashAuthToken differentiates similar inputs", () => {
    expect(hashAuthToken("abc")).not.toBe(hashAuthToken("abd"));
  });

  test("hashAuthToken on a freshly generated raw matches the returned hash", () => {
    const { raw, hash } = generateAuthToken();
    expect(hashAuthToken(raw)).toBe(hash);
  });

  test("each generated token is unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { raw } = generateAuthToken();
      expect(seen.has(raw)).toBe(false);
      seen.add(raw);
    }
  });
});
