/** What running out of water actually does, and whether the ship says so in
 *  time. Starts leg 1 with a deliberately short tank and no hauling. */
import { init, step, seasonOver } from "../sim/src/sim.ts";
import { apply } from "../sim/src/commands.ts";
import { autoLaunch } from "./pilot.ts";
import { WATER_ROOM, waterDays } from "../sim/src/colony.ts";
import { LEGS } from "../sim/src/legs.ts";

for (const tank of [1200, 600, 300, 120]) {
  const s = init(3);
  apply(s, { kind: "setting", key: "crewSelfAssign", value: true });
  s.rooms[WATER_ROOM].ice = tank;
  const start = s.day, marks: string[] = [];
  let seen = new Set<string>(), minAir = 100, dryFrom = 0;
  let lastLaunchDay = -1;
  while (!s.dead && !(s.phase === "season" && seasonOver(s))) {
    // The fleet does not fly itself any more. Send it, but do NOT haul: this
    // probe measures a room running dry, and carrying water up from the bay
    // would be measuring the fix rather than the failure.
    if (s.day !== lastLaunchDay) { lastLaunchDay = s.day; autoLaunch(s); }
    const beds = s.assets.filter(a => a.id.startsWith("bed")).length;
    if (beds < 3 && !s.board.some(t => t.kind === "buildBed")
        && s.phase === "season" && s.crew.some(c => !c.asleep && s.day >= c.fitOn))
      apply(s, { kind: "buildBed" });
    step(s);
    for (const g of s.signals) if (/^H2O|^PRP/.test(g.code) && !seen.has(g.code + g.day)) {
      seen.add(g.code + g.day);
      if (!marks.some(m => m.startsWith(`d${g.day - start} ${g.code}`)))
        marks.push(`d${g.day - start} ${g.code}`);
    }
    minAir = Math.min(minAir, s.colony.air);
    if (s.dry && !dryFrom) dryFrom = s.day - start;
    if (s.day - start > LEGS[0].days + 40) break;
  }
  console.log(`\ntank ${String(tank).padStart(5)}  ->  ended ${(s.dead ?? "season over").padEnd(14)}` +
    ` air low ${minAir.toFixed(0).padStart(3)}  food ${s.colony.food.toFixed(0).padStart(4)}` +
    `  beds ${s.assets.filter(a => a.id.startsWith("bed")).length}` +
    `  took ${s.counters.encountersTaken}/${s.counters.encountersTaken + s.counters.encountersMissed}` +
    `  crew ${s.crew.filter(c => !c.asleep).length}`);
  console.log(`         first dry day ${dryFrom || "-"}, tank left ${s.rooms[WATER_ROOM].ice.toFixed(0)}` +
    ` (${waterDays(s) === Infinity ? "-" : waterDays(s).toFixed(0)}d)`);
  console.log(`         feed: ${[...new Set(marks)].slice(0, 8).join("  ") || "(nothing said)"}`);
}
console.log();
