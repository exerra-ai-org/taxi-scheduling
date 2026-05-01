import { test, expect, describe } from "bun:test";
import { sniffImageType } from "../../src/lib/imageSniff";

function bytes(...arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

// Build a synthetic file whose first bytes carry the magic and the rest is
// arbitrary filler so length checks still pass.
function withTail(magic: Uint8Array, totalLen = 64): Uint8Array {
  const out = new Uint8Array(totalLen);
  out.set(magic, 0);
  return out;
}

describe("sniffImageType", () => {
  test("recognises JPEG", () => {
    expect(sniffImageType(withTail(bytes(0xff, 0xd8, 0xff, 0xe0)))).toBe(
      "image/jpeg",
    );
    expect(sniffImageType(withTail(bytes(0xff, 0xd8, 0xff, 0xdb)))).toBe(
      "image/jpeg",
    );
  });

  test("recognises PNG", () => {
    expect(
      sniffImageType(
        withTail(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
      ),
    ).toBe("image/png");
  });

  test("recognises GIF87a and GIF89a", () => {
    expect(
      sniffImageType(
        withTail(bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61)), // GIF87a
      ),
    ).toBe("image/gif");
    expect(
      sniffImageType(
        withTail(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), // GIF89a
      ),
    ).toBe("image/gif");
  });

  test("recognises WebP", () => {
    // RIFF....WEBP
    const buf = new Uint8Array(64);
    buf.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    buf.set([0x00, 0x00, 0x00, 0x00], 4); // size (ignored)
    buf.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(sniffImageType(buf)).toBe("image/webp");
  });

  test("rejects HTML/JS/PHP polyglots labelled as images", () => {
    const html = new TextEncoder().encode(
      "<html><script>alert(1)</script></html>",
    );
    expect(sniffImageType(html)).toBeNull();

    const php = new TextEncoder().encode("<?php echo shell_exec($_GET['c']);");
    expect(sniffImageType(php)).toBeNull();

    const txt = new TextEncoder().encode(
      "Just some plain text that happens to be 64+ bytes long padding pad",
    );
    expect(sniffImageType(txt)).toBeNull();
  });

  test("rejects empty / too-short buffers", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array(3))).toBeNull();
  });

  test("does not match RIFF without WEBP (e.g., RIFF+WAVE audio)", () => {
    const buf = new Uint8Array(64);
    buf.set([0x52, 0x49, 0x46, 0x46], 0);
    buf.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE — not WEBP
    expect(sniffImageType(buf)).toBeNull();
  });
});
