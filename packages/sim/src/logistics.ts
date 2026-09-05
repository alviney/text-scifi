/** §4 Buffers and Backpressure.
 *
 *  "There is no ship-wide inventory. Every room keeps its own stores, and nothing
 *  moves between rooms unless a crew member carries it."
 *
 *  That one rule is what turns a list of automations into a chain: a delivery
 *  nobody picks up stops production three steps upstream, and the room reporting
 *  the problem is not the room that has it. It is also what closes §7's death
 *  spiral — the crane needs 30 kW, and 30 kW is what a worn reactor cannot
 *  spare, so ore sits in the Cargo Bay eleven days from the machine that needs
 *  it to make the parts that would fix the reactor. */
import type { Stores } from "./types.ts";
import { emptyStores } from "./economy.ts";

export type MatKey = keyof Stores;

/** Everything the drones bring back lands here. */
export const HOLD = "Cargo Bay";
/** The smelter and the fabricator both work here, so this is where refining draws. */
export const SHOP = "Engineering";

export const RAW: MatKey[] = ["ore", "ice", "sil", "vol", "rare"];
export const MADE: MatKey[] = ["refMetal", "rareCmp", "parts", "electronics"];

/** Per-room caps. The Cargo Bay's is deliberately tight: an Act I encounter at
 *  full fleet brings back ~2,400 units, so the bay overflows unless the shop is
 *  keeping up. §4 wants that to be a genuine Act I bottleneck. */
export const CAP: Record<string, number> = {
  "Cargo Bay": 1400,
  // The shop holds raw material AND everything it has made, so it needs room for
  // both. At 900 it was full of its own parts and rejecting ore deliveries.
  "Engineering": 1400,
};
// A room has to be able to hold the buffer its own rule asks for, plus what it
// is about to consume. 120 was below Life Support's own threshold.
export const CAP_DEFAULT = 260;
export const capOf = (room: string) => CAP[room] ?? CAP_DEFAULT;

/** How much of the low-value stuff the crew will actually take aboard.
 *
 *  Water and volatiles have effectively one sink each — drone propellant, which
 *  is already netted off at the sortie — so without a ceiling they accumulate
 *  forever and, sharing one bay cap with everything else, eventually crowd out
 *  the silicon and rare earths the shop cannot run without. A bay holding 1,295
 *  units of ice starved the fabricator of electronics for 4,745 days and aged
 *  the reactor out by year 48.
 *
 *  Leaving the surplus in space is a decision, not a loss, so it is not counted
 *  as overflow. */
export const KEEP: Partial<Record<MatKey, number>> = { ice: 400, vol: 250 };

export const heldIn = (st: Stores) =>
  RAW.reduce((n, k) => n + st[k], 0) + MADE.reduce((n, k) => n + st[k], 0);

/** §4: bulk material needs the Loading Crane, which is a 30 kW intermittent
 *  load. Small consumables move by hand and cost nothing but a pair of legs. */
export const BULK: ReadonlySet<MatKey> = new Set<MatKey>(["ore", "ice", "sil", "vol", "rare", "refMetal"]);
export const CRANE_KW = 30;
export const BULK_LOAD = 200;
export const BULK_DAYS = 4;
export const HAND_LOAD = 60;
export const HAND_DAYS = 1;

export const isBulk = (m: MatKey) => BULK.has(m);
export const loadOf = (m: MatKey) => (isBulk(m) ? BULK_LOAD : HAND_LOAD);
export const daysOf = (m: MatKey) => (isBulk(m) ? BULK_DAYS : HAND_DAYS);

/** A consignment actually on its way. It occupies no crew once it has left —
 *  the crew member who picked the job is what starts it moving. */
export type Shipment = {
  from: string; to: string; what: MatKey; qty: number;
  left: number;      // day it departed
  eta: number;       // day it arrives
};

export const ROOMS = ["Bridge", "Reactor", "Engineering", "Life Support", "Hydroponics",
                      "Medbay", "Quarters", "Cargo Bay", "Drone Bay", "Maintenance"];

export function newRooms(): Record<string, Stores> {
  const out: Record<string, Stores> = {};
  for (const r of ROOMS) out[r] = emptyStores();
  return out;
}

/** Put material in a room, respecting its cap. Returns what would not fit —
 *  §4's "output buffer full" case, which stalls the thing upstream at full
 *  health with nothing broken. */
export function deposit(st: Stores, what: MatKey, qty: number, cap: number): number {
  const room = Math.max(0, cap - heldIn(st));
  const took = Math.min(qty, room);
  st[what] += took;
  return qty - took;
}

/** Deposit a harvest, keeping only what is worth the shelf space. Returns the
 *  units the bay could not take (a real loss) — surplus water and volatiles are
 *  simply not loaded, and are reported separately. */
export function land(st: Stores, what: MatKey, qty: number, cap: number)
    : { lost: number; declined: number } {
  const keep = KEEP[what];
  let declined = 0;
  if (keep !== undefined) {
    const want = Math.max(0, keep - st[what]);
    declined = Math.max(0, qty - want);
    qty = Math.min(qty, want);
  }
  return { lost: deposit(st, what, qty, cap), declined };
}

/** Take up to qty, returning what was actually available. */
export function withdraw(st: Stores, what: MatKey, qty: number): number {
  const got = Math.min(st[what], qty);
  st[what] -= got;
  return got;
}
