import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rm, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { sign } from "hono/jwt";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);
// Sign with whatever JWT_SECRET ended up being — works regardless of which
// test file imported config.ts first.
const TEST_SECRET = process.env.JWT_SECRET;

const UPLOAD_DIR = join(import.meta.dir, "../../uploads");
let app: any;
let authCookie: string;

beforeAll(async () => {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const { Hono } = await import("hono");
  const { uploadRoutes } = await import("../../src/routes/upload");
  app = new Hono();
  app.route("/upload", uploadRoutes);

  // Sign a real JWT so the route's jwt() middleware passes regardless of
  // module-cache ordering across test files.
  const token = await sign(
    {
      sub: 1,
      email: "t@t.com",
      role: "customer",
      name: "T",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    TEST_SECRET,
  );
  authCookie = `token=${token}`;
});

async function listUploaded(): Promise<string[]> {
  try {
    return await readdir(UPLOAD_DIR);
  } catch {
    return [];
  }
}

async function clearUploads() {
  for (const f of await listUploaded()) {
    if (f.startsWith(".")) continue;
    await rm(join(UPLOAD_DIR, f)).catch(() => {});
  }
}

function makeForm(filename: string, mime: string, body: Uint8Array): FormData {
  const fd = new FormData();
  fd.append("file", new File([body], filename, { type: mime }));
  return fd;
}

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  // followed by an IHDR chunk-sized stub so the file is >12 bytes
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
]);

const HTML_PAYLOAD = new TextEncoder().encode(
  "<html><script>alert(1)</script></html><!-- padding padding padding -->",
);

describe("POST /upload/profile-picture", () => {
  test("rejects HTML payload labelled as image/jpeg", async () => {
    await clearUploads();
    const before = (await listUploaded()).length;

    const res = await app.request("/upload/profile-picture", {
      method: "POST",
      headers: { cookie: authCookie },
      body: makeForm("evil.jpg", "image/jpeg", HTML_PAYLOAD),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("image");
    expect((await listUploaded()).length).toBe(before);
  });

  test("accepts a real PNG and assigns the .png extension regardless of client mime", async () => {
    await clearUploads();

    const res = await app.request("/upload/profile-picture", {
      method: "POST",
      headers: { cookie: authCookie },
      body: makeForm("logo.gif", "image/gif", PNG_MAGIC), // mislabelled mime + extension
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { url: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.url).toMatch(/\.png$/);

    const files = (await listUploaded()).filter((n) => !n.startsWith("."));
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.png$/);
  });

  test("rejects empty file", async () => {
    const res = await app.request("/upload/profile-picture", {
      method: "POST",
      headers: { cookie: authCookie },
      body: makeForm("zero.jpg", "image/jpeg", new Uint8Array(0)),
    });
    expect(res.status).toBe(400);
  });

  test("rejects when 'file' field is missing", async () => {
    const fd = new FormData();
    fd.append("notfile", "x");
    const res = await app.request("/upload/profile-picture", {
      method: "POST",
      headers: { cookie: authCookie },
      body: fd,
    });
    expect(res.status).toBe(400);
  });
});

afterAll(async () => {
  await clearUploads();
});
