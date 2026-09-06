/** ARCHITECTURE §2: "State is plain data — serialisation IS the save format."
 *
 *  So this is thin on purpose. It lives in the client, not the core, because the
 *  core is not allowed to know about localStorage (§5's table: no web APIs in
 *  sim/, or a second client has to unpick them).
 *
 *  One wrinkle: `state.stores` and `state.rooms.Engineering` are the same object
 *  in memory. JSON round-tripping splits them into two, so the link is remade on
 *  load — otherwise the shop would refine into a shelf nobody reads. */
import type { State } from "../../../sim/src/types.ts";
import { SHOP } from "../../../sim/src/logistics.ts";

const KEY = "seedship.save.v1";
export const SAVE_VERSION = 1;

export type Save = { v: number; at: number; state: State };

export function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: SAVE_VERSION, at: Date.now(), state: s }));
    return true;
  } catch { return false; }
}

export function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Save;
    if (parsed.v !== SAVE_VERSION) return null;      // no migrations yet, by design
    const s = parsed.state;
    s.stores = s.rooms[SHOP];                        // re-link the aliased shelf
    return s;
  } catch { return null; }
}

export function peek(): { day: number; alive: number; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Save;
    if (p.v !== SAVE_VERSION) return null;
    return { day: p.state.day, alive: p.state.colony.frozen + p.state.colony.awake, at: p.at };
  } catch { return null; }
}

export function clear() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }
