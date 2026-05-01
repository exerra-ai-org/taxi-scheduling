import { describe, test, expect, beforeAll, mock } from "bun:test";
import { sign } from "hono/jwt";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

const SECRET = process.env.JWT_SECRET;

let lastSelectShape: Record<string, unknown> | null = null;
let lastJoinTargets: string[] = [];
let returnedRows: any[] = [];

mock.module("../../src/db/index", () => ({
  dbClient: { end: async () => {} },
  db: {
    select: (shape: Record<string, unknown>) => {
      lastSelectShape = shape;
      lastJoinTargets = [];
      const obj: any = {};
      obj.from = () => obj;
      obj.leftJoin = (target: any) => {
        // Drizzle table objects have a .name accessor on the symbol.
        const name =
          target?.[Symbol.for("drizzle:Name")] ??
          target?.constructor?.name ??
          "unknown";
        lastJoinTargets.push(String(name));
        return obj;
      };
      obj.innerJoin = (target: any) => {
        const name =
          target?.[Symbol.for("drizzle:Name")] ??
          target?.constructor?.name ??
          "unknown";
        lastJoinTargets.push(`inner:${String(name)}`);
        return obj;
      };
      obj.where = () => obj;
      obj.orderBy = () => Promise.resolve(returnedRows);
      obj.then = (resolve: any) => resolve(returnedRows);
      return obj;
    },
  },
}));

let app: any;

async function customerCookie(): Promise<string> {
  const token = await sign(
    {
      sub: 7,
      email: "alice@example.com",
      role: "customer",
      name: "Alice",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    SECRET,
  );
  return `token=${token}`;
}

beforeAll(async () => {
  const { Hono } = await import("hono");
  const { bookingRoutes } = await import("../../src/routes/bookings");
  app = new Hono();
  app.route("/bookings", bookingRoutes);
});

describe("GET /bookings — customer list", () => {
  test("uses left joins on reviews, driver_assignments and users (no correlated subqueries)", async () => {
    returnedRows = [];

    const cookie = await customerCookie();
    await app.request("/bookings", { headers: { cookie } });

    expect(lastJoinTargets.length).toBeGreaterThanOrEqual(3);
    const flat = lastJoinTargets.join(",");
    // The query joins reviews, an aliased active-primary
    // driver_assignment, and an aliased primary-driver users row.
    expect(flat).toMatch(/reviews/);
    expect(flat).toMatch(/active_primary_da/);
    expect(flat).toMatch(/active_primary_user/);

    // The select shape must include the join-derived columns the
    // frontend depends on.
    const cols = Object.keys(lastSelectShape ?? {});
    expect(cols).toContain("hasReview");
    expect(cols).toContain("reviewRating");
    expect(cols).toContain("primaryDriverName");
    expect(cols).toContain("primaryDriverPhone");
  });

  test("preserves the response shape when rows include the joined fields", async () => {
    returnedRows = [
      {
        id: 1,
        customerId: 7,
        pickupAddress: "A",
        dropoffAddress: "B",
        status: "completed",
        hasReview: true,
        reviewRating: 5,
        primaryDriverName: "Bob",
        primaryDriverPhone: "07000",
      },
    ];

    const cookie = await customerCookie();
    const res = await app.request("/bookings", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { bookings: any[] };
    };
    const b = body.data.bookings[0];
    expect(b.hasReview).toBe(true);
    expect(b.reviewRating).toBe(5);
    expect(b.primaryDriverName).toBe("Bob");
    expect(b.primaryDriverPhone).toBe("07000");
  });
});
