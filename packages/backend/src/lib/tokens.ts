import { createHash, randomBytes } from "node:crypto";

/**
 * Single-use auth tokens — magic-link, password-reset, invitation.
 *
 * Stored as SHA-256 hashes so a read-only DB compromise (backup leak,
 * replica access, query log) does not yield usable tokens. The raw
 * value is sent to the user via email exactly once.
 */

export const TOKEN_HASH_HEX_LENGTH = 64; // sha256 hex

export function hashAuthToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateAuthToken(): { raw: string; hash: string } {
  // 32 bytes (256 bits) → ~43 base64url chars. More than enough entropy.
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashAuthToken(raw) };
}
