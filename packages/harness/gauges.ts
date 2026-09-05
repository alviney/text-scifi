/** Does routine maintenance mitigate the lying-instrument mechanic? */
import { run } from "../sim/src/sim.ts";
import type { Policy, State } from "../sim/src/types.ts";

const base = { serviceAt: 55, replaceAt: 62, droneTarget: 6, botanistShare: 0.25,
               prioritise: true, automate: true };
const SEEDS = 20;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log("\nMachine sensors are fixed by routine repairs. Store gauges are not.\n");
console.log("  arm".padEnd(26) + "arrived".padStart(9) + "end cond".padStart(10) +
            "rods".padStart(8) + "drones".padStart(9) + "missed".padStart(9) + "died cold".padStart(11));
console.log("  " + "-".repeat(70));
for (const [label, calibrate] of [["gauges calibrated yearly", true], ["gauges never calibrated", false]] as const) {
  const p: Policy = { ...base, name: label, maintainSensors: calibrate };
  const rs: State[] = [];
  for (let s = 1; s <= SEEDS; s++) rs.push(run(s, p));
  const arrived = rs.filter(s => s.dead === "arrived");
  console.log("  " + label.padEnd(24) +
    `${(arrived.length / rs.length * 100).toFixed(0)}%`.padStart(9) +
    (arrived.length ? avg(arrived.map(s => avg(s.assets.map(a => a.cond)))).toFixed(0) : "-").padStart(10) +
    avg(rs.map(s => s.rods)).toFixed(0).padStart(8) +
    avg(rs.map(s => s.drones)).toFixed(1).padStart(9) +
    avg(rs.map(s => s.counters.encountersMissed)).toFixed(0).padStart(9) +
    avg(rs.map(s => s.colony.diedFrozen)).toFixed(0).padStart(11));
}
console.log();
