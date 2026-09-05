import { type Rng, rng, next, chance } from "./rng.ts";
import type { Asset, Policy, State } from "./types.ts";
import { buildAssets, RARE_COST, PART_COST, ELEC_COST } from "./catalogue.ts";
import { buildSchedule, harvest } from "./encounters.ts";
import { emptyStores, refine, makeParts, canMakeRod, makeRod, canMakeDrone, makeDrone,
         RARE_RESERVE, ELEC_TARGET } from "./economy.ts";
import { BASELINE_KW, reactorOutput, rodsPerDay, conditionFactor } from "./power.ts";
import { type Rule, type Task, inheritedRules, playerRules, evaluate, reportedCondition } from "./rules.ts";
import { newColony, tickColony, labour } from "./colony.ts";

export const START_RODS = 320;
export const START_DRONES = 6;
const DAYS = 300 * 365;

export function init(seed: number, actII = 40, p?: Policy): State {
  const r = rng(seed);
  const s: State = {
    day: 0, rngState: 0, assets: buildAssets(), rods: START_RODS, drones: START_DRONES,
    stores: emptyStores(), schedule: buildSchedule(r, actII), next: 0,
    gauges: { parts: 100, rods: 100, rareCmp: 100, drones: 100 }, colony: newColony(), rules: [], board: [],
    counters: { ruleFires: 0, staleTasks: 0, blindDays: 0, services: 0, replacements: 0,
                faults: 0, encountersTaken: 0, encountersMissed: 0, rodsMade: 0,
                deficitDays: 0, brownoutDays: 0 },
    dead: null,
  };
  s.rngState = r.s;
  // the ship departs with a working stock, not empty shelves
  s.stores.parts = 120; s.stores.electronics = 40; s.stores.rareCmp = 60; s.stores.refMetal = 200;
  // §5c: the ship never launches empty — the departure crew left standing rules
  s.rules = inheritedRules(s.assets);
  if (p?.automate) s.rules.push(...playerRules(s.assets, p.serviceAt, p.replaceAt));
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
  for (const k of Object.keys(s.gauges)) s.gauges[k] = Math.max(0, s.gauges[k] - 0.0009);
  // Calibrating the store gauges is its own job, and nothing prompts it.
  if (p.maintainSensors && s.day % 365 === 0)
    for (const k of Object.keys(s.gauges)) s.gauges[k] = 100;
  for (const a of s.assets) {
    // Instruments wear whether or not the machine does — about a third as fast.
    a.sensorCond = Math.max(0, a.sensorCond - a.baseWear * 0.35);
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

  // ---- automation: rules read the ship through its sensors and raise tasks ----
  const rank = (id: string) => (p.prioritise ? (CRITICAL_ORDER[id] ?? 9) : 0);
  const firesBefore = s.rules.reduce((n, r) => n + r.fires, 0);
  evaluate(s, s.rules, s.board, rank);
  s.counters.ruleFires += s.rules.reduce((n, r) => n + r.fires, 0) - firesBefore;

  // A player without rules only finds out by looking, and at the speeds this game
  // is played at they are not looking often. ~0.3%/day is a mean detection lag of
  // about 330 days — comparable to a whole service interval, so things routinely
  // break before anyone notices. A rule notices the same day, every time.
  if (!p.automate) {
    for (const a of s.assets) {
      if (!(a.faulted || a.cond < p.serviceAt)) continue;
      if (s.board.some(t => t.target === a.id)) continue;
      if (chance(r, 0.003))
        s.board.push({ kind: "service", target: a.id, raised: s.day, priority: a.faulted ? -1 : rank(a.id) });
    }
  }

  // how blind is the ship? sensors reading more than 20 points high
  if (s.assets.some(a => reportedCondition(a) - a.cond > 20)) s.counters.blindDays++;

  // ---- maintenance, limited by crew labour ----
  // Servicing only helps if there is wear to recover: an asset already at its
  // ceiling gains nothing and still pays the refurbishment loss.
  // The crew work the board, not the ship: a job nobody raised is a job nobody does.
  // Crew capacity is people, not a constant. Lose them and the ship stops being repaired.
  let jobs = labour(s.colony) * (1 - p.botanistShare);
  s.board.sort((x, y) => x.priority - y.priority || x.raised - y.raised);
  const done: Task[] = [];
  for (const task of s.board) {
    if (jobs <= 0) break;
    if (task.kind === "makeRod") {
      if (canMakeRod(s.stores)) { makeRod(s.stores); s.rods++; s.counters.rodsMade++; done.push(task); jobs--; }
      continue;
    }
    if (task.kind === "makeDrone") {
      if (s.drones < p.droneTarget && canMakeDrone(s.stores)) { makeDrone(s.stores); s.drones++; done.push(task); jobs--; }
      else if (s.drones >= p.droneTarget) done.push(task);
      continue;
    }
    const a = s.assets.find(x => x.id === task.target);
    if (!a) { done.push(task); continue; }
    // nothing left to recover, and not broken: drop it
    if (!a.faulted && a.cond >= a.maxCond - 3) { done.push(task); continue; }
    if (a.maxCond < p.replaceAt) {
      if (replace(s, a)) { done.push(task); jobs--; continue; }
      // No parts yet. Keep patching it anyway: the ceiling is already written
      // off, so there is nothing left to protect, and a high-wear asset in
      // free-fall reaches zero long before the replacement arrives. Abandoning
      // the reactor for one year at ageFactor 1.9 cost 182 colonists.
    }
    service(s, a);
    // A sensor bolted to a machine gets checked while the machine is open, so
    // routine repairs DO mitigate condition drift — for free, without the player
    // ever deciding to. A gauge on a store has no such visit: nothing routine
    // touches it, and its reading looks fine precisely because it reads high.
    a.sensorCond = 100;
    done.push(task); jobs--;
  }
  for (const t2 of done) s.board.splice(s.board.indexOf(t2), 1);
  s.counters.staleTasks += s.board.filter(t2 => s.day - t2.raised > 365).length > 0 ? 1 : 0;

  const yearsLeft = (DAYS - s.day) / 365;
  if (s.rods < yearsLeft * rodsPerDay(delivered, reactor.cond) * 365) s.counters.deficitDays++;

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

  tickColony(s, r, output, labour(s.colony) * p.botanistShare / 0.6);

  s.day++;
  s.rngState = r.s;
  if (s.day >= DAYS) s.dead = "arrived";
  return s;
}

export function run(seed: number, p: Policy, actII = 40): State {
  const s = init(seed, actII, p);
  while (!s.dead) step(s, p);
  return s;
}
