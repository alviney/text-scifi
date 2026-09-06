/** A probe for the game as it is actually played: one leg, from the prep
 *  window through the end of the season.
 *
 *  run.ts measures a fully-automated 300-year voyage, which is not a
 *  configuration anybody starts from any more — every policy in it dies. This
 *  drives init(seed) with no policy, which is the real opening: four crew coming
 *  round in the Medbay, no rules, a locker of rations, and a cluster ahead.
 *
 *  It reports the flows a season lives or dies on, so a change to any of them
 *  can be seen rather than guessed at. */
import { init, step } from "../sim/src/sim.ts";
import { apply } from "../sim/src/commands.ts";
import { seasonOver } from "../sim/src/sim.ts";
import { LEGS } from "../sim/src/legs.ts";
import { HOLD } from "../sim/src/logistics.ts";
import { FARM_ROOM, MED_ROOM, wakesLeft } from "../sim/src/colony.ts";
import { autoHaul, autoLaunch } from "./pilot.ts";
import type { State } from "../sim/src/types.ts";

const SEEDS = Number(process.env.SEEDS ?? 12);
const BEDS = Number(process.env.BEDS ?? 3);
/** Days before closest approach the probe sends the fleet.
 *
 *  §6b's Δv curve bottoms out AT closest approach, so this is the one knob the
 *  launch decision has: launch early and every sortie of the wave costs more
 *  water; launch late and the window shuts on the sorties you have not flown.
 *  2 is roughly the optimum; sweep it with fleet.ts. */
const LAUNCH_AT = Number(process.env.LAUNCH_AT ?? 2);
/** How many of the five the probe is willing to work. The bay holds one rock,
 *  so taking all five is a choice about water, not about greed. */
const TAKE = Number(process.env.TAKE ?? 5);
/** Does the probe carry material out of the Cargo Bay?
 *
 *  0 nobody moves anything · 1 ore to the shop · 2 everything to where it is used.
 *
 *  This used to be a footnote. Since the wave holds station on a full bay it is
 *  the single biggest lever in the season: the fleet flies exactly as long as
 *  the crew can keep the shelf clear. */
const HAUL = Number(process.env.HAUL ?? 2);


export type Row = {
  seed: number; days: number; dead: string | null;
  food: number; fed: number; air: number;
  taken: number; missed: number; sent: number;
  landed: number; spilled: number; prop: number;
  ice: number; iceDeclined: number; water: number;
  beds: number; awake: number;
  fert: number; wakes: number; vol: number;
};

function playSeason(seed: number): Row {
  const s = init(seed);
  // The crew take work off the board themselves. A human hands out every job in
  // leg 1; the probe is measuring the ECONOMY, not the player's clicking, so it
  // delegates and leaves every other setting at its default.
  apply(s, { kind: "setting", key: "crewSelfAssign", value: true });
  let built = 0, sent = 0;
  const start = s.day;
  let lastDay = -1;
  while (!s.dead && !(s.phase === "season" && seasonOver(s))) {
    // ONCE A DAY, NOT ONCE AN HOUR. step() is one game-hour (CLAUDE.md), and a
    // launch decision taken hourly issues twenty-four commands a day.
    if (s.day !== lastDay) {
      lastDay = s.day;
      autoHaul(s, HAUL as 0 | 1 | 2);
      if (sent < TAKE && !s.sortie) {
        const before = s.sortie as unknown;
        autoLaunch(s, "big", LAUNCH_AT);
        if (s.sortie !== before) sent++;
      }
    }
    // Queue the beds the departure board asks for, one at a time — only one
    // bed task sits on the board at once, so a player queues the next when the
    // last is done rather than asking for three up front.
    const beds = s.assets.filter(a => a.id.startsWith("bed")).length;
    if (beds < BEDS && !s.board.some(t => t.kind === "buildBed")
        && s.phase === "season" && s.crew.some(c => !c.asleep && s.day >= c.fitOn)) {
      apply(s, { kind: "buildBed" }); built++;
    }
    step(s);
    if (s.day - start > LEGS[0].days + 40) break;
  }
  const bay = s.rooms[HOLD];
  return {
    seed, days: s.day - start, dead: s.dead, sent,
    food: s.colony.food, fed: s.colony.fed, air: s.colony.air,
    taken: s.counters.encountersTaken, missed: s.counters.encountersMissed,
    landed: s.schedule.filter(e => e.leg === 0).reduce((n, e) => n + e.landed, 0),
    spilled: s.counters.overflow, prop: s.counters.propellant,
    ice: bay.ice, iceDeclined: (s.counters as any).waterDeclined ?? 0,
    water: (s.counters as any).waterUsed ?? 0,
    beds: s.assets.filter(a => a.id.startsWith("bed") && !a.faulted).length,
    awake: s.crew.filter(c => !c.asleep).length,
    fert: s.rooms[FARM_ROOM].vol, wakes: wakesLeft(s),
    vol: (s.counters as any).volUsed ?? 0,
  };
}

const rows: Row[] = [];
for (let seed = 1; seed <= SEEDS; seed++) rows.push(playSeason(seed));
const avg = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0) / rows.length;

console.log(`\nLeg 1, ${SEEDS} seeds, ${BEDS} beds queued, crew self-assigning, ` +
            `fleet launched ${LAUNCH_AT}d before approach, up to ${TAKE} objects\n`);
const cols: [string, (r: Row) => string][] = [
  ["seed", r => String(r.seed)],
  ["days", r => String(r.days)],
  ["awake", r => String(r.awake)],
  ["beds", r => String(r.beds)],
  ["food", r => r.food.toFixed(0)],
  ["fed", r => r.fed.toFixed(0)],
  ["air", r => r.air.toFixed(0)],
  ["worked", r => `${r.taken}/${r.taken + r.missed}`],
  ["landed", r => r.landed.toFixed(0)],
  ["spilled", r => r.spilled.toFixed(0)],
  ["propellant", r => r.prop.toFixed(0)],
  ["bay ice", r => r.ice.toFixed(0)],
  ["water used", r => r.water.toFixed(0)],
  ["fert left", r => r.fert.toFixed(0)],
  ["wakes left", r => String(r.wakes)],
  ["ended", r => r.dead ?? "-"],
];
console.log(cols.map(([h]) => h.padStart(11)).join(""));
console.log("-".repeat(cols.length * 11));
for (const r of rows) console.log(cols.map(([, f]) => f(r).padStart(11)).join(""));
console.log("-".repeat(cols.length * 11));
console.log(["mean", avg(r => r.days).toFixed(0), avg(r => r.awake).toFixed(1),
             avg(r => r.beds).toFixed(1), avg(r => r.food).toFixed(0),
             avg(r => r.fed).toFixed(0), avg(r => r.air).toFixed(0),
             `${avg(r => r.taken).toFixed(1)}/${avg(r => r.taken + r.missed).toFixed(1)}`,
             avg(r => r.landed).toFixed(0), avg(r => r.spilled).toFixed(0),
             avg(r => r.prop).toFixed(0),
             avg(r => r.ice).toFixed(0), avg(r => r.water).toFixed(0),
             avg(r => r.fert).toFixed(0), avg(r => r.wakes).toFixed(1),
             `${rows.filter(r => r.dead).length} dead`]
            .map(c => c.padStart(11)).join(""));
console.log();
