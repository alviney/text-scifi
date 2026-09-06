# Seedship

A text-driven, CLI-aesthetic ship-management game. You are the AI managing a 300-year
interstellar colony voyage: 200 sleepers, a small waking crew, and a ship that wears out.

**This file loads into every session. Keep it short and point at the real docs.**

## Where the knowledge lives

| Doc | What it is |
|---|---|
| `plan.md` | The design. Sections are cited everywhere as §1, §4, §6b etc. Entries titled **"Built"** record what was actually implemented and what the numbers did. |
| `ARCHITECTURE.md` | The non-negotiables. Read §2 before touching the core. |
| `packages/README.md` | Findings log. Every measured result, every bug worth remembering, in the order they were found. |
| `design/README.md` | Interface decisions and the vocabulary layer. |

If a decision seems arbitrary, it is probably recorded in one of these with the
measurement behind it. Look before re-deciding.

## Working agreements

- **Develop and push on `claude/design-planning-b5hvd1`.** Never another branch without asking.
- **No pull request unless explicitly asked.**
- When mocking up interface ideas, **do not change the simulation** unless asked to.
- The user plays and reacts rather than specifying up front. Build the smallest real
  thing, measure it, show it, and say what you found.
- Findings get written down. A number nobody recorded gets re-derived later.

## Shape of the code

```
packages/sim/     the simulation. Zero dependencies, zero I/O, no clock, no DOM.
packages/web/     Svelte 5 + Vite client. Builds to ONE self-contained HTML file.
packages/harness/ probes that measure the game.
design/           interface studies, published as artifacts.
```

**The core knows nothing about the UI.** Nothing in `packages/sim` imports from the client,
and the client never reaches into the model — every change goes through
`apply(state, command)`. The balance harness and the client are both just callers.

**`step(s)` is one game-HOUR.** Not a day. Anything in a probe that means "once a day" must
latch on the day changing or it fires 24 times. This has bitten twice.

**State is plain data and serialisation is the save format.** Seeded RNG throughout; a save
plus a command log must replay exactly, so never roll dice off-stream.

## Running things

```
node --experimental-strip-types packages/harness/season.ts     # the game as it is PLAYED
node --experimental-strip-types packages/harness/water.ts      # dry-tank failure curve
node --experimental-strip-types packages/harness/volatiles.ts  # both volatile sinks
node --experimental-strip-types packages/harness/run.ts        # ⚠ see below
cd packages/web && npx vite build                              # -> dist/index.html
```

**`harness/run.ts` measures a ship that cannot go dark.** The autopilot never ends a season,
so it sits in `phase: "season"` for 300 years and every policy dies "crew lost". It is still
useful for determinism and crash checks. **`season.ts` is the real signal** — it drives
`init(seed)` with no policy, which is the opening the game actually has.

## Verifying UI work

Chromium is at `/opt/pw-browsers/chromium` (never run `playwright install`). Screenshot the
built `dist/index.html`, and prefer measuring a property (pixel counts, scrollWidth, blank
frames) over eyeballing a full-page image — it is cheaper and catches more.

## Live artifacts

- Playable build — https://claude.ai/code/artifact/81179ce3-b560-4b71-80fd-55747fbcd05b
- Nav interface study — https://claude.ai/code/artifact/7af88e8c-6881-4d63-ad7b-d872aad21ce2

Republish by passing the same URL as `url`.
