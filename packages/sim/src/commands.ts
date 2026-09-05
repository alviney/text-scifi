/** Everything the player can do, as data.
 *
 *  ARCHITECTURE §2 promises `apply(state, command) -> state`. This is it. The
 *  point is not ceremony: a command is serialisable, so a save plus a command
 *  log reproduces any bug exactly (§2's determinism rule), and a second client
 *  only has to build these objects — it never reaches into the model. */
import type { Rule } from "./rules.ts";
import type { Settings, State } from "./types.ts";
import { emit } from "./signals.ts";

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
  | { kind: "ack" };

export function apply(s: State, c: Command): State {
  switch (c.kind) {
    case "raise": {
      if (s.board.some(t => t.target === c.target && t.kind === c.action)) break;
      s.board.push({ kind: c.action, target: c.target, raised: s.day, priority: 0 });
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
  }
  return s;
}

/** Signals the player has not seen yet — what §2's snap-back holds on. */
export const unacked = (s: State) =>
  s.signals.filter(x => x.level === "critical" && x.day > s.acked);
