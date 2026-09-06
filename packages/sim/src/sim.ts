import { type Rng, rng, chance } from "./rng.ts";
import type { Asset, Encounter, Policy, Settings, State } from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { buildAssets, assetName, newBed, BED_PARTS, MAX_BEDS,
         RARE_COST, PART_COST, ELEC_COST } from "./catalogue.ts";
import { buildSchedule, classReading, confidence, trueMass, dvCost, inWindow,
         sortieYield, sortiesFor, windowOpens, windowCloses, windowGone,
         SORTIE_LOSS, SORTIES_PER_WINDOW, PROPELLANT_PER_SORTIE,
         PROPELLANT_RESERVE, propellantFor, WINDOW_LEAD, WINDOW_TAIL,
         CLASS_NAME } from "./encounters.ts";
import { emptyStores, refine, makeParts, canMakeRod, makeRod, canMakeDrone, makeDrone,
         RARE_RESERVE, ELEC_TARGET } from "./economy.ts";
import { CRANE_KW, HOLD, SHOP, capOf, daysOf, deposit, heldIn, isBulk, land, loadOf,
         newRooms, withdraw, type MatKey } from "./logistics.ts";
import { BASELINE_KW, bus, emptyRoomSaving, reactorOutput, rodsPerDay } from "./power.ts";
import { type Task, inheritedRules, playerRules, evaluate, reportedCondition } from "./rules.ts";
import { newColony, tickColony, crewLabour, STARTING_WATER, WATER_ROOM,
         START_BAY_WATER, FARM_ROOM, MED_ROOM,
         STARTING_FERTILISER, STARTING_MEDS } from "./colony.ts";
import { newCrew, tickCrew, hasAwake, effort, onDuty, makeDistinct, POOL,
         type Person, type Role } from "./crew.ts";

/** Who the departure crew rostered for the first season. Not the player's
 *  choice — they were picked before you were switched on. */
export const FIRST_CREW: Role[] = ["engineer", "engineer", "botanist", "pilot"];
import { LEGS, PREP_DAYS } from "./legs.ts";
import { emit } from "./signals.ts";
import { apply } from "./commands.ts";

export const START_RODS = 320;
export const START_DRONES = 6;
export const DAYS = 300 * 365;
export const HOURS = DAYS * 24;

export function init(seed: number, actII = 40, p?: Policy): State {
  const r = rng(seed);
  const s: State = {
    day: 0, rngState: 0, assets: buildAssets(), rods: START_RODS, drones: START_DRONES,
    stores: emptyStores(), rooms: newRooms(), shipments: [],
    schedule: buildSchedule(r), next: 0, sortie: null, scans: [], hour: 0,
    leg: 0, phase: "prep", phaseFrom: 0, nextCrew: [...FIRST_CREW],
    gauges: { parts: 100, rods: 100, rareCmp: 100, drones: 100 }, colony: newColony(),
    crew: [], requests: [], memorial: [], pool: { ...POOL }, nextCrewId: 0, nextTaskId: 0,
    rules: [], board: [], signals: [], acked: 0, settings: { ...DEFAULT_SETTINGS },
    counters: { ruleFires: 0, staleTasks: 0, blindDays: 0, services: 0, replacements: 0,
                faults: 0, encountersTaken: 0, encountersMissed: 0, rodsMade: 0,
                deficitDays: 0, brownoutDays: 0,
                deliveries: 0, overflow: 0, starvedDays: 0, craneBlockedDays: 0,
                waterUsed: 0, propellant: 0, declined: 0, volUsed: 0 },
    dead: null,
  };
  s.rngState = r.s;
  // The clock starts at the first cluster's prep window, not at launch. The
  // first two years of the voyage are the same nothing as the other 298.
  s.hour = Math.round((LEGS[0].year * 365 - PREP_DAYS) * 24);
  s.day = Math.floor(s.hour / 24);
  // The ship departs with a working stock, not empty shelves — and §4 says that
  // stock has to be SOMEWHERE. The shop holds what it made; the rooms hold a
  // handful of parts each, which is the buffer that runs out first.
  s.stores = s.rooms[SHOP];
  s.stores.parts = 60; s.stores.electronics = 40; s.stores.rareCmp = 60; s.stores.refMetal = 200;
  for (const room of Object.keys(s.rooms)) if (room !== SHOP) s.rooms[room].parts = 25;
  // §6b: water is a working stock like any other, and the ship cannot start
  // without it — an empty bay cannot fuel the first wave, and an empty tank
  // starts the air falling on day one. The Cargo Bay's share is propellant;
  // Life Support's is the tank the crew and the beds draw on.
  s.rooms[HOLD].ice = START_BAY_WATER;
  s.rooms[WATER_ROOM].ice = STARTING_WATER;
  // Volatiles, likewise: fertiliser for the racks that do not exist yet, and
  // enough medical stock for ten wakes. Both are one season's worth — the point
  // is that leg 2 cannot be started on what the ship left Earth with.
  s.rooms[FARM_ROOM].vol = STARTING_FERTILISER;
  s.rooms[MED_ROOM].vol = STARTING_MEDS;
  // §5c argues the ship should launch with standing rules as a curriculum. The
  // game now starts with NONE: the opening phase is meant to be hands-on —
  // wake someone, learn what the ship does, hand out every job — and automation
  // is what the middle game is for. The balance harness still gets them, since
  // it is measuring a fully-automated ship.
  s.rules = p ? inheritedRules(s.assets) : [];
  // An autopilot (the balance harness) may pre-load the player's side of things.
  // A human client does the same through apply(), one command at a time.
  if (p) {
    // A Policy means the balance harness: a fully-staffed, self-running ship.
    // Spread over DEFAULT_SETTINGS rather than built from scratch: this object
    // was written by hand and silently lost `rations` when the ration lever was
    // added, so every automated run multiplied the day's meals by undefined and
    // carried food = NaN from the first day to the last. The harness has been
    // reporting a food model that was not running.
    s.settings = { ...DEFAULT_SETTINGS,
                   replaceAt: p.replaceAt, droneTarget: p.droneTarget,
                   botanistShare: p.botanistShare, prioritise: p.prioritise,
                   shedEmptyRooms: true, autoRetire: true,
                   crewSelfAssign: true, autoWake: true };
    s.phase = "season";
    s.crew = newCrew(r);
    for (const c of s.crew) s.pool[c.role]--;
    s.nextCrewId = s.crew.length;
    s.colony.awake = s.crew.length;
    s.colony.frozen -= s.crew.length;
    for (const c of s.crew) c.fitOn = 0;
    if (p.automate) s.rules.push(...playerRules(s.assets, p.serviceAt, p.replaceAt,
      p.criticalServiceAt, id => CRITICAL_ORDER[id] !== undefined));
  }
  // The AI does not come round alone and wait two years for company. There is
  // nothing it can do without hands, so the ship wakes it and the first crew
  // together — they are already on the Medbay tables, coming round over the next
  // three to five days, and the prep window IS their recovery.
  if (!p) {
    for (const role of FIRST_CREW) {
      s.pool[role]--;
      const person = makeDistinct(r, role, s.day, s.nextCrewId++, s.crew);
      s.crew.push(person);
    }
    s.colony.awake = s.crew.length;
    s.colony.frozen -= s.crew.length;
    s.rngState = r.s;
    emit(s, "critical", "Voyage", "SEA-WAKE",
         `${LEGS[0].name} ahead. ${s.crew.length} coming round in the Medbay.`);
    emit(s, "info", "Quarters", "RAT-LOCKER",
         `${s.colony.food.toFixed(0)} rations aboard. Nothing is growing yet.`);
  }
  return s;
}

const reactorOf = (s: State) => s.assets.find(a => a.id === "reactor")!;
/** The ten addresses in §4. The life-support nodes are distributed, not a room. */
export const roomOf = (a: Asset) => (a.room === "node" ? "Life Support" : a.room);

/** The dependency order everything else hangs off. Lower is attended to first. */
export const CRITICAL_ORDER: Record<string, number> = {
  reactor: 0, powerdist: 1, o2gen: 1, smelter: 2, fabricator: 2, water: 3, atmo: 3, cryo: 3,
};
/** §4: wear accelerates as the ceiling falls. */
const ageFactor = (a: Asset) => 1 + (100 - a.maxCond) / 40;

/** Floor: below this an asset is scrap, and only replacement helps. */
export const MAXCOND_FLOOR = 30;

/** An asset nobody wrote a rule for is noticed only by someone walking past it,
 *  and only once it is visibly bad. This is the cost of not automating. */
/** What a dormant ship draws: the cryo banks and nothing else. */
export const DORMANT_KW = 420;

export const NOTICE_AT = 30;
export const NOTICE_CHANCE = 0.003;

/** §4 refurbishment loss.
 *  A flat per-service cost made frequent servicing strictly worse than neglect,
 *  which inverts the premise of the game. The loss is mostly proportional to the
 *  WEAR RECOVERED, so total ceiling erosion tracks total wear rather than visit
 *  count. A small fixed overhead still discourages pointless fiddling, and a
 *  faulted rebuild costs a real penalty on top. The decision then lives where it
 *  should — in fault risk — rather than in gaming the repair counter. */
export const REFURB_OVERHEAD = 0.05;
export const REFURB_RATE = 0.022;
export const FAULT_REBUILD_PENALTY = 2.0;

function service(s: State, a: Asset, by?: string) {
  const recovered = a.maxCond - a.cond;
  const loss = REFURB_OVERHEAD + REFURB_RATE * recovered + (a.faulted ? FAULT_REBUILD_PENALTY : 0);
  const wasFaulted = a.faulted;
  a.cond = a.maxCond;
  a.maxCond = Math.max(MAXCOND_FLOOR, a.maxCond - loss);
  a.faulted = false;
  a.repairs++;
  s.counters.services++;
  if (wasFaulted)
    emit(s, "info", a.room, "EQ-REBUILT", `${assetName(a.id)} rebuilt and back on line.`, a.id, by);
  else
    emit(s, "chatter", a.room, "EQ-SVC", `${assetName(a.id)} serviced.`, a.id, by);
}

function replace(s: State, a: Asset, by?: string): boolean {
  // §4 splits this across two rooms, and the split is the point.
  //
  // The precision half — electronics and rare compounds — is assembled at the
  // fabricator, so it comes off the SHOP's shelf. The fitting half is metal
  // parts, and those have to be IN THE ROOM: a shipful of parts in Engineering
  // is no use to the Reactor until somebody carries them there, which is a job,
  // which can jam.
  //
  // Requiring all three in the room instead was tried first and was simply
  // wrong: rooms never hold electronics, so nothing outside Engineering could
  // ever be replaced. Replacements fell from 281 to 17 across a voyage and the
  // reactor aged out by year 20.
  const shop = s.rooms[SHOP], here = s.rooms[roomOf(a)];
  if (shop.rareCmp < RARE_COST[a.cls] || shop.electronics < ELEC_COST[a.cls]
      || here.parts < PART_COST[a.cls])
    return false;
  shop.rareCmp -= RARE_COST[a.cls]; shop.electronics -= ELEC_COST[a.cls];
  here.parts -= PART_COST[a.cls];
  a.cond = 100; a.maxCond = 100; a.faulted = false; a.repairs = 0;
  s.counters.replacements++;
  emit(s, "info", a.room, "EQ-NEW", `${assetName(a.id)} replaced. Ceiling back to 100.`, a.id, by);
  return true;
}

/** Can this job even be started today? A blocked job stays on the board getting
 *  older, which is §4's point: nothing is broken and nothing is moving. */
function canStart(s: State, task: Task, craneUp: boolean): boolean {
  if (task.kind === "buildBed")
    return s.rooms["Hydroponics"].parts >= BED_PARTS || s.rooms[SHOP].parts >= BED_PARTS;
  if (task.kind === "deliver") {
    const what = task.what as MatKey;
    if (isBulk(what) && !craneUp) return false;
    return s.rooms[task.from!][what] > 0;
  }
  if (task.kind === "makeRod") return canMakeRod(s.stores);
  if (task.kind === "makeDrone") return s.drones < s.settings.droneTarget && canMakeDrone(s.stores);
  const a = s.assets.find(x => x.id === task.target);
  if (!a) return false;
  return a.faulted || a.cond < a.maxCond - 3;
}

/** The work is done — now do the thing. Returns false if it cannot be completed
 *  for want of materials, in which case the job waits, finished but unfulfilled. */
function finish(s: State, task: Task, p: Settings, by?: string): boolean {
  if (task.kind === "buildBed") {
    const shop = s.rooms[SHOP], hyd = s.rooms["Hydroponics"];
    const from = hyd.parts >= BED_PARTS ? hyd : shop;
    if (from.parts < BED_PARTS) return false;
    from.parts -= BED_PARTS;
    const n = s.assets.filter(a => a.id.startsWith("bed")).length + 1;
    if (n > MAX_BEDS) return true;
    s.assets.push(newBed(n));
    emit(s, "info", "Hydroponics", "HYD-BED",
         `Grow bed ${n} planted. ${n} of ${MAX_BEDS} racks running.`, undefined, by);
    return true;
  }
  if (task.kind === "makeRod") {
    if (!canMakeRod(s.stores)) return false;
    makeRod(s.stores); s.rods++; s.counters.rodsMade++;
    emit(s, "chatter", "Engineering", "FAB-ROD", "Fuel rod fabricated.", undefined, by);
    return true;
  }
  if (task.kind === "makeDrone") {
    if (s.drones >= p.droneTarget) return true;
    if (!canMakeDrone(s.stores)) return false;
    makeDrone(s.stores); s.drones++;
    emit(s, "chatter", "Drone Bay", "FAB-DRN", `Drone built. Fleet at ${s.drones}.`, undefined, by);
    return true;
  }
  if (task.kind === "deliver") {
    const what = task.what as MatKey;
    const qty = withdraw(s.rooms[task.from!], what, loadOf(what));
    if (qty <= 0) return true;
    s.shipments.push({ from: task.from!, to: task.to!, what, qty,
                       left: s.day, eta: s.day + daysOf(what) });
    return true;
  }
  const a = s.assets.find(x => x.id === task.target);
  if (!a) return true;
  if (!a.faulted && a.cond >= a.maxCond - 3) return true;
  if (a.maxCond < p.replaceAt && replace(s, a, by)) return true;
  // No parts yet. Keep patching it anyway: the ceiling is already written off,
  // so there is nothing left to protect, and a high-wear asset in free-fall
  // reaches zero long before the replacement arrives. Abandoning the reactor for
  // one year at ageFactor 1.9 cost 182 colonists.
  service(s, a, by);
  // A sensor bolted to a machine gets checked while the machine is open, so
  // routine repairs DO mitigate condition drift — for free, without the player
  // ever deciding to. A gauge on a store has no such visit: nothing routine
  // touches it, and its reading looks fine precisely because it reads high.
  a.sensorCond = 100;
  return true;
}

/** One game-hour. This is the tick.
 *
 *  It used to be a day, which was a shortcut, and the shortcut showed: a survey
 *  takes an hour and there was nowhere to put it, so it was resolved against the
 *  client's interpolated clock instead. That made one duration in the game
 *  incomparable with all the others — and durations only mean anything relative
 *  to each other. A six-hour repair and a thirty-six-hour rebuild have to be the
 *  same kind of number, owned by the same clock.
 *
 *  ARCHITECTURE §2 said "integer game-hours, fixed timestep" from the start.
 *  This is that.
 *
 *  Day-scale processes — wear, power, industry, the colony — still run once a
 *  day, on the rollover. Nothing about the balance changes; the hour is simply
 *  where work and progress now live. */
export function step(s: State): State {
  if (s.dead) return s;
  s.hour++;
  hourly(s);
  if (s.hour % 24 === 0) { s.day++; daily(s); openSeason(s); arrive(s); }
  if (s.hour >= HOURS && !s.dead) {
    s.dead = "arrived";
    emit(s, "info", "Voyage", "ARRIVE",
         `Target reached. ${s.colony.frozen + s.colony.awake} of 200 alive.`);
  }
  return s;
}

/** Have we reached the next cluster? Transit ends by arriving, never by
 *  anything going wrong — nothing pulls you out of the dark, which is exactly
 *  why the gate before it has to be strict. */
/** Prep is the crew's recovery, so it ends when the first of them stands up.
 *  There is no button: you had the days you had. */
function openSeason(s: State): void {
  if (s.phase !== "prep") return;
  if (!s.crew.some(c => !c.asleep && s.day >= c.fitOn)) return;
  s.phase = "season"; s.phaseFrom = s.hour;
  const leg = LEGS[s.leg];
  emit(s, "info", "Voyage", "SEA-OPEN",
       `${leg.name}. ${s.schedule.filter(e => e.leg === s.leg).length} objects over ${leg.days} days.`);
}

/** The cluster is behind you when the last object has passed. */
export function seasonOver(s: State): boolean {
  const last = s.schedule.filter(e => e.leg === s.leg).at(-1);
  // The season ends when the last WINDOW shuts, not when the ship passes
  // closest approach: there are six more days of harvesting after that, and
  // ending the season on the earlier date silently threw them away.
  return !!last && windowGone(last, s.day) && !s.sortie;
}

function arrive(s: State): void {
  if (s.phase !== "transit") return;
  const next = LEGS[s.leg + 1];
  if (!next || s.day < next.year * 365 - PREP_DAYS) return;
  s.leg++; s.phase = "prep"; s.phaseFrom = s.hour;
  // The roster chosen as the last crew went under comes round now.
  const r: Rng = { s: s.rngState };
  for (const role of s.nextCrew) {
    if (s.pool[role] <= 0 || s.colony.frozen <= 0) continue;
    s.pool[role]--;
    s.crew.push(makeDistinct(r, role, s.day, s.nextCrewId++, s.crew));
    s.colony.frozen--;
  }
  s.colony.awake = s.crew.length;
  s.rngState = r.s;
  const alive = s.colony.frozen + s.colony.awake;
  emit(s, "critical", "Voyage", "SEA-WAKE",
       `${next.name} ahead. Year ${Math.floor(s.day / 365)}, ${alive} of 200 alive. ` +
       `${s.crew.length} coming round.`);
}

/** Everything that happens on the hour: work gets done, surveys come back. */
function hourly(s: State): void {
  const p = s.settings;
  // ---- work ----
  // §3: crew are task queues. A job is a quantity of work with somebody's name
  // against it, and until somebody's name is on it, it does not move. That is
  // the opening phase of the game: nobody is awake, nothing is automated, and
  // every job is one you handed out.
  s.board.sort((x, y) => x.priority - y.priority || x.raised - y.raised);
  const hands = onDuty(s.crew, s.day);

  // Standing order, off at the start. Turning it on is the first thing
  // automation buys you — the crew stop waiting to be told.
  if (p.crewSelfAssign) {
    for (const person of hands) {
      if (person.task && s.board.some(t => t.id === person.task)) continue;
      const next = s.board.find(t => !t.assignee && canStart(s, t, s.craneUp !== false));
      if (!next) break;
      next.assignee = person.id; person.task = next.id;
    }
  }

  const done: Task[] = [];
  for (const task of s.board) {
    const person = task.assignee ? s.crew.find(c => c.id === task.assignee) : undefined;
    // Gone or frozen: the job goes back on the board. Merely still in the medbay:
    // the job is theirs and waits for them. Clearing it here silently unassigned
    // every job given to someone who had just been woken.
    if (task.assignee && !person) { task.assignee = undefined; continue; }
    if (!person || person.asleep) continue;
    if (s.day < person.fitOn) continue;
    if (!canStart(s, task, s.craneUp !== false)) continue;   // blocked, and getting older
    // An hour of somebody's time, worth what they are worth. A tired, unhappy,
    // ageing or injured person moves the bar more slowly, by name.
    task.done += effort(person) * (1 - p.botanistShare);
    if (task.done < task.work) continue;
    if (finish(s, task, p, person.name)) { done.push(task); person.task = undefined; }
    else { task.done = task.work; }             // held, waiting on materials
  }
  for (const t2 of done) s.board.splice(s.board.indexOf(t2), 1);

  // §6b: the array is not crew, so a survey needs nobody assigned — but it is
  // measured in the same hours as everything else, which is the point.
  for (let i = s.scans.length - 1; i >= 0; i--) {
    const scan = s.scans[i];
    scan.done++;
    if (scan.done < scan.work) continue;
    s.scans.splice(i, 1);
    const enc = s.schedule.find(e => e.id === scan.enc);
    if (!enc) continue;
    enc.scans++;
    const conf = confidence(enc, s.day / 365);
    emit(s, "info", "Bridge", "NAV-SCAN",
         `Survey complete. ${classReading(enc, conf)}, ${
           Math.round(trueMass(enc) * (1 + enc.bias * (1 - conf) * 0.4))} units, ` +
         `${Math.round(conf * 100)}% confidence.`);
  }
}

/** ─── §6b: the fleet ────────────────────────────────────────────────────────
 *
 *  Three small functions, and between them they are the season.
 *
 *  `openWindows` tells you a rock is reachable. `flyWave` flies the wave you
 *  sent. `closeWindows` books what you took and what you let go past. The
 *  player is the only thing that connects the first to the second. */

/** What one sortie costs in water, right now, at this object. */
export const sortieCost = (e: Encounter, day: number) =>
  PROPELLANT_PER_SORTIE * dvCost(e, day);

/** What a full wave would cost if it launched today and flew at today's rate.
 *
 *  An estimate, and deliberately the optimistic one: the Δv curve keeps falling
 *  until closest approach, so a wave launched before the minimum costs LESS than
 *  this. Quoting the pessimistic figure would have made waiting look worse than
 *  launching, which is backwards. */
export const waveCost = (s: State, e: Encounter) =>
  sortieCost(e, s.day) * sortiesFor(s.drones);

/** Why the fleet cannot go, in the words the player will see. Null means go. */
export function launchBlocked(s: State, e: Encounter): string | null {
  if (s.phase === "transit" || s.phase === "done") return "The ship is dark.";
  if (s.sortie && s.sortie.enc !== e.id) return "The fleet is already out.";
  if (e.flown >= sortiesFor(s.drones)) return "Picked clean.";
  if (s.day < windowOpens(e)) return `Out of range for ${Math.ceil(windowOpens(e) - s.day)} days.`;
  if (windowGone(e, s.day)) return "Gone. It is receding at cruise velocity.";
  if (s.drones <= 0) return "No drones left.";
  if (!hasAwake(s.crew, "pilot")) return "Nobody awake can fly them.";
  if (reactorOf(s).faulted) return "The reactor is down.";
  if (s.rooms[HOLD].ice < sortieCost(e, s.day))
    return "Not enough water in the bay for a single sortie.";
  return null;
}

/** A window opening is the ONLY prompt the player gets, and it is a warning
 *  rather than a note on purpose: a season has five of these in it and each one
 *  is a rock you will not be offered again. */
function openWindows(s: State): void {
  // The first day the AI is awake in this leg. An object whose window opened
  // before the ship came online still has to be announced, or the season's
  // first rock is one nobody was ever told about.
  const online = Math.round(LEGS[s.leg].year * 365 - PREP_DAYS);
  for (const e of s.schedule) {
    if (e.leg !== s.leg) continue;
    if (Math.max(Math.round(windowOpens(e)), online) !== s.day) continue;
    const conf = confidence(e, s.day / 365);
    emit(s, "warn", "Drone Bay", "HRV-OPEN",
         `${classReading(e, conf)} in range. ${WINDOW_LEAD + WINDOW_TAIL} days to work it, ` +
         `cheapest in ${WINDOW_LEAD}.`);
  }
}

/** One day of the wave in flight.
 *
 *  Each drone makes one round trip a day, and pays for it before it goes. The
 *  bill is water out of the Cargo Bay at today's point on the Δv curve — so a
 *  wave that launched early is still paying for that decision on day three,
 *  and one that launched at the minimum gets cheaper for a day and then dearer. */
function flyWave(s: State, r: Rng): void {
  const so = s.sortie;
  if (!so) return;
  const e = s.schedule.find(x => x.id === so.enc)!;

  const stop = (why: string, level: "info" | "warn" = "info") => {
    s.sortie = null;
    emit(s, level, "Drone Bay", "HRV-HOME",
         `Fleet home from the ${CLASS_NAME[e.cls]} object. ${so.flown} of ${so.want} sorties, ` +
         `${so.landed.toFixed(0)} units aboard for ${so.burned.toFixed(0)} water. ${why}`);
  };

  if (windowGone(e, s.day)) return stop("The window shut.", "warn");
  if (s.drones <= 0) return stop("The fleet is gone.", "warn");
  if (!hasAwake(s.crew, "pilot")) return stop("Nobody awake can fly them.", "warn");
  if (reactorOf(s).faulted) return stop("The reactor went down.", "warn");

  const dv = dvCost(e, s.day);
  const per = PROPELLANT_PER_SORTIE * dv;
  const bay = s.rooms[HOLD], cap = capOf(HOLD);

  for (let i = 0; i < s.drones && so.flown < so.want; i++) {
    // §4 BACKPRESSURE, and the reason the haul is the season.
    //
    // A drone will not burn water to bring a load to a shelf with no room on
    // it. Measured without this: the probe landed 2,193 units and spilled
    // 47,096 — the fleet spent 818 water flying cargo into a bay that had been
    // full since the third sortie. That is not a hard decision, it is a broken
    // one. The wave now HOLDS STATION until somebody carries material out of
    // the Cargo Bay, which makes the length of a wave a function of how fast
    // the crew can empty the bay, not of how big the rock is.
    const load = sortieYield(e).units;
    if (capOf(HOLD) - heldIn(bay) < load * 0.25) {
      if (!s.bayHeld) {
        s.bayHeld = true;
        emit(s, "warn", "Cargo Bay", "HRV-HOLD",
             `Fleet holding station — the bay is full. ${
               so.want - so.flown} sorties waiting on somebody to clear it.`);
      }
      return;
    }
    s.bayHeld = false;
    if (bay.ice < per) {
      emit(s, "warn", "Drone Bay", "PRP-SHORT",
           `Only ${so.flown} of ${so.want} sorties flown — the bay is out of water.`);
      return stop("Out of propellant.", "warn");
    }
    so.burned += withdraw(bay, "ice", per);
    s.counters.propellant += per;
    so.flown++; e.flown++;

    const h = sortieYield(e);
    // Value order, unchanged from the instantaneous version. The bay has a lid,
    // so something gets left in space — the crew keep the rare earths and the
    // ore before the water, and the fleet's own reserve goes ahead of both.
    const fuelFirst = Math.min(Math.max(0, h.ice),
                               Math.max(0, PROPELLANT_RESERVE - bay.ice));
    for (const [k, v] of [["ice", fuelFirst], ["rare", h.rare], ["ore", h.ore],
                          ["sil", h.sil], ["ice", Math.max(0, h.ice) - fuelFirst],
                          ["vol", h.vol]] as [MatKey, number][]) {
      const got = land(bay, k, v, cap);
      s.counters.overflow += got.lost;
      s.counters.declined += got.declined;
      so.spilled += got.lost;
      const kept = v - got.lost - got.declined;
      so.landed += kept; e.landed += kept;
    }
    // §6b's risk column. A sortie flown off the minimum is a sortie flown hard.
    if (chance(r, SORTIE_LOSS * dv)) {
      s.drones--; so.lost++;
      emit(s, "warn", "Drone Bay", "DRN-LOST", `Drone lost on sortie. Fleet at ${s.drones}.`);
      if (s.drones <= 0) return stop("The fleet is gone.", "warn");
    }
  }

  if (so.spilled > 1 && s.day % 3 === 0)
    emit(s, "warn", "Cargo Bay", "BAY-FULL",
         `Bay full. ${so.spilled.toFixed(0)} units of this haul left behind.`);
  if (so.flown >= so.want) stop("Picked clean.");
}

/** Book the objects whose windows have shut. */
function closeWindows(s: State): void {
  while (s.next < s.schedule.length && windowCloses(s.schedule[s.next]) <= s.day) {
    const e = s.schedule[s.next++];
    if (e.flown > 0) { s.counters.encountersTaken++; continue; }
    s.counters.encountersMissed++;
    if (e.leg === s.leg)
      emit(s, "warn", "Cargo Bay", "HRV-GONE",
           `${classReading(e, confidence(e, s.day / 365))} object passed unworked. ` +
           `The route does not offer it twice.`);
  }
}

/** One day of wear, power, industry and people. */
function daily(s: State): void {
  if (s.dead) return;

  // THE LONG DARK IS A SKIP, FOR NOW.
  //
  // With nobody awake and no automation there is nothing between a
  // seventy-year crossing and a dead ship: the reactor sags, the banks go cold,
  // and a hundred people die before the second cluster. The player cannot act on
  // any of it, which makes it a cutscene that kills you.
  //
  // So the ship goes properly dormant — throttled reactor, systems cold, cryo on
  // trickle. Nothing runs, so nothing wears. Fuel still burns, because the banks
  // still have to be kept cold and that is the one bill you cannot defer.
  //
  // This is a PLACEHOLDER for a mechanic that is not designed yet: what the ship
  // does with itself for sixty years is a real question, and answering it with
  // "an unattended ship dies" is not an answer, it is the absence of one.
  if (s.phase === "transit") {
    s.rods -= rodsPerDay(DORMANT_KW, s.assets.find(a => a.id === "reactor")!.cond);
    if (s.rods <= 0) {
      emit(s, "critical", "Reactor", "FUEL-OUT", "Fuel exhausted in the dark.", "reactor");
      s.dead = "out of fuel";
    }
    return;
  }
  const r: Rng = { s: s.rngState };
  const p = s.settings;
  const reactor = reactorOf(s);

  // ---- power ----
  // §6: Power Distribution sheds from the bottom up before anything dies. If it
  // is faulted the player loses shedding control entirely and brownouts hit
  // whatever they hit — which is why it sits second in the critical order.
  const output = reactorOutput(reactor);
  const pd = s.assets.find(a => a.id === "powerdist")!;
  const saved = p.shedEmptyRooms ? emptyRoomSaving(s.colony.awake) : 0;
  const b = pd.faulted ? bus(output * 0.85, s.colony.banks, saved)
                       : bus(output, s.colony.banks, saved);
  const wasBrown = s.brownout ?? false;
  if (b.shed) {
    s.counters.brownoutDays++;
    if (!wasBrown)
      emit(s, b.cascade ? "critical" : "warn", "Reactor", "PWR-LOW",
           `Output ${output.toFixed(0)} kW. ${b.cascade ? "Cascade brownout — everything degraded."
             : b.dimmed ? "Shed and dimmed." : "Non-essentials shed."}`, "reactor");
  } else if (wasBrown) {
    emit(s, "info", "Reactor", "PWR-OK", `Output restored to ${output.toFixed(0)} kW.`, "reactor");
  }
  s.brownout = b.shed;
  // Everything discretionary comes out of what the bus has left after shedding.
  const headroom = b.headroom;

  // §4: the Loading Crane is a 30 kW intermittent load, and it is UPSTREAM of
  // the shop — there is no point powering a smelter you cannot feed. So the
  // crane is served first, and when there is not even 30 kW spare the ore stays
  // in the Cargo Bay. That is §7's death spiral, and it needs no broken part.
  const crane = s.assets.find(a => a.id === "crane")!;
  const craneUp = !crane.faulted && headroom >= CRANE_KW;
  s.craneUp = craneUp;                     // the hourly work loop reads this
  const craneKw = craneUp ? CRANE_KW : 0;
  if (!craneUp) s.counters.craneBlockedDays++;

  // ---- industry demand: the shop only draws power when it has work ----
  const shop = s.rooms[SHOP];
  const raw = shop.ore + shop.rare + shop.sil;
  const wantsIndustry = raw > 1 || shop.refMetal > 4;
  const industryKw = wantsIndustry ? Math.min(Math.max(0, headroom - craneKw), 240) : 0;
  // Raw material aboard but not in the shop: the jam §4 is about. Every rule
  // fired correctly and the smelter is still idle.
  if (!wantsIndustry && (s.rooms[HOLD].ore + s.rooms[HOLD].sil + s.rooms[HOLD].rare) > 1)
    s.counters.starvedDays++;

  // ---- fuel ----
  const delivered = Math.min(output, b.load + industryKw + craneKw);
  s.rods -= rodsPerDay(delivered, reactor.cond);
  if (s.rods <= 0) {
    emit(s, "critical", "Reactor", "FUEL-OUT", "Fuel exhausted. The reactor is cold.", "reactor");
    s.dead = "out of fuel"; s.rngState = r.s; return;
  }

  // ---- wear ----
  for (const k of Object.keys(s.gauges)) s.gauges[k] = Math.max(0, s.gauges[k] - 0.0009);
  for (const a of s.assets) {
    // Instruments wear whether or not the machine does — about a third as fast.
    a.sensorCond = Math.max(0, a.sensorCond - a.baseWear * 0.35);
    if (a.faulted) continue;
    // §6: in a cascade brownout the fluctuation itself damages what is running.
    // "You get a window to scramble, and the window is costing you equipment."
    const env = (reactor.faulted ? 2 : 1) * (b.cascade ? 1.5 : 1);
    a.cond -= a.baseWear * ageFactor(a) * env;
    if (a.cond <= 0) {
      a.cond = 0; a.faulted = true; s.counters.faults++;
      emit(s, CRITICAL_ORDER[a.id] !== undefined ? "critical" : "warn", a.room, "EQ-FAULT",
           `${assetName(a.id)} has failed.`, a.id);
    }
    // §4 AT_RISK: the further below 30 it sits, the likelier it breaks outright
    else if (a.cond < 30 && chance(r, 0.0025 * (1 - a.cond / 30))) {
      a.faulted = true; s.counters.faults++;
      emit(s, CRITICAL_ORDER[a.id] !== undefined ? "critical" : "warn", a.room, "EQ-FAULT",
           `${assetName(a.id)} has failed.`, a.id);
    }
  }

  // ---- industry (power-gated) ----
  const industry = industryKw / 240;               // 0..1, how much of the shop can run
  refine(s.stores, 40 * industry, 12 * industry, 20 * industry, RARE_RESERVE, ELEC_TARGET);
  makeParts(s.stores, 6 * industry);

  // ---- automation: rules read the ship through its sensors and raise tasks ----
  const rank = (id: string) => (p.prioritise ? (CRITICAL_ORDER[id] ?? 9) : 0);
  const firesBefore = s.rules.reduce((n, x) => n + x.fires, 0);
  evaluate(s, s.rules, s.board, rank);
  s.counters.ruleFires += s.rules.reduce((n, x) => n + x.fires, 0) - firesBefore;

  // An asset no rule watches is found only by someone noticing it, and at the
  // speeds this game is played at nobody is looking. ~0.3%/day is a mean lag of
  // about 330 days — comparable to a whole service interval, so unwatched things
  // routinely break before anyone sees them. A rule notices the same day, every
  // time. This is the entire cost of not automating, and it is why §1's
  // no-automation ship dies.
  const watched = new Set(s.rules.filter(x => x.kind === "condition").map(x => x.watch));
  for (const a of s.assets) {
    if (watched.has(a.id)) continue;
    if (!(a.faulted || a.cond < NOTICE_AT)) continue;
    if (s.board.some(t => t.target === a.id)) continue;
    if (chance(r, NOTICE_CHANCE))
      s.board.push({ kind: "service", target: a.id, raised: s.day, priority: a.faulted ? -1 : rank(a.id) });
  }

  // how blind is the ship? sensors reading more than 20 points high
  if (s.assets.some(a => reportedCondition(a) - a.cond > 20)) s.counters.blindDays++;

  // ---- consignments in transit ----
  // A shipment costs a crew member once, when they pick it up. After that it is
  // simply somewhere on the ship, which is what makes a delivery marker worth
  // animating: it is a specific thing moving between two real places.
  for (let i = s.shipments.length - 1; i >= 0; i--) {
    const sh = s.shipments[i];
    if (s.day < sh.eta) continue;
    const spill = deposit(s.rooms[sh.to], sh.what, sh.qty, capOf(sh.to));
    if (spill > 0) deposit(s.rooms[sh.from], sh.what, spill, capOf(sh.from));
    s.shipments.splice(i, 1);
    s.counters.deliveries++;
    emit(s, "chatter", sh.to, "LOG-IN",
         `${sh.qty.toFixed(0)} ${sh.what} delivered from ${sh.from}.`);
  }

  s.counters.staleTasks += s.board.filter(t2 => s.day - t2.raised > 365).length > 0 ? 1 : 0;

  const yearsLeft = (DAYS - s.day) / 365;
  if (s.rods < yearsLeft * rodsPerDay(delivered, reactor.cond) * 365) s.counters.deficitDays++;

  // ---- encounters ----
  //
  // NOTHING HERE HARVESTS BY ITSELF ANY MORE.
  //
  // This block used to work every object the ship passed, which meant the five
  // rocks of a season were an income statement rather than five decisions — and
  // the survey button bought a better estimate of something you were going to
  // take anyway (packages/README, open thread 1). The fleet now goes where it is
  // sent, one object at a time, and a window that shuts on an object nobody sent
  // it to is a rock the route does not offer twice.
  openWindows(s);
  flyWave(s, r);
  closeWindows(s);

  const frozenBefore = s.colony.frozen, awakeBefore = s.colony.awake;
  // §3: the people, before the aggregate. A ship with no botanist awake grows
  // less food however many hands are aboard — the roster is a latency resource,
  // and this is where that bites.
  const perHead = s.board.length / Math.max(1, s.crew.length);
  for (const rq of tickCrew(s.crew, r, s.day, perHead, s.colony.fed, s.colony.air, b.dimmed)) {
    s.requests.push(rq);
    const who = s.crew.find(c => c.id === rq.from);
    emit(s, "warn", "Quarters", rq.kind === "cryo" ? "CRW-ASK-CRYO" : "CRW-ASK-REST",
         `${who?.name ?? "Someone"}: "${rq.text}"`);
    // A standing order, not a rule the engine runs: §3's rotation is a decision
    // the player either makes by hand or delegates once.
    if (p.autoRetire && rq.kind === "cryo") apply(s, { kind: "answer", request: rq.id, grant: true });
  }
  s.colony.awake = s.crew.filter(c => !c.asleep).length;
  const botany = crewLabour(s.crew, s.colony) * p.botanistShare / 0.6
               * (hasAwake(s.crew, "botanist") ? 1 : 0.55);
  tickColony(s, r, b, botany);
  if (s.colony.frozen < frozenBefore)
    emit(s, "critical", "Colony", "CRY-LOST",
         `Cryo bank lost. ${frozenBefore - s.colony.frozen} colonists dead.`);
  if (s.colony.awake < awakeBefore)
    emit(s, "critical", "Quarters", "CRW-LOST", `Crew member died.`);

  s.rngState = r.s;
}

export function run(seed: number, p: Policy, actII = 40): State {
  const s = init(seed, actII, p);
  let lastDay = -1;
  while (!s.dead) {
    // THE AUTOPILOT HAS TO SEND THE FLEET NOW.
    //
    // `step()` stopped harvesting by itself, so without this every automated
    // run works zero objects — validate.ts went from 5 encounters to 0 the
    // moment the mechanic landed. This is a CLIENT decision sitting in the
    // simulation's own driver, for the same reason the calibration below is:
    // run() is the balance harness's loop, not the game's. It takes anything in
    // range the moment it appears, which is the crudest possible player and
    // exactly right for a determinism and crash check. The probes that measure
    // the DECISION live in packages/harness/pilot.ts.
    if (s.day !== lastDay) {
      lastDay = s.day;
      if (!s.sortie) {
        const e = s.schedule.find(x => x.leg === s.leg && inWindow(x, s.day)
                                       && x.flown < sortiesFor(s.drones)
                                       && !launchBlocked(s, x));
        if (e) apply(s, { kind: "launch", enc: e.id });
        // Nothing carries material out of the bay in an autopilot run either,
        // so the wave would hold station on a full shelf for three hundred
        // years. The rules the policy installs do the hauling; this only has to
        // not deadlock when they cannot.
      }
    }
    // The autopilot's one standing habit the rule engine cannot express:
    // §5 gauges have no machine to be opened alongside, so calibration is a
    // deliberate act. A human client issues apply(s, {kind:"calibrate"}).
    // Once a year, not once an hour on every 365th day — the tick is finer now.
    if (p.maintainSensors && s.hour % (365 * 24) === 0)
      for (const k of Object.keys(s.gauges)) s.gauges[k] = 100;
    step(s);
  }
  return s;
}
