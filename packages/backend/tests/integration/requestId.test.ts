import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { requestContext } from "../../src/middleware/requestContext";

describe("requestContext middleware", () => {
  let app: Hono;
  beforeAll(() => {
    app = new Hono();
    app.use("*", requestContext());
    app.get("/x", (c) => {
      const reqId = c.get("requestId");
      const log = c.get("logger");
      log.info("hit", { route: "/x" });
      return c.json({ reqId });
    });
  });

  test("generates a request id and exposes it on the response header", async () => {
    const res = await app.request("/x");
    expect(res.status).toBe(200);
    const reqId = res.headers.get("x-request-id");
    expect(reqId).toBeTruthy();
    const body = (await res.json()) as { reqId: string };
    expect(body.reqId).toBe(reqId);
  });

  test("respects an inbound x-request-id when present", async () => {
    const res = await app.request("/x", {
      headers: { "x-request-id": "client-supplied-abc-123" },
    });
    expect(res.headers.get("x-request-id")).toBe("client-supplied-abc-123");
    const body = (await res.json()) as { reqId: string };
    expect(body.reqId).toBe("client-supplied-abc-123");
  });

  test("rejects request ids that fail validation and falls back to a UUID", async () => {
    // Spaces, semicolons, oversize: all fail the SAFE_REQUEST_ID regex.
    const cases = [
      "has spaces in it",
      "x".repeat(200),
      "<script>",
      'value;injection="y"',
    ];
    for (const c of cases) {
      const res = await app.request("/x", {
        headers: { "x-request-id": c },
      });
      const id = res.headers.get("x-request-id");
      expect(id).not.toBe(c);
      // Generated UUIDs match this shape.
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  test("generates distinct ids per request", async () => {
    const r1 = await app.request("/x");
    const r2 = await app.request("/x");
    expect(r1.headers.get("x-request-id")).not.toBe(
      r2.headers.get("x-request-id"),
    );
  });

  test("the bound logger is available via c.var.logger", async () => {
    // The handler above calls log.info — covered implicitly.
    // Here we just assert the route returns 200, proving the binding
    // exists.
    const res = await app.request("/x");
    expect(res.status).toBe(200);
  });
});
