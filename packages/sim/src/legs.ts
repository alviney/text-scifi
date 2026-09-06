/** The voyage as five harvest seasons.
 *
 *  Three hundred years is not playable and never was — at one game-hour a
 *  second it is a month of wall clock. Nor is it interesting: the Long Dark is
 *  by design a long stretch of nothing.
 *
 *  So the ship is only *awake* five times. Each leg is a cluster of objects the
 *  route passes through, and the shape of a leg is always the same three beats:
 *
 *    PREP     You come online alone. The crew are still under. You read what
 *             the last century did to the ship, queue the repairs, and write
 *             the rules. Nothing moves — there are no hands yet.
 *    SEASON   You wake the crew and work the cluster. Real time, by hand,
 *             every job given out by name.
 *    TRANSIT  You put everyone back under and go dark. Decades pass in
 *             minutes. Nothing pulls you out of it.
 *
 *  That last beat is what automation is FOR. A rule is not a labour saver here,
 *  it is the only thing running while nobody is awake — the state the ship is in
 *  when you next open your eyes is exactly the state your rules left it in.
 *
 *  And it is why the gate exists. You cannot go dark until the ship can survive
 *  being left, which turns "is my automation any good?" from a vague worry into
 *  a checklist you have to pass. */
import type { Asset, State } from "./types.ts";
import { CRITICAL_ORDER } from "./sim.ts";
import { PART_COST } from "./catalogue.ts";
import { foodBalance } from "./colony.ts";
import { roomOf } from "./sim.ts";

export type Phase = "prep" | "season" | "transit" | "done";

export type Leg = {
  n: number;
  /** year the cluster begins */
  year: number;
  /** how long the cluster takes to pass, in days */
  days: number;
  /** how many objects are in it */
  objects: number;
  /** §6b's three acts: the belt is rich, the Long Dark is not */
  richness: number;
  name: string;
};

/** Five legs across three hundred years.
 *
 *  Seasons are ~90 days, which is about half an hour of play at one game-hour a
 *  second. Object counts total 100, the same as the old continuous schedule, so
 *  the material economy is unmoved — it is only bunched. */
/** How long you get alone with the ship before the cluster arrives. Long enough
 *  to read a century of damage and queue the work; short enough that the season
 *  is what you are waiting for. */
export const PREP_DAYS = 20;

/** FIVE OBJECTS A SEASON, NOT TWENTY-SIX.
 *
 *  The counts here were inherited from the old continuous schedule — a hundred
 *  objects trickling across three hundred years — and simply bunched into five
 *  clusters when the voyage became five harvest seasons. Nobody re-asked how
 *  many objects a season should HAVE.
 *
 *  Twenty-six is the wrong answer and the interface is where it showed: on a
 *  ninety-day rail at phone width that is fifteen pixels an object, so the
 *  diamonds touch, size stops being readable, and the one thing the map exists
 *  to say — "a big one is coming" — cannot be said. A season is meant to be a
 *  handful of decisions you can hold in your head, not a conveyor.
 *
 *  Five each, so a season is five rocks you can name. The material economy is
 *  held where it was by making each one proportionally richer: the same mass
 *  arrives, in lumps four to five times bigger, which is a real change of
 *  character rather than a rescale. A single haul can now exceed what the Cargo
 *  Bay will hold, so what you can CARRY starts to matter as much as what you can
 *  reach — see packages/README.md for what that measured. */
export const OBJECTS_PER_LEG = 5;

export const LEGS: Leg[] = [
  { n: 0, year:   2, days: 90, objects: OBJECTS_PER_LEG, richness: 13.0, name: "The Departure Belt" },
  { n: 1, year:  62, days: 90, objects: OBJECTS_PER_LEG, richness:  4.3, name: "Kestrel Drift" },
  { n: 2, year: 141, days: 90, objects: OBJECTS_PER_LEG, richness:  2.8, name: "The Deep Field" },
  { n: 3, year: 214, days: 90, objects: OBJECTS_PER_LEG, richness:  4.3, name: "Anvil Scatter" },
  { n: 4, year: 283, days: 90, objects: OBJECTS_PER_LEG, richness: 10.6, name: "Arrival Debris" },
];

export const isCritical = (a: Asset) => CRITICAL_ORDER[a.id] !== undefined;

/** Everything the watch needs to still be alive in seventy years.
 *
 *  Not the same as "critical" (§4's dependency order), and the difference cost a
 *  watch its life: the gate passed on power, air and water, the grow beds were
 *  nobody's business, and the ship starved thirty-one years into the dark with
 *  nothing able to pull anyone out of it. Food is a lifeline whether or not it
 *  is on the critical path. */
export const isLifeline = (a: Asset) =>
  isCritical(a) || a.id.startsWith("bed") || a.id === "irrigation" || a.id.startsWith("lsn");

/** What the crossing will eat.
 *
 *  Clustering the objects has a consequence that took a while to surface: between
 *  legs there is **no material income at all**. Sixty years of wear with nothing
 *  coming aboard, so everything the watch will need has to be on the shelves
 *  before you go dark. That is what the harvest season is FOR — you are not
 *  collecting ore, you are funding six decades of unattended maintenance.
 *
 *  Rough on purpose. Assets wear out on roughly a 56-year service life (§4), so
 *  a 60-year crossing is about one replacement per asset, and the player needs a
 *  number to aim at rather than a simulation. */
export const SERVICE_LIFE_YEARS = 56;

export function crossingNeeds(s: State, years: number) {
  const n = s.assets.length * (years / SERVICE_LIFE_YEARS);
  return {
    replacements: n,
    parts: Math.round(n * 9),
    electronics: Math.round(n * 5),
    rareCmp: Math.round(n * 0.6),
  };
}

export function held(s: State) {
  const parts = Object.values(s.rooms).reduce((t, r) => t + r.parts, 0);
  const shop = s.rooms["Engineering"];
  return { parts, electronics: shop.electronics, rareCmp: shop.rareCmp };
}

export type Check = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

/** §1's "degrades gracefully" made into a door.
 *
 *  Everything here is a thing that, left alone for seventy years with nobody
 *  awake, decides whether there is a ship to come back to. The player cannot go
 *  dark until all of it holds — which is the point: the checklist is the brief
 *  for what the automation has to be good enough to do. */
export function readiness(s: State): Check[] {
  const crit = s.assets.filter(isCritical);
  const watched = new Set(s.rules.filter(r => r.kind === "condition").map(r => r.watch));

  const broken = s.assets.filter(a => a.faulted);
  // Below the thresholds a player will actually write. A gate at 65 against a
  // service rule at 65 is a knife edge: the asset sits exactly on the line and
  // the check flickers.
  const worn = crit.filter(a => a.cond < 55);
  const lifeline = s.assets.filter(isLifeline);
  const unwatched = lifeline.filter(a => !watched.has(a.id));
  const bare = crit.filter(a => (s.rooms[roomOf(a)]?.parts ?? 0) < PART_COST[a.cls]);

  const onWatch = s.crew.filter(c => !c.asleep);
  const next = LEGS[s.leg + 1];
  const years = next ? next.year - s.day / 365 : 300 - s.day / 365;
  const burn = s.rods / Math.max(0.01, years);
  const food = foodBalance(s, s.settings.botanistShare);
  const need = crossingNeeds(s, Math.max(1, next ? next.year - s.day / 365 : 300 - s.day / 365));
  const have = held(s);

  return [
    { id: "faults", label: "Nothing is broken", ok: broken.length === 0,
      detail: broken.length ? `${broken.length} faulted` : "all systems running" },
    { id: "cond", label: "Critical systems above 55", ok: worn.length === 0,
      detail: worn.length ? `${worn.map(a => a.id).slice(0, 3).join(", ")} below` : "all above" },

    // The three that decide whether there is a ship to come back to. Somebody
    // has to be awake to turn a wrench, they have to be allowed to pick up work
    // without being told, and something has to notice the work is needed.
    { id: "watch", label: "Somebody is on watch", ok: onWatch.length > 0,
      detail: onWatch.length ? `${onWatch.length} staying awake` : "nobody awake" },
    { id: "unsupervised", label: "The watch can work unsupervised",
      ok: s.settings.crewSelfAssign,
      detail: s.settings.crewSelfAssign ? "they take jobs off the board"
                                        : "they only do what you hand them" },
    { id: "watched", label: "Everything keeping them alive is watched",
      ok: unwatched.length === 0,
      detail: unwatched.length ? `${unwatched.length} with no rule on them`
                               : `${lifeline.length} covered` },

    // The one that is not obvious and killed a watch of two eight years into a
    // sixty-year transit: more people awake is more mouths AND more hands in
    // the grow beds, so the margin does not move the way you expect. And since
    // nothing pulls you out of the dark, you would not have found out until the
    // next cluster.
    { id: "food", label: "The galley can feed the watch", ok: food.margin >= 1.25,
      detail: onWatch.length === 0 ? "nobody to feed"
            : `${food.produced.toFixed(0)} grown against ${food.eaten.toFixed(0)} eaten` +
              (food.margin < 1.25 ? "" : ` · ${food.beds} beds`) },

    { id: "spares", label: "A spare in every critical room", ok: bare.length === 0,
      detail: bare.length ? `${bare.length} room${bare.length > 1 ? "s" : ""} without parts`
                          : "stocked" },

    // The one the harvest season exists to satisfy. Nothing comes aboard between
    // clusters, so the crossing is funded entirely out of what you took here.
    { id: "stores", label: "Stores to last the crossing",
      ok: have.parts >= need.parts && have.electronics >= need.electronics
          && have.rareCmp >= need.rareCmp,
      detail: `${have.parts.toFixed(0)}/${need.parts} parts · ` +
              `${have.electronics.toFixed(0)}/${need.electronics} electronics · ` +
              `${have.rareCmp.toFixed(0)}/${need.rareCmp} rare` },
    { id: "fuel", label: "Fuel to reach the next cluster", ok: burn >= 1.05,
      detail: `${s.rods.toFixed(0)} rods for ${years.toFixed(0)} years` },
  ];
}

/** Not a gate — a nag. Half-finished work is untidy rather than fatal. */
export const looseEnds = (s: State) => s.board.filter(t => t.done < t.work).length;

export const canGoDark = (s: State) => readiness(s).every(c => c.ok);

/** The assets the gate wants a rule on that do not have one — so the interface
 *  can offer to write them rather than making the player click fifteen times. */
export const unwatchedLifeline = (s: State) => {
  const watched = new Set(s.rules.filter(r => r.kind === "condition").map(r => r.watch));
  return s.assets.filter(a => isLifeline(a) && !watched.has(a.id));
};
