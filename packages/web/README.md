# `@seedship/web`

The prototype client. Svelte 5 + Vite, per `ARCHITECTURE.md` §4.

Published to play: https://claude.ai/code/artifact/81179ce3-b560-4b71-80fd-55747fbcd05b

```
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/index.html — one self-contained file
```

## What it is

A **real client over the real simulation**. Every number on screen comes from
`packages/sim`; there is no mock data and no second copy of any rule. The tabs follow the
information architecture in `design/README.md` — Voyage, Facilities, Crew, Rules, with a
ticker above everything.

## The two rules it exists to prove

**1. The core knows nothing about the UI.** Nothing in `packages/sim` imports from here, and
nothing here reaches into the model — every change goes through `apply(state, command)`. The
balance harness and this client are both just callers.

**2. Rendering is decoupled from the tick.** `lib/engine.ts` owns real time. It steps the
simulation as fast as the speed demands — up to 1,200 game-days a second — and *publishes* a
snapshot at 12 Hz. Continuous motion (the starfield, the voyage bar) reads interpolated values
every animation frame and never triggers a re-render. At full speed the sim runs three orders
of magnitude faster than the UI repaints, and neither notices the other.

## Layout of the client

| File | Holds |
|------|-------|
| `lib/engine.ts` | The clock, the speed ladder, §2's snap-back, §11 Q8's severity floor |
| `lib/view.ts` | The vocabulary layer — every piece of spec jargon translated exactly once |
| `lib/Ticker.svelte` | The persistent feed strip |
| `tabs/*.svelte` | The four screens |
| `app.css` | The token set from `design/seedship-console.html`, four skins |

`lib/view.ts` is the load-bearing one. `design/README.md` insists the notation in `plan.md` §5
is *a specification, not an interface* — so `AT_RISK` becomes "Failing" and `maxCondition`
becomes "Best after repair" in one place, and no component invents its own wording.

## Speeds

The ladder runs `❚❚ · 1× · 2× · 6× · FF · ▶▶`. **6× is §2's cap** — one game-year per real
minute, which puts a 300-year playthrough at five hours. The two beyond it are a prototype
affordance for watching a whole voyage in a couple of minutes and are labelled as such.

Each speed raises the feed's severity floor (§11 Q8), so what the ticker carries tells you how
fast you are going without showing a number.

## Testing it from a script

The engine is exposed as `window.seedship`, which is the whole point of commands being data:

```js
seedship.send({ kind: "addRule", rule: { id: "p-reactor", watch: "reactor",
  kind: "condition", threshold: 60, action: "service",
  inherited: false, fires: 0, lastFired: -1 } });
seedship.setSpeed(5);
```

## Not built yet

- The ship cutaway with delivery markers, and per-room stores with delivery jobs (§5b).
  Facilities currently shows one ship-wide store.
- Crew as individuals — names, roles, requests. The tab shows the colony in aggregate.
- Rules beyond `condition → service`. The builder writes the one shape that matters most;
  `plan.md` §5c's chained automations need the full grammar.
- Saving. `State` is already the save format; nothing writes it anywhere.
