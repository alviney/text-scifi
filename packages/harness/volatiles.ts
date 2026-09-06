/** The two volatile sinks, and what running each of them out actually costs.
 *
 *  They are deliberately different shapes: fertiliser is a yield lever, so
 *  losing it should cost harvest and nothing else; medical stock is a hard gate
 *  on waking, so losing it should stop the roster growing and stop nothing else. */
import { init, step, seasonOver } from "../sim/src/sim.ts";
import { apply } from "../sim/src/commands.ts";
import { FARM_ROOM, MED_ROOM, MEDS_PER_WAKE, wakesLeft } from "../sim/src/colony.ts";
import { LEGS } from "../sim/src/legs.ts";

function play(fert: number, meds: number, wakeTries: number) {
  const s = init(3);
  apply(s, { kind: "setting", key: "crewSelfAssign", value: true });
  s.rooms[FARM_ROOM].vol = fert;
  s.rooms[MED_ROOM].vol = meds;
  const start = s.day, marks: string[] = [];
  let woke = 0, refused = 0, seen = new Set<string>(), lastTry = -1;
  while (!s.dead && !(s.phase === "season" && seasonOver(s))) {
    const beds = s.assets.filter(a => a.id.startsWith("bed")).length;
    if (beds < 3 && !s.board.some(t => t.kind === "buildBed")
        && s.phase === "season" && s.crew.some(c => !c.asleep && s.day >= c.fitOn))
      apply(s, { kind: "buildBed" });
    // A player who keeps reaching for another pair of hands. step() is one game
    // HOUR, so this has to be gated on the day changing or it fires 24 times.
    if (woke + refused < wakeTries && s.phase === "season"
        && (s.day - start) % 10 === 0 && s.day !== lastTry) {
      lastTry = s.day;
      const before = s.crew.length;
      apply(s, { kind: "wake", role: "engineer" });
      if (s.crew.length > before) woke++; else refused++;
    }
    step(s);
    for (const g of s.signals) if (/^FRT|^MED/.test(g.code)) {
      const k = g.code + g.day;
      if (!seen.has(k)) { seen.add(k); if (!marks.some(m => m.endsWith(g.code))) marks.push(`d${g.day - start} ${g.code}`); }
    }
    if (s.day - start > LEGS[0].days + 40) break;
  }
  return { s, woke, refused, marks, start };
}

console.log("\nfertiliser (beds keep going, badly)                     food  fed  beds  left  feed");
for (const f of [240, 120, 40, 0]) {
  const { s, marks } = play(f, 250, 0);
  console.log(`  start ${String(f).padStart(4)}` + " ".repeat(38) +
    `${s.colony.food.toFixed(0).padStart(6)}${s.colony.fed.toFixed(0).padStart(5)}` +
    `${String(s.assets.filter(a => a.id.startsWith("bed")).length).padStart(6)}` +
    `${s.rooms[FARM_ROOM].vol.toFixed(0).padStart(6)}   ${marks.join(" ") || "-"}`);
}

console.log("\nmedical stock (a hard gate on waking)                   woke refused  crew  left  feed");
for (const m of [250, 100, 50, 0]) {
  const { s, woke, refused, marks } = play(240, m, 6);
  console.log(`  start ${String(m).padStart(4)} (${String(Math.floor(m / MEDS_PER_WAKE)).padStart(2)} wakes)` + " ".repeat(25) +
    `${String(woke).padStart(6)}${String(refused).padStart(8)}` +
    `${String(s.crew.filter(c => !c.asleep).length).padStart(6)}` +
    `${String(wakesLeft(s)).padStart(6)}   ${marks.join(" ") || "-"}`);
}
console.log();
