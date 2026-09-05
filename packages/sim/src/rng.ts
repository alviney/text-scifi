/** Seeded, deterministic PRNG. The core never touches Math.random(). */
export type Rng = { s: number };

export const rng = (seed: number): Rng => ({ s: seed >>> 0 });

/** mulberry32 — small, fast, good enough, and identical across runtimes. */
export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (r: Rng, lo: number, hi: number) => lo + next(r) * (hi - lo);
export const chance = (r: Rng, p: number) => next(r) < p;

export function pick<T>(r: Rng, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = next(r) * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
  return items[items.length - 1];
}
