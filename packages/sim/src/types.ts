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
};

export type Stores = {
  ore: number; ice: number; sil: number; vol: number; rare: number;
  refMetal: number; rareCmp: number; parts: number; electronics: number;
};

export type Encounter = { year: number; cls: string; richness: number };

export type Counters = {
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
  counters: Counters;
  dead: string | null;   // reason, if the run ended early
};

/** How the player plays. Stands in for the rule engine in this pass. */
export type Policy = {
  name: string;
  /** service an asset once condition falls below this */
  serviceAt: number;
  /** replace an asset once its ceiling falls below this */
  replaceAt: number;
  /** drone fleet the player tries to maintain */
  droneTarget: number;
  /** maintenance jobs the crew can complete per day */
  labourPerDay: number;
  /** does the player look after the systems everything else depends on first? */
  prioritise: boolean;
};
