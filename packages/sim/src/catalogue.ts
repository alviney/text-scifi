import type { Asset, Complexity } from "./types.ts";

/** The §4 catalogue: 42 active assets. Passive items are omitted — they never wear. */
const CAT: [string, string, Complexity, number][] = [
  // id, room, complexity, baseWear multiplier
  ["nav",        "Bridge",       "high", 0.6],
  ["comms",      "Bridge",       "med",  0.8],
  ["fabricator", "Engineering",  "high", 1.3],
  ["smelter",    "Engineering",  "med",  1.4],
  ["workbench",  "Engineering",  "low",  0.5],
  ["reactor",    "Reactor",      "high", 1.8],
  ["powerdist",  "Reactor",      "med",  0.9],
  ["battery",    "Reactor",      "med",  1.0],
  ["rtg",        "Reactor",      "med",  0.4],
  ["auxarray",   "Reactor",      "low",  0.5],
  ["o2gen",      "Life Support", "high", 1.4],
  ["water",      "Life Support", "med",  1.1],
  ["atmo",       "Life Support", "med",  0.9],
  ["irrigation", "Hydroponics",  "low",  0.8],
  ["cryo",       "Medbay",       "high", 1.0],
  ["medstation", "Medbay",       "med",  0.7],
  ["scanner",    "Medbay",       "med",  0.6],
  ["dispenser",  "Quarters",     "low",  0.7],
  ["recterm",    "Quarters",     "low",  0.5],
  ["crane",      "Cargo Bay",    "med",  0.9],
  ["launcher",   "Drone Bay",    "med",  1.0],
  ["dronefab",   "Drone Bay",    "high", 1.2],
  ["clamp",      "Drone Bay",    "low",  0.8],
  ["hullpanel",  "Maintenance",  "low",  0.9],
  ["doors",      "Maintenance",  "med",  0.8],
  ["conduits",   "Maintenance",  "low",  0.7],
];

/** Tuned so an untouched healthy asset falls 100 -> 30 in ~2 years (§4). */
export const BASE_WEAR_PER_DAY = 70 / (2 * 365);

export function buildAssets(): Asset[] {
  const out: Asset[] = [];
  const add = (id: string, room: string, cls: Complexity, mult: number) =>
    out.push({ id, room, cls, baseWear: BASE_WEAR_PER_DAY * mult,
               cond: 100, maxCond: 100, faulted: false, repairs: 0 });

  for (const [id, room, cls, mult] of CAT) add(id, room, cls, mult);
  for (let i = 1; i <= 10; i++) add(`lsn${i}`, "node", "med", 0.7);   // LifeSupportNode x10
  for (let i = 1; i <= 6; i++) add(`bed${i}`, "Hydroponics", "low", 0.6); // Grow Bed x6
  return out;
}

/** Direct rare compounds in a replacement, by complexity (§7).
 *  NOT the 2/5/14 figures in plan.md's complexity table — those are the TOTAL
 *  rare-compound cost, and the bulk of it is already carried by the electronics
 *  below (1 rare compound each). Charging both double-counts the choke point. */
export const RARE_COST: Record<Complexity, number> = { low: 0, med: 0, high: 2 };
/** Metal parts and electronics per replacement. */
export const PART_COST: Record<Complexity, number> = { low: 6, med: 10, high: 16 };
export const ELEC_COST: Record<Complexity, number> = { low: 2, med: 5, high: 12 };
