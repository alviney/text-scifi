/** §6b's launch window, measured.
 *
 *  The fleet is now SENT rather than dispatched by the simulation, and the one
 *  knob the sending has is when. Δv falls until closest approach and climbs
 *  steeply after it, so this sweeps the launch day and reports what each choice
 *  costs — in water, in rocks worked, and in drones that did not come back.
 *
 *  It drives the same opening season.ts does: init(seed), no policy, the crew
 *  self-assigning and carrying material out of the bay. */
import { init, step } from "../sim/src/sim.ts";
import { apply } from "../sim/src/commands.ts";
import { seasonOver } from "../sim/src/sim.ts";
import { LEGS } from "../sim/src/legs.ts";
import { dvCost, WINDOW_LEAD, WINDOW_TAIL } from "../sim/src/encounters.ts";
import { autoHaul, autoLaunch } from "./pilot.ts";
import { START_DRONES } from "../sim/src/sim.ts";

const SEEDS = Number(process.env.SEEDS ?? 12);


type Row = { launchAt: number; worked: number; landed: number; prop: number;
             perUnit: number; drones: number; spilled: number; held: number };

function play(seed: number, launchAt: number) {
  const s = init(seed);
  apply(s, { kind: "setting", key: "crewSelfAssign", value: true });
  const start = s.day;
  let lastDay = -1, held = 0;
  while (!s.dead && !(s.phase === "season" && seasonOver(s))) {
    if (s.day !== lastDay) {
      lastDay = s.day;
      autoHaul(s);
      if (s.bayHeld) held++;
      autoLaunch(s, "big", launchAt);
    }
    const beds = s.assets.filter(a => a.id.startsWith("bed")).length;
    if (beds < 3 && !s.board.some(t => t.kind === "buildBed") && s.phase === "season"
        && s.crew.some(c => !c.asleep && s.day >= c.fitOn)) apply(s, { kind: "buildBed" });
    step(s);
    if (s.day - start > LEGS[0].days + 40) break;
  }
  const landed = s.schedule.filter(e => e.leg === 0).reduce((n, e) => n + e.landed, 0);
  return { worked: s.schedule.filter(e => e.leg === 0 && e.flown > 0).length,
           landed, prop: s.counters.propellant, drones: s.drones,
           spilled: s.counters.overflow, held };
}

// The curve itself, before any simulation: what a sortie costs on each day of
// the window, as a multiple of the minimum.
const shape = LEGS[0];
console.log(`\n§6b Δv curve — cost of one sortie, by launch day\n`);
const fake = { year: 0, id: 0, leg: 0, cls: "C", richness: 1, size: 1, bias: 0,
               scans: 0, flown: 0, landed: 0 };
const days: number[] = [];
for (let d = -WINDOW_LEAD; d <= WINDOW_TAIL; d++) days.push(d);
console.log(days.map(d => (d > 0 ? `+${d}` : `${d}`).padStart(6)).join(""));
console.log(days.map(d => dvCost(fake, d).toFixed(2).padStart(6)).join(""));
console.log(`${" ".repeat(6 * WINDOW_LEAD)}     ^ closest approach\n`);

const rows: Row[] = [];
for (const launchAt of [28, 22, 16, 12, 8, 5, 3, 1, 0, -2, -4]) {
  const out = [] as ReturnType<typeof play>[];
  for (let seed = 1; seed <= SEEDS; seed++) out.push(play(seed, launchAt));
  const m = (f: (x: typeof out[0]) => number) => out.reduce((a, x) => a + f(x), 0) / out.length;
  rows.push({ launchAt, worked: m(x => x.worked), landed: m(x => x.landed),
              prop: m(x => x.prop), perUnit: m(x => x.prop) / Math.max(1, m(x => x.landed)) * 1000,
              drones: m(x => x.drones), spilled: m(x => x.spilled), held: m(x => x.held) });
}

console.log(`Leg 1, ${SEEDS} seeds, crew hauling. "launch at" is days BEFORE`);
console.log(`closest approach; negative means the fleet waits until after it.\n`);
const cols: [string, (r: Row) => string][] = [
  ["launch at", r => (r.launchAt >= 0 ? `-${r.launchAt}d` : `+${-r.launchAt}d`)],
  ["worked", r => `${r.worked.toFixed(1)}/5`],
  ["landed", r => r.landed.toFixed(0)],
  ["propellant", r => r.prop.toFixed(0)],
  ["water/1k", r => r.perUnit.toFixed(1)],
  ["spilled", r => r.spilled.toFixed(0)],
  ["days held", r => r.held.toFixed(0)],
  ["drones", r => `${r.drones.toFixed(1)}/${START_DRONES}`],
];
console.log(cols.map(([h]) => h.padStart(12)).join(""));
console.log("-".repeat(cols.length * 12));
for (const r of rows) console.log(cols.map(([, f]) => f(r).padStart(12)).join(""));
console.log();
