import { Hono } from "hono";
import { join } from "path";
import { config } from "../config";
import { authMiddleware } from "../middleware/auth";
import { ok, err } from "../lib/response";
import { extensionForType, sniffImageType } from "../lib/imageSniff";

export const uploadRoutes = new Hono();

const UPLOAD_DIR = join(import.meta.dir, "../../uploads");
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

uploadRoutes.post("/profile-picture", authMiddleware, async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return err(c, "Expected multipart/form-data", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return err(c, "Missing file field", 400);
  }

  if (file.size === 0) {
    return err(c, "Empty file", 400);
  }
  if (file.size > MAX_SIZE_BYTES) {
    return err(c, "File must be under 5 MB", 400);
  }

  // Read bytes once and sniff the actual format. Client-provided
  // file.type is not trusted — a request labelled image/jpeg may
  // contain HTML/PHP/etc.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return err(c, "Only JPEG, PNG, WebP, and GIF images are allowed", 400);
  }

  const filename = `${crypto.randomUUID()}.${extensionForType(sniffed)}`;
  const dest = join(UPLOAD_DIR, filename);

  await Bun.write(dest, bytes);

  return ok(c, { url: `${config.app.selfUrl}/uploads/${filename}` });
});
