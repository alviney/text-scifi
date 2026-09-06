export type Complexity = "low" | "med" | "high";

export type Asset = {
  id: string;
  room: string;
  cls: Complexity;
  /** condition points lost per day at full duty, before modifiers */
  baseWear: number;
  cond: number;      // 0-100
  maxCond: number;   // the ceiling repairs restore to; erodes with every repair
  faulted: boolean;
  repairs: number;
  /** §5: the instrument reporting this asset. It wears too, and a worn one lies. */
  sensorCond: number;
};

export type Stores = {
  ore: number; ice: number; sil: number; vol: number; rare: number;
  refMetal: number; rareCmp: number; parts: number; electronics: number;
};

export type Encounter = {
  id: number;
  year: number;
  /** which harvest season it belongs to */
  leg: number;
  cls: string;
  /** the act's yield multiplier */
  richness: number;
  /** this object's own size, averaging 1.0 within its act */
  size: number;
  /** which way this object's estimate is wrong, fixed so surveys converge */
  bias: number;
  /** how many times the player has paid to look harder */
  scans: number;
};

export type Counters = {
  ruleFires: number; staleTasks: number; blindDays: number;
  services: number; replacements: number; faults: number;
  encountersTaken: number; encountersMissed: number;
  rodsMade: number; deficitDays: number; brownoutDays: number;
  /** §4 logistics: hauls run, material lost to a full bay, days the shop sat
   *  idle with raw material aboard but in the wrong room. */
  deliveries: number; overflow: number; starvedDays: number; craneBlockedDays: number;
  /** §6b water: what Life Support drew, what the fleet burned as propellant,
   *  and what the crew left in space because the bay would not take it. */
  waterUsed: number; propellant: number; declined: number;
  /** volatiles drawn as fertiliser and as medical supplies */
  volUsed: number;
};

export type State = {
  /** Total elapsed game-hours. THIS is the clock — `day` is derived from it and
   *  kept alongside because day-scale things read more clearly in days. */
  hour: number;
  day: number;
  rngState: number;
  assets: Asset[];
  rods: number;
  drones: number;
  /** §4: there is no ship-wide inventory. `stores` is the SHOP's shelf, kept as
   *  a name because production reads it; everything else lives per room. */
  stores: Stores;
  rooms: Record<string, Stores>;
  shipments: import("./logistics.ts").Shipment[];
  schedule: Encounter[];
  next: number;          // index into schedule
  /** §5: gauges on the stores. They wear, and a worn one reads high. */
  gauges: Record<string, number>;
  colony: import("./colony.ts").Colony;
  /** §3: the awake roster, as people. The colony above stays aggregate. */
  crew: import("./crew.ts").Person[];
  /** §5b: the board runs both ways — these come UP from the crew. */
  requests: import("./crew.ts").Request[];
  /** §3: the dead, by name. The ending should be able to count them. */
  memorial: import("./crew.ts").Memorial[];
  /** §3: how many of each speciality are left in cryo. Run one dry and that
   *  capability is gone for the rest of the voyage. */
  pool: Record<import("./crew.ts").Role, number>;
  /** Monotonic. Deriving person ids from crew.length collided the moment anyone
   *  was frozen — the roster shrank and the next wake reused a live id. */
  nextCrewId: number;
  nextTaskId: number;
  /** Surveys in progress. Measured in fractional days because a scan is an
   *  hour and the simulation steps in days — see tickShort(). */
  scans: { enc: number; work: number; done: number }[];
  /** cached each day so the hourly work loop knows whether the crane can run */
  craneUp?: boolean;
  /** Which of the five legs, and where in it. See legs.ts. */
  leg: number;
  phase: import("./legs.ts").Phase;
  /** hour the current phase began, for the transit progress readout */
  phaseFrom: number;
  /** Who the player rostered for the next cluster, chosen as they go dark. */
  nextCrew: import("./crew.ts").Role[];
  rules: import("./rules.ts").Rule[];
  board: import("./rules.ts").Task[];
  /** §8's feed. A bounded window, not a ledger — totals live in counters. */
  signals: import("./signals.ts").Signal[];
  /** day of the last acknowledgement — §2's snap-back releases on this */
  acked: number;
  /** was the ship short of power yesterday? edge detection for the feed */
  brownout?: boolean;
  /** §6b: was Life Support short of water yesterday, and had it already been
   *  warned about? Edge detection, so the feed says it once rather than daily. */
  dry?: boolean;
  waterLow?: boolean;
  /** §6b: were the beds short of fertiliser yesterday? Same edge trick. */
  lean?: boolean;
  /** Standing orders the player sets. Part of the state because they are part
   *  of the save, and because a second client must not have to be taught them. */
  settings: Settings;
  counters: Counters;
  dead: string | null;   // reason, if the run ended early
};

/** What the player leaves standing between decisions. Everything here is set by
 *  a command and read by step() — no client-side knob reaches into the sim. */
export type Settings = {
  /** replace an asset once its ceiling ("best after repair") falls below this */
  replaceAt: number;
  /** how many drones the crew keep flying */
  droneTarget: number;
  /** share of crew effort on hydroponics rather than repairs */
  botanistShare: number;
  /** work the systems everything depends on first? */
  prioritise: boolean;
  /** §6 lever 2: stop holding atmosphere in rooms nobody is in. ~56 kW. */
  shedEmptyRooms: boolean;
  /** §3: put people back under when they ask, without waiting to be told.
   *  Off, and the roster ages out while you are looking at something else. */
  autoRetire: boolean;
  /** Do the crew take work off the board themselves, or do you hand out every
   *  job? Off at the start: the opening phase is meant to be manual, and
   *  turning this on is the first thing automation buys you. */
  crewSelfAssign: boolean;
  /** Wake a replacement whenever the roster is short. Off for a player — §3
   *  makes that a decision — and on for the balance harness, which is measuring
   *  a fully-staffed, fully-automated ship. */
  autoWake: boolean;
  /** 1 = full rations, 0.75 = short, 0.5 = half. Buys days, costs morale. */
  rations: number;
};

export const DEFAULT_SETTINGS: Settings = {
  replaceAt: 62, droneTarget: 6, botanistShare: 0.25, prioritise: true,
  shedEmptyRooms: true, autoRetire: true, crewSelfAssign: false, autoWake: false,
  rations: 1,
};

/** An autopilot: a scripted player, used by the balance harness.
 *
 *  This used to be an argument to step(), which meant the simulation made every
 *  decision the player should be making — fine for measuring balance, useless as
 *  a game, because there was nothing left to click. step() now reads Settings
 *  and Rules out of the state, and this drives those through apply() like any
 *  other client would. The harness is now a client, not a special case. */
export type Policy = {
  name: string;
  /** service an asset once condition falls below this */
  serviceAt: number;
  /** Optional separate threshold for the systems everything depends on.
   *  Experiment knob only: sweeping it found no benefit over a single
   *  ship-wide threshold, so the game should not expose per-asset values. */
  criticalServiceAt?: number;
  /** replace an asset once its ceiling falls below this */
  replaceAt: number;
  /** drone fleet the player tries to maintain */
  droneTarget: number;
  /** share of crew effort spent on hydroponics rather than repairs */
  botanistShare: number;
  /** does the player look after the systems everything else depends on first? */
  prioritise: boolean;
  /** does the player write maintenance rules, or notice things by hand? */
  automate: boolean;
  /** does the player service the instruments as well as the machines? */
  maintainSensors: boolean;
};
