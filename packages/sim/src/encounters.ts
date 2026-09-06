import { type Rng, next, pick, range } from "./rng.ts";
import type { Encounter, Stores } from "./types.ts";
import { LEGS } from "./legs.ts";

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

/** §6b's route, bunched into the five harvest seasons (legs.ts).
 *
 *  It used to be a hundred objects trickling across three hundred years, which
 *  meant the ship had to be awake for all three hundred. Same hundred objects,
 *  same acts, same total yield — they now arrive in five clusters of about
 *  ninety days each, and the ship sleeps between them. */
export function buildSchedule(r: Rng): Encounter[] {
  const out: Encounter[] = [];
  for (const leg of LEGS) {
    for (let i = 0; i < leg.objects; i++) {
      // Spread through the cluster, but unevenly — a season with a lull in the
      // middle and two objects arriving together reads as a place, not a metronome.
      const t = (i + range(r, 0.05, 0.95)) / leg.objects;
      out.push({
        id: out.length,
        year: leg.year + (t * leg.days) / 365,
        leg: leg.n,
        cls: pick(r, [...CLASSES], FREQ),
        richness: leg.richness,
        size: range(r, 0.45, 1.55),
        bias: range(r, -1, 1),
        scans: 0,
        flown: 0, landed: 0,
      });
    }
  }
  out.sort((a, b) => a.year - b.year);
  out.forEach((e, i) => { e.id = i; });
  return out;
}

export const CAP_PER_SORTIE = 40;
export const SORTIES_PER_WINDOW = 4;
export const PROPELLANT_PER_SORTIE = 6;   // water, thrown away (§6b)

/** The water a full wave costs. Drones fly on the same stuff the crew drink,
 *  which is what makes a comet worth taking rather than worth skipping. */
export const propellantFor = (sorties: number) => sorties * PROPELLANT_PER_SORTIE;

/** Water the bay holds back for the fleet before it loads anything else.
 *
 *  Three waves. Without this the two ends of §4 collide: the bay fills with ore
 *  nobody has hauled to the shop yet, ice cannot land because there is no shelf
 *  left, and the fleet stops flying — measured, a full bay cost 15 of 26
 *  encounters in the first season and left the crew watching rocks go past with
 *  a hold full of material they could not move. A full bay is supposed to cost
 *  you cargo, which it still does. It is not supposed to cost you the fleet. */
export const PROPELLANT_RESERVE = propellantFor(3 * 24);

/** §6b's window, in days either side of closest approach.
 *
 *  "Objects are detected 6-18 months ahead... the launch window is a cost curve,
 *  not a gate." The lead is longer than the tail on purpose: a drone can chase
 *  something down, expensively, but once the object is receding at cruise
 *  velocity it is gone and no amount of propellant catches it.
 *
 *  THE OVERLAP IS THE DECISION, and the first cut of these numbers designed it
 *  out. At a 12-day lead against a season's ~18-day object spacing only one
 *  object is ever in range, so the fleet takes whatever is in front of it and
 *  "which rock" is not a choice at all — measured, picking the biggest, the
 *  most metallic and the most icy rock of the season produced byte-identical
 *  seasons. A 28-day lead puts two and often three objects in range at once,
 *  which is what forces you to leave one.
 *
 *  The tail stays short. Chasing something down is expensive; catching something
 *  that is already receding at cruise velocity is impossible. */
export const WINDOW_LEAD = 28;
export const WINDOW_TAIL = 8;

export const closestApproach = (e: Encounter) => e.year * 365;
export const windowOpens = (e: Encounter) => closestApproach(e) - WINDOW_LEAD;
export const windowCloses = (e: Encounter) => closestApproach(e) + WINDOW_TAIL;
export const inWindow = (e: Encounter, day: number) =>
  day >= windowOpens(e) && day <= windowCloses(e);
export const windowGone = (e: Encounter, day: number) => day > windowCloses(e);

/** §6b's cost curve, as a multiplier on a sortie's propellant.
 *
 *  | Early | High — the drone burns fuel chasing |
 *  | At the minimum | Lowest |
 *  | Late | Rises steeply |
 *
 *  This is the only reason the launch button is a decision rather than a
 *  formality. Sending the fleet the hour a window opens costs about 2.4x what
 *  sending it two days before closest approach costs, and the water it wastes
 *  is water the NEXT object's wave does not have. Waiting is the skill; waiting
 *  too long is how you lose the rock and a drone with it. */
export function dvCost(e: Encounter, day: number): number {
  const t = day - closestApproach(e);
  if (t <= 0) return 1 + Math.pow(Math.min(1, -t / WINDOW_LEAD), 1.4) * 1.7;
  return 1 + Math.pow(Math.min(1, t / WINDOW_TAIL), 2) * 3.2;
}

/** What one drone brings back from one round trip, by material.
 *
 *  Harvest used to be a single instantaneous call for the whole object, which
 *  is what made the encounter something that HAPPENED TO the player rather than
 *  something they did. A wave is now flown a day at a time, so the material
 *  arrives while the season is still running and the crew can carry it out of
 *  the bay as it lands. */
export function sortieYield(e: Encounter) {
  const units = CAP_PER_SORTIE * e.richness * e.size;
  const c = COMP[e.cls];
  return { ice: units * c.ice, vol: units * c.vol, sil: units * c.sil,
           ore: units * c.ore, rare: units * c.rare, units };
}

/** How many round trips an object is worth before it is picked clean. */
export const sortiesFor = (drones: number) => drones * SORTIES_PER_WINDOW;

/** §6b's risk column. A sortie flown off the minimum is a sortie flown hard,
 *  and hard sorties are the ones that do not come back. */
export const SORTIE_LOSS = 0.010;

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
