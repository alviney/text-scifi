/** The clock. ARCHITECTURE §2: the core knows only ticks; the client owns real
 *  time. So everything about wall-clock, requestAnimationFrame and speed lives
 *  here and nothing in sim/ imports it.
 *
 *  ARCHITECTURE §4's render rule is the reason this is not just a setInterval:
 *  the simulation may tick hundreds of times a second while the UI repaints 60
 *  times a second, and structure must re-render only when its data changes.
 *  So the loop steps the sim as fast as the speed demands, and PUBLISHES a
 *  snapshot at a fixed, much slower rate. Continuous motion (the starfield, bar
 *  interpolation) reads `progress()` every frame and never touches the store. */
import { init, step, tickShort, DAYS } from "../../../sim/src/sim.ts";
import { apply, unacked, type Command } from "../../../sim/src/commands.ts";
import type { State } from "../../../sim/src/types.ts";

/** One game-day every 24 real seconds, so **one real second is one game hour**.
 *
 *  There is no speed control. §2 argues for a ladder up to a game-year a minute
 *  and §11 Q8 builds a severity floor on top of it, but none of that can be
 *  tuned from a spreadsheet — it has to be felt, and it cannot be felt while the
 *  ship is being fast-forwarded past. So the prototype runs at one honest rate
 *  until playing it says what the ladder should be.
 *
 *  A consequence worth knowing: a full 300-year voyage at this rate is about a
 *  month of wall-clock time. That is fine — the point is what an hour feels
 *  like, not reaching the destination. */
export const SECONDS_PER_GAME_DAY = 24;
export const DAYS_PER_SECOND = 1 / SECONDS_PER_GAME_DAY;

/** How often the UI is told anything changed. 12/s is well under 60fps, and
 *  above the rate at which anyone reads a changing number. */
const PUBLISH_HZ = 12;
/** Never block the main thread: at most this many sim days per animation frame. */
const MAX_STEPS_PER_FRAME = 4000;

type Sub = (s: State) => void;

export class Engine {
  state: State;
  /** set when a critical signal lands unacknowledged — §2's snap-back.
   *  With one fixed rate there is no speed to drop, so this is now purely the
   *  visible half: the ticker pins the alert until it is acknowledged. */
  snapped = false;
  private subs: Sub[] = [];
  private carry = 0;
  private lastT = 0;
  private lastPublish = 0;
  private raf = 0;

  constructor(seed = 1, opts?: { from?: State }) {
    this.state = opts?.from ?? init(seed);
  }

  subscribe(fn: Sub) {
    this.subs.push(fn);
    fn(this.state);
    return () => { this.subs = this.subs.filter(x => x !== fn); };
  }

  private publish() { for (const fn of this.subs) fn(this.state); }

  /** 0..1 through the voyage, interpolated inside the current day so a bar can
   *  move smoothly at 1× instead of stepping once a second. */
  progress() { return Math.min(1, (this.state.day + this.carry) / DAYS); }

  /** Development only, and not reachable from the interface: run the simulation
   *  forward without waiting for the wall clock. Screenshots and balance checks
   *  need a year-200 ship; a player does not. */
  fastForward(days: number) {
    for (let i = 0; i < days && !this.state.dead; i++) {
      step(this.state);
      tickShort(this.state, this.state.day);
    }
    this.publish();
  }

  send(c: Command) {
    apply(this.state, c);
    if (c.kind === "ack") this.snapped = false;
    this.publish();
  }

  /** Real time is the client's business, so autosave is too. */
  onSave?: (s: State) => void;
  private lastSave = 0;

  start() {
    if (this.raf) return;
    this.lastT = performance.now();
    const frame = (t: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.25, (t - this.lastT) / 1000);   // clamp: tab was hidden
      this.lastT = t;

      if (!this.state.dead) {
        this.carry += dt * DAYS_PER_SECOND;
        // Anything shorter than a day resolves against the interpolated clock —
        // a one-hour survey should not wait for the day to turn over.
        tickShort(this.state, this.state.day + this.carry);
        let n = Math.min(Math.floor(this.carry), MAX_STEPS_PER_FRAME);
        this.carry -= n;
        while (n-- > 0 && !this.state.dead) {
          step(this.state);
          // §2 snap-back: a critical signal pins the ticker until acknowledged.
          if (!this.snapped && unacked(this.state).length) this.snapped = true;
        }
      }

      if (t - this.lastPublish > 1000 / PUBLISH_HZ) {
        this.lastPublish = t;
        this.publish();
      }
      if (this.onSave && t - this.lastSave > 15000) {
        this.lastSave = t;
        this.onSave(this.state);
      }
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
}
