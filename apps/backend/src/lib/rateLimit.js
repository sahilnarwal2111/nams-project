// A small in-memory limit: at most `max` hits per key in each window. Enough
// for one small server; the counts reset when it restarts.
export function createRateLimit({ max, windowMs }) {
  const hits = new Map();
  return {
    // Counts one hit and reports whether it is allowed.
    take(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        // Drop finished windows so the map cannot grow without bound.
        if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset: () => hits.clear(),
  };
}
