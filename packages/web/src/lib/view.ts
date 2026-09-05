/** The vocabulary layer. design/README: "the notation in plan.md §5 is a
 *  specification, not an interface" — so every piece of spec jargon is
 *  translated exactly once, here, and no component invents its own wording.
 *
 *  This lives in the client on purpose (ARCHITECTURE §7): the presentation layer
 *  owns the mapping, and the core stays free of anything a second client would
 *  have to be re-taught. */
import type { Asset, State } from "../../../sim/src/types.ts";
import { assetName } from "../../../sim/src/catalogue.ts";
import { reportedCondition, reportedStock } from "../../../sim/src/rules.ts";
import { MAXCOND_FLOOR } from "../../../sim/src/sim.ts";
import { BASELINE_KW, reactorOutput, rodsPerDay } from "../../../sim/src/power.ts";
import { DAYS } from "../../../sim/src/sim.ts";

export { assetName };

export type Band = "ok" | "warn" | "crit";

/** design/README: "Status is the only colour", and colour never carries meaning
 *  alone — every band has its own glyph too. */
export const GLYPH: Record<Band, string> = { ok: "●", warn: "◐", crit: "○" };

/** §4's state names, in the words the player sees. AT_RISK is "Failing". */
export function band(a: Asset): Band {
  if (a.faulted) return "crit";
  if (a.cond < 30) return "crit";
  if (a.cond < 55) return "warn";
  return "ok";
}

export function stateWord(a: Asset): string {
  if (a.faulted) return "Broken";
  if (a.cond < 30) return "Failing";
  if (a.cond < 55) return "Worn";
  return "Working";
}

/** A room reads as the worst of its equipment — design/README's whole dot rule. */
export function roomBand(assets: Asset[]): Band {
  if (assets.some(a => band(a) === "crit")) return "crit";
  if (assets.some(a => band(a) === "warn")) return "warn";
  return "ok";
}

/** design/README: a reading from a worn sensor carries a trailing "?" and no
 *  explanation. The mark is the whole feature — it is what makes the §5 lie
 *  visible without turning it into a tutorial. */
export function shown(a: Asset): { value: number; doubt: boolean } {
  const v = reportedCondition(a);
  return { value: v, doubt: v - a.cond > 4 };
}

export function shownStock(s: State, key: string, actual: number) {
  const g = s.gauges[key] ?? 100;
  const v = reportedStock(actual, g);
  return { value: v, doubt: g < 96 };
}

export const num = (n: number, d = 0) => n.toLocaleString("en", {
  minimumFractionDigits: d, maximumFractionDigits: d });

export const mark = (r: { value: number; doubt: boolean }, d = 0) =>
  num(r.value, d) + (r.doubt ? "?" : "");

/** Game time, in the two units the player actually thinks in. */
export const year = (day: number) => Math.floor(day / 365);
export function when(day: number, now: number): string {
  const d = now - day;
  if (d < 1) return "just now";
  if (d < 60) return `${Math.floor(d)}d ago`;
  if (d < 730) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

/** design/README's "one question per level": the facility line answers
 *  "what's wrong in here?" in a sentence before it shows a number. */
export function roomLine(assets: Asset[]): string {
  const broken = assets.filter(a => a.faulted);
  if (broken.length) return `${assetName(broken[0].id)} is broken` +
    (broken.length > 1 ? ` and ${broken.length - 1} more` : "");
  const failing = assets.filter(a => band(a) === "crit");
  if (failing.length) return `${assetName(failing[0].id)} is failing`;
  const worn = assets.filter(a => band(a) === "warn");
  if (worn.length) return `${worn.length} item${worn.length > 1 ? "s" : ""} getting worn`;
  return "Nothing needs you";
}

/** And the equipment level answers "what do I do about it?" */
export function assetLine(a: Asset, now: number): string {
  const since = a.repairs === 0 ? "It has never been serviced"
    : `Last serviced ${when(now - Math.round((100 - a.cond) / Math.max(a.baseWear, 1e-6)), now)}`;
  if (a.faulted) return `Broken. It stopped and nothing has rebuilt it.`;
  if (a.maxCond <= MAXCOND_FLOOR + 1) return `Worn out. Repairs cannot help it any more — it needs replacing.`;
  if (a.cond < 30) return `Failing. ${since}.`;
  return `${stateWord(a)}. Best it can reach after repair is ${Math.round(a.maxCond)}.`;
}

/** The one number pair on the Voyage tab that actually decides anything. */
export function power(s: State) {
  const reactor = s.assets.find(a => a.id === "reactor")!;
  const made = reactorOutput(reactor);
  return { made, needed: BASELINE_KW, short: made < BASELINE_KW };
}

/** Will the fuel last? This has to be a projection from the CURRENT burn, not a
 *  historical counter — counters.deficitDays only ever goes up, so reading it
 *  told a ship at full output with 259 rods that it was burning too fast. */
export function fuel(s: State) {
  const reactor = s.assets.find(a => a.id === "reactor")!;
  const out = reactorOutput(reactor);
  const perDay = rodsPerDay(Math.min(out, BASELINE_KW), reactor.cond);
  const daysLeft = DAYS - s.day;
  const needed = perDay * daysLeft;
  return { needed, perYear: perDay * 365, onTrack: s.rods >= needed,
           lastsDays: perDay > 0 ? s.rods / perDay : Infinity };
}

export const ROOMS = ["Bridge", "Reactor", "Engineering", "Life Support", "Hydroponics",
                      "Medbay", "Quarters", "Cargo Bay", "Drone Bay", "Maintenance"];

export const roomOf = (a: Asset) => (a.room === "node" ? "Life Support" : a.room);

/** §4: the materials worth showing on a shelf, in the order a person reads them. */
export const SHELF: [string, string][] = [
  ["parts", "Metal parts"], ["electronics", "Electronics"], ["rareCmp", "Rare compounds"],
  ["refMetal", "Refined metal"], ["ore", "Metal ore"], ["rare", "Rare earths"],
  ["sil", "Silicates"], ["ice", "Water ice"], ["vol", "Volatiles"],
];

/** What a room is holding, worth-showing entries only. */
export function shelf(s: State, room: string) {
  const st = s.rooms[room];
  if (!st) return [];
  return SHELF.filter(([k]) => (st as Record<string, number>)[k] > 0.5)
              .map(([k, name]) => ({ key: k, name, qty: (st as Record<string, number>)[k] }));
}

/** Consignments on their way, for the room that is waiting on them. */
export const inbound = (s: State, room: string) => s.shipments.filter(x => x.to === room);
export const outbound = (s: State, room: string) => s.shipments.filter(x => x.from === room);

/** §4's jam, in one sentence. The crane is 30 kW and a worn reactor has none. */
export function logistics(s: State) {
  const crane = s.assets.find(a => a.id === "crane")!;
  const waiting = s.board.filter(t => t.kind === "deliver");
  return { crane, waiting, moving: s.shipments.length,
           stuck: waiting.length > 0 && (crane.faulted || s.brownout === true) };
}
