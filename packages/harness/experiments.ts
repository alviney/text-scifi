/** Tests two of the three bets flagged in plan.md:
 *  does automation actually matter, and do lying sensors bite? */
import { run } from "../sim/src/sim.ts";
import type { Policy, State } from "../sim/src/types.ts";

const base = { serviceAt: 55, replaceAt: 62, droneTarget: 6, labourPerDay: 2, prioritise: true };
const P = (name: string, automate: boolean, maintainSensors: boolean): Policy =>
  ({ ...base, name, automate, maintainSensors });

const ARMS: Policy[] = [
  P("rules + sensors kept", true,  true),
  P("rules, sensors rot",   true,  false),
  P("no rules, sensors kept", false, true),
  P("no rules, sensors rot",  false, false),
];

const SEEDS = Number(process.env.SEEDS ?? 20);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`\nDoes automation matter, and do lying sensors bite? — ${SEEDS} seeds each\n`);
const cols = ["arm", "end cond", "services", "replaced", "faults", "blind%", "missed", "brownout%"];
console.log(cols.map((c, i) => c.padStart(i ? 10 : 22)).join(""));
console.log("-".repeat(22 + 10 * (cols.length - 1)));

const results: Record<string, number> = {};
for (const p of ARMS) {
  const rs: State[] = [];
  for (let s = 1; s <= SEEDS; s++) rs.push(run(s, p));
  const cond = avg(rs.map(s => avg(s.assets.map(a => a.cond))));
  results[p.name] = cond;
  console.log([
    p.name,
    cond.toFixed(0),
    avg(rs.map(s => s.counters.services)).toFixed(0),
    avg(rs.map(s => s.counters.replacements)).toFixed(0),
    avg(rs.map(s => s.counters.faults)).toFixed(0),
    (avg(rs.map(s => s.counters.blindDays)) / (300 * 365) * 100).toFixed(0),
    avg(rs.map(s => s.counters.encountersMissed)).toFixed(0),
    (avg(rs.map(s => s.counters.brownoutDays)) / (300 * 365) * 100).toFixed(0),
  ].map((c, i) => String(c).padStart(i ? 10 : 22)).join(""));
}

const d = (a: string, b: string) => (results[a] - results[b]).toFixed(1);
console.log(`\n  automation is worth        ${d("rules + sensors kept", "no rules, sensors kept")} condition points`);
console.log(`  letting sensors rot costs  ${d("rules + sensors kept", "rules, sensors rot")} condition points`);
console.log(`  ...and without rules       ${d("no rules, sensors kept", "no rules, sensors rot")} (rules are what sensors feed)\n`);
