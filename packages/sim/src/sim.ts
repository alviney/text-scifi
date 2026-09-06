import { type Rng, rng, chance } from "./rng.ts";
import type { Asset, Policy, Settings, State } from "./types.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import { buildAssets, assetName, newBed, BED_PARTS, MAX_BEDS,
         RARE_COST, PART_COST, ELEC_COST } from "./catalogue.ts";
import { buildSchedule, harvest, classReading, confidence, trueMass } from "./encounters.ts";
import { emptyStores, refine, makeParts, canMakeRod, makeRod, canMakeDrone, makeDrone,
         RARE_RESERVE, ELEC_TARGET } from "./economy.ts";
import { CRANE_KW, HOLD, SHOP, capOf, daysOf, deposit, isBulk, land, loadOf, newRooms,
         withdraw, type MatKey } from "./logistics.ts";
import { BASELINE_KW, bus, emptyRoomSaving, reactorOutput, rodsPerDay } from "./power.ts";
import { type Task, inheritedRules, playerRules, evaluate, reportedCondition } from "./rules.ts";
import { newColony, tickColony, crewLabour } from "./colony.ts";
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
    schedule: buildSchedule(r), next: 0, scans: [], hour: 0,
    leg: 0, phase: "prep", phaseFrom: 0, nextCrew: [...FIRST_CREW],
    gauges: { parts: 100, rods: 100, rareCmp: 100, drones: 100 }, colony: newColony(),
    crew: [], requests: [], memorial: [], pool: { ...POOL }, nextCrewId: 0, nextTaskId: 0,
    rules: [], board: [], signals: [], acked: 0, settings: { ...DEFAULT_SETTINGS },
    counters: { ruleFires: 0, staleTasks: 0, blindDays: 0, services: 0, replacements: 0,
                faults: 0, encountersTaken: 0, encountersMissed: 0, rodsMade: 0,
                deficitDays: 0, brownoutDays: 0,
                deliveries: 0, overflow: 0, starvedDays: 0, craneBlockedDays: 0 },
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
    s.settings = { replaceAt: p.replaceAt, droneTarget: p.droneTarget,
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

function service(s: State, a: Asset) {
  const recovered = a.maxCond - a.cond;
  const loss = REFURB_OVERHEAD + REFURB_RATE * recovered + (a.faulted ? FAULT_REBUILD_PENALTY : 0);
  const wasFaulted = a.faulted;
  a.cond = a.maxCond;
  a.maxCond = Math.max(MAXCOND_FLOOR, a.maxCond - loss);
  a.faulted = false;
  a.repairs++;
  s.counters.services++;
  if (wasFaulted)
    emit(s, "info", a.room, "EQ-REBUILT", `${assetName(a.id)} rebuilt and back on line.`, a.id);
  else
    emit(s, "chatter", a.room, "EQ-SVC", `${assetName(a.id)} serviced.`, a.id);
}

function replace(s: State, a: Asset): boolean {
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
  emit(s, "info", a.room, "EQ-NEW", `${assetName(a.id)} replaced. Ceiling back to 100.`, a.id);
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
function finish(s: State, task: Task, p: Settings): boolean {
  if (task.kind === "buildBed") {
    const shop = s.rooms[SHOP], hyd = s.rooms["Hydroponics"];
    const from = hyd.parts >= BED_PARTS ? hyd : shop;
    if (from.parts < BED_PARTS) return false;
    from.parts -= BED_PARTS;
    const n = s.assets.filter(a => a.id.startsWith("bed")).length + 1;
    if (n > MAX_BEDS) return true;
    s.assets.push(newBed(n));
    emit(s, "info", "Hydroponics", "HYD-BED",
         `Grow bed ${n} planted. ${n} of ${MAX_BEDS} racks running.`);
    return true;
  }
  if (task.kind === "makeRod") {
    if (!canMakeRod(s.stores)) return false;
    makeRod(s.stores); s.rods++; s.counters.rodsMade++;
    emit(s, "chatter", "Engineering", "FAB-ROD", "Fuel rod fabricated.");
    return true;
  }
  if (task.kind === "makeDrone") {
    if (s.drones >= p.droneTarget) return true;
    if (!canMakeDrone(s.stores)) return false;
    makeDrone(s.stores); s.drones++;
    emit(s, "chatter", "Drone Bay", "FAB-DRN", `Drone built. Fleet at ${s.drones}.`);
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
  if (a.maxCond < p.replaceAt && replace(s, a)) return true;
  // No parts yet. Keep patching it anyway: the ceiling is already written off,
  // so there is nothing left to protect, and a high-wear asset in free-fall
  // reaches zero long before the replacement arrives. Abandoning the reactor for
  // one year at ageFactor 1.9 cost 182 colonists.
  service(s, a);
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
  return !!last && s.day / 365 > last.year;
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
    if (finish(s, task, p)) { done.push(task); person.task = undefined; }
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
  const year = s.day / 365;
  while (s.next < s.schedule.length && s.schedule[s.next].year <= year) {
    const enc = s.schedule[s.next++];
    // §3: "No pilots, no rare compounds, no ship." Drones do not fly themselves.
    if (s.drones > 0 && !reactor.faulted && hasAwake(s.crew, "pilot")) {
      const h = harvest(enc, s.drones);
      const bay = s.rooms[HOLD], cap = capOf(HOLD);
      let spilled = 0;
      // Value order, deliberately. The bay has a lid, so something gets left in
      // space — and the crew keep the rare earths and the ore before the water.
      // Depositing in an arbitrary order let ice fill the bay and leave the ore
      // behind, which is a modelling artifact rather than a decision anyone made.
      for (const [k, v] of [["rare", h.rare], ["ore", h.ore], ["sil", h.sil],
                            ["ice", Math.max(0, h.ice)], ["vol", h.vol]] as [MatKey, number][])
        spilled += land(bay, k, v, cap).lost;
      s.counters.overflow += spilled;
      s.counters.encountersTaken++;
      emit(s, "info", "Cargo Bay", "HRV-OK",
           `${enc.cls}-type worked. ${(h.ore + h.rare + h.sil).toFixed(0)} units aboard.`);
      // §4: an output buffer that is full stalls the thing feeding it. Here that
      // is the whole encounter — material left in space because the bay is full.
      if (spilled > 1)
        emit(s, "warn", "Cargo Bay", "BAY-FULL",
             `Bay full. ${spilled.toFixed(0)} units left behind.`);
      if (chance(r, 0.06 * s.drones)) {
        s.drones--;
        emit(s, "warn", "Drone Bay", "DRN-LOST", `Drone lost on sortie. Fleet at ${s.drones}.`);
      }
    } else {
      s.counters.encountersMissed++;
      emit(s, "warn", "Cargo Bay", "HRV-MISS",
           `${enc.cls}-type passed unworked — ${
             s.drones <= 0 ? "no drones" :
             !hasAwake(s.crew, "pilot") ? "nobody awake can fly them" : "no power"}.`);
    }
  }

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
  while (!s.dead) {
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
