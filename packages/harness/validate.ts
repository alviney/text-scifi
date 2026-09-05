/** Checks the simulation's output against the figures plan.md derives. */
import { run } from "../sim/src/sim.ts";
import type { Policy, State } from "../sim/src/types.ts";

const steady: Policy = { name: "steady", serviceAt: 55, replaceAt: 62, droneTarget: 6, labourPerDay: 2, prioritise: true };
const SEEDS = 20;
const runs: State[] = [];
for (let s = 1; s <= SEEDS; s++) runs.push(run(s, steady));
const avg = (f: (s: State) => number) => runs.reduce((a, s) => a + f(s), 0) / runs.length;

const checks: [string, number, number, number][] = [
  // label, plan.md claim, observed, tolerance as a fraction
  ["replacements over 300y",  246, avg(s => s.counters.replacements), 0.40],
  ["encounters taken",        100, avg(s => s.counters.encountersTaken), 0.25],
  ["fuel rods consumed",      287, 320 + avg(s => s.counters.rodsMade) - avg(s => s.rods), 0.30],
  ["asset service life (yr)",  56, 300 / (avg(s => s.counters.replacements) / 42), 0.45],
];

console.log("\nplan.md claims vs simulation\n");
console.log("  metric".padEnd(30) + "claimed".padStart(9) + "observed".padStart(11) + "   verdict");
console.log("  " + "-".repeat(58));
for (const [label, claim, obs, tol] of checks) {
  const off = Math.abs(obs - claim) / claim;
  console.log("  " + label.padEnd(28) + String(claim).padStart(9) + obs.toFixed(0).padStart(11) +
    `   ${off <= tol ? "holds" : "OFF"} (${(off * 100).toFixed(0)}%)`);
}
const failures = runs.filter(s => s.dead !== "arrived").length;
console.log(`\n  fail states triggered: ${failures}/${SEEDS} runs`);
console.log(`  mean end condition:    ${avg(s => s.assets.reduce((a, x) => a + x.cond, 0) / s.assets.length).toFixed(0)}`);
console.log(`  rare compounds banked: ${avg(s => s.stores.rareCmp).toFixed(0)}`);
console.log(`  raw rare unrefined:    ${avg(s => s.stores.rare).toFixed(0)}\n`);
