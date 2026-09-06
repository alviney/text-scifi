import type { Stores } from "./types.ts";

export const emptyStores = (): Stores => ({
  ore: 0, ice: 0, sil: 0, vol: 0, rare: 0,
  refMetal: 0, rareCmp: 0, parts: 0, electronics: 0,
});

/** §7 refining and fabrication yields. */
export const YIELD = { ore: 0.6, rare: 0.3, sil: 0.5 };

/** Rare compounds held back for replacements and fuel rods, never spent on electronics. */
export const RARE_RESERVE = 60;
/** Electronics are made to a target, not endlessly.
 *
 *  Raised from 200 once the voyage became five legs: a sixty-year crossing with
 *  no material coming aboard needs ~225 electronics, so a hard ceiling of 200
 *  made the readiness gate impossible to pass by arithmetic rather than by play.
 *  A cap that cannot be reached is a bug, not a balance choice. */
export const ELEC_TARGET = 400;

/** Refine whatever raw material is on hand, limited by throughput per day. */
export function refine(s: Stores, oreCap: number, rareCap: number, silCap: number,
                       rareReserve = RARE_RESERVE, elecTarget = ELEC_TARGET) {
  const o = Math.min(s.ore, oreCap);   s.ore -= o;   s.refMetal += o * YIELD.ore;
  const r = Math.min(s.rare, rareCap); s.rare -= r;  s.rareCmp  += r * YIELD.rare;
  const q = Math.min(s.sil, silCap);   s.sil  -= q;
  // 2 silicon + 1 rare compound -> 1 electronics, but only up to the target and
  // never dipping into the reserve. Rare compounds are the choke point (§7) and
  // must not be silently spent on stock nobody asked for.
  const room = Math.max(0, elecTarget - s.electronics);
  const spendable = Math.max(0, s.rareCmp - rareReserve);
  const made = Math.min(q / 2, spendable, room);
  s.rareCmp -= made; s.electronics += made;
}

/** Parts are made to a target, like electronics.
 *
 *  Without a ceiling the shop hoards them: §4's room buffer is one shelf, so a
 *  fabricator running flat out fills Engineering with its own output and then
 *  has no room to accept the ore it needs. Measured, that let **3% of landed ore
 *  reach the shop** across a voyage — incoming deliveries bounced back to the
 *  Cargo Bay and the parts economy quietly died around year 150.
 *
 *  §4's own diagram separates the input buffer from the output buffer. Capping
 *  production is the cheap way to honour that without modelling two shelves. */
export const PARTS_TARGET = 500;

/** Metal parts: 4 refined metal -> 1 part. */
export function makeParts(s: Stores, cap: number, target = PARTS_TARGET) {
  const room = Math.max(0, target - s.parts);
  const n = Math.min(Math.floor(s.refMetal / 4), cap, room);
  s.refMetal -= n * 4; s.parts += n;
}

/** §7: a fuel rod is 12 rare compounds + 2 metal parts. */
export const ROD_RARE = 12;
export const ROD_PARTS = 2;
export function canMakeRod(s: Stores) { return s.rareCmp >= ROD_RARE && s.parts >= ROD_PARTS; }
export function makeRod(s: Stores) { s.rareCmp -= ROD_RARE; s.parts -= ROD_PARTS; }

/** §6b: a drone is 8 metal parts + 6 electronics + 2 seals (seals folded into parts). */
export const DRONE_PARTS = 10, DRONE_ELEC = 6;
export function canMakeDrone(s: Stores) { return s.parts >= DRONE_PARTS && s.electronics >= DRONE_ELEC; }
export function makeDrone(s: Stores) { s.parts -= DRONE_PARTS; s.electronics -= DRONE_ELEC; }
