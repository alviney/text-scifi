import type { Asset, State } from "./types.ts";
import { HOLD, SHOP, RAW } from "./logistics.ts";

/** Where each material is produced, and therefore where a delivery fetches it. */
export const SOURCE_OF: Record<string, string> =
  Object.fromEntries([...RAW.map(k => [k, HOLD]),
                      ...["refMetal", "rareCmp", "parts", "electronics"].map(k => [k, SHOP])]);

/** §5: a rule watches one thing, tests one condition, and takes one action. */
export type Rule = {
  id: string;
  /** asset id, "stores:<key>", or "room:<room>:<key>" */
  watch: string;
  kind: "condition" | "stock" | "roomstock";
  threshold: number;
  action: "service" | "replace" | "makeRod" | "makeDrone" | "deliver" | "buildBed";
  inherited: boolean;                  // left by the departure crew (§5c)
  fires: number;
  lastFired: number;                   // day, -1 for never
};

/** §3: "Crew members are task queues — the player schedules work onto them.
 *  Tasks take time. A crew member can only do one thing at a time."
 *
 *  So a task is no longer an instant that a pool of abstract labour absorbs. It
 *  is a quantity of work with somebody's name against it, and until somebody's
 *  name is on it, it does not move. That is the whole opening phase of the game:
 *  nobody is awake, nothing is automated, and every job is one you gave out. */
export type Task = {
  id: string;
  kind: Rule["action"]; target: string; raised: number; priority: number;
  /** crew-days of work this needs */
  work: number;
  /** crew-days done so far */
  done: number;
  /** who is on it, if anyone */
  assignee?: string;
  /** delivery jobs only: where from, where to, and what */
  from?: string; to?: string; what?: string;
};

/** How long each kind of job takes, in GAME-HOURS.
 *
 *  One unit for every duration in the game, so the bars mean something against
 *  each other: a repair is a morning, a rebuild is a day and a half, a survey is
 *  an hour. At one real second per game-hour these are 6 to 60 seconds of
 *  watching — long enough to feel, short enough to sit through. */
export const WORK: Record<Rule["action"], number> = {
  service: 6, replace: 36, makeRod: 12, makeDrone: 24, deliver: 3, buildBed: 24,
};

export function newTask(s: State, t: Omit<Task, "id" | "work" | "done">): Task {
  return { ...t, id: `t${s.nextTaskId++}`, work: WORK[t.kind], done: 0 };
}

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
    // The single maintenance rule aboard, on the thing that kills you fastest.
    //
    // This sat at 40 and made the game unwinnable by default. Reactor output
    // crosses the 890 kW baseline at condition 49, and the reactor sheds a
    // point every six days — so a rule that waits for 40 leaves the ship
    // underpowered for ~58 days on every single cycle, against the cryo banks'
    // 21-day thermal grace. Touching nothing, the first bank went dark on day
    // 317 and 100 colonists were dead inside fifteen months.
    //
    // §5c wants the inherited rules to be a curriculum that "teaches by going
    // wrong slowly". 55 is the lowest value that is not a death sentence: it is
    // still the worst threshold in the viable 55-65 band, so there is something
    // left for the player to improve, and now they live long enough to find it.
    mk("RC-01", "reactor", "condition", 55, "service"),
    // production and supply
    mk("FB-01", "stores:drones", "stock", 6, "makeDrone"),   // keep the fleet up
    mk("FU-01", "stores:rods", "stock", 60, "makeRod"),

    // §4: the ship does not launch with an empty logistics layer either. These
    // are the two hauls that keep the shop fed and the rooms stocked, and they
    // are the ones the player will watch jam when the reactor sags.
    // §6b: the water rule. plan.md's own worked example of a sensor lying was
    // "the water-restock rule that had not fired in 47 years", written when
    // water did nothing — now that Life Support actually draws on the tank, a
    // gauge reading high here is a slow suffocation rather than a curiosity.
    //
    // The threshold is a fortnight of a full watch and three beds, which is
    // enough lead time for someone to walk the ice up from the Cargo Bay.
    mk("LS-01", "room:Life Support:ice", "roomstock", 120, "deliver"),
    // §6b's other two: fertiliser for the racks and medical stock for the
    // Medbay. The Medbay's threshold is two wakes — low enough that the rule is
    // not constantly hauling, high enough that running it to zero takes
    // inattention rather than bad luck.
    mk("HY-01", "room:Hydroponics:vol",  "roomstock",  60, "deliver"),
    mk("MD-01", "room:Medbay:vol",       "roomstock",  50, "deliver"),
    mk("LG-01", "room:Engineering:ore",  "roomstock", 300, "deliver"),
    mk("LG-02", "room:Engineering:sil",  "roomstock", 150, "deliver"),
    mk("LG-03", "room:Engineering:rare", "roomstock",  80, "deliver"),
    // Parts out to the rooms that consume them, by hand.
    //
    // The threshold is sized to the ROOM, not fixed. A flat 20 everywhere looked
    // reasonable and was the single worst number in the logistics layer: Life
    // Support has thirteen assets against the Bridge's two, and a shelf holding
    // 20 parts cannot cover one high-complexity replacement, let alone thirteen
    // ageing at once. Measured, that blocked 440,697 asset-days of replacements
    // — every one of them for want of parts in the room, never for want of
    // electronics or rare compounds.
    ...Object.entries(assets.reduce((n, a) => {
      const room = a.room === "node" ? "Life Support" : a.room;
      n[room] = (n[room] ?? 0) + 1; return n;
    }, {} as Record<string, number>))
      .filter(([room]) => room !== "Engineering")
      .map(([room, n], i) =>
        mk(`LG-2${i}`, `room:${room}:parts`, "roomstock", 20 + 4 * n, "deliver")),
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
      board.push(newTask(s, { kind: "service", target: a.id, raised: s.day, priority: pri }));
      r.fires++; r.lastFired = s.day;
    } else if (r.kind === "roomstock") {
      // §4: a room watching its OWN shelf. The material it wants lives somewhere
      // else, so the action is a delivery, not production — which is exactly why
      // chains get deep without any chaining primitive.
      const [, room, key] = r.watch.split(":");
      const have = s.rooms[room]?.[key as keyof typeof s.stores] ?? 0;
      if (have >= r.threshold) continue;
      // Don't send anyone to fetch what isn't there. Without this the rule fires
      // every day forever against an empty source — 14,519 firings in 46 years
      // for 23 actual hauls, which is plan.md's own THRASH failure state and not
      // something an inherited rule should ship doing.
      const src = SOURCE_OF[key] ?? HOLD;
      if ((s.rooms[src]?.[key as keyof typeof s.stores] ?? 0) <= 0) continue;
      if (board.some(t => t.kind === "deliver" && t.to === room && t.what === key)) continue;
      if (s.shipments.some(x => x.to === room && x.what === key)) continue;
      board.push(newTask(s, { kind: "deliver", target: `${room}:${key}`, raised: s.day,
                             priority: 4, from: src, to: room, what: key }));
      r.fires++; r.lastFired = s.day;
    } else {
      const key = r.watch.split(":")[1];
      const actual = key === "rods" ? s.rods : key === "drones" ? s.drones : (s.stores as any)[key];
      const have = reportedStock(actual, s.gauges[key] ?? 100);   // <- the lie that has no backstop
      if (have >= r.threshold) continue;
      if (board.some(t => t.kind === r.action)) continue;
      board.push(newTask(s, { kind: r.action, target: r.watch, raised: s.day, priority: 5 }));
      r.fires++; r.lastFired = s.day;
    }
  }
}
