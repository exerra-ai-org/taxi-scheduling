import { test, expect, describe } from "bun:test";
import { createLogger } from "../../src/lib/logger";

function captureWrite(): {
  out: string[];
  write: (s: string) => boolean;
} {
  const out: string[] = [];
  return {
    out,
    write: (s: string) => {
      out.push(s);
      return true;
    },
  };
}

describe("createLogger", () => {
  test("emits one JSON line per call with level, msg, ts", () => {
    const cap = captureWrite();
    const log = createLogger({ writer: cap.write });
    log.info("hello");
    expect(cap.out).toHaveLength(1);
    const parsed = JSON.parse(cap.out[0].trim());
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(typeof parsed.time).toBe("string");
  });

  test("merges structured fields into the JSON record", () => {
    const cap = captureWrite();
    const log = createLogger({ writer: cap.write });
    log.warn("login attempt", { email: "a@b.com", ip: "1.2.3.4" });
    const parsed = JSON.parse(cap.out[0].trim());
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("login attempt");
    expect(parsed.email).toBe("a@b.com");
    expect(parsed.ip).toBe("1.2.3.4");
  });

  test("child() copies bindings and merges further fields", () => {
    const cap = captureWrite();
    const log = createLogger({ writer: cap.write });
    const child = log.child({ requestId: "abc-123" });
    child.error("boom", { route: "/x" });
    const parsed = JSON.parse(cap.out[0].trim());
    expect(parsed.requestId).toBe("abc-123");
    expect(parsed.route).toBe("/x");
    expect(parsed.level).toBe("error");
  });

  test("Error instances are serialised to {name,message,stack}", () => {
    const cap = captureWrite();
    const log = createLogger({ writer: cap.write });
    log.error("operation failed", { err: new Error("kaboom") });
    const parsed = JSON.parse(cap.out[0].trim());
    expect(parsed.err.name).toBe("Error");
    expect(parsed.err.message).toBe("kaboom");
    expect(typeof parsed.err.stack).toBe("string");
  });

  test("respects minimum level — debug suppressed when level=info", () => {
    const cap = captureWrite();
    const log = createLogger({ writer: cap.write, level: "info" });
    log.debug("hidden");
    log.info("visible");
    expect(cap.out).toHaveLength(1);
    expect(JSON.parse(cap.out[0].trim()).msg).toBe("visible");
  });
});
