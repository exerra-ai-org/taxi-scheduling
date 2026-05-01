/**
 * Generic TTL + LRU in-memory cache with async-fn memoisation.
 *
 * Used by services that hit slow upstreams (OSRM) or rarely-changing
 * tables (mile_rates, fixed_routes) to absorb load. Same-key concurrent
 * calls share a single in-flight request — important for OSRM where a
 * burst of identical pricing quotes used to fan out to as many HTTP hops.
 *
 * - get/set is O(1). LRU recency uses Map insertion order, which is
 *   guaranteed to be insertion order in V8 / JSC, refreshed on each `get`.
 * - Errors are NOT cached. The next call retries cleanly.
 * - Past-TTL entries return undefined and are evicted lazily on access.
 *
 * Not safe for multi-process; for that swap the storage layer for Redis.
 */

export interface TtlCacheOptions {
  maxSize: number;
  /** Per-entry lifetime in milliseconds. */
  ttlMs: number;
}

export interface TtlCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  clear(): void;
  size(): number;
  /** Memoise an async function. Identical keys de-dupe to a single
   *  in-flight call. Errors are NOT cached. */
  wrap(fn: (key: K) => Promise<V>): (key: K) => Promise<V>;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export function createTtlCache<K, V>(opts: TtlCacheOptions): TtlCache<K, V> {
  const { maxSize, ttlMs } = opts;
  const store = new Map<K, Entry<V>>();
  const inFlight = new Map<K, Promise<V>>();

  function isExpired(e: Entry<V>): boolean {
    return e.expiresAt <= Date.now();
  }

  function pruneOldest(): void {
    while (store.size > maxSize) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        store.delete(key);
        return undefined;
      }
      // Refresh LRU recency by re-inserting at the tail.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      store.delete(key);
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      pruneOldest();
    },
    has(key) {
      const entry = store.get(key);
      if (!entry) return false;
      if (isExpired(entry)) {
        store.delete(key);
        return false;
      }
      return true;
    },
    clear() {
      store.clear();
      inFlight.clear();
    },
    size() {
      // Lazy expiry: do not include past-TTL entries in the reported size.
      let n = 0;
      for (const e of store.values()) if (!isExpired(e)) n += 1;
      return n;
    },
    wrap(fn) {
      const cache = this;
      return async function memoised(key) {
        const cached = cache.get(key);
        if (cached !== undefined) return cached;

        const inflight = inFlight.get(key);
        if (inflight) return inflight;

        const promise = fn(key)
          .then((value) => {
            cache.set(key, value);
            return value;
          })
          .finally(() => {
            inFlight.delete(key);
          });

        inFlight.set(key, promise);
        return promise;
      };
    },
  };
}
