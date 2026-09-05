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
import { init, step, DAYS } from "../../../sim/src/sim.ts";
import { apply, unacked, type Command } from "../../../sim/src/commands.ts";
import type { State } from "../../../sim/src/types.ts";

/** Game-days per real second. §2 caps play at one game-year per real minute,
 *  which is 6 days/s — the ladder above that is a prototype affordance for
 *  watching 300 years go by, and is labelled as such in the UI. */
export const SPEEDS = [
  { label: "❚❚", days: 0,    note: "paused",                                  floor: 0 },
  { label: "1×", days: 1,    note: "a day a second",                          floor: 0 },
  { label: "2×", days: 2,    note: "two days a second",                       floor: 1 },
  { label: "6×", days: 6,    note: "a year a minute — §2's cap",              floor: 1 },
  { label: "FF", days: 120,  note: "beyond the design cap: prototype only",   floor: 2 },
  { label: "▶▶", days: 1200, note: "beyond the design cap: prototype only",   floor: 3 },
];

/** §11 Q8's severity floor. The feed is the player's ambient awareness, but at
 *  speed the ship generates lines faster than anyone can read — it becomes
 *  unreadable exactly when it is being relied on. So the speed raises the floor:
 *  chatter is what you read at 1x and never see at full tilt, which makes
 *  slowing down feel DIFFERENT rather than just slower, and means the strip's
 *  content tells the player what speed they are at without showing a number. */
export const LEVELS = ["chatter", "info", "warn", "critical"] as const;
export const rank = (l: string) => LEVELS.indexOf(l as typeof LEVELS[number]);

/** How often the UI is told anything changed. 12/s is well under 60fps, and
 *  above the rate at which anyone reads a changing number. */
const PUBLISH_HZ = 12;
/** Never block the main thread: at most this many sim days per animation frame. */
const MAX_STEPS_PER_FRAME = 4000;

type Sub = (s: State) => void;

export class Engine {
  state: State;
  speedIx = 1;
  /** set when a critical signal lands unacknowledged — §2's snap-back */
  snapped = false;
  private subs: Sub[] = [];
  private carry = 0;
  private lastT = 0;
  private lastPublish = 0;
  private raf = 0;

  constructor(seed = 1) {
    this.state = init(seed);
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

  get speed() { return SPEEDS[this.speedIx]; }

  setSpeed(ix: number) {
    this.speedIx = Math.max(0, Math.min(SPEEDS.length - 1, ix));
    this.publish();
  }

  send(c: Command) {
    apply(this.state, c);
    if (c.kind === "ack") this.snapped = false;
    this.publish();
  }

  start() {
    if (this.raf) return;
    this.lastT = performance.now();
    const frame = (t: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.25, (t - this.lastT) / 1000);   // clamp: tab was hidden
      this.lastT = t;

      if (!this.state.dead && this.speed.days > 0) {
        this.carry += dt * this.speed.days;
        let n = Math.min(Math.floor(this.carry), MAX_STEPS_PER_FRAME);
        this.carry -= n;
        while (n-- > 0 && !this.state.dead) {
          step(this.state);
          // §2 snap-back: a critical signal drops the speed and pins the ticker.
          // Checked per step, not per frame, or a fast-forward would run past it.
          if (!this.snapped && unacked(this.state).length) {
            this.snapped = true;
            this.speedIx = Math.min(this.speedIx, 1);
            this.carry = 0;
            break;
          }
        }
      }

      if (t - this.lastPublish > 1000 / PUBLISH_HZ) {
        this.lastPublish = t;
        this.publish();
      }
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
}
