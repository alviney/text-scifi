/** The scripted player, shared by every probe.
 *
 *  ARCHITECTURE §4: "the harness is now a client, not a special case." Since
 *  `step()` stopped harvesting by itself, a probe that does not send the fleet
 *  measures a ship that works no rocks at all — so every probe needs the two
 *  standing habits a human has, and they belong in ONE place rather than
 *  copy-pasted into each one.
 *
 *  Both are day-latched by the caller. `step()` is one game-HOUR (CLAUDE.md),
 *  and a launch decision taken hourly issues twenty-four commands a day. */
import { apply } from "../sim/src/commands.ts";
import { launchBlocked } from "../sim/src/sim.ts";
import { closestApproach, confidence, estimate, inWindow, sortieYield,
         sortiesFor, trueMass } from "../sim/src/encounters.ts";
import { HOLD } from "../sim/src/logistics.ts";
import type { Encounter, State } from "../sim/src/types.ts";

/** Where each raw material is wanted. */
export const WANTS: [string, string][] = [
  ["ore", "Engineering"], ["sil", "Engineering"], ["rare", "Engineering"],
  ["ice", "Life Support"], ["vol", "Hydroponics"],
];

/** Keep the Cargo Bay moving.
 *
 *  One job at a time, re-issued as each completes — apply() refuses a duplicate,
 *  so this is a player noticing the shelf is filling rather than a standing
 *  rule. Since the wave holds station on a full bay this is the single biggest
 *  lever in a season: the fleet flies exactly as long as the crew keep the
 *  shelf clear. */
export function autoHaul(s: State, mode: 0 | 1 | 2 = 2): void {
  if (mode === 0) return;
  const bay = s.rooms[HOLD] as unknown as Record<string, number>;
  const want = mode === 1 ? WANTS.slice(0, 1) : WANTS;
  const best = want.filter(([k]) => bay[k] > 20).sort((a, b) => bay[b[0]] - bay[a[0]])[0];
  if (best) apply(s, { kind: "haul", from: HOLD, to: best[1], what: best[0] });
}

/** How a scripted player chooses between the objects in range. */
export type Pick = "big" | "metal" | "ice";

const score = (e: Encounter, how: Pick) => {
  const y = sortieYield(e);
  return how === "metal" ? y.ore + y.rare * 2 : how === "ice" ? y.ice + y.vol : y.units;
};

/** Send the fleet, if it is idle and something is worth sending it to.
 *
 *  `launchAt` is days before closest approach the probe is willing to launch —
 *  the §6b cost curve's one knob. Pass Infinity to take anything in range the
 *  moment it appears, which is what a crude autopilot does. */
export function autoLaunch(s: State, how: Pick = "big", launchAt = Infinity): void {
  if (s.sortie) return;
  const ready = s.schedule.filter(e =>
    e.leg === s.leg && inWindow(e, s.day) && e.flown < sortiesFor(s.drones)
    && s.day >= closestApproach(e) - launchAt && !launchBlocked(s, e));
  const pick = ready.sort((a, b) => score(b, how) - score(a, how))[0];
  if (pick) apply(s, { kind: "launch", enc: pick.id });
}

/** What a probe does once a day. Returns true on a day boundary. */
export function everyDay(s: State, last: { day: number }): boolean {
  if (s.day === last.day) return false;
  last.day = s.day;
  return true;
}
