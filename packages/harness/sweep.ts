/** Sweeps the service threshold to find the optimum, since the refurbishment
 *  model implies there is an interior one: service too early and the fixed
 *  overhead per visit erodes the ceiling for nothing, too late and the AT_RISK
 *  failure roll starts collecting assets. */
import { run } from "../sim/src/sim.ts";
import type { Policy, State } from "../sim/src/types.ts";

const SEEDS = Number(process.env.SEEDS ?? 10);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const survivors = (s: State) => s.colony.frozen + s.colony.awake;

const thresholds = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];

console.log(`\nService threshold sweep — ${SEEDS} seeds each, replaceAt 62\n`);
console.log("  serviceAt  survivors  end cond   faults  services  replaced  brownout%  lost");
console.log("  " + "-".repeat(74));

let best = { at: 0, surv: -1, cond: 0 };
const rows: [number, number, number][] = [];

for (const at of thresholds) {
  const p: Policy = { name: `s${at}`, serviceAt: at, replaceAt: 62, droneTarget: 6,
                      botanistShare: 0.25, prioritise: true, automate: true, maintainSensors: true };
  const rs: State[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) rs.push(run(seed, p));
  const arrived = rs.filter(s => s.dead === "arrived");
  const surv = avg(rs.map(survivors));
  const cond = arrived.length ? avg(arrived.map(s => avg(s.assets.map(a => a.cond)))) : 0;
  rows.push([at, surv, cond]);
  if (surv > best.surv || (surv === best.surv && cond > best.cond)) best = { at, surv, cond };
  console.log("  " + String(at).padStart(9) +
    surv.toFixed(0).padStart(11) + cond.toFixed(0).padStart(10) +
    avg(rs.map(s => s.counters.faults)).toFixed(0).padStart(9) +
    avg(rs.map(s => s.counters.services)).toFixed(0).padStart(10) +
    avg(rs.map(s => s.counters.replacements)).toFixed(0).padStart(10) +
    (avg(rs.map(s => s.counters.brownoutDays)) / (300 * 365) * 100).toFixed(0).padStart(11) +
    (200 - surv).toFixed(0).padStart(6));
}

const span = Math.max(...rows.map(r => r[1])) - Math.min(...rows.map(r => r[1]));
console.log(`\n  best: service at ${best.at} — ${best.surv.toFixed(0)}/200 survive, condition ${best.cond.toFixed(0)}`);
console.log(`  spread across the range: ${span.toFixed(0)} colonists\n`);

/* Phase 2. If there is an interior optimum, the obvious next move is to give the
 * systems everything else depends on — reactor, life support, cryo — an earlier
 * threshold than the rest. Test it rather than assume it. */

const arms: { label: string; critical?: number; rest: number }[] = [
  { label: "uniform 60",             rest: 60 },
  { label: "critical 75, rest 50",   critical: 75, rest: 50 },
  { label: "critical 80, rest 45",   critical: 80, rest: 45 },
  { label: "critical 70, rest 55",   critical: 70, rest: 55 },
];

console.log("Differentiated thresholds — earlier service for the critical path\n");
console.log("  arm                     survivors  end cond  services  brownout%");
console.log("  " + "-".repeat(63));

for (const arm of arms) {
  const p: Policy = { name: arm.label, serviceAt: arm.rest, criticalServiceAt: arm.critical,
                      replaceAt: 62, droneTarget: 6, botanistShare: 0.25,
                      prioritise: true, automate: true, maintainSensors: true };
  const rs: State[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) rs.push(run(seed, p));
  const arrived = rs.filter(s => s.dead === "arrived");
  console.log("  " + arm.label.padEnd(24) +
    avg(rs.map(survivors)).toFixed(0).padStart(9) +
    (arrived.length ? avg(arrived.map(s => avg(s.assets.map(a => a.cond)))) : 0).toFixed(0).padStart(10) +
    avg(rs.map(s => s.counters.services)).toFixed(0).padStart(10) +
    (avg(rs.map(s => s.counters.brownoutDays)) / (300 * 365) * 100).toFixed(0).padStart(11));
}
console.log();
