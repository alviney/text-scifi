import type { Asset } from "./types.ts";

export const NOMINAL_KW = 1000;
export const BASELINE_KW = 890;   // §6 continuous load

/** §4: full output above 60% condition, then falls away to a floor. */
export function conditionFactor(cond: number): number {
  return cond >= 60 ? 1 : 0.4 + 0.6 * (cond / 60);
}

export function reactorOutput(reactor: Asset): number {
  if (reactor.faulted) return 0;
  return NOMINAL_KW * conditionFactor(reactor.cond);
}

/** §6: a worn reactor is weaker AND thirstier. */
export function efficiency(cond: number): number {
  return 0.65 + 0.35 * (cond / 100);
}

/** Rod-years consumed per day at a given delivered load. */
export function rodsPerDay(deliveredKw: number, reactorCond: number): number {
  return (deliveredKw / NOMINAL_KW) / efficiency(reactorCond) / 365;
}
