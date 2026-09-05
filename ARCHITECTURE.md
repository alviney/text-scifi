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

**The web build is the primary version, permanently.** iOS is a second client, and the only
question is what renders it.

### The real cost is not rendering — it is a second simulation

Whatever ships on iOS, the decision that matters is whether the simulation exists **once or
twice**.

| Path | Simulation | UI | Cost |
|------|-----------|----|------|
| **Capacitor** | Shared, unchanged | Shared, unchanged | Weeks |
| **Unity** | **Ported to C#** | Rebuilt in Unity UI / TextMeshPro | Months, then maintained twice |
| **Native Swift** | **Ported to Swift** | Rebuilt in SwiftUI | Months, then maintained twice |

Two implementations of a *deterministic* simulation is a heavier commitment than it looks. Every
balance change is made twice. Every fix is made twice. Any divergence means the two versions
quietly play differently, and saves stop transferring between them. The core's determinism makes
the port *tractable* — identical output is testable — but it does not make it free.

### Decided: Capacitor first, native deferred

Ship the WebView build. It is weeks of work, it shares everything, and for a game whose visual
language is monospace characters and box-drawing it renders the target aesthetic **better than
any engine would** — real text, real scrolling, real accessibility.

Then find out whether it is actually inadequate before paying for a rewrite. If it is fine, the
question never needs answering — which is the point of deferring it.

**What would reopen it.** A deferred decision needs a trigger, or it just drifts:

- Tap latency or scroll jank in the feed that cannot be fixed in CSS.
- Suspend and resume behaving badly enough to compromise §11 Q7 (offline time).
- App Store friction that a WebView build cannot get past.
- Wanting something the WebView genuinely cannot do.

Absent one of those, there is nothing to decide.

**What keeps the door open, at no cost.** Deferring is only free if the discipline in §2 holds,
so these are the things that must not slip:

| Keep | Because |
|------|---------|
| The core dependency-free and deterministic | A port is only tractable if it is self-contained |
| No web APIs anywhere in `sim/` | `localStorage`, `fetch` and `Date.now()` in the core would each have to be unpicked later |
| UI logic out of the core | Anything the client knows, a second client has to be taught |
| **The balance suite as the port's acceptance test** | A native rewrite is "correct" when it produces byte-identical output from the same seed. Without that, a port is unverifiable. |

That last row is the one that turns a rewrite from a gamble into a task, and it exists already —
it is the same harness that validates the tuning.

### If one of those triggers fires

**Unity, honestly assessed for an iOS-only target.** Its central benefit is reaching many
platforms from one project — and if the target is iOS alone, that benefit goes unused while its
costs are paid in full. For a text-first interface, TextMeshPro is a step down from the
platform's own text rendering, and §8's layout would be rebuilt in a system less suited to it
than the DOM or SwiftUI.

**Unity is nonetheless the right call in three cases**, and they are not technical arguments to
be talked out of:

- **You already know Unity and do not know Swift.** Porting a simulation into a language you are
  fluent in beats porting it into one you are learning. This is a real and sufficient reason.
- **iOS is a stepping stone**, with Android or consoles behind it. Then the cross-platform
  benefit is used after all, and the calculus inverts.
- **The presentation is going to stop being text** — a rendered ship view, effects, anything the
  DOM is poor at.

**Native Swift** is the better fit purely on the merits for an iOS-only, text-first game: the
best text rendering available, proper platform integration, and no engine overhead. It costs the
same simulation port that Unity does.

So the question that decides it is not architectural. It is: *which language would you rather
maintain a second copy of the simulation in, and is iOS the destination or a waypoint?*

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
