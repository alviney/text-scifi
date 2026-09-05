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

## The start screen asks one real question

`lib/Start.svelte` offers the voyage with the departure crew's fifteen standing rules, or with
nothing at all. That is on the front screen rather than in the source because it is genuinely
undecided: `plan.md` §5c argues the inherited rules are a curriculum that teaches by going wrong
slowly, but a ship that watches nothing is a different game and might be a better one. Playing
both is the only way to find out.

Saving is `localStorage`, autosaved every 15 seconds, and lives in the client because §5's rules
say no web APIs in `sim/`. `State` is the save format, unchanged — the one wrinkle is that
`state.stores` and `state.rooms.Engineering` are the same object in memory, so the link is
remade on load.

## Not built yet

- Rules beyond `condition → service` and `roomstock → deliver`. The builder writes the shape
  that matters most; §5c's chained automations need the full grammar.
- Crew skill growth and cross-training (§3) — the only mitigation for role extinction.
- Manual crew assignment. Jobs are worked off the board; you cannot hand one to a person.
- The arrival narrative. §1 wants an ending that counts the dead by name, and the memorial is
  already carrying the names.
