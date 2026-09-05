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

/** §6b three-act route: departure belt, the Long Dark, arrival debris. */
export function buildSchedule(r: Rng, actII = 40): Encounter[] {
  const out: Encounter[] = [];
  const act = (from: number, to: number, n: number, richness: number) => {
    for (let i = 0; i < n; i++) {
      const year = from + ((i + range(r, 0.2, 0.8)) / n) * (to - from);
      out.push({ year, cls: pick(r, [...CLASSES], FREQ), richness });
    }
  };
  act(0, 50, 30, 2.5);        // Act I  — big, well-surveyed, cheap to reach
  act(50, 260, actII, 1.0);   // Act II — the Long Dark
  act(260, 300, 30, 1.0);     // Act III
  return out.sort((a, b) => a.year - b.year);
}

export const CAP_PER_SORTIE = 40;
export const SORTIES_PER_WINDOW = 4;
export const PROPELLANT_PER_SORTIE = 6;   // water, thrown away (§6b)

/** Harvest one encounter with the fleet available. Returns what came aboard. */
export function harvest(enc: Encounter, drones: number) {
  const sorties = drones * SORTIES_PER_WINDOW;
  const units = sorties * CAP_PER_SORTIE * enc.richness;
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
