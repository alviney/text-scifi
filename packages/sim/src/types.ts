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

export type Encounter = { year: number; cls: string; richness: number };

export type Counters = {
  ruleFires: number; staleTasks: number; blindDays: number;
  services: number; replacements: number; faults: number;
  encountersTaken: number; encountersMissed: number;
  rodsMade: number; deficitDays: number; brownoutDays: number;
  /** §4 logistics: hauls run, material lost to a full bay, days the shop sat
   *  idle with raw material aboard but in the wrong room. */
  deliveries: number; overflow: number; starvedDays: number; craneBlockedDays: number;
};

export type State = {
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
  rules: import("./rules.ts").Rule[];
  board: import("./rules.ts").Task[];
  /** §8's feed. A bounded window, not a ledger — totals live in counters. */
  signals: import("./signals.ts").Signal[];
  /** day of the last acknowledgement — §2's snap-back releases on this */
  acked: number;
  /** was the ship short of power yesterday? edge detection for the feed */
  brownout?: boolean;
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
};

export const DEFAULT_SETTINGS: Settings = {
  replaceAt: 62, droneTarget: 6, botanistShare: 0.25, prioritise: true,
  shedEmptyRooms: true,
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
