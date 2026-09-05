import type { Asset } from "./types.ts";

export const NOMINAL_KW = 1000;
export const BASELINE_KW = 890;   // §6 continuous load

/** §4: full output above 60% condition, then falls away to a floor. */
export function conditionFactor(cond: number): number {
  return cond >= 60 ? 1 : 0.4 + 0.6 * (cond / 60);
}

export function reactorOutput(reactor: Asset): number {
  if (reactor.faulted) return 0;
  return NOMINAL_KW * conditionFactor(reactor.cond);
}

/** §6: a worn reactor is weaker AND thirstier. */
export function efficiency(cond: number): number {
  return 0.65 + 0.35 * (cond / 100);
}

/** Rod-years consumed per day at a given delivered load. */
export function rodsPerDay(deliveredKw: number, reactorCond: number): number {
  return (deliveredKw / NOMINAL_KW) / efficiency(reactorCond) / 365;
}

/** §6's load table and load shedding.
 *
 *  The prototype had none of this: it treated the 890 kW baseline as a hard
 *  floor, so any reactor below 890 was in permanent deficit with no way out.
 *  That turned §4's death spiral into a soft lock — entered around year 80,
 *  never escaped, 220 years of coasting at the scrap floor.
 *
 *  §6 always specified the way out. Power Distribution sheds from the bottom up:
 *  `sheddable` goes first, `dimmable` scales to 60% rather than hard-cutting,
 *  and `critical` is never auto-shed. That is 162 kW of cushion between "the
 *  reactor is sagging" and "colonists start dying", which is the window §1's
 *  "degrades gracefully" promise is made of. */
export type ShedClass = "critical" | "dimmable" | "sheddable";

/** Continuous draw, by class. Sums to the 890 kW baseline in §6's table. */
export const LOAD: Record<ShedClass, number> = {
  critical: 175,     // O2 90, atmo 25, medstation 20, nav 15, powerdist 10, doors 10, conduits 5
  dimmable: 255,     // grow beds 120, life support nodes 80, water 40, irrigation 15
  sheddable: 60,     // comms 20, scanner 10, clamp 10, aux 5, dispenser 5, rec 5, hull 5
};
/** Cryo is critical and counted separately: it is the decision, not a load. */
export const KW_PER_BANK = 50;
/** Dimmable assets scale down rather than cutting out. */
export const DIM_FACTOR = 0.6;

/** §6 lever 2: "Shed empty rooms — LifeSupportNodes in rooms with no crew. Up to
 *  ~70 kW free, and near-costless if you track where crew are."
 *
 *  This matters more than it looks. Headroom at a perfect reactor is only 110 kW,
 *  and the Loading Crane takes 30 of it — so adding §4's logistics layer quietly
 *  cut industrial throughput by 27% and replacements with it, from 281 a voyage
 *  to 176. Eight crew cannot occupy ten rooms at once; holding atmosphere in the
 *  empty ones is the cheapest power on the ship. */
export const NODE_KW = 8;
export const NODES = 10;
export const emptyRoomSaving = (crewAwake: number) =>
  Math.max(0, NODES - Math.max(1, Math.ceil(crewAwake / 3))) * NODE_KW;

export type Bus = {
  /** what the ship is actually drawing, cryo included */
  load: number;
  /** left over for the crane and the shop */
  headroom: number;
  /** how many banks this output can hold up */
  banks: number;
  shed: boolean;
  dimmed: boolean;
  /** §6: shedding everything still is not enough. Everything runs degraded and
   *  the fluctuation damages whatever is running. */
  cascade: boolean;
};

/** Work §6's shedding order and report what the bus can carry. */
export function bus(output: number, banksWanted: number, emptyRooms = 0): Bus {
  let shed = false, dimmed = false;
  const fixed = () => LOAD.critical + (dimmed ? LOAD.dimmable * DIM_FACTOR : LOAD.dimmable)
                      + (shed ? 0 : LOAD.sheddable) - emptyRooms;
  if (output < fixed() + banksWanted * KW_PER_BANK) shed = true;
  if (output < fixed() + banksWanted * KW_PER_BANK) dimmed = true;
  const banks = Math.max(0, Math.min(banksWanted,
    Math.floor((output - fixed()) / KW_PER_BANK)));
  const load = fixed() + banks * KW_PER_BANK;
  return { load, headroom: Math.max(0, output - load), banks, shed, dimmed,
           cascade: dimmed && banks < banksWanted };
}
