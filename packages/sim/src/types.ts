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
};

export type State = {
  day: number;
  rngState: number;
  assets: Asset[];
  rods: number;
  drones: number;
  stores: Stores;
  schedule: Encounter[];
  next: number;          // index into schedule
  /** §5: gauges on the stores. They wear, and a worn one reads high. */
  gauges: Record<string, number>;
  colony: import("./colony.ts").Colony;
  rules: import("./rules.ts").Rule[];
  board: import("./rules.ts").Task[];
  counters: Counters;
  dead: string | null;   // reason, if the run ended early
};

/** How the player plays. Stands in for the rule engine in this pass. */
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
