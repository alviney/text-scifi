# Seedship — Technical Architecture

Companion to `plan.md`. That document says what the game *is*; this one says how it is built.
They change at different rates and have different readers.

Written against a stated plan: **web first, then iOS** — possibly via Unity or Xcode.

---

## 1. The decision that matters

Performance decides nothing here. At the top speed §2 specifies (1 game-year per real minute)
the simulation runs **146 ticks/second** at roughly 69,000 operations/second, and a full
300-year playthrough is 2.6 million ticks. Any language on any runtime handles that.

Two things do decide it:

1. **There will be a second client.** Anything the web version couples to itself, the iOS
   version pays for twice.
2. **The interface is text.** §8 is monospace, box-drawing characters, ASCII bars and status
   glyphs. The DOM renders that natively, crisply, accessibly and for free.

So the architecture is one rule:

> ## The simulation is a standalone library that knows nothing about the UI.
>
> No DOM, no framework, no rendering, no timers it does not own. Pure functions over a
> serialisable state object.

Everything below follows from that.

---

## 2. Shape

```
┌──────────────────────────────────────────────┐
│  @seedship/sim         TypeScript, zero deps │
│                                              │
│  step(state, hours) -> state                 │
│  apply(state, command) -> state              │
│  serialise / deserialise                     │
│                                              │
│  degradation · power · rules · economy       │
│  crew · encounters · manufacturing           │
└──────────────────────────────────────────────┘
        │                    │                │
        ▼                    ▼                ▼
   web client          headless harness   future clients
   (DOM, Svelte)       (balance tests)    (Capacitor / native)
```

The core exports two functions and a type. Everything else is a client.

### Non-negotiables for the core

| Rule | Why |
|------|-----|
| **Deterministic** | Same seed + same commands = same 300 years, exactly |
| **Seeded RNG**, never `Math.random()` | Reproduce any bug from a save and a command log |
| **Integer game-hours**, fixed timestep | No float drift across 2.6M ticks |
| **State is plain data** | Serialisation *is* the save format (§11 Q1 answered) |
| **No I/O, no clock** | The client owns real time; the core only knows ticks |

---

## 3. Why this pays for itself immediately

The core being headless is not only about the second client. **It makes the balance testable.**

`plan.md` rests on a large stack of tuned numbers — 56-year asset lives, ~246 replacements,
~6,600 rare elements, a 2% food margin, 320 fuel rods, the three-act encounter structure. Every
one of those is currently a spreadsheet argument.

With a headless core, a 300-year playthrough runs in **seconds**, so:

- The economy becomes a **test suite**. "A diligent player finishes with rare compounds in hand"
  is an assertion, not a hope.
- Tuning changes get regression-tested. Change `baseWear` and see what it does to arrival
  outcomes across a thousand seeds.
- The bets flagged in `plan.md` — sensor drift, food margin, whether 13,000 maintenance tasks
  reads as pressure or noise — become measurable rather than arguable.

This is the strongest single argument for the split, and it applies on day one.

---

## 4. Web client

**Svelte** (or vanilla TS with a small signal library — the choice barely matters once the core
is isolated).

Not React: §2 requires a render loop that interpolates progress bars and animations at 60fps
*independently* of the simulation tick. A virtual DOM diffing text-dense panes on every frame is
the wrong shape of work. Svelte compiles to direct DOM updates and ships a smaller bundle.

**The render strategy matters more than the framework.** Do not re-render on tick:

- Structure renders when its data actually changes.
- Continuous motion — progress bars, the ticker, the starfield, delivery markers — is CSS
  transforms and `requestAnimationFrame`, reading interpolated values.
- At 8,760× the sim ticks 146×/second and the UI still paints 60fps of smooth motion, because
  the two are not coupled.

Styling: hand-written CSS with the token structure already proven in
`design/seedship-console.html` — light DOM, no component library. A CLI aesthetic wants full
control over every character cell, and a component library would fight it the whole way.

---

## 5. iOS

### Recommended: Capacitor around the web build

Weeks, not months. Ships the same codebase, the same DOM, the same crisp monospace text. For a
game whose entire visual language is characters and box-drawing, a WebView is not a compromise —
it renders the target aesthetic *better* than a game engine would.

### Not recommended: Unity

Unity is a strong engine and the wrong tool for **this** game:

- Its WebGL target would render the text interface into a canvas, losing selectable text,
  accessibility, native scrolling and crisp subpixel monospace — the things §8 depends on.
- It buys physics, 3D, asset pipelines and cross-platform input. This game needs none of them.
- The core would have to be C#, so either the web version becomes Unity too (see above) or the
  simulation is written twice.

Unity becomes the right answer only if the plan changes to include controllers, console
platforms, or real-time graphics.

### Viable later: native Swift

If a genuinely native iOS build is ever wanted, the isolated core is exactly what makes that a
**port rather than a rewrite** — a few thousand lines of deterministic, dependency-free logic
with a test suite that must produce identical output. That is a tractable job. Porting a
simulation entangled with a UI is not.

---

## 6. Repository layout

```
plan.md               game design
ARCHITECTURE.md       this file
design/               interface mockups
packages/
  sim/                the core. zero dependencies.
    src/
    test/             including full-playthrough balance runs
  web/                Svelte client
  harness/            headless runner for balance and regression
```

---

## 7. Open

- **Signal format plumbing.** `plan.md` §5 uses `state:atRisk` while §8 shows the player
  "Failing". The presentation layer owns that mapping; the table lives in `design/README.md`
  and must not drift.
- **Offline time.** §11 Q7 proposes the simulation suspends when the app closes. Capacitor
  makes that the default behaviour, which is convenient but should be a decision rather than an
  accident.
- **Save size and versioning.** State is the save; migrations will be needed the first time the
  model changes under an existing save.
- **Whether the harness ships.** A player-facing "simulate the rest of the voyage" tool is the
  same code as the balance runner, and might be an interesting endgame feature.
