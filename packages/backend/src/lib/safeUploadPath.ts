import { resolve, relative, sep } from "path";

/**
 * Validate that `filename` resolves to a direct child of `root`.
 *
 * Returns the absolute path on success, or null if the filename:
 *   - is empty / whitespace
 *   - contains path separators (/, \) or null bytes
 *   - contains URL-encoded path or separator characters
 *   - starts with a dot (hidden file) or `..`
 *   - escapes `root` after path resolution
 *   - resolves to `root` itself
 */
export function resolveSafeUploadPath(
  root: string,
  filename: string,
): string | null {
  if (typeof filename !== "string") return null;
  const trimmed = filename.trim();
  if (trimmed.length === 0) return null;

  // Reject obvious bad patterns BEFORE path.resolve, which can swallow some.
  if (trimmed.includes("\0")) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  // URL-encoded separators / null bytes / parent.
  if (/%2f|%5c|%00|%2e%2e/i.test(trimmed)) return null;
  // Hidden / parent / current dirs.
  if (trimmed.startsWith(".")) return null;

  const abs = resolve(root, trimmed);
  const rel = relative(root, abs);

  // Empty rel means abs === root — also a malformed lookup.
  if (rel.length === 0) return null;
  if (rel.startsWith("..")) return null;
  if (rel.includes(sep)) return null;

  return abs;
}
