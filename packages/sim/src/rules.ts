import type { Asset, State } from "./types.ts";

/** §5: a rule watches one thing, tests one condition, and takes one action. */
export type Rule = {
  id: string;
  watch: string;                       // asset id, or "stores:<key>"
  kind: "condition" | "stock";
  threshold: number;
  action: "service" | "replace" | "makeRod" | "makeDrone";
  inherited: boolean;                  // left by the departure crew (§5c)
  fires: number;
  lastFired: number;                   // day, -1 for never
};

export type Task = { kind: Rule["action"]; target: string; raised: number; priority: number };

/** §5: worn sensors do not fail, they LIE — and they read HIGH, so the rule
 *  watching for "below X" is never told the truth and quietly stops firing.
 *
 *  Where the lie actually bites is STOCK, not condition. A faulted machine is
 *  obvious however broken its gauge is, so drift there only delays routine
 *  servicing. A store that reads 900 when it holds 300 has no such backstop —
 *  which is exactly plan.md's water-restock example, and the reason that rule
 *  had not fired in 47 years. */
export function reportedCondition(a: Asset): number {
  const drift = (100 - a.sensorCond) / 100 * 45;
  return Math.min(100, a.cond + drift);
}

/** A gauge on a store, reading proportionally high as it wears. */
export function reportedStock(actual: number, gaugeCond: number): number {
  return actual * (1 + (100 - gaugeCond) / 100 * 2.0);
}

/** The 13 rules the ship launches with (§5c), plus whatever the player writes. */
export function inheritedRules(assets: Asset[]): Rule[] {
  const mk = (id: string, watch: string, kind: Rule["kind"], threshold: number,
              action: Rule["action"], inherited = true): Rule =>
    ({ id, watch, kind, threshold, action, inherited, fires: 0, lastFired: -1 });

  return [
    // the single maintenance rule aboard, on the thing that kills you fastest
    mk("RC-01", "reactor", "condition", 40, "service"),
    // production and supply
    mk("FB-01", "stores:drones", "stock", 6, "makeDrone"),   // keep the fleet up
    mk("FU-01", "stores:rods", "stock", 60, "makeRod"),
  ];
}

/** Rules the player writes once they understand the game (§5c curriculum). */
export function playerRules(assets: Asset[], serviceAt: number, replaceAt: number,
                            criticalAt?: number, isCritical?: (id: string) => boolean): Rule[] {
  const out: Rule[] = [];
  for (const a of assets) {
    const th = (criticalAt !== undefined && isCritical?.(a.id)) ? criticalAt : serviceAt;
    out.push({ id: `svc-${a.id}`, watch: a.id, kind: "condition", threshold: th,
               action: "service", inherited: false, fires: 0, lastFired: -1 });
  }
  return out;
}

/** Evaluate every rule and raise tasks. Rules read the ship through its sensors. */
export function evaluate(s: State, rules: Rule[], board: Task[], priorityOf: (id: string) => number) {
  for (const r of rules) {
    if (r.kind === "condition") {
      const a = s.assets.find(x => x.id === r.watch);
      if (!a) continue;
      const seen = reportedCondition(a);                 // <- the lie lives here
      const wants = a.faulted || seen < r.threshold;
      if (!wants) continue;
      if (board.some(t => t.target === a.id)) continue;  // already raised
      // §5: a broken thing goes to the FRONT of the queue, not the back
      const pri = a.faulted ? -1 : priorityOf(a.id);
      board.push({ kind: "service", target: a.id, raised: s.day, priority: pri });
      r.fires++; r.lastFired = s.day;
    } else {
      const key = r.watch.split(":")[1];
      const actual = key === "rods" ? s.rods : key === "drones" ? s.drones : (s.stores as any)[key];
      const have = reportedStock(actual, s.gauges[key] ?? 100);   // <- the lie that has no backstop
      if (have >= r.threshold) continue;
      if (board.some(t => t.kind === r.action)) continue;
      board.push({ kind: r.action, target: r.watch, raised: s.day, priority: 5 });
      r.fires++; r.lastFired = s.day;
    }
  }
}
