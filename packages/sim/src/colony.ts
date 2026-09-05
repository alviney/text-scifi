/** The people, and the things that keep them alive. Without this the ship cannot
 *  fail: §1's fail states are all deaths, and a model with no deaths in it will
 *  report that a neglected ship arrives safely. */
import type { Asset, State } from "./types.ts";
import { chance, type Rng } from "./rng.ts";
import type { Bus } from "./power.ts";

export const CREW_TARGET = 8;
export const FOOD_PER_CREW_PER_DAY = 3;
export const BED_CYCLE_DAYS = 36;
export const BED_YIELD = 155;
export const COLONISTS = 200;
export const BANKS = 8;
export const PER_BANK = COLONISTS / BANKS;

/** kW that must be met before the cryo banks start dying (§6 critical load). */
export const CREW_CRITICAL_KW = 490;
export const KW_PER_BANK = 50;
/** How long a bank holds temperature without power before its pods are lost. */
export const COLD_GRACE_DAYS = 21;

export type Colony = {
  awake: number;          // crew currently working
  frozen: number;         // colonists still in cryo
  banks: number;          // cryo banks still powered
  food: number;
  fed: number;            // 0-100, falls when there is no food
  air: number;            // 0-100, falls when life support is broken
  diedAwake: number;
  diedFrozen: number;
  /** consecutive days the banks have been underpowered */
  cold: number;
};

export const newColony = (): Colony => ({
  awake: CREW_TARGET, frozen: COLONISTS - CREW_TARGET, banks: BANKS,
  food: 400, fed: 100, air: 100, diedAwake: 0, diedFrozen: 0, cold: 0,
});

/** Crew capacity is not a constant — it is however many people are alive and well. */
export function labour(c: Colony): number {
  return c.awake * 0.36 * (c.fed / 100) * (c.air / 100);
}

export function tickColony(s: State, r: Rng, b: Bus, botanistJobs: number) {
  const c = s.colony;

  // ---- food: beds crop on a cycle, and only if someone plants and picks them ----
  const beds = s.assets.filter(a => a.id.startsWith("bed") && !a.faulted);
  // §6: grow beds are `dimmable`, so a ship short of power grows less food
  // rather than none. Dimming is paid for here, one meal at a time.
  const perDay = beds.length * (BED_YIELD / BED_CYCLE_DAYS) * Math.min(1, botanistJobs)
               * (b.dimmed ? 0.6 : 1);
  c.food += perDay;
  c.food -= c.awake * FOOD_PER_CREW_PER_DAY;
  if (c.food < 0) { c.food = 0; c.fed = Math.max(0, c.fed - 1.2); }
  else c.fed = Math.min(100, c.fed + 2);

  // ---- air: the ship-wide generator plus the node in the room you are in ----
  const o2 = s.assets.find(a => a.id === "o2gen")!;
  const nodes = s.assets.filter(a => a.id.startsWith("lsn"));
  const nodesOk = nodes.filter(a => !a.faulted).length / nodes.length;
  // The O2 generator and the atmosphere regulator are `critical`, so they are
  // the last things to lose power — air only fails once the bus cannot even
  // carry the critical block.
  const airOk = !o2.faulted && nodesOk > 0.3 && b.load >= 175;
  c.air = airOk ? Math.min(100, c.air + 3) : Math.max(0, c.air - 4);

  // ---- crew die of starvation or bad air ----
  const risk = (c.fed < 25 ? 0.004 : 0) + (c.air < 25 ? 0.010 : 0);
  for (let i = 0; i < c.awake; i++)
    if (risk > 0 && chance(r, risk)) { c.awake--; c.diedAwake++; }

  // ---- the colony needs power, and gets it last ----
  // A bank has thermal mass: it survives a dip and dies to a drought. Killing
  // colonists on the first brownout made a well-run ship lose 182 of them.
  // §6 does the shedding; this only asks how many banks survived it.
  const canPower = b.banks;
  if (canPower < c.banks) c.cold++; else c.cold = 0;
  if (c.cold >= COLD_GRACE_DAYS) {
    const lost = c.banks - canPower;
    const killed = Math.min(c.frozen, lost * PER_BANK);
    c.frozen -= killed; c.diedFrozen += killed; c.banks = canPower; c.cold = 0;
  }

  // ---- wake replacements, if there is anyone left and a medbay to do it in ----
  const medbay = s.assets.find(a => a.id === "medstation")!;
  if (c.awake < CREW_TARGET && c.frozen > 0 && !medbay.faulted && c.fed > 40 && c.air > 40) {
    if (chance(r, 0.02)) { c.awake++; c.frozen--; }
  }

  // ---- §1 fail states ----
  if (c.awake <= 0 && (c.frozen <= 0 || medbay.faulted)) s.dead = "crew lost";
  else if (c.frozen <= 0 && c.awake <= 0) s.dead = "colony lost";
}
