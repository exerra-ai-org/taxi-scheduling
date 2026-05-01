import { test, expect, describe, beforeEach, afterAll } from "bun:test";

const realFetch = globalThis.fetch;

let fetchCalls: string[] = [];
let nextResponse: Response | Error = new Response(
  JSON.stringify({
    routes: [{ distance: 16093.44, duration: 600 }],
  }),
  { status: 200, headers: { "content-type": "application/json" } },
);

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(typeof url === "string" ? url : url.toString());
    if (nextResponse instanceof Error) throw nextResponse;
    return nextResponse.clone();
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

async function importFresh() {
  // Force a clean import so cache state is fresh per test.
  // Bun cannot truly purge the module cache mid-test, so we instead
  // clear the cache exposed by the module (added below).
  const mod = await import("../../src/services/osrm");
  mod.__resetOsrmCacheForTests();
  return mod;
}

describe("getOsrmDistance — cached upstream", () => {
  test("identical coords produce only one HTTP call", async () => {
    const { getOsrmDistance } = await importFresh();
    await getOsrmDistance(51.5, -0.1, 51.6, -0.2);
    await getOsrmDistance(51.5, -0.1, 51.6, -0.2);
    await getOsrmDistance(51.5, -0.1, 51.6, -0.2);
    expect(fetchCalls).toHaveLength(1);
  });

  test("coords differing only past the 4th decimal hit the cache", async () => {
    const { getOsrmDistance } = await importFresh();
    await getOsrmDistance(51.50001, -0.10001, 51.60001, -0.20001);
    await getOsrmDistance(51.50002, -0.10002, 51.60002, -0.20002);
    expect(fetchCalls).toHaveLength(1);
  });

  test("meaningfully different coords miss the cache and refetch", async () => {
    const { getOsrmDistance } = await importFresh();
    await getOsrmDistance(51.5, -0.1, 51.6, -0.2);
    await getOsrmDistance(51.51, -0.1, 51.6, -0.2); // ~1km north
    expect(fetchCalls).toHaveLength(2);
  });

  test("upstream failure (null result) is NOT cached — retries hit again", async () => {
    const { getOsrmDistance } = await importFresh();

    // First call: simulate transport error → fn returns null
    nextResponse = new Response("upstream down", { status: 503 });
    const a = await getOsrmDistance(40, -74, 40.1, -74.1);
    expect(a).toBeNull();

    // Second call with the same coords: should refetch (we don't want
    // a transient OSRM hiccup to poison the cache)
    nextResponse = new Response(
      JSON.stringify({ routes: [{ distance: 16093.44, duration: 600 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const b = await getOsrmDistance(40, -74, 40.1, -74.1);
    expect(b).not.toBeNull();
    expect(fetchCalls).toHaveLength(2);
  });

  test("concurrent identical lookups dedupe to a single HTTP request", async () => {
    const { getOsrmDistance } = await importFresh();

    // Slow the response so the in-flight de-dupe matters.
    let resolveResp!: (r: Response) => void;
    const slowResp = new Promise<Response>((r) => {
      resolveResp = r;
    });
    globalThis.fetch = (async () => {
      fetchCalls.push("slow");
      return slowResp;
    }) as typeof fetch;

    const p1 = getOsrmDistance(45, -0.5, 45.5, -0.5);
    const p2 = getOsrmDistance(45, -0.5, 45.5, -0.5);
    const p3 = getOsrmDistance(45, -0.5, 45.5, -0.5);

    resolveResp(
      new Response(
        JSON.stringify({ routes: [{ distance: 16093.44, duration: 600 }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const [a, b, c] = await Promise.all([p1, p2, p3]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    expect(fetchCalls.filter((c) => c === "slow")).toHaveLength(1);
  });
});
