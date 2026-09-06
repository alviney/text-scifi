/** Everything the player can do, as data.
 *
 *  ARCHITECTURE §2 promises `apply(state, command) -> state`. This is it. The
 *  point is not ceremony: a command is serialisable, so a save plus a command
 *  log reproduces any bug exactly (§2's determinism rule), and a second client
 *  only has to build these objects — it never reaches into the model. */
import { newTask, type Rule } from "./rules.ts";
import { MAX_BEDS } from "./catalogue.ts";
import type { Settings, State, Stores } from "./types.ts";
import { emit } from "./signals.ts";
import { SCAN_HOURS, worthScanning, sortiesFor, classReading, confidence,
         dvCost, closestApproach } from "./encounters.ts";
import { LEGS } from "./legs.ts";
import { canWake, MED_ROOM, MEDS_PER_WAKE } from "./colony.ts";
import { withdraw } from "./logistics.ts";
import { FIRST_CREW, seasonOver, launchBlocked } from "./sim.ts";
import { makeDistinct, THAW_MAX, type Person, type Role } from "./crew.ts";
import type { Rng } from "./rng.ts";

/** §3: "Freezing is cheap and instant — rotate crew freely, the cost gate is on
 *  waking them up." They go back alive, just older, and their skill goes with
 *  them: training dies with the shift. */
function freeze(s: State, who: Person) {
  const i = s.crew.indexOf(who);
  if (i < 0) return;
  s.crew.splice(i, 1);
  s.colony.frozen++;
  s.colony.awake = s.crew.length;
  emit(s, "info", "Medbay", "CRW-CRYO",
       `${who.name} is back under at ${Math.floor(who.age)}. ${
         Math.floor((s.day - who.wokeOn) / 365)} years served.`);
}

export type Command =
  /** put a job on the board by hand — the player noticing something themselves */
  | { kind: "raise"; action: Rule["action"]; target: string }
  /** pull a job the player no longer wants done */
  | { kind: "cancel"; target: string }
  /** §5: recalibrate a store gauge. Nothing in the game prompts this. */
  | { kind: "calibrate"; gauge?: string }
  | { kind: "addRule"; rule: Rule }
  | { kind: "removeRule"; id: string }
  | { kind: "setThreshold"; id: string; threshold: number }
  | { kind: "setting"; key: keyof Settings; value: number | boolean }
  /** acknowledge a critical signal — releases §2's snap-back */
  | { kind: "ack" }
  /** §5b: answer a request that came UP from the crew */
  | { kind: "answer"; request: string; grant: boolean }
  /** §3: freezing is cheap and instant. This is the rotation valve. */
  | { kind: "freeze"; person: string }
  /** §3: waking someone is the expensive half, and the first thing you do. */
  | { kind: "wake"; role: Role }
  /** §3: crew are task queues. Put a name on a job. */
  | { kind: "assign"; task: string; person: string }
  | { kind: "unassign"; task: string }
  /** §6b: look harder at something ahead. One game-hour of the array's time. */
  | { kind: "rescan"; enc: number }
  /** §6b: SEND THE FLEET. The one command the season turns on — nothing is
   *  harvested that the player did not send the drones to. */
  | { kind: "launch"; enc: number }
  /** Call them home early, keeping the water the rest of the wave would burn. */
  | { kind: "recall" }
  /** The three beats of a leg: prep -> season -> transit. */
  /** End the season: everyone back under, and say who wakes at the next cluster. */
  | { kind: "goDark"; next?: import("./crew.ts").Role[] }
  /** §4: move material between rooms by hand. The manual half of the logistics
   *  layer, and without it the material economy is unreachable — deliveries only
   *  ever came from standing rules, which the player now starts without. */
  | { kind: "haul"; from: string; to: string; what: string }
  /** §6: a grow bed is built, not inherited. The first crew's real job. */
  | { kind: "buildBed" }
  /** How thin to spread the locker. Buys days, costs morale. */
  | { kind: "rations"; level: number };

export function apply(s: State, c: Command): State {
  switch (c.kind) {
    case "raise": {
      if (s.board.some(t => t.target === c.target && t.kind === c.action)) break;
      s.board.push(newTask(s, { kind: c.action, target: c.target, raised: s.day, priority: 0 }));
      break;
    }
    case "cancel": {
      const i = s.board.findIndex(t => t.target === c.target);
      if (i >= 0) s.board.splice(i, 1);
      break;
    }
    case "calibrate": {
      const keys = c.gauge ? [c.gauge] : Object.keys(s.gauges);
      for (const k of keys) s.gauges[k] = 100;
      break;
    }
    case "addRule": {
      if (!s.rules.some(r => r.id === c.rule.id)) s.rules.push({ ...c.rule });
      break;
    }
    case "removeRule": {
      const i = s.rules.findIndex(r => r.id === c.id);
      if (i >= 0) s.rules.splice(i, 1);
      break;
    }
    case "setThreshold": {
      const r = s.rules.find(x => x.id === c.id);
      if (r) r.threshold = c.threshold;
      break;
    }
    case "setting": {
      (s.settings as Record<string, number | boolean>)[c.key] = c.value;
      break;
    }
    case "ack": {
      s.acked = s.day;
      break;
    }
    case "answer": {
      const rq = s.requests.find(x => x.id === c.request);
      if (!rq || rq.answered) break;
      rq.answered = c.grant ? "granted" : "declined";
      const who = s.crew.find(x => x.id === rq.from);
      if (!who) break;
      if (c.grant) {
        if (rq.kind === "cryo") freeze(s, who);
        else { who.rest = 100; who.asked = false; }
      } else {
        // §5b: "declining costs morale". That is what gives §3's happiness stat
        // the mechanical teeth its table asked for and never got.
        who.happiness = Math.max(0, who.happiness - 25);
        who.asked = false;
      }
      break;
    }
    case "freeze": {
      const who = s.crew.find(x => x.id === c.person);
      if (who) freeze(s, who);
      break;
    }
    case "wake": {
      // §3: the cost gate is on waking, not freezing. It spends a colonist out
      // of a small and unequal pool, and they are no use for a few days while
      // the Medbay brings them round.
      const medbay = s.assets.find(a => a.id === "medstation")!;
      if (medbay.faulted || s.pool[c.role] <= 0 || s.colony.frozen <= 0) break;
      // §6b: and it now costs medical supplies, which is the first reason the
      // game has ever given to harvest for the crew rather than the machines.
      // An empty Medbay is a hard no — the rostered crew who come round at the
      // start of a leg are free, so this can never lock the ship out entirely.
      if (!canWake(s)) {
        emit(s, "warn", MED_ROOM, "MED-OUT",
             `No medical supplies in ${MED_ROOM}. Nobody can be brought round until volatiles are carried up.`);
        break;
      }
      withdraw(s.rooms[MED_ROOM], "vol", MEDS_PER_WAKE);
      s.counters.volUsed += MEDS_PER_WAKE;
      s.pool[c.role]--;
      // Thread the state's own RNG rather than reaching for a fresh one:
      // ARCHITECTURE §2's non-negotiable is that a save plus a command log
      // replays exactly, and a command that rolls dice off-stream breaks that.
      const r: Rng = { s: s.rngState };
      const p = makeDistinct(r, c.role, s.day, s.nextCrewId++, s.crew);
      s.rngState = r.s;
      s.crew.push(p);
      s.colony.frozen--; s.colony.awake = s.crew.length;
      emit(s, "info", "Medbay", "CRW-WAKE",
           `${p.name} is out of cryo. ${p.role[0].toUpperCase() + p.role.slice(1)}, age ${
             Math.floor(p.age)}. Fit for duty within ${THAW_MAX} days.`);
      break;
    }
    case "assign": {
      const task = s.board.find(t => t.id === c.task);
      const who = s.crew.find(x => x.id === c.person);
      if (!task || !who || who.asleep) break;
      // One thing at a time (§3). Taking a new job drops the old one.
      for (const t of s.board) if (t.assignee === who.id) t.assignee = undefined;
      task.assignee = who.id; who.task = task.id;
      break;
    }
    case "haul": {
      if ((s.rooms[c.from]?.[c.what as keyof Stores] ?? 0) <= 0) break;
      if (s.board.some(t => t.kind === "deliver" && t.to === c.to && t.what === c.what)) break;
      s.board.push(newTask(s, { kind: "deliver", target: `${c.to}:${c.what}`,
                                raised: s.day, priority: 4,
                                from: c.from, to: c.to, what: c.what }));
      break;
    }
    case "buildBed": {
      const have = s.assets.filter(a => a.id.startsWith("bed")).length;
      if (have >= MAX_BEDS) break;
      if (s.board.some(t => t.kind === "buildBed")) break;
      s.board.push(newTask(s, { kind: "buildBed", target: `bed${have + 1}`,
                                raised: s.day, priority: 2 }));
      break;
    }
    case "rations": {
      s.settings.rations = Math.max(0.4, Math.min(1, c.level));
      emit(s, "info", "Quarters", "RAT-SET",
           `Rations set to ${Math.round(s.settings.rations * 100)}%.`);
      break;
    }
    case "goDark": {
      if (s.phase !== "season") break;
      // The readiness gate is parked along with the Long-Dark automation model
      // it was written for. For now the only condition is that the cluster is
      // behind you and you have said who wakes up next.
      if (!seasonOver(s)) {
        emit(s, "warn", "Bridge", "SEA-HOLD", "There are still objects ahead of us.");
        break;
      }
      // Everyone goes back under. Nobody keeps watch — there is nothing for
      // them to do that the player could direct, and no automation to direct it.
      for (const person of [...s.crew]) freeze(s, person);
      s.nextCrew = c.next ?? [...FIRST_CREW];
      s.phase = "transit"; s.phaseFrom = s.hour;
      const next = LEGS[s.leg + 1];
      emit(s, "info", "Voyage", "SEA-DARK",
           next ? `Going dark. ${Math.round(next.year - s.day / 365)} years to ${next.name}.`
                : `Going dark. ${Math.round(300 - s.day / 365)} years to target.`);
      break;
    }
    case "rescan": {
      const enc = s.schedule.find(e => e.id === c.enc);
      if (!enc || enc.year <= s.day / 365) break;          // already behind us
      if (s.scans.some(x => x.enc === c.enc)) break;       // already looking
      if (!worthScanning(enc, s.day / 365)) {
        emit(s, "chatter", "Bridge", "NAV-SCAN",
             "Nothing more to learn about that one from here.");
        break;
      }
      const comms = s.assets.find(a => a.id === "comms")!;
      if (comms.faulted) {
        emit(s, "warn", "Bridge", "NAV-BLIND", "The Comms Array is down. Nothing to scan with.");
        break;
      }
      s.scans.push({ enc: c.enc, work: SCAN_HOURS, done: 0 });
      emit(s, "chatter", "Bridge", "NAV-SCAN", `Surveying the object ${
        Math.round(enc.year - s.day / 365)} years out.`);
      break;
    }
    case "launch": {
      const e = s.schedule.find(x => x.id === c.enc);
      if (!e) break;
      const why = launchBlocked(s, e);
      if (why) { emit(s, "warn", "Drone Bay", "HRV-HOLD", why); break; }
      // Re-sending the fleet to an object it is already working is a no-op
      // rather than a second wave: the drones are there.
      if (s.sortie?.enc === c.enc) break;
      const dv = dvCost(e, s.day);
      s.sortie = { enc: e.id, flown: e.flown, want: sortiesFor(s.drones),
                   landed: 0, burned: 0, spilled: 0, lost: 0, from: s.day, dv };
      const late = s.day > closestApproach(e);
      emit(s, "info", "Drone Bay", "HRV-GO",
           `Fleet away to the ${classReading(e, confidence(e, s.day / 365)).toLowerCase()} object. ` +
           `${(sortiesFor(s.drones) - e.flown)} sorties at ${dv.toFixed(1)}x propellant` +
           (dv > 1.6 ? late ? " — it is already running from us." : " — we are chasing it down."
                     : "."));
      break;
    }
    case "recall": {
      const so = s.sortie;
      if (!so) break;
      s.sortie = null;
      emit(s, "info", "Drone Bay", "HRV-BACK",
           `Fleet recalled after ${so.flown} sorties. ${so.landed.toFixed(0)} units aboard.`);
      break;
    }
    case "unassign": {
      const task = s.board.find(t => t.id === c.task);
      if (!task) break;
      const who = s.crew.find(x => x.id === task.assignee);
      if (who) who.task = undefined;
      task.assignee = undefined;
      break;
    }
  }
  return s;
}

/** Signals the player has not seen yet — what §2's snap-back holds on. */
export const unacked = (s: State) =>
  s.signals.filter(x => x.level === "critical" && x.day > s.acked);
