/** What a season actually lands, now that a rock is a lump rather than a trickle. */
import { init, step, seasonOver } from "../sim/src/sim.ts";
import { apply } from "../sim/src/commands.ts";
import { HOLD, capOf } from "../sim/src/logistics.ts";
import { LEGS } from "../sim/src/legs.ts";
import { trueMass } from "../sim/src/encounters.ts";

const SEEDS = Number(process.env.SEEDS ?? 12);
let landed = 0, over = 0, decl = 0, taken = 0, offered = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = init(seed);
  apply(s, { kind: "setting", key: "crewSelfAssign", value: true });
  const start = s.day;
  while (!s.dead && !(s.phase === "season" && seasonOver(s))) {
    const beds = s.assets.filter(a => a.id.startsWith("bed")).length;
    if (beds < 3 && !s.board.some(t => t.kind === "buildBed")
        && s.phase === "season" && s.crew.some(c => !c.asleep && s.day >= c.fitOn))
      apply(s, { kind: "buildBed" });
    step(s);
    if (s.day - start > LEGS[0].days + 40) break;
  }
  offered += s.schedule.filter(e => e.leg === 0).reduce((a, e) => a + trueMass(e, 6), 0);
  over += s.counters.overflow; decl += s.counters.declined;
  taken += s.counters.encountersTaken;
  landed += Object.values(s.rooms[HOLD]).reduce((a: any, x: any) => a + x, 0) as number;
}
const n = SEEDS;
console.log(`\nleg 1, ${n} seeds, bay cap ${capOf(HOLD)}\n`);
console.log(`  mass the cluster contained   ${Math.round(offered / n).toLocaleString()}`);
console.log(`  left in space, bay full      ${Math.round(over / n).toLocaleString()}  (${(over / offered * 100).toFixed(0)}%)`);
console.log(`  declined, keep-ceiling       ${Math.round(decl / n).toLocaleString()}  (${(decl / offered * 100).toFixed(0)}%)`);
console.log(`  still in the bay at the end  ${Math.round(landed / n).toLocaleString()}`);
console.log(`  objects worked               ${(taken / n).toFixed(1)} of 5\n`);
