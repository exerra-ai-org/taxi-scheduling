import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { logger as rootLogger, type Logger } from "../lib/logger";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
    logger: Logger;
  }
}

/**
 * Allowed characters for an inbound request ID. Anything outside this
 * set could enable header injection (CRLF) or log forging — fall back
 * to a generated UUID.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestContext(): MiddlewareHandler {
  return async (c, next) => {
    const inbound = c.req.header("x-request-id");
    const requestId =
      inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();

    const log = rootLogger.child({
      requestId,
      method: c.req.method,
      path: c.req.path,
    });

    c.set("requestId", requestId);
    c.set("logger", log);
    c.header("x-request-id", requestId);

    await next();
  };
}
