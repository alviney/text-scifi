# Seedship — Game Design Document

> You are the AI managing a seedship. Your crew sleeps in cryo. A skeleton crew keeps the ship alive. Your job: keep everything running long enough to reach the destination.

---

## 1. Core Concept

A text-driven management/automation game with a CLI-style interface. The player reads status panels, schedules tasks, sets up automations, and tries to keep a fragile ship running across interstellar distances. The tone is industrial and utilitarian — think asset management software in space.

### The Journey
- **Destination is known** — a star system, centuries away.
- The journey takes **hundreds of years** of game time.
- The player *must* eventually automate and frame jack — you can't micromanage for 300 years.

### Outcome Spectrum (narrative, no score)

The ending is a **narrative outcome** based on ship and colony state at arrival. No numerical score — the player feels the result.

| Outcome | Condition | Tone |
|---------|-----------|------|
| **Perfect arrival** | Nearly all 200 colonists alive, ship in good shape | Triumphant — a new beginning |
| **Good arrival** | Most colonists alive, some losses along the way | Bittersweet — worth the cost |
| **Rough arrival** | Significant losses, ship barely holding together | Somber — survival, but at a price |
| **Skeleton arrival** | Handful of survivors, ship falling apart | Bleak — was it worth it? |
| **Failure** | Everyone dead or ship destroyed before arrival | — |

### Fail States
- **Total crew death** — no active crew, and unable to unfreeze more (medbay destroyed, no power, no medical supplies).
- **Critical system destruction** — reactor irrepairable, life support gone.
- **Total colony loss** — all cryo pods lost (power shutdown, cascade failure).
- The game **degrades gracefully** — things get worse before they become unrecoverable. There's always a window to scramble.

### Difficulty Curve
- **Equipment ages** — maintenance burden grows over the centuries.
- **Asteroids are rare** — resources dwindle between encounters, stockpiling is essential.
- **Crew attrition** — deaths shrink the available roster over time.
- **Parts stockpiles deplete** — manufacturing must keep pace or things spiral.
- **Cascading failures** — one neglected system breaks its dependents.

---

## 2. Game Loop

```
┌─────────────────────────────────────────────────────┐
│  1. OBSERVE    — Check interfaces, read statuses    │
│  2. PRIORITISE — Identify degraded/at-risk items    │
│  3. SCHEDULE   — Queue tasks for crew & equipment   │
│  4. MANUFACTURE — Produce parts, process materials  │
│  5. HARVEST    — Send drones to intercept asteroids │
│  6. AUTOMATE   — Wire up events → triggers          │
│  7. ADVANCE    — Tick time forward / frame jack      │
│  8. RESPOND    — Handle failures, injuries, deaths  │
└─────────────────────────────────────────────────────┘
```

### Time & Ticking

**Two layers:**

1. **Game clock** — ticks in **game-hours**. All simulation (degradation, crew stats, task progress, events) advances per game-hour.
2. **Render loop** — runs independently (requestAnimationFrame). Progress bars and UI interpolate smoothly between game states regardless of speed.

**Speed control:**
- No pause. The ship doesn't wait.
- Default (minimum) speed: **1 game-hour = 1 real-minute** (a game-day = 24 real-minutes).
- Continuous slider up to ~**1 game-year per real-minute** (~8,760x).
- At high speeds, simulation still runs per-hour resolution. Revisit if performance demands batching.

**Frame jacking & alert snap-back:**
- Speed is a continuous spectrum — "frame jacking" is just the high end of the slider.
- The player configures **snap-back rules**: "if an unresolved alert is older than X game-hours, drop speed to Y."
- This lets the player trust their automations at high speed, but get pulled back when something needs attention.

---

## 3. Crew

The skeleton crew are the player's hands. They perform repairs, operate equipment, and keep each other alive.

### Cryo Pool & Rotation
- **~200 people** in cryo storage — the full colony complement.
- **6-8 active crew** at any time.
- **Unfreezing** is expensive: costs medical consumables + the crew member spends a few days in medbay recovering before they can work.
- **Freezing** is cheap and instant — rotate crew freely, the cost gate is on waking them up.
- This creates a roster drafting mechanic: need a specialist? Wake them, but pay the price.

### Specialisations
| Role        | Strengths                              |
|-------------|----------------------------------------|
| Engineer    | Repairs, manufacturing                 |
| Botanist    | Hydroponics, food production           |
| Medic       | Treating injuries, managing cryo       |
| Pilot / Nav | Drone operations, asteroid intercepts  |
| Technician  | Electrical, life support               |
| Generalist  | Can do anything, but slower            |

<!-- TODO: Can crew gain experience / cross-train over time? -->
<!-- TODO: Do crew have names, personality traits, relationships? -->
<!-- TODO: What happens when a crew member dies — narrative event? Log entry? -->

### Crew Stats
| Stat       | Description                                      | Consequence of neglect          |
|------------|--------------------------------------------------|---------------------------------|
| Hunger     | Driven by food production pipeline               | Weakness → incapacitation → death |
| Sleep      | Needs scheduled rest periods                     | Errors → accidents              |
| Happiness  | Affected by conditions, deaths, workload         | Reduced efficiency? Mutiny?     |
| Health     | Injury/illness from accidents or environment     | Can't work → needs medical care |

### Crew Actions
- Crew members are **task queues** — the player schedules work onto them.
- Tasks take time. A crew member can only do one thing at a time.
- Dangerous tasks (repairing neglected high-danger equipment) carry injury/death risk.

---

## 4. Ship Data Model

Inspired by industrial asset management / IoT hierarchies.

```
Ship
├── Facility / Room
│   ├── System (can span rooms, e.g. Life Support)
│   │   ├── Asset / Equipment (e.g. LifeSupportNode)
│   │   │   ├── Component / Part (replaceable)
│   │   │   └── Consumable (depletable)
│   │   └── ...
│   └── ...
└── ...
```

### Ship Layout (~10 rooms, fixed)

Room connectivity is flavour — it doesn't affect gameplay mechanics.
Each room has its own LifeSupportNode (can be individually vented/failed).

| Room                    | Purpose                                              |
|-------------------------|------------------------------------------------------|
| **Bridge**              | Navigation, comms, speed control, asteroid tracking  |
| **Engineering**         | Fabrication, manufacturing, ship-wide system controls|
| **Reactor / Power**     | Energy generation, power distribution                |
| **Life Support**        | O₂, water recycling, atmosphere control              |
| **Hydroponics**         | Food production, seed bank storage                   |
| **Medbay**              | Crew health, cryo management, unfreeze recovery      |
| **Quarters**            | Crew rest, morale, food consumption                  |
| **Cargo Bay**           | Raw material storage, refined material storage       |
| **Drone Bay**           | Drone launch/recovery, asteroid harvesting ops       |
| **Maintenance Corridor**| Hull access, external repairs, high-danger zone      |

### Per-Room Equipment: LifeSupportNode

Every room has a **LifeSupportNode** — local atmosphere control (air, temp, pressure). These are regular equipment that degrade and need maintenance. The ship-wide Life Support room feeds O₂/water to all nodes, but each node can fail or be vented independently.

```
Life Support (System)
├── O₂ Generator (ship-wide, in Life Support room)
├── Water Recycler (ship-wide, in Life Support room)
├── Atmosphere Regulator (ship-wide, in Life Support room)
└── LifeSupportNode × 10 (one per room)
    ├── Local air, temp, pressure
    ├── Can vent room (e.g. fire response)
    └── Degrades independently
```

If a node fails → that room becomes dangerous. If the ship-wide O₂ generator fails → all nodes eventually starve. Cascading failure.

### Equipment Catalogue

**Passive equipment** (bunks, seed vault, storage racks) does **not degrade** — no maintenance needed.

| Room | Equipment | Danger | Consumables / Parts | Passive? |
|------|-----------|--------|---------------------|----------|
| **Bridge** | Nav Computer | Low | Electronics | |
| | Comms Array | Low | Electronics | |
| | Speed Controller | Low | — | Yes |
| **Engineering** | Fabricator | Med | Metal parts, electronics, power | |
| | Smelter / Refinery | Med | Filters, power | |
| | Workbench | Low | Tools | |
| **Reactor** | Reactor Core | High | Coolant, fuel rods | |
| | Power Distribution | Med | Circuit breakers | |
| | Battery Bank | Med | Cells, electronics | |
| | RTG Bank | Low | — | |
| | Aux Array Control | Low | — | |
| **Life Support** | O₂ Generator | High | Water, filters | |
| | Water Recycler | Med | Filters, chemical compounds | |
| | Atmosphere Regulator | Med | Sensors | |
| **Hydroponics** | Grow Beds | Low | Seeds, water, fertiliser | |
| | Irrigation System | Low | Pumps, seals | |
| | Seed Vault | Low | — | Yes |
| **Medbay** | Cryo Control | High | Medical supplies, power | |
| | Med Station | Med | Medical supplies | |
| | Diagnostic Scanner | Low | Electronics | |
| **Quarters** | Food Dispenser | Low | Food | |
| | Bunks | Low | — | Yes |
| | Rec Terminal | Low | Power | |
| **Cargo Bay** | Storage Racks | Low | — | Yes |
| | Loading Crane | Med | Metal parts, seals | |
| **Drone Bay** | Drone Launcher | Med | Drones, fuel | |
| | Drone Fabricator | Med | Metal parts, electronics | |
| | Docking Clamp | Med | Seals | |
| **Maintenance Corridor** | Hull Access Panel | High | Plating, seals, tools | |
| | Pressure Doors | High | Seals, sensors | |
| | Utility Conduits | Med | Various | |

*Plus a LifeSupportNode in every room (Med danger, needs filters/sensors).*

~32 active equipment pieces + ~4 passive + 10 LifeSupportNodes = ~46 total items.

<!-- "Solar Array Control" renamed "Aux Array Control", and Battery Bank / RTG Bank added,
     to match the generation model in §6 Energy. See Open Question 9. -->

### Equipment Degradation
- Active equipment degrades over time (per game-hour). Passive does not.
- **Maintenance window**: hasn't been serviced in N days → moves to "at risk".
- **Danger rating**: Low / Medium / High.
  - High-danger equipment left unmaintained increases risk to the crew member repairing it.
  - The longer the neglect, the higher the accident chance.

### Equipment States

Two **orthogonal tracks** rather than one combinatorial state machine. Almost everything
is derived from two numbers, so the sim never manages transitions by hand.

#### Track 1 — Condition (derived from `condition: 0-100`)

| Band | State | Effect |
|------|-------|--------|
| 85-100 | `NOMINAL`   | Full output |
| 60-85  | `WORN`      | Full output; flavour chatter in the feed |
| 30-60  | `DEGRADED`  | Output scales down linearly; consumable draw rises |
| 0-30   | `AT_RISK`   | As degraded, plus a per-hour failure roll |
| —      | `FAULTED`   | **Latched.** Output zero. Repairable in place. |
| —      | `DESTROYED` | **Latched.** Beyond repair — needs a replacement unit built. |

`FAULTED` and `DESTROYED` are latched flags (set by an event, cleared by a task).
Every other band is a pure function of `condition` — no transition bookkeeping.

#### Track 2 — Duty (what it's doing right now)

| State | Meaning |
|-------|---------|
| `RUNNING`   | Powered, fed, producing |
| `IDLE`      | Powered, nothing queued |
| `OFFLINE`   | Player switched it off (power saving, mothballing) |
| `UNPOWERED` | Power budget cut it |
| `STARVED`   | Missing an input consumable |

```
effectiveOutput = rated × conditionFactor(condition) × (duty === RUNNING ? 1 : 0)
```

A room's status dot on the main screen = the **worst** of (condition band, duty state)
across its assets. That's the whole green/amber/red rule.

#### Ageing — the difficulty curve in one number

Each asset also carries **`maxCondition`**, starting at 100.

- A repair restores `condition` up to `maxCondition` — never past it.
- Every repair costs a little `maxCondition` (refurbishment loss): ~0.5 for routine
  servicing, ~2-3 for a `FAULTED` rebuild.

Everything the difficulty curve needs falls out of that one decaying ceiling:

- Old kit needs servicing **more often** — less headroom above the `AT_RISK` line.
- Eventually `maxCondition` drops below the `DEGRADED` line and the asset is a permanent
  liability. The only fix is **replacement**, which costs manufacturing throughput, which
  costs asteroid material, which is the scarcest thing in the game.
- No separate "ageing system" to tune. One number, monotonically falling.

#### Degradation rate

```
wearPerHour = baseWear × dutyFactor × environmentFactor × ageFactor
```

| Factor | Range | Notes |
|--------|-------|-------|
| `baseWear` | per asset class | Reactor Core wears far faster than a Nav Computer |
| `dutyFactor` | 0.0 - 1.0 | `RUNNING` 1.0, `IDLE` 0.25, `OFFLINE` 0.0 — mothballing genuinely works |
| `environmentFactor` | 1.0 - 3.0+ | Room's LifeSupportNode faulted or vented → ×3; fire/radiation higher |
| `ageFactor` | 1.0 - 2.0 | Rises as `maxCondition` falls |

**Scale check.** Tune `baseWear` so an untouched healthy asset takes ~2 game-years to fall
from 100 to the `AT_RISK` line — roughly **0.005 condition/game-hour**. Across ~44 assets
over a 300-year journey that's on the order of **13,000 maintenance tasks per playthrough**.

Nobody hand-schedules that. The numbers are what *force* the automation layer — that's
deliberate. The tuning target is: **unmanageable by hand, comfortable once automated.**

#### Repair accident risk

```
accidentChance = dangerRating × (1 - condition/100) × crewFactor
```

`crewFactor` derives from the crew member's sleep, health, and specialisation match.
A sleep-deprived generalist sent at an `AT_RISK` High-danger Reactor Core is where crew
die — and the player will have chosen that, which is the point.

#### Transitions

| Trigger | Result |
|---------|--------|
| `condition` reaches 0 | → `FAULTED` |
| `AT_RISK` per-hour failure roll succeeds | → `FAULTED` (early and unpredictable) |
| Cascade event (fire, decompression) or a `FAULTED` dependency | → `DESTROYED` |
| Repair task completes | `condition = maxCondition`; `maxCondition -= refurbLoss` |
| Replacement installed | New asset, `maxCondition = 100` |

#### Events emitted (feeds §5)

Every active asset emits on band and duty changes, so automations bind to states without
any special-casing:

`state:worn` · `state:degraded` · `state:atRisk` · `state:faulted` · `state:destroyed`
`duty:starved` · `duty:unpowered` · `duty:offline`

This is what makes the canonical automation trivial to express:
*"on `state:atRisk` → post a repair task to the board."*

---

## 5. Event System

The core automation layer. Inspired by IoT event-driven patterns.

### Key Principle
**Listeners are self-contained.** A piece of equipment only listens for events and acts on *itself*. No cross-targeting. This keeps automations simple and predictable.

### Events (things that happen)

**Shared traits:**
- `Toggleable` — emits `on` / `off`
- `Countable` — emits `added` / `removed`

**Device-specific** — unique events per equipment type (e.g. fire alarm emits `alarm:fire`)

### Listeners (conditions)

Adapters that watch events and evaluate conditions:
- `limitUnder(threshold)` — triggers when a countable drops below a value
- `limitOver(threshold)` — triggers when a countable exceeds a value

<!-- TODO: More listener types — time-based? Compound conditions (AND/OR)? -->

### Triggers (actions taken in response)

**Shared traits:**
- `Toggleable` — can `turnOn` / `turnOff`
- `Countable` — can request `amount`

An action can also **post a task to the task board** for crew to pick up (e.g. "needs repair", "needs restock").

**Examples:**
| Scenario | Event | Listener | Trigger |
|----------|-------|----------|---------|
| Fire suppression | FireAlarm → `alarm:fire` | LifeSupportNode listens | Vent air from room (self-action) |
| Coffee restock | Dispenser → `removed` | `limitUnder(10)` | Post "restock" task to board |
| Low O₂ warning | O₂ Sensor → `removed` | `limitUnder(safe_level)` | Alert + reroute supply (self-action) |
| Equipment failure | Motor → `off` (unexpected) | Motor listens | Post "repair" task to board |

### Building Automations (IFTTT-style)

From an equipment's detail pane:
1. See existing listeners listed
2. **"Add listener"** → pick an event to watch (from self or another device on the ship)
3. Pick the condition (limitUnder, limitOver, on/off, etc.)
4. Pick the action (self-action or post task to board)
5. If posting to board: choose front or end of queue priority

<!-- TODO: Can automations fail? Sensors can degrade too? -->

---

## 5b. Task Board

The bridge between automated systems and human crew.

- Equipment automations (or the player directly) **post tasks** to the task board.
- Crew members with an empty personal queue **pick tasks from the board**.
- The player can also manually assign tasks directly to a crew member's queue for urgent work.

### Board Pickup Order
1. **Specialisation match** — crew prefer tasks that fit their role (engineers grab repairs, botanists grab hydroponics work).
2. **Priority** — within matching tasks, higher priority first.
3. **FIFO** — ties broken by post order.

This rewards having the right crew awake and makes specialists feel distinct from generalists.

---

## 6. Resources & Economy

### Raw Materials (from asteroids)

Sourced via **drone harvesting**. Asteroids are **rare** — every few years — so stockpiling and rationing are core gameplay.

- Asteroids enter range at random intervals.
  - Limited **window of availability** — after which delta-v cost is prohibitive.
  - Reference: *Delta-V* by Daniel Suarez for hard-sci-fi asteroid mining.

| Raw Material     | Refined Into           | Used For                          |
|------------------|------------------------|-----------------------------------|
| Water ice        | Water                  | Drinking, hydroponics, O₂        |
| Metal ore        | Refined metal          | Parts, plating, tools, structure  |
| Silicates        | Silicon                | Electronics, solar panels         |
| Volatiles        | Chemical compounds     | Fuel, medical supplies, fertiliser|
| Rare elements    | Rare compounds         | Advanced electronics, medical     |

### Production Chains (3-4 steps deep)

```
REFINING (Engineering)
  Water ice       → Water
  Metal ore       → Refined metal
  Silicates       → Silicon
  Volatiles       → Chemical compounds
  Rare elements   → Rare compounds

INTERMEDIATE PRODUCTS (Engineering)
  Refined metal              → Metal parts (structural, mechanical)
  Silicon + Rare compounds   → Electronics (boards, sensors)
  Chemical compounds         → Seals, medical supplies, fertiliser

FINAL ASSEMBLY (Engineering)
  Metal parts + Electronics + Seals → Equipment (pumps, motors, drones, RTG banks)
  Metal parts + Electronics         → Components (replacement parts for existing equipment)
  Refined metal                     → Tools, plating, structural repairs (Workbench)
  Rare compounds + Metal parts      → Fuel rods

FOOD (Hydroponics)
  Seeds + Water + Fertiliser + Power → Food
  Crop types: nutrition, medicinal, morale (coffee?)

LIFE SUPPORT (continuous consumption)
  Water       → O₂ (electrolysis) + drinking water
  Power       → atmosphere regulation, heating
  Filters     → air quality (consumable, manufactured from chemical compounds)
```

### Recycling
- Broken/replaced equipment can be **scrapped** back into raw materials at a loss.
- Gives value to failed parts rather than just discarding them.

### Seed Bank
- Finite stock of organic seeds for hydroponics.
- Different crops for nutrition, medicine, morale.

### Energy

**Power is the spine.** It is the only system that touches every other one, and it is what
turns "shut down cryo tanks" from flavour text into a decision the player actually has to make.

Unit: **kW**. All figures below are draw at full duty.

#### Generation

| Source | Output | Notes |
|--------|--------|-------|
| **Reactor Core** | 1,000 kW nominal | Degrades like any other asset (§4). Output scales with condition. |
| **RTG Bank** | 12 kW each | Manufactured. Output decays ~0.8%/year (half-life). Always-on trickle. |
| **Battery Bank** | 6 h of critical-only load | Buffer, not a source. Recharges from surplus. |

**The reactor is an asset, not a constant.** Its output runs through the same
`conditionFactor` as everything else in §4:

```
output = 1000 × conditionFactor(condition)
conditionFactor = 1.0            when condition ≥ 60
                = 0.4 + 0.6×(condition/60)   below 60
```

| Reactor condition | Band | Output |
|-------------------|------|--------|
| 100-60 | `NOMINAL` / `WORN` | 1,000 kW |
| 45 | `DEGRADED` | 850 kW |
| 30 | `AT_RISK` boundary | **700 kW** |
| 15 | `AT_RISK` | 550 kW |
| — | `FAULTED` | 0 kW — battery bank, then RTGs only |

This is the single most important consequence in the design:

> **A reactor that slips into `AT_RISK` cannot power the ship's baseline load.**

The §4 ageing curve *is* the §6 crisis curve. One decaying number produces the whole
mid-game squeeze — no separate escalation system needed.

#### Fuel

The reactor burns **fuel rods**, measured in *rod-years*: one rod = one year at nominal
(1,000 kW) output, **scaling with actual delivered load**. Draw less, burn slower.

- Ship departs with **320 rods**.
- Baseline load (below) is ~0.89 nominal → ~360 years of burn against a 300-year journey.
  A **~20% margin**, and no more.
- More rods can be fabricated from **rare compounds** — the scarcest asteroid yield (§6).

So power is *not free even when you have headroom*. Running the smelter around the clock
doesn't just risk a brownout, it spends journey margin. Every rod inserted is a signal-feed
event and a natural milestone marker for §10 ("*rod 47 seated — 273 remaining*").

#### Load table

**Continuous** — drawing whenever healthy and powered:

| Asset | kW | Shed class |
|-------|----|------------|
| Cryo Control — 8 banks × 50 kW | **400** | `critical` (manual only) |
| O₂ Generator | 90 | `critical` |
| Grow Beds | 120 | `dimmable` |
| LifeSupportNode × 10 @ 8 kW | 80 | `dimmable` (per room) |
| Water Recycler | 40 | `dimmable` |
| Atmosphere Regulator | 25 | `critical` |
| Comms Array | 20 | `sheddable` |
| Med Station | 20 | `critical` |
| Nav Computer | 15 | `critical` |
| Irrigation System | 15 | `dimmable` |
| Power Distribution | 10 | `critical` |
| Diagnostic Scanner | 10 | `sheddable` |
| Pressure Doors | 10 | `critical` |
| Docking Clamp | 10 | `sheddable` |
| Aux Array Control | 5 | `sheddable` |
| Food Dispenser | 5 | `sheddable` |
| Rec Terminal | 5 | `sheddable` |
| Utility Conduits | 5 | `critical` |
| Hull Access Panel | 5 | `sheddable` |
| **Continuous baseline** | **890 kW** | |

**Intermittent** — draws only in `RUNNING` duty (§4), i.e. when actually working:

| Asset | kW |
|-------|----|
| Smelter / Refinery | 140 |
| Fabricator | 100 |
| Drone Fabricator | 80 |
| Drone Launcher | 60 |
| Loading Crane | 30 |
| Workbench | 5 |
| **Industrial peak** | **415 kW** |

#### The core tension

```
  Reactor nominal    1,000 kW
  Continuous baseline  890 kW
  ─────────────────────────────
  Headroom             110 kW      ← you can run the Fabricator. Barely.
  Industrial peak      415 kW      ← what you actually want to run.
```

**You cannot run life support, hydroponics, all eight cryo banks, and manufacture at the
same time.** Not on day one, at a perfect reactor, with nothing broken. That's the design
target: the budget is adversarial from the first hour and only gets worse.

The player's levers, roughly in order of how much they cost:

1. **Schedule industry** — smelt in bursts, not continuously. Cheap, just requires attention (or automation).
2. **Shed empty rooms** — LifeSupportNodes in rooms with no crew. Up to ~70 kW free, and near-costless if you track where crew are.
3. **Dim hydroponics** — 135 kW available, paid for in food throughput, paid for later in crew hunger.
4. **Cut comms, rec terminal, scanner** — ~35 kW, paid for in morale and diagnostics.
5. **Shut a cryo bank** — 50 kW. Twenty-five people die.

#### Priority & load shedding

Every asset carries a **power priority `0-9`** (player-settable, sane defaults shipped).
When demand exceeds supply, **Power Distribution** sheds from the bottom up until it fits.

- Shed asset → `UNPOWERED` duty state → emits `duty:unpowered` (§4) → automations can react.
- **`dimmable`** assets scale output down instead of hard-cutting — grow beds run at 60%,
  LifeSupportNodes hold a thinner atmosphere.
- **`critical`** assets are never auto-shed. Only the player can turn them off, by hand.

Setting priorities *is* the strategic layer — the same "configure it and trust it" contract
as the automation console. A player who ranked cryo below hydroponics finds out during the
first brownout, not before.

**If shedding everything sheddable still isn't enough**, the bus enters a **cascade
brownout**: everything runs degraded, and power fluctuation inflicts condition damage on
active assets (§4). This is §1's "degrades gracefully" promise made mechanical — you get a
window to scramble, and the window itself is costing you equipment.

**Power Distribution is the dependency that matters.** If it goes `FAULTED`, the player
loses load-shedding control entirely: priorities stop being honoured and brownouts hit
whatever they hit. Repair it first.

#### Cryo banks — the decision

200 colonists in **8 banks of 25**. 50 kW per bank. Together, **40% of the ship's entire
generating capacity**, permanently, for three centuries.

- Shutting a bank kills its 25 colonists. **Irreversible.**
- It can never be automated and never auto-shed. Hard confirmation, every time.
- Every loss is logged permanently and counted in the §1 arrival outcome. The ending
  narrative knows exactly how many people you spent, and when.
- **You cannot wake them to save them.** The ship supports 6-8 active crew — hydroponics
  can't feed 25 more. Mass-unfreezing swaps a clean death for starvation.

That trap is the point. There is no clever way out; there is only choosing early enough
that you only have to do it once.

#### Failure modes

| Event | Consequence |
|-------|-------------|
| Reactor `DEGRADED` | Output falls below baseline → permanent shedding becomes normal |
| Reactor `FAULTED` (SCRAM) | Battery bank: ~6 h of critical-only load. Then RTGs (~tens of kW). Life support on RTGs alone is survivable for the crew; **cryo is not.** |
| Power Distribution `FAULTED` | Priorities unenforced; shedding becomes arbitrary |
| Fuel exhausted | Reactor stops. Same as SCRAM, but permanent. |
| Cascade brownout | Condition damage across all active assets |

<!-- TODO: Battery bank capacity in kWh, and how fast surplus recharges it. -->
<!-- TODO: RTG fabrication cost — should the emergency margin be expensive enough to hurt? -->
<!-- TODO: Does the reactor need coolant as a separate consumable (it's in the §4 catalogue), or is fuel enough? -->

---

## 7. Manufacturing

**Manufacturing is the ship's only closed loop.** Every other system drains — equipment
ages, consumables burn, fuel depletes, people die. Manufacturing is the sole mechanism that
puts anything *back*. It's therefore the bottleneck the entire §4 ageing curve routes
through, and it competes for the §6 power budget while doing it.

### The demand it has to meet

Deriving from §4's ageing model (routine repairs cost ~0.5 `maxCondition`, `ageFactor`
accelerating as assets wear):

| | |
|---|---|
| Asset service life before `maxCondition` falls below the `DEGRADED` line | **~56 years** |
| Replacements over a 300-year journey (46 assets, ~5.4 cycles) | **~246 units** |
| Average cadence | **one complete piece of equipment every ~15 game-months** |
| Rare compounds consumed by those replacements alone | **~1,380** |
| Rare elements that must be mined to yield them (3:10 refining) | **~4,600** |

Before a single dose of medicine, RTG, or spare fuel rod. This is the budget every later
system has to fit inside — notably asteroid yields, which need to average **~65 rare
elements per encounter** across ~100 encounters just to break even.

### Fabrication assets

Each fab asset holds **its own job queue**. Jobs aren't a global "build" button.

| Asset | Power | Tier | Role |
|-------|-------|------|------|
| **Smelter / Refinery** | 140 kW | 1 | Raw → refined. High throughput, high power. |
| **Fabricator** | 100 kW | 2-3 | Refined → parts → components → equipment. |
| **Drone Fabricator** | 80 kW | 3 | Drones only. |
| **Workbench** | 5 kW | 0 | Crew-powered. Slow, poor yields, **nearly free**. |

**The Workbench is the brownout lifeline.** When the reactor is degraded and there's no
headroom for the Fabricator, the Workbench still runs. It gives the player something
productive to do *during* a power crisis instead of waiting it out — badly, slowly, at
worse yields, but running.

### How a job runs

1. A crew member is dispatched to **set the job up** — a short task (~2 h).
2. Materials are **committed at setup** and removed from inventory.
3. The machine then runs **autonomously** to completion. No crew required.

The crew cost is **fixed per job, not per unit**. So batching is rewarded: queue 20 seals
in one job and you pay one setup task instead of twenty. This matters enormously — it's what
lets a fab machine keep working while the crew sleep, which is mandatory in a 300-year game.

**But batching is risky.** If power is lost mid-job, the in-progress unit is **scrapped**
(materials gone); completed units in the batch survive. So a long batch during a marginal
power situation is a real gamble, and brownouts become *expensive* rather than merely slow.
Batch size is a genuine risk/reward decision rather than a free optimisation.

### Recipes

**Tier 1 — Refining** *(Smelter, 140 kW)*

| Recipe | In | Out | Hours |
|--------|----|----|-------|
| Melt ice | 10 water ice | 9 water | 4 |
| Crack volatiles | 10 volatiles | 7 chemical compounds | 6 |
| Refine metal | 10 metal ore | 6 refined metal | 8 |
| Refine silicon | 10 silicates | 5 silicon | 8 |
| Refine rares | 10 rare elements | **3 rare compounds** | 16 |

Note the yields: ice is nearly lossless, rares are punishing and slow.

**Tier 2 — Components** *(Fabricator, 100 kW)*

| Recipe | In | Out | Hours |
|--------|----|----|-------|
| Seals | 2 chemical compounds | 3 seals | 4 |
| Filters | 1 chemical compound + 1 refined metal | 2 filters | 3 |
| Fertiliser | 2 chemical compounds + 1 water | 4 fertiliser | 3 |
| Metal parts | 4 refined metal | 1 metal part | 6 |
| Medical supplies | 3 chemical compounds + 1 rare compound | 2 medical supplies | 8 |
| Electronics | 2 silicon + **1 rare compound** | 1 electronics | 10 |

**Tier 2b — Manual** *(Workbench, 5 kW — worse at everything except power)*

| Recipe | In | Out | Hours |
|--------|----|----|-------|
| Seals (manual) | 2 chemical compounds | 2 seals | 10 |
| Toolset | 2 refined metal | 1 toolset | 12 |
| Circuit breakers | 1 electronics + 1 refined metal | 2 breakers | 10 |
| Plating | 3 refined metal | 1 plating | 14 |

**Tier 3 — Assembly** *(Fabricator, 100 kW)*

| Recipe | In | Out | Hours |
|--------|----|----|-------|
| Replacement component | 2 metal parts + 1 electronics | 1 component | 12 |
| Equipment — Low complexity | 6 metal parts + 2 electronics + 2 seals | 1 unit | 48 |
| Equipment — Med complexity | 10 metal parts + 5 electronics + 4 seals | 1 unit | 96 |
| Equipment — High complexity | 16 metal parts + 12 electronics + 6 seals + 2 rare compounds | 1 unit | 168 |
| RTG Bank | 8 metal parts + 4 electronics + **6 rare compounds** | 1 unit | 120 |
| Fuel rod | 2 metal parts + **12 rare compounds** | 1 rod | 72 |
| Drone *(Drone Fabricator, 80 kW)* | 8 metal parts + 6 electronics + 2 seals | 1 drone | 72 |

### Rare compounds are the choke point

Electronics, medical supplies, RTG banks, fuel rods and every high-complexity asset all
pull from the same 3:10-yield, 16-hour bottleneck. **There is no substitution path.** That
single dependency is what gives asteroid encounters existential weight rather than merely
being useful — specifically, encounters that carry *rare elements*.

It also means the player is permanently arbitrating between four things they need:
keep the lights on (fuel), keep people alive (medicine), keep the ship repaired (electronics),
or buy insurance (RTGs). Any of those can be starved to feed another.

### The collision with power

From §6: **110 kW of headroom** against a healthy reactor.

- **Fabricator (100 kW) fits — barely.** You can fabricate more or less continuously.
- **Smelter (140 kW) does not fit at all.** Refining always requires shedding something
  first. It is a deliberate act, never ambient.
- **Both together (240 kW)** means shedding 130 kW: dim hydroponics, shed nodes, cut comms —
  or shut a cryo bank.

Which produces the design's best emergent trap:

> **The reactor degrades → you need to build a replacement → building it needs 240 kW of
> refining and assembly → which is power the degraded reactor no longer has.**

A death spiral with a clearly visible entrance, exactly as §1's "degrades gracefully, always
a window to scramble" promises. The counterplay is stockpiling refined material *while you
still have surplus power* — which is the lesson the whole game is trying to teach, and which
the player will only learn by nearly losing once.

### Standing orders

~246 replacements and tens of thousands of consumable units over the journey. Hand-queueing
that is as impossible as hand-scheduling the maintenance in §4, and the answer is the same:

A fab asset can hold a **standing order** — a recipe plus a **stock target** and a
**reorder point**. When inventory of the output drops below the reorder point, the machine
queues a batch automatically (materials permitting) and posts the setup task to the board (§5b).

This is just the §5 event system applied to inventory: `Countable` → `limitUnder(n)` →
queue job + post task. No new machinery, and it makes the manufacturing screen a place you
*configure* rather than babysit.

If materials are missing, the job stalls and emits `job:starved` — which is itself an event
the player can automate against ("*on `job:starved` → drop speed*").

### Scrapping

Scrapping a `DESTROYED` or aged-out asset returns roughly:

| Recovered | Rate |
|-----------|------|
| Refined metal | ~40% of build cost |
| Seals, plating | ~20% |
| Electronics | **0%** — fried, always |

Replacement is never a wash, and the electronics loss is what keeps rare compounds draining
even when the player is diligent about recycling.

### Tech tree — no

**Deliberately none.** All schematics are aboard from departure; this is a colony vessel, not
an expedition. A research tree implies growth and progress, but this game's arc is **decline** —
the drama is in maintaining, not expanding, and a tech tree would fight the tone directly.

What replaces it, if the "unlock" beat is wanted:

- **Schematics can be lost.** Data core damage destroys recipes; recovering them becomes a
  scarcity story rather than a progress story.
- **Improvisation recipes.** Under duress, crew derive *worse but cheaper* substitutes —
  a seal made from scrap that lasts a third as long. Progress shaped like desperation.

### Building new equipment — yes, within limits

- **No new rooms.** The layout is fixed (§4).
- **Additional units of existing equipment, yes** — a second Fabricator, more RTG banks,
  extra grow beds — subject to **per-room equipment slots**.

Expansion is real but self-limiting, because it's power-gated: a second Fabricator is another
100 kW you don't have. "Build more" is a trap the player can walk into, which is the correct
amount of rope.

<!-- TODO: Per-room slot counts. -->
<!-- TODO: Do fab assets have a quality/precision stat that degrades output as they age? -->
<!-- TODO: Complexity class (Low/Med/High) per catalogue entry in §4. -->

---

## 8. Interface Design

### Platform
- **Mobile first**. Single pane at a time, not tiled windows.
- Desktop can be supported later, potentially with multi-pane layouts.

### Aesthetic
- **CLI-style** — monospace text, minimal graphics.
- ASCII/text-based loading bars, status indicators, icons.
- Industrial, utilitarian feel. Think `htop` meets a ship's bridge console.
- Interaction is **tap/click**, but buttons and menus are styled to look like CLI menus — compact, minimal, text-only.

### Navigation Model

```
┌──────────────────────────┐
│      MAIN SCREEN         │
│                          │
│  Facility List           │
│  ● Bridge         [OK]  │
│  ● Engineering    [OK]  │
│  ◐ Hydroponics   [WARN] │
│  ○ Medbay        [CRIT] │
│  ...                     │
│                          │
│ ─── Signal Feed ──────── │
│ 14:32 O₂ low in Medbay   │◄── tap to open detail
│ 14:28 Repair complete     │
│ 14:15 Asteroid detected   │
│ ...                       │
└──────────────────────────┘
        │
        ▼ tap facility or feed item
┌──────────────────────────┐
│    DETAIL PANE           │
│                          │
│  Equipment list, crew,   │
│  CLI-style action menus  │
│  Status, progress bars   │
│                          │
│  [back]                  │
└──────────────────────────┘
```

- **Main screen**: facility list with status dots (green/amber/red) + a scrolling **signal feed** showing alerts, status changes, and events in real time.
- **Tap a feed item** → opens the relevant detail pane (equipment, crew member, alert source).
- **Tap a facility** → opens facility view with equipment, crew present, conditions.
- **Detail panes** use CLI-styled menus for actions — looks like a terminal, but you tap the options.

### Signal Feed
- A constant, always-visible stream of ship events.
- "Main feed signals" — systems write status updates, alerts, and events here.
- Acts as the player's ambient awareness of ship state.
- Each line is tappable — links to the source of the signal.

### Key Screens
<!-- TODO: Design each screen in detail — iterative process -->

| Screen              | Purpose                                              |
|---------------------|------------------------------------------------------|
| Main / Overview     | Facility list + signal feed                          |
| Facility Detail     | Drill into a room — see equipment, crew, conditions  |
| Equipment Detail    | Status, degradation, maintenance history, actions    |
| Crew Roster         | Crew stats, task queues, status, cryo pool access    |
| Crew Member Detail  | Individual stats, current task, history              |
| Task Manager        | All active/queued tasks, progress bars               |
| Automation Console  | View/create event → listener → trigger chains        |
| Resource Inventory  | Raw materials, parts, consumables                    |
| Navigation / Astro  | Asteroid windows, course, destination progress       |
| Manufacturing Queue | What's being built, what's needed                    |

### Task Visibility
- Any task, anywhere, can be inspected at any time.
- Each task shows a **progress bar** (text-based), assignee, ETA, status.

---

## 9. Technical Architecture

### Design Patterns
- **Command Pattern** — for the task/action system (queueable, undoable, serialisable).
- **Observer Pattern** — for the event/listener/trigger system.
- **Component/Entity** — for ship hierarchy and equipment composition.
- **State Pattern** — for equipment and crew state machines.
- Reference: [Refactoring Guru — Behavioral Patterns](https://refactoring.guru/design-patterns/behavioral-patterns)

### Tech Stack
<!-- TODO: Decide on framework and UI library -->

**Considerations:**
- Needs to support the multi-pane CLI aesthetic efficiently.
- Must handle a global tick system with many concurrent timers/progress bars.
- Component-based UI framework is a natural fit.

**Candidates:**
| Option | Pros | Cons |
|--------|------|------|
| React + a terminal-style UI lib | Huge ecosystem, component model | May need custom work for CLI feel |
| Svelte | Lightweight, reactive, fast | Smaller ecosystem |
| Vue | Good middle ground | — |
| Vanilla + Web Components | Maximum control over aesthetic | More boilerplate |

<!-- TODO: Evaluate terminal-style CSS frameworks / component libraries -->
<!-- TODO: State management approach — how to handle the game world state? -->

---

## 10. Flavour Text & Narrative Content

### Text Bank (v1 — no LLM needed)
Even without an LLM, the game should have a **large bank of pre-written text** to keep the signal feed and events feeling alive and varied. These are selected contextually based on game state.

- **Alert messages** — not just "Pump failed", but *why*: "Irrigation pump seized — looks like someone spilled coffee on the intake", "O₂ generator tripped after power fluctuation in Reactor room".
- **Crew chatter** — idle dialogue in the feed: complaints about food, comments on workload, jokes, reactions to events.
- **Incident descriptions** — varied flavour for equipment failures, accidents, near-misses.
- **Milestone messages** — marking years passed, distance covered, crew birthdays, anniversaries of deaths.
- **Mood-dependent lines** — crew text varies by their stats. A happy crew member quips; an exhausted one snaps.

The text bank should be **large enough that repetition is rare** across a full playthrough. Tagged by context (equipment type, stat thresholds, event type) so the right lines surface at the right time.

### Future: LLM Integration (requires internet)

These features would use an LLM to replace/supplement the text bank with dynamic generation. Not for v1, but worth designing toward.

### Crew Dialogue & Personality
- Crew members speak in the signal feed — complaints, jokes, mourning, chatter.
- The LLM generates dialogue grounded in **game state**: the crew member's stats (hunger, sleep, happiness, health), their backstory, recent events (deaths, accidents, victories), and their relationships.
- A hungry, exhausted engineer who just lost a friend talks differently than a well-rested, happy one.
- The player overhears crew rather than conversing with them — you're the AI, not their peer.

### Crew Agency & Refusal
- Crew aren't just obedient task queues — they can **push back**.
- Ask someone to do a high-danger repair on no sleep? They might refuse, demand someone else go, or do it reluctantly (affecting quality/risk).
- The LLM evaluates the crew member's state + personality + task danger to decide their response.
- Gives the happiness and relationship stats real mechanical teeth.
- The player has to manage *people*, not just task queues.

### Context the LLM receives per interaction
- Crew member's full stats + backstory + personality traits
- Recent event log (what's happened to them and around them)
- Current ship state (what's broken, who's died, resource levels)
- The specific task or situation triggering the dialogue

---

## 11. Open Questions

1. **Saving** — Autosave? Manual save? Browser local storage?
2. **Procedural generation** — Are asteroid encounters, equipment failures, crew events randomised?
3. **Frame jacking risk** — What can go wrong if you frame jack too early? Cascade failures?
4. **Tutorial / onboarding** — How does the player learn the systems?
5. **Sound** — Any ambient audio, or purely visual?
6. **Crew backstories** — Pre-written or generated? How deep?

7. **Offline time — what happens when the app is closed?**
   "No pause" (§2) plus a mobile-first platform (§8) collide here, and the answer changes
   what kind of game this is.
   - *(a) Sim suspends when the app closes.* "No pause" means no pause **button** during
     play — you can't stop the ship to think — but backgrounding the app freezes the clock.
   - *(b) Idle-game.* Elapsed real time is simulated on return. You could come back to a
     dead ship after a weekend. Thematically superb, brutally punishing, and it makes the
     speed slider almost meaningless.

   **Proposal: (a).** It keeps the design intent (no stopping to think) without punishing
   someone whose phone rings. Worth noting what it implies: at the 8,760× cap, 300 game-years
   is **~5 real hours** of pure fast-forward — a *floor* on playthrough length, since real
   play sits well below max speed. That number is the actual justification for the speed cap,
   and it should be chosen deliberately rather than inherited from "1 year/minute sounds good".

8. **The signal feed at high speed.**
   The feed is the player's ambient awareness (§8) — but at 8,760× the ship generates
   thousands of lines per real minute. It becomes unreadable exactly when the player is
   relying on it most.

   **Proposal:** give every signal a **severity** — `chatter` / `info` / `warn` / `critical` —
   and let the speed slider raise the feed's floor. At high speed, chatter and info are
   suppressed and rolled into periodic digest lines ("*47 maintenance tasks completed,
   3 parts consumed*"); `warn` and `critical` always surface. This shares its plumbing with
   the snap-back rules in §2 — snap-back is just "a `critical` signal went unacknowledged
   for X game-hours" — and it gives the flavour text bank (§10) a natural home: chatter is
   what you read at 1× and never see at 8,760×, which makes slowing down feel *different*
   rather than just slower.

9. **Solar panels don't work in interstellar space.**
   §6 originally had "solar panels can be manufactured to supplement". Between stars there is
   no meaningful sunlight — for the ~298 middle years of a 300-year journey a solar array
   generates nothing. Options:
   - *(a) Replace with RTG banks.* Radioisotope generators work anywhere, and their output
     **decays over time** — a second ageing curve, thematically perfect for a ship slowly
     running down. Downside: no interesting spatial variation.
   - *(b) Keep solar, but only live at departure and arrival.* Makes the journey's first and
     last decades mechanically distinct — you arrive and the power situation suddenly eases,
     which is a lovely note to end on.
   - *(c) Handwave it.*

   **Provisionally took (a)** in the §6 numbers, because the emergency-margin role needed
   something that works mid-journey. **(b) isn't exclusive with it** and is worth adding on
   top — an arrival-phase power windfall would give the endgame a distinct texture. The
   catalogue's "Solar Array Control" is renamed "Aux Array Control" pending this.

---

## Appendix: Inspiration & References

- *Delta-V* by Daniel Suarez — asteroid mining, orbital mechanics
- Industrial IoT / SCADA interfaces — aesthetic and data model
- *FTL: Faster Than Light* — ship management under pressure
- *Dwarf Fortress* — deep simulation, text-driven interface
- `htop`, `tmux`, terminal UIs — visual language
