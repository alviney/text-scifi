/** Balance harness: runs whole playthroughs and reports what the design's numbers do. */
import { run, START_RODS } from "../sim/src/sim.ts";
import type { Policy, State } from "../sim/src/types.ts";

const POLICIES: Policy[] = [
  { name: "diligent",  serviceAt: 70, replaceAt: 65, droneTarget: 8, botanistShare: 0.25, prioritise: true,  automate: true,  maintainSensors: true },
  { name: "steady",    serviceAt: 55, replaceAt: 62, droneTarget: 6, botanistShare: 0.25, prioritise: true,  automate: true,  maintainSensors: true },
  { name: "no gauges", serviceAt: 55, replaceAt: 62, droneTarget: 6, botanistShare: 0.25, prioritise: true,  automate: true,  maintainSensors: false },
  { name: "no rules",  serviceAt: 55, replaceAt: 62, droneTarget: 6, botanistShare: 0.25, prioritise: true,  automate: false, maintainSensors: true },
  { name: "neglectful",serviceAt: 20, replaceAt: 45, droneTarget: 4, botanistShare: 0.25, prioritise: false, automate: false, maintainSensors: false },
  { name: "underfed",  serviceAt: 55, replaceAt: 62, droneTarget: 6, botanistShare: 0.12, prioritise: true,  automate: true,  maintainSensors: true },
];

const SEEDS = Number(process.env.SEEDS ?? 20);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: number[], f: (s: number) => boolean) => xs.filter(f).length / xs.length * 100;

console.log(`\nSeedship balance harness — ${SEEDS} seeds x ${POLICIES.length} policies, 300 years each\n`);
const t0 = Date.now();

const header = ["policy", "arrived", "avg cond", "awake", "frozen", "died up", "died cold",
                "services", "replaced", "faults", "brownout%"];
console.log(header.map((h, i) => h.padStart(i ? 9 : 11)).join(""));
console.log("-".repeat(header.length * 9 + 2));

for (const p of POLICIES) {
  const runs: State[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) runs.push(run(seed, p));
  const arrived = runs.filter(s => s.dead === "arrived");
  const conds = arrived.map(s => avg(s.assets.map(a => a.cond)));
  const worst = arrived.map(s => Math.min(...s.assets.map(a => a.maxCond)));
  const row = [
    p.name,
    `${(arrived.length / runs.length * 100).toFixed(0)}%`,
    arrived.length ? avg(conds).toFixed(0) : "-",
    avg(runs.map(s => s.colony.awake)).toFixed(1),
    avg(runs.map(s => s.colony.frozen)).toFixed(0),
    avg(runs.map(s => s.colony.diedAwake)).toFixed(0),
    avg(runs.map(s => s.colony.diedFrozen)).toFixed(0),
    avg(runs.map(s => s.counters.services)).toFixed(0),
    avg(runs.map(s => s.counters.replacements)).toFixed(0),
    avg(runs.map(s => s.counters.faults)).toFixed(0),
    (avg(runs.map(s => s.counters.brownoutDays)) / (300 * 365) * 100).toFixed(0),
  ];

  console.log(row.map((c, i) => String(c).padStart(i ? 9 : 11)).join(""));

  const failed = runs.filter(s => s.dead !== "arrived");
  if (failed.length) {
    const why = failed.reduce((m: Record<string, number>, s) => (m[s.dead!] = (m[s.dead!] ?? 0) + 1, m), {});
    console.log(`${"".padStart(11)}  failed: ${Object.entries(why).map(([k, v]) => `${v}x ${k}`).join(", ")}`);
  }
}

console.log(`\ndeterminism check:`);
const a = run(7, POLICIES[1]), b = run(7, POLICIES[1]);
console.log(`  same seed twice -> ${JSON.stringify(a.counters) === JSON.stringify(b.counters) ? "identical" : "DIVERGED"}`);
console.log(`\n${(Date.now() - t0) / 1000}s for ${SEEDS * POLICIES.length} full playthroughs`);
console.log(`(each = ${(300 * 365).toLocaleString()} days, 42 assets)\n`);
