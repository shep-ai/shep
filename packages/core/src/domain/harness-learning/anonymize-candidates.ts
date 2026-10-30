/**
 * Anonymous, stable ids for blind selection (spec 150).
 *
 * The selector must not learn which harness produced which output, so labels
 * are sorted, shuffled with a PRNG seeded from a key (feature, k, recursion)
 * and renamed A, B, … — the same inputs always give the same mapping, so a
 * resumed refinement shows the selector the same ids. Adapted from Harness²
 * `core/selection.py` (google-research/harness2, Apache-2.0).
 */

const ALPHABET = 26;
const CHAR_A = 65;

/** A..Z, then AA..AZ, BA… */
export function anonymousId(index: number): string {
  let out = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % ALPHABET;
    out = String.fromCharCode(CHAR_A + rem) + out;
    n = Math.floor((n - 1) / ALPHABET);
  }
  return out;
}

/** FNV-1a 32-bit hash of a string. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny deterministic PRNG returning [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** anonymous id → label. */
export function assignAnonymousIds(
  labels: readonly string[],
  seedKey: string
): Record<string, string> {
  const ordered = [...labels].sort();
  const random = mulberry32(fnv1a(seedKey));
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const map: Record<string, string> = {};
  ordered.forEach((label, i) => {
    map[anonymousId(i)] = label;
  });
  return map;
}
