import { type Rng, rng, next, chance } from "./rng.ts";
import type { Asset, Policy, State } from "./types.ts";
import { buildAssets, RARE_COST, PART_COST, ELEC_COST } from "./catalogue.ts";
import { buildSchedule, harvest } from "./encounters.ts";
import { emptyStores, refine, makeParts, canMakeRod, makeRod, canMakeDrone, makeDrone,
         RARE_RESERVE, ELEC_TARGET } from "./economy.ts";
import { BASELINE_KW, reactorOutput, rodsPerDay, conditionFactor } from "./power.ts";

export const START_RODS = 320;
export const START_DRONES = 6;
const DAYS = 300 * 365;

export function init(seed: number, actII = 40): State {
  const r = rng(seed);
  const s: State = {
    day: 0, rngState: 0, assets: buildAssets(), rods: START_RODS, drones: START_DRONES,
    stores: emptyStores(), schedule: buildSchedule(r, actII), next: 0,
    counters: { services: 0, replacements: 0, faults: 0, encountersTaken: 0,
                encountersMissed: 0, rodsMade: 0, deficitDays: 0, brownoutDays: 0 },
    dead: null,
  };
  s.rngState = r.s;
  // the ship departs with a working stock, not empty shelves
  s.stores.parts = 120; s.stores.electronics = 40; s.stores.rareCmp = 60; s.stores.refMetal = 200;
  return s;
}

const reactorOf = (s: State) => s.assets.find(a => a.id === "reactor")!;

/** The dependency order everything else hangs off. Lower is attended to first. */
export const CRITICAL_ORDER: Record<string, number> = {
  reactor: 0, powerdist: 1, o2gen: 1, smelter: 2, fabricator: 2, water: 3, atmo: 3, cryo: 3,
};
/** §4: wear accelerates as the ceiling falls. */
const ageFactor = (a: Asset) => 1 + (100 - a.maxCond) / 40;

/** Floor: below this an asset is scrap, and only replacement helps. */
export const MAXCOND_FLOOR = 30;

/** §4 refurbishment loss.
 *  A flat per-service cost made frequent servicing strictly worse than neglect,
 *  which inverts the premise of the game. The loss is mostly proportional to the
 *  WEAR RECOVERED, so total ceiling erosion tracks total wear rather than visit
 *  count. A small fixed overhead still discourages pointless fiddling, and a
 *  faulted rebuild costs a real penalty on top. The decision then lives where it
 *  should — in fault risk — rather than in gaming the repair counter. */
export const REFURB_OVERHEAD = 0.05;
export const REFURB_RATE = 0.022;
export const FAULT_REBUILD_PENALTY = 2.0;

function service(s: State, a: Asset) {
  const recovered = a.maxCond - a.cond;
  const loss = REFURB_OVERHEAD + REFURB_RATE * recovered + (a.faulted ? FAULT_REBUILD_PENALTY : 0);
  a.cond = a.maxCond;
  a.maxCond = Math.max(MAXCOND_FLOOR, a.maxCond - loss);
  a.faulted = false;
  a.repairs++;
  s.counters.services++;
}

function replace(s: State, a: Asset): boolean {
  const st = s.stores;
  if (st.rareCmp < RARE_COST[a.cls] || st.parts < PART_COST[a.cls] || st.electronics < ELEC_COST[a.cls])
    return false;
  st.rareCmp -= RARE_COST[a.cls]; st.parts -= PART_COST[a.cls]; st.electronics -= ELEC_COST[a.cls];
  a.cond = 100; a.maxCond = 100; a.faulted = false; a.repairs = 0;
  s.counters.replacements++;
  return true;
}

/** One day. Wear is linear within a day, so a daily step is exact for it. */
export function step(s: State, p: Policy): State {
  if (s.dead) return s;
  const r: Rng = { s: s.rngState };
  const reactor = reactorOf(s);

  // ---- power ----
  const output = reactorOutput(reactor);
  const shortfall = BASELINE_KW - output;
  if (shortfall > 0) s.counters.brownoutDays++;
  // industry only runs on whatever is left over
  const headroom = Math.max(0, output - BASELINE_KW);

  // ---- industry demand: the shop only draws power when it has work ----
  const raw = s.stores.ore + s.stores.rare + s.stores.sil;
  const wantsIndustry = raw > 1 || s.stores.refMetal > 4;
  const industryKw = wantsIndustry ? Math.min(headroom, 240) : 0;

  // ---- fuel ----
  const delivered = Math.min(output, BASELINE_KW + industryKw);
  s.rods -= rodsPerDay(delivered, reactor.cond);
  if (s.rods <= 0) { s.dead = "out of fuel"; s.rngState = r.s; return s; }

  // ---- wear ----
  for (const a of s.assets) {
    if (a.faulted) continue;
    const env = reactor.faulted ? 2 : 1;
    a.cond -= a.baseWear * ageFactor(a) * env;
    if (a.cond <= 0) { a.cond = 0; a.faulted = true; s.counters.faults++; }
    // §4 AT_RISK: the further below 30 it sits, the likelier it breaks outright
    else if (a.cond < 30 && chance(r, 0.0025 * (1 - a.cond / 30))) {
      a.faulted = true; s.counters.faults++;
    }
  }

  // ---- industry (power-gated) ----
  const industry = industryKw / 240;               // 0..1, how much of the shop can run
  refine(s.stores, 40 * industry, 12 * industry, 20 * industry, RARE_RESERVE, ELEC_TARGET);
  makeParts(s.stores, 6 * industry);

  // ---- maintenance, limited by crew labour ----
  // Servicing only helps if there is wear to recover: an asset already at its
  // ceiling gains nothing and still pays the refurbishment loss.
  let jobs = p.labourPerDay;
  const worthDoing = (a: Asset) =>
    a.faulted || (a.cond < p.serviceAt && a.cond < a.maxCond - 3);
  // Which assets a player attends to first is a real strategic axis, and the
  // ship has a dependency order: without the reactor there is no power, without
  // power no refining, without refining no parts — including the parts that
  // would have fixed the reactor.
  const rank = (a: Asset) => (p.prioritise ? (CRITICAL_ORDER[a.id] ?? 9) : 0);
  const needy = s.assets.filter(worthDoing)
    .sort((a, b) => Number(b.faulted) - Number(a.faulted) || rank(a) - rank(b) || a.cond - b.cond);
  for (const a of needy) {
    if (jobs <= 0) break;
    if (a.maxCond < p.replaceAt) {
      if (replace(s, a)) { jobs--; continue; }
      // No parts. A worn-but-working asset is left alone rather than having its
      // ceiling burned for nothing — but a FAULTED one is always patched back,
      // because the alternative is losing it for the rest of the voyage.
      if (!a.faulted) continue;
    }
    service(s, a); jobs--;
  }

  // ---- keep the fleet up, and top up fuel when it looks short ----
  if (s.drones < p.droneTarget && canMakeDrone(s.stores)) { makeDrone(s.stores); s.drones++; }
  const yearsLeft = (DAYS - s.day) / 365;
  const rodsNeeded = yearsLeft * rodsPerDay(delivered, reactor.cond) * 365;
  if (s.rods < rodsNeeded * 1.05 && canMakeRod(s.stores)) { makeRod(s.stores); s.rods++; s.counters.rodsMade++; }
  if (s.rods < rodsNeeded) s.counters.deficitDays++;

  // ---- encounters ----
  const year = s.day / 365;
  while (s.next < s.schedule.length && s.schedule[s.next].year <= year) {
    const enc = s.schedule[s.next++];
    if (s.drones > 0 && !reactor.faulted) {
      const h = harvest(enc, s.drones);
      s.stores.ice += Math.max(0, h.ice); s.stores.vol += h.vol; s.stores.sil += h.sil;
      s.stores.ore += h.ore; s.stores.rare += h.rare;
      s.counters.encountersTaken++;
      if (chance(r, 0.06 * s.drones)) s.drones--;         // sortie losses
    } else s.counters.encountersMissed++;
  }

  s.day++;
  s.rngState = r.s;
  if (s.day >= DAYS) s.dead = "arrived";
  return s;
}

export function run(seed: number, p: Policy, actII = 40): State {
  const s = init(seed, actII);
  while (!s.dead) step(s, p);
  return s;
}
