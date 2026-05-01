import { logger } from "./logger";

/**
 * Graceful-shutdown registry.
 *
 * Hooks run in reverse registration order (LIFO) so the most recently
 * added subsystem (e.g., DB pool, opened *after* the HTTP server in
 * index.ts) gets a chance to drain before earlier ones close.
 *
 * Each hook has a per-hook timeout so a wedged shutdown handler never
 * blocks the rest. Errors in one hook are logged but do not stop the
 * cascade. The whole `run()` is idempotent.
 */
export interface ShutdownHook {
  name: string;
  fn: () => Promise<void> | void;
}

export interface ShutdownOptions {
  hookTimeoutMs?: number;
}

export interface Shutdown {
  register(name: string, fn: () => Promise<void> | void): void;
  run(signal: string): Promise<void>;
}

export function createShutdown(opts: ShutdownOptions = {}): Shutdown {
  const hookTimeoutMs = opts.hookTimeoutMs ?? 10_000;
  const hooks: ShutdownHook[] = [];
  let isShuttingDown = false;

  return {
    register(name, fn) {
      hooks.push({ name, fn });
    },
    async run(signal) {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info("shutdown initiated", { signal, hookCount: hooks.length });

      for (let i = hooks.length - 1; i >= 0; i--) {
        const hook = hooks[i];
        try {
          await Promise.race([
            Promise.resolve(hook.fn()),
            new Promise<void>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `shutdown hook '${hook.name}' exceeded ${hookTimeoutMs}ms`,
                    ),
                  ),
                hookTimeoutMs,
              ),
            ),
          ]);
        } catch (cause) {
          logger.error("shutdown hook failed", {
            name: hook.name,
            err: cause as Error,
          });
        }
      }

      logger.info("shutdown complete", { signal });
    },
  };
}
