/**
 * Minimal structured JSON-line logger.
 *
 * One log = one line of valid JSON to stdout. No deps, plays nicely with
 * Cloud Run / Loki / Datadog / GCP / CloudWatch ingestors that expect
 * JSON-per-line on stdout.
 *
 * Usage:
 *   const log = createLogger();
 *   log.info("server started", { port: 3000 });
 *   const child = log.child({ requestId: "abc" });
 *   child.error("db down", { err: new Error("ECONNREFUSED") });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  bindings?: Record<string, unknown>;
  writer?: (line: string) => boolean;
}

function serialiseError(e: Error): Record<string, unknown> {
  return { name: e.name, message: e.message, stack: e.stack };
}

function normaliseFields(
  fields: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Error) {
      out[k] = serialiseError(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const minRank = LEVEL_RANK[opts.level ?? "info"];
  const writer = opts.writer ?? ((line) => process.stdout.write(line));
  const baseBindings = opts.bindings ?? {};

  function emit(
    level: LogLevel,
    msg: string,
    fields?: Record<string, unknown>,
  ) {
    if (LEVEL_RANK[level] < minRank) return;
    const record = {
      level,
      time: new Date().toISOString(),
      msg,
      ...baseBindings,
      ...normaliseFields(fields),
    };
    writer(JSON.stringify(record) + "\n");
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (bindings) =>
      createLogger({
        level: opts.level,
        writer,
        bindings: { ...baseBindings, ...bindings },
      }),
  };
}

// Module-level default logger. Routes can replace with c.var.logger
// (request-scoped child).
const envLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
export const logger = createLogger({
  level: ["debug", "info", "warn", "error"].includes(envLevel)
    ? envLevel
    : "info",
});
