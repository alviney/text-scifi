/** What the departure board expects of a season.
 *
 *  §1b makes a leg the unit of play, but nothing in the model said what a leg
 *  was FOR — the player could work five rocks, bank nothing useful, go dark, and
 *  find out sixty years later that the season had been a waste. A season needs a
 *  brief, and the brief needs to be visible while there is still time to act on
 *  it.
 *
 *  Everything here is DERIVED. There is no goal state, nothing is stored, and
 *  step() never reads this file: a goal is a question asked of the state the
 *  simulation already keeps. That matters because it means goals cannot drift
 *  out of sync with the ship, and because adding one costs nothing but a
 *  function.
 *
 *  `readiness()` in legs.ts asks a related question — can you survive being left
 *  — and was written for the watch-and-automate model that is currently parked,
 *  so nothing surfaces it. These are the season's own objectives, in the
 *  vocabulary the player already has, and two of them lean on the same
 *  arithmetic.
 *
 *  §5c argues that inherited things should carry authorship: "set by Marchetti,
 *  y0" is cheap and it is what makes a default feel like a legacy rather than a
 *  setting. A goal is exactly that — somebody decided it before you existed and
 *  wrote down why — so each one carries the sentence it was set with. */
import type { State } from "./types.ts";

import { LEGS, OBJECTS_PER_LEG, crossingNeeds, held, isCritical } from "./legs.ts";
import { FOOD_PER_CREW_PER_DAY } from "./colony.ts";

export type Goal = {
  id: string;
  /** Plain language. design/README: the spec's keys are not an interface. */
  name: string;
  /** Missing this one does not cost you points, it costs you the next crew. */
  critical: boolean;
  have: number;
  want: number;
  met: boolean;
  /** One line of state, for the collapsed row. */
  detail: string;
  /** Who set it, and the sentence they set it with (§5c). */
  by: string;
  because: string;
};

/** Days of locker the next watch should wake up to. Not a full crossing — they
 *  are expected to grow their own — but enough that the first month is not
 *  spent hungry while the racks come up. */
const LOCKER_DAYS = 60;

/** What the departure board ASKS for, which is not the same as MAX_BEDS.
 *  The catalogue caps the racks at six because that is what Hydroponics has
 *  room for; three is what a watch actually needs, and the gap between them is
 *  headroom the player can choose to spend. Aiming the goal at the cap would
 *  have told them to build twice what anybody asked for. */
const BEDS_WANTED = 3;

export function goals(s: State): Goal[] {
  const beds = s.assets.filter(a => a.id.startsWith("bed") && !a.faulted).length;
  // Worked means the fleet was SENT and brought something back, not that the
  // ship happened to pass it. Four rocks you sailed past are not four rocks.
  const worked = s.schedule.filter(e => e.leg === s.leg && e.flown > 0).length;
  const next = LEGS[s.leg + 1];
  const years = Math.max(1, next ? next.year - s.day / 365 : 300 - s.day / 365);
  const need = crossingNeeds(s, years);
  const have = held(s);
  const crit = s.assets.filter(isCritical);
  const sound = crit.filter(a => a.cond >= 55).length;
  // The watch that will be awake in the next season, sized off this one.
  const mouths = Math.max(1, s.crew.filter(c => !c.asleep).length);
  const locker = Math.round(mouths * FOOD_PER_CREW_PER_DAY * LOCKER_DAYS);

  const g = (id: string, name: string, critical: boolean, have_: number, want: number,
             detail: string, by: string, because: string): Goal =>
    ({ id, name, critical, have: have_, want, met: have_ >= want, detail, by, because });

  return [
    g("beds", "Feed yourselves", true, beds, BEDS_WANTED,
      `${beds} of ${BEDS_WANTED} racks running`,
      "Mission Control",
      "Three racks. Not two. Two feeds a crew that is careful; three feeds a crew " +
      "that makes mistakes, and they will."),

    g("locker", "Leave a full locker", true, Math.round(s.colony.food), locker,
      `${Math.round(s.colony.food)} of ${locker} meals`,
      "Mission Control",
      `Whatever is in the locker when you go dark is what the next watch eats while ` +
      `their own racks come up. ${LOCKER_DAYS} days is the margin we think that takes.`),

    g("stores", "Stock the crossing", true,
      Math.min(have.parts / Math.max(1, need.parts),
               have.electronics / Math.max(1, need.electronics),
               have.rareCmp / Math.max(1, need.rareCmp)) * 100, 100,
      `${have.parts.toFixed(0)}/${need.parts} parts · ` +
      `${have.electronics.toFixed(0)}/${need.electronics} electronics · ` +
      `${have.rareCmp.toFixed(0)}/${need.rareCmp} rare`,
      "Mission Control",
      "Nothing comes aboard between clusters. Sixty years of wear funded entirely " +
      "out of what you take here — you are not collecting ore, you are buying decades."),

    g("belt", "Work the belt", false, worked, OBJECTS_PER_LEG,
      `${worked} of ${OBJECTS_PER_LEG} objects`,
      "Mission Control",
      "Every rock you pass is one the route does not offer twice. Send the drones."),

    g("sound", "Hand over a sound ship", false, sound, crit.length,
      `${sound} of ${crit.length} critical systems above 55`,
      "Mission Control",
      "The next crew inherit the ship you leave, not the one you meant to leave."),
  ];
}

export const goalsMet = (s: State) => goals(s).filter(x => x.met).length;
