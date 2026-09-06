/** The people, and the things that keep them alive. Without this the ship cannot
 *  fail: §1's fail states are all deaths, and a model with no deaths in it will
 *  report that a neglected ship arrives safely. */
import type { Asset, State } from "./types.ts";
import { chance, type Rng } from "./rng.ts";
import { withdraw } from "./logistics.ts";
import { emit } from "./signals.ts";
import type { Bus } from "./power.ts";
import { effort, makeDistinct, mourn, nextRole, type Person } from "./crew.ts";

export const CREW_TARGET = 8;
export const FOOD_PER_CREW_PER_DAY = 3;

/** What the first crew are sent up with.
 *
 *  Deliberately not enough. Four people on full rations eat 1,080 over a
 *  ninety-day season, so a locker of 700 buys about sixty days — and the gap is
 *  the whole early game: build grow beds, or go hungry, or both. */
export const STARTING_RATIONS = 700;

/** How thin you are willing to spread it. Cutting rations buys days and costs
 *  morale, which costs work rate, which costs you the beds you were trying to
 *  build — the pressure is meant to compound rather than simply pinch. */
export const RATION_LEVELS = [1, 0.75, 0.5] as const;

/** §6b: water, which the ship had no use for until now.
 *
 *  A quarter of everything the fleet lands is ice — C-types are 45% water and
 *  comets 65%, and those two classes are 45% of the route. Every drop of it used
 *  to arrive, sit in the Cargo Bay against a 400-unit cap, and do nothing: air
 *  was a function of the oxygen generator and the power bus, grow beds drew
 *  nothing, and food was rations and crops. The most abundant thing on the
 *  route was the one thing the ship did not need, which made a comet the worst
 *  object you could be offered.
 *
 *  So water now has three sinks, and they are deliberately different in
 *  character: the crew's draw is small and unavoidable, the beds' is large and
 *  optional, and the fleet's is spent up front before a single unit comes back.
 *
 *  The loop is closed but not perfect — this is make-up water for what the
 *  scrubbers cannot recover, not what anybody drinks. A grow bed does not close
 *  at all: what it transpires leaves with the crop. */
export const WATER_ROOM = "Life Support";
export const WATER_PER_CREW_PER_DAY = 0.9;
export const WATER_PER_BED_PER_DAY = 1.6;
/** The tank Life Support launches with. Sized to carry the first season on its
 *  own — §5c's rule that an inherited default may be suboptimal but must not be
 *  fatal applies to the stores as much as to the rules, and the player starts
 *  with no rules at all.
 *
 *  Four crew and three beds draw 8.4 a day, so a season costs about 920. At 900
 *  the first leg ended with fourteen units in the tank, which is not a lesson,
 *  it is a coin toss: waking a fifth person or planting a fourth bed killed a
 *  player who had done everything the departure board asked. 1200 lands the
 *  season at about a quarter full, with the low-water warning firing inside the
 *  last fortnight — late enough to be a fright, early enough to act on, and
 *  short enough that leg 2 cannot be started without hauling ice up. */
export const STARTING_WATER = 1200;
/** Propellant aboard at departure. A full wave costs 144, so this is four
 *  encounters' worth: enough that the first icy rock is a top-up rather than a
 *  rescue, and not enough to work a whole season without one. */
export const START_BAY_WATER = 600;
/** Days of tank left before the ship says something. */
export const WATER_LOW_DAYS = 25;

/** §6b: volatiles, the other material with nothing to spend it on.
 *
 *  Water was 26% of every haul and did nothing; volatiles are 19% and were in the
 *  same position, sitting at a 250-unit keep-cap because there was no reason to
 *  carry more. plan.md's table has always had them cracked into chemical
 *  compounds for "fuel, medical supplies, fertiliser".
 *
 *  They are consumed raw here. The cracking step in §6's recipe table would add a
 *  tenth material to a game that is trying to lose some, and nothing downstream
 *  would be able to tell the difference — so the yields are folded into the rates
 *  below rather than modelled as a stage.
 *
 *  Two sinks, and deliberately not the same shape as water's:
 *
 *    FERTILISER  Continuous, small, and a YIELD LEVER rather than a gate. Water
 *                is the hard stop on a grow bed — no water, no crop. Volatiles
 *                only decide how good the crop is, so running out costs you
 *                harvest rather than killing the rack.
 *    MEDICAL     Lumpy, and a HARD GATE on the one decision §3 says the whole
 *                game turns on. Waking somebody has always cost colonist-years
 *                and days in the Medbay; it has never cost material, so there
 *                was no reason to harvest for the crew rather than the machines.
 *                An empty Medbay means nobody else comes up.
 *
 *  The rostered crew who come round at the start of a leg are FREE. They were
 *  prepped before the ship went dark, which is fiction the go-dark decision
 *  already implies — and it is what stops an empty Medbay from being a hard lock
 *  with no crew, no wakes and no way back. Improvising a wake mid-season is what
 *  draws on the stores, which is exactly the difference the planning loop wants. */
export const FARM_ROOM = "Hydroponics";
export const MED_ROOM = "Medbay";
export const VOL_PER_BED_PER_DAY = 0.6;
/** What a bed yields with no fertiliser at all. Less, not nothing. */
export const UNFED_BED_YIELD = 0.55;
export const MEDS_PER_WAKE = 25;
// 200 ended leg 1 with fifteen units left, which is the same coin toss the water
// tank was rejected for. 240 lands it at about a quarter full, matching the tank,
// so the first season teaches the readout rather than the shortage — and leg 2
// still cannot be started without hauling volatiles up.
export const STARTING_FERTILISER = 240;
export const STARTING_MEDS = 250;

/** Can the Medbay bring somebody round? §3's gate, now with a material in it. */
export function canWake(s: State): boolean {
  return (s.rooms[MED_ROOM]?.vol ?? 0) >= MEDS_PER_WAKE;
}
/** How many more people the Medbay could bring round on what it holds. */
export const wakesLeft = (s: State) =>
  Math.floor((s.rooms[MED_ROOM]?.vol ?? 0) / MEDS_PER_WAKE);

/** What Life Support will draw today, at the current crew and beds. */
export function waterDraw(s: State): number {
  const beds = s.assets.filter(a => a.id.startsWith("bed") && !a.faulted).length;
  return s.colony.awake * WATER_PER_CREW_PER_DAY + beds * WATER_PER_BED_PER_DAY;
}
/** Days of water left in the tank at today's draw. */
export function waterDays(s: State): number {
  const d = waterDraw(s);
  return d > 0 ? (s.rooms[WATER_ROOM]?.ice ?? 0) / d : Infinity;
}
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

/** The ship departs with **nobody awake**. Two hundred people asleep, a
 *  caretaker, and no hands. Waking the first person is the first thing the
 *  player does, and it is meant to be a decision rather than a default. */
export const newColony = (): Colony => ({
  awake: 0, frozen: COLONISTS, banks: BANKS,
  food: STARTING_RATIONS, fed: 100, air: 100, diedAwake: 0, diedFrozen: 0, cold: 0,
});

/** Crew capacity is not a constant — it is however many people are alive and
 *  well. With §3's roster in, it is the sum of what each of them can actually
 *  manage today: a tired, unhappy or injured person works slower, by name. */
export function labour(c: Colony): number {
  return c.awake * 0.36 * (c.fed / 100) * (c.air / 100);
}

/** What the galley makes against what the watch eats, per day.
 *
 *  This is the number that decides whether a ship left alone for sixty years is
 *  still crewed at the end of it, and it is not obvious: more people awake means
 *  more mouths AND more hands in the grow beds, so the margin does not move the
 *  way you expect. It needs showing, not deriving. */
export function foodBalance(s: State, botanistShare: number, dimmed = false) {
  const ration = s.settings.rations;
  const beds = s.assets.filter(a => a.id.startsWith("bed") && !a.faulted).length;
  const jobs = crewLabour(s.crew, s.colony) * botanistShare / 0.6;
  // A dry bed grows nothing and an unfertilised one grows badly, so the
  // projection has to know about both shelves.
  const wet = Math.min(1, (s.rooms[WATER_ROOM]?.ice ?? 0) / Math.max(1e-9, waterDraw(s)));
  const fed_ = beds > 0
    ? UNFED_BED_YIELD + (1 - UNFED_BED_YIELD)
      * Math.min(1, (s.rooms[FARM_ROOM]?.vol ?? 0) / (beds * VOL_PER_BED_PER_DAY))
    : 1;
  const produced = beds * (BED_YIELD / BED_CYCLE_DAYS) * Math.min(1, jobs)
                 * (dimmed ? 0.6 : 1) * wet * fed_;
  const eaten = s.crew.filter(c => !c.asleep).length * FOOD_PER_CREW_PER_DAY * ration;
  return { produced, eaten, beds, margin: eaten > 0 ? produced / eaten : Infinity,
           /** days of locker left at the current burn, ignoring what grows */
           daysLeft: eaten > produced ? s.colony.food / (eaten - produced) : Infinity };
}

export function crewLabour(crew: Person[], c: Colony): number {
  const raw = crew.reduce((n, p) => n + effort(p), 0) * 0.45;
  return raw * (c.fed / 100) * (c.air / 100);
}

export function tickColony(s: State, r: Rng, b: Bus, botanistJobs: number) {
  const c = s.colony;

  // ---- water: drawn before anything that needs it ----
  //
  // Life Support holds the tank, so this obeys §4 like every other material: it
  // is not a ship-wide pool, it is one room's shelf, and it only refills because
  // somebody carried ice up from the Cargo Bay. A player with no delivery rule
  // and no eye on the gauge will run it down.
  const beds = s.assets.filter(a => a.id.startsWith("bed") && !a.faulted);
  const wantWater = c.awake * WATER_PER_CREW_PER_DAY + beds.length * WATER_PER_BED_PER_DAY;
  const gotWater = withdraw(s.rooms[WATER_ROOM], "ice", wantWater);
  s.counters.waterUsed += gotWater;
  /** 1 when the draw was met in full, 0 when the tank is dry. */
  const wet = wantWater > 0 ? gotWater / wantWater : 1;
  const wasDry = s.dry ?? false;
  const isDry = wet < 0.999;
  if (isDry && !wasDry)
    emit(s, wet <= 0 ? "critical" : "warn", WATER_ROOM, "H2O-OUT",
         wet <= 0 ? "Water tank empty. The scrubbers are running dry and nothing is growing."
                  : `Water short in ${WATER_ROOM}. Beds and scrubbers running at ${(wet * 100).toFixed(0)}%.`);
  else if (!isDry && wasDry)
    emit(s, "info", WATER_ROOM, "H2O-OK", "Water restored to Life Support.");
  else if (!isDry && wantWater > 0) {
    // The warning that matters is the one that arrives with time to act on it.
    const days = s.rooms[WATER_ROOM].ice / wantWater;
    const wasLow = s.waterLow ?? false;
    if (days < WATER_LOW_DAYS && !wasLow)
      emit(s, "warn", WATER_ROOM, "H2O-LOW",
           `Water down to ${s.rooms[WATER_ROOM].ice.toFixed(0)} — about ${days.toFixed(0)} days.`);
    s.waterLow = days < WATER_LOW_DAYS;
  }
  s.dry = isDry;

  // ---- fertiliser: how good the crop is, not whether there is one ----
  const wantVol = beds.length * VOL_PER_BED_PER_DAY;
  const gotVol = withdraw(s.rooms[FARM_ROOM], "vol", wantVol);
  s.counters.volUsed += gotVol;
  const fedBeds = wantVol > 0
    ? UNFED_BED_YIELD + (1 - UNFED_BED_YIELD) * (gotVol / wantVol)
    : 1;
  const wasLean = s.lean ?? false;
  const isLean = wantVol > 0 && gotVol < wantVol - 1e-9;
  if (isLean && !wasLean)
    emit(s, "warn", FARM_ROOM, "FRT-LOW",
         `No fertiliser in ${FARM_ROOM}. The beds keep going at ${
           (fedBeds * 100).toFixed(0)}% until volatiles are carried up.`);
  else if (!isLean && wasLean)
    emit(s, "info", FARM_ROOM, "FRT-OK", "Fertiliser restored. The beds are back to full yield.");
  s.lean = isLean;

  // ---- food: beds crop on a cycle, and only if someone plants and picks them ----
  // §6: grow beds are `dimmable`, so a ship short of power grows less food
  // rather than none. Dimming is paid for here, one meal at a time. A bed with
  // no water does not grow slowly, it grows nothing.
  const perDay = beds.length * (BED_YIELD / BED_CYCLE_DAYS) * Math.min(1, botanistJobs)
               * (b.dimmed ? 0.6 : 1) * wet * fedBeds;
  c.food += perDay;
  const ration = s.settings.rations;
  c.food -= c.awake * FOOD_PER_CREW_PER_DAY * ration;
  if (c.food < 0) { c.food = 0; c.fed = Math.max(0, c.fed - 1.2); }
  else c.fed = Math.min(100, c.fed + 2 * ration);
  // Short commons is felt as morale, not as starvation, until the locker is
  // actually empty. That is what makes it a lever rather than a countdown.
  if (ration < 1) for (const p of s.crew)
    if (!p.asleep) p.happiness = Math.max(0, p.happiness - 0.10 * (1 - ration) * 4);

  // ---- air: the ship-wide generator plus the node in the room you are in ----
  const o2 = s.assets.find(a => a.id === "o2gen")!;
  const nodes = s.assets.filter(a => a.id.startsWith("lsn"));
  const nodesOk = nodes.filter(a => !a.faulted).length / nodes.length;
  // The O2 generator and the atmosphere regulator are `critical`, so they are
  // the last things to lose power — air only fails once the bus cannot even
  // carry the critical block.
  //
  // A dry loop is a slower death than a broken one: the scrubbers limp on what
  // they can reclaim, so air falls at half the rate of a failed generator and
  // there is time to notice and carry water up. Being half-supplied costs half
  // as much again, so the tank running low is felt before it runs out.
  const plantOk = !o2.faulted && nodesOk > 0.3 && b.load >= 175;
  if (!plantOk) c.air = Math.max(0, c.air - 4);
  else if (wet < 1) c.air = Math.max(0, c.air - 2 * (1 - wet));
  else c.air = Math.min(100, c.air + 3);

  // ---- crew die of starvation or bad air ----
  const risk = (c.fed < 25 ? 0.004 : 0) + (c.air < 25 ? 0.010 : 0);
  if (risk > 0) {
    for (const person of s.crew.filter(p => !p.asleep)) {
      if (!chance(r, risk)) continue;
      person.asleep = true; person.health = 0;
      s.memorial.push({ name: person.name, role: person.role,
                        years: Math.floor((s.day - person.wokeOn) / 365),
                        cause: c.air < 25 ? "asphyxiation" : "starvation", day: s.day });
      s.crew.splice(s.crew.indexOf(person), 1);
      mourn(s.crew, person);
      c.diedAwake++;
      // §3: a death is the heaviest event in the game. It goes out at critical
      // severity, which under §2 pulls a fast-forwarding player back to real
      // time. You do not get to skip past someone dying.
      emit(s, "critical", "Quarters", "CRW-DIED",
           `${person.name} has died. ${c.air < 25 ? "The air gave out." : "There was no food."}`);
    }
    c.awake = s.crew.filter(p => !p.asleep).length;
  }

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

  // Nobody wakes themselves. §3 makes the roster an insurance premium the player
  // chooses to pay: waking someone costs colonist-years and days in the medbay,
  // and the ship will happily coast with an empty crew while it falls apart.
  //
  // The balance harness is measuring a fully-staffed ship, so it sets autoWake
  // and gets the old behaviour.
  const medbay0 = s.assets.find(a => a.id === "medstation")!;
  if (s.settings.autoWake && c.awake < CREW_TARGET && c.frozen > 0
      && !medbay0.faulted && canWake(s) && c.fed > 40 && c.air > 40 && chance(r, 0.02)) {
    const want = nextRole(s.crew, s.pool);
    if (want) {
      s.pool[want]--;
      withdraw(s.rooms[MED_ROOM], "vol", MEDS_PER_WAKE);
      s.counters.volUsed += MEDS_PER_WAKE;
      const p = makeDistinct(r, want, s.day, s.nextCrewId++, s.crew);
      s.crew.push(p); c.awake++; c.frozen--;
      emit(s, "info", "Medbay", "CRW-WAKE",
           `${p.name} is out of cryo. ${p.role[0].toUpperCase() + p.role.slice(1)}.`);
    }
  }


  // ---- §1 fail states ----
  // An empty roster is no longer a loss on its own — the ship departs that way.
  // It is a loss when there is nobody awake AND no way to wake anyone: either
  // the banks are empty or the Med Station is broken.
  const medbay = s.assets.find(a => a.id === "medstation")!;
  if (c.awake <= 0 && (c.frozen <= 0 || medbay.faulted)) s.dead = "crew lost";
  else if (c.frozen <= 0 && c.awake <= 0) s.dead = "colony lost";
}
