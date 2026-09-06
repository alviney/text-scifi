/** §8's feed, and §11 Q8's severity floor. The sim emits signals; the client
 *  decides which ones survive at the current speed. Nothing here knows about
 *  the DOM — a signal is a record, not a string on a screen. */

export type Level = "chatter" | "info" | "warn" | "critical";

export type Signal = {
  day: number;
  level: Level;
  /** facility code, the [FAC] in [LVL][FAC][CODE] */
  fac: string;
  /** what happened, the [CODE] */
  code: string;
  text: string;
  /** asset id, so tapping a feed line can drill straight in */
  target?: string;
  /** §3: who did it, when a person did.
   *
   *  "Okonkwo took the hull repair" is a story; "the hull repair completed" is a
   *  log line — the crew module opens on exactly that claim, and the feed had
   *  been emitting the log line. Most signals have no author (a reactor sagging
   *  is nobody's doing) and leave this unset; the ones that came out of somebody
   *  finishing a job now carry their name. */
  by?: string;
};

/** Room -> the three-letter code the feed prints. design/README: the marker is
 *  fixed-width so the eye can scan the left edge without reading the message. */
export const FAC: Record<string, string> = {
  "Bridge": "BRG", "Engineering": "ENG", "Reactor": "RCT", "Life Support": "LSP",
  "Hydroponics": "HYD", "Medbay": "MED", "Quarters": "QTR", "Cargo Bay": "CRG",
  "Drone Bay": "DRN", "Maintenance": "MNT", "node": "LSP",
  "Voyage": "NAV", "Stores": "STO", "Colony": "CRY",
};

export const LEVEL_MARK: Record<Level, string> = {
  chatter: "··", info: "  ", warn: "!·", critical: "!!",
};

/** How many signals the state carries. The save is the state (ARCHITECTURE §2),
 *  so this is bounded — the feed is a window, not a ledger. Totals live in
 *  counters, which is what the balance suite reads. */
export const FEED_CAP = 240;

export function emit(s: { day: number; signals: Signal[] }, level: Level,
                     fac: string, code: string, text: string, target?: string,
                     by?: string) {
  s.signals.push({ day: s.day, level, fac: FAC[fac] ?? fac, code, text, target, by });
  if (s.signals.length > FEED_CAP) s.signals.splice(0, s.signals.length - FEED_CAP);
}

/** The printed marker, for any client that wants §8's exact format. */
export const marker = (sig: Signal) => `[${LEVEL_MARK[sig.level]}][${sig.fac}][${sig.code}]`;
