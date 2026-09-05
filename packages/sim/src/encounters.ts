import { type Rng, next, pick, range } from "./rng.ts";
import type { Encounter, Stores } from "./types.ts";

/** §6b object classes: frequency and composition. */
export const CLASSES = ["C", "S", "M", "Comet", "Exotic"] as const;
const FREQ = [35, 30, 20, 10, 5];
const COMP: Record<string, Record<keyof Pick<Stores,"ice"|"vol"|"sil"|"ore"|"rare">, number>> = {
  C:      { ice: .45, vol: .35, sil: .15, ore: .05, rare: .00 },
  S:      { ice: .10, vol: .07, sil: .45, ore: .35, rare: .03 },
  M:      { ice: .02, vol: .05, sil: .15, ore: .60, rare: .18 },
  Comet:  { ice: .65, vol: .30, sil: .05, ore: .00, rare: .00 },
  Exotic: { ice: .00, vol: .10, sil: .20, ore: .25, rare: .45 },
};

/** §6b three-act route: departure belt, the Long Dark, arrival debris.
 *
 *  Each object also gets a `size` and a `bias`. Size makes rocks differ within
 *  an act, so "a big one is coming" is a thing the player can see rather than a
 *  uniform stream of identical diamonds; it averages 1.0 so the act's richness
 *  still sets the act's yield. Bias is the direction this object's estimate is
 *  wrong in — fixed at build time so a survey converges on the truth instead of
 *  jittering every time the screen redraws. */
export function buildSchedule(r: Rng, actII = 40): Encounter[] {
  const out: Encounter[] = [];
  const act = (from: number, to: number, n: number, richness: number) => {
    for (let i = 0; i < n; i++) {
      const year = from + ((i + range(r, 0.2, 0.8)) / n) * (to - from);
      out.push({ id: out.length, year, cls: pick(r, [...CLASSES], FREQ), richness,
                 size: range(r, 0.45, 1.55), bias: range(r, -1, 1), scans: 0 });
    }
  };
  act(0, 50, 30, 2.5);        // Act I  — big, well-surveyed, cheap to reach
  act(50, 260, actII, 1.0);   // Act II — the Long Dark
  act(260, 300, 30, 1.0);     // Act III
  out.sort((a, b) => a.year - b.year);
  out.forEach((e, i) => { e.id = i; });
  return out;
}

export const CAP_PER_SORTIE = 40;
export const SORTIES_PER_WINDOW = 4;
export const PROPELLANT_PER_SORTIE = 6;   // water, thrown away (§6b)

/** Harvest one encounter with the fleet available. Returns what came aboard. */
export function harvest(enc: Encounter, drones: number) {
  const sorties = drones * SORTIES_PER_WINDOW;
  const units = sorties * CAP_PER_SORTIE * enc.richness * enc.size;
  const c = COMP[enc.cls];
  return {
    ice: units * c.ice - sorties * PROPELLANT_PER_SORTIE,  // propellant is spent, not banked
    vol: units * c.vol,
    sil: units * c.sil,
    ore: units * c.ore,
    rare: units * c.rare,
    sorties,
  };
}


/** What the object is actually worth, in units aboard, for a given fleet. */
export const trueMass = (enc: Encounter, drones = 6) =>
  drones * SORTIES_PER_WINDOW * CAP_PER_SORTIE * enc.richness * enc.size;

/** §6b: what the ship can tell about an object from here.
 *
 *  Confidence comes from two things the player controls differently. Proximity
 *  is free and arrives on its own; scans are bought, one game-hour at a time.
 *  Neither reaches certainty on its own — a distant rock scanned three times and
 *  a close one never scanned land in roughly the same place. */
export const SCAN_HOURS = 1;
export const SCAN_GAIN = 0.18;
/** Never certain. An instrument that reports an exact figure is lying, and
 *  "1,733 to 1,733 units" reads as a bug rather than as knowledge. */
export const MAX_CONFIDENCE = 0.97;

export function confidence(enc: Encounter, year: number): number {
  const away = Math.max(0, enc.year - year);
  const near = Math.max(0, 1 - away / 25);          // free, and slow
  return Math.max(0, Math.min(MAX_CONFIDENCE, 0.15 + 0.55 * near + SCAN_GAIN * enc.scans));
}

/** Is there anything left to learn? Used to stop the button being a no-op. */
export const worthScanning = (enc: Encounter, year: number) =>
  confidence(enc, year) < MAX_CONFIDENCE - 0.001;

/** A reading, as a range that closes on the truth as confidence rises. */
export function estimate(truth: number, enc: Encounter, conf: number) {
  const err = (1 - conf) * 0.8;
  const mid = truth * (1 + enc.bias * err * 0.5);
  return { mid, lo: Math.max(0, mid * (1 - err)), hi: mid * (1 + err), err };
}

/** The composition readout, in the same shape. */
export function estimateComposition(enc: Encounter, conf: number) {
  const c = COMP[enc.cls];
  return (Object.keys(c) as (keyof typeof c)[])
    .map(k => ({ what: k, share: c[k], ...estimate(c[k], enc, conf) }))
    .filter(x => x.share > 0.02 || x.hi > 0.05)
    .sort((a, b) => b.mid - a.mid);
}

/** design/README's plain language: "M-type (est.)" reads as "Probably metal". */
export const CLASS_NAME: Record<string, string> = {
  C: "carbon", S: "stone", M: "metal", Comet: "ice", Exotic: "rare earths",
};
export function classReading(enc: Encounter, conf: number): string {
  if (conf < 0.45) return "Composition unknown";
  if (conf < 0.8) return `Probably ${CLASS_NAME[enc.cls]}`;
  return `${CLASS_NAME[enc.cls][0].toUpperCase()}${CLASS_NAME[enc.cls].slice(1)}`;
}
