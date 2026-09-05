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

### What crew are actually for

Totalling the work the ship generates across the journey:

| Work | Crew-hours |
|------|-----------:|
| Maintenance tasks (13,000 × ~6 h, §4) | 78,000 |
| Fab job setups (~4,000 × 2 h, §7) | 8,000 |
| Drone prep and recovery (§6b) | 19,200 |
| Medical, hydroponics, everything else | 20,000 |
| **Total demand** | **125,200** |
| Supply — 7 crew × 8 h/day × 300 years | 6,132,000 |

**Crew are ~2% utilised.** Labour is not scarce and never will be, so the roster cannot be a
throughput mechanic. It's something better:

> **Crew are a latency resource, not a throughput resource.**

What matters is never *how much* work the crew can do — it's whether the right specialist is
**already awake** at the moment something breaks. Average load is 2%; a cascade failure wants
three engineers *simultaneously*, and unfreezing takes days.

So the roster is an **insurance premium**. Keeping eight people awake for the next twenty years
costs food, water, O₂, morale management and colonist-years, against a crisis that may not come.
Keeping four is cheap and leaves you exposed. That decision — *who do I keep awake, and for how
long?* — is the whole crew game, and it's a completely different shape from every other system
in this document.

Two knock-on effects worth stating:

- **Headcount is power-gated like everything else.** Crew eat, and food comes from Grow Beds at
  120 kW (§6). One grow bed installation feeds roughly ten people; an eleventh crew member means
  a second bed, and 120 kW you don't have.
- **Idle crew are not wasted crew.** They're the standing reserve. The feed should make idleness
  feel like readiness rather than inefficiency — this is where §10's crew chatter lives.

### Cryo Pool & Rotation
- **~200 people** in cryo storage — the full colony complement.
- **6-8 active crew** at any time.
- **Unfreezing** is expensive: costs medical consumables + the crew member spends a few days in medbay recovering before they can work.
- **Freezing** is cheap and instant — rotate crew freely, the cost gate is on waking them up.
- This creates a roster drafting mechanic: need a specialist? Wake them, but pay the price.

**Unfreezing costs medical supplies — which cost rare compounds** (§7). So crew are priced in
the same currency as electronics, fuel rods and RTGs. Every person you wake is an asset you
didn't repair.

### The colony is the labour pool

The 200 aren't cargo. They're the staffing budget, and it is finite.

A colony vessel carries people balanced for **founding a settlement**, not for maintaining a
starship, so ship-relevant specialists are a minority:

| Role | Aboard | Role-years available (~35 working years each) |
|------|-------:|----------------------------------------------:|
| Engineer | 30 | 1,050 |
| Technician | 25 | 875 |
| Medic | 20 | 700 |
| Botanist | 20 | 700 |
| **Pilot / Nav** | **15** | **525** |
| Generalist | 90 | 3,150 |

Filling 7 crew slots for 300 years costs **2,100 crew-years**. Against a specialist pool of
3,850, that's **55% utilisation if every slot is a specialist** — feasible, but you will feel
it, and the back half of the journey is staffed by whoever is left.

#### Ageing and rotation

Nobody lives 300 years. Cryo arrests ageing; being awake does not. A crew member wakes at ~30,
works ~35 years, and must be **refrozen before they age out** — which is why freezing is cheap
and instant. The colonist returns to cryo alive, just older.

So the real cost of crewing isn't death, it's **colonist-years burned**. Spread evenly, 2,100
crew-years across 200 people is ~10 years each: everyone serves a shift and arrives a decade
older. Lean on your best engineer for eighty years and you have spent her whole life.

This gives §1's outcome spectrum a second, quieter dimension. *200 alive, mean age 58* and
*180 alive, mean age 34* are both arrivals, and they found very different colonies. The ending
should say so.

#### Role extinction

Because the pools are small and unequal, **specific roles can run dry**, and that's the real
crew failure mode:

- **Pilots are the fragile one.** 525 role-years total — a single continuously-awake pilot
  consumes **57% of the entire pool**. Lose a few to drone accidents (§6b) and asteroid
  harvesting stops permanently. No pilots, no rare compounds, no ship.
- **No medics** means you cannot safely unfreeze anyone. The roster locks at whoever happens to
  be awake, and every subsequent death is permanent.

Neither is an instant loss. Both are slow, visible, and entirely the player's doing — which is
exactly the failure texture §1 asks for.

### Specialisations
| Role        | Strengths                              |
|-------------|----------------------------------------|
| Engineer    | Repairs, manufacturing                 |
| Botanist    | Hydroponics, food production           |
| Medic       | Treating injuries, managing cryo       |
| Pilot / Nav | Drone operations, asteroid intercepts  |
| Technician  | Electrical, life support               |
| Generalist  | Can do anything, but slower            |

#### Experience and cross-training — yes

Crew gain skill in the work they actually do. A generalist who performs two hundred repairs
becomes, functionally, an engineer.

- It's the **only mitigation for role extinction**: you can train replacements, but it takes
  years, and the early attempts are slow and dangerous (`crewFactor` in §4's accident formula).
- It rewards long-horizon play — wake a generalist *alongside* a specialist decades before you
  need them, and pay for the overlap in food, power and colonist-years.
- **Training dies with the shift.** Skill is attached to the person, and that person ages out.
  A treadmill, not a ratchet — consistent with §7's enhancement philosophy.

The player who is thinking fifty years ahead has something concrete to do about it. The one who
isn't discovers in year 200 that nobody left alive can fly a drone.

### Names, traits and relationships

**Names: yes, required.** The signal feed does not work without them. *"Okonkwo took the hull
repair"* is a story; *"crew member 4 took the hull repair"* is a log line.

**Traits: lightweight in v1.** Two or three per person, modifying stat drift and task
preference — *insomniac*, *steady hands*, *claustrophobic*. Enough to make crew distinguishable
without a personality system. Full personality is the §10 LLM future.

**Relationships: cheap and worth it.** A simple `close-to` link, formed by working the same
shifts over years. When someone dies, those linked to them take a happiness hit and their
chatter changes. Almost free to implement, and it's most of what makes a death land.

### Death

A crew death is the game's heaviest event and should be treated as one:

- **A prominent feed event**, not a status change — and the feed drops to `critical` severity,
  which under §2's snap-back rules pulls a frame-jacking player back to real time. *You do not
  get to fast-forward through someone dying.*
- **A permanent memorial entry** in the crew log: name, role, years served, cause, the task they
  were doing.
- **Happiness hits** for anyone `close-to` them.
- **Their skills are simply gone**, including any cross-training invested in them — the roster
  shrinks and the pool shrinks with it.
- **Named in the arrival narrative.** The ending should be able to count the dead by name.


### Crew Stats
| Stat       | Description                                      | Consequence of neglect          |
|------------|--------------------------------------------------|---------------------------------|
| Hunger     | Driven by food production pipeline               | Weakness → incapacitation → death |
| Sleep      | Needs scheduled rest periods                     | Errors → accidents              |
| Happiness  | Affected by conditions, deaths, workload         | Slower work → refusal → withdrawal |
| Health     | Injury/illness from accidents or environment     | Can't work → needs medical care |

**Withdrawal, not mutiny.** Mutiny belongs to a different genre — you are an AI custodian of
sleeping colonists, not a captain facing a crew with somewhere to go. The unhappiness ladder is
quieter and worse: work slows, then dangerous tasks get refused, and finally the crew member
**asks to be put back into cryo.**

That last step is a pressure valve with teeth. They're not dead and nothing is broken, but the
roster just lost a specialist and replacing them costs medical supplies — rare compounds — and
days of Medbay recovery. A player who grinds their crew doesn't face a rebellion; they face an
empty ship and a bill.

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

**The hierarchy is not just filing.** Facilities and Systems are **event participants**: they
hold counters over their children and emit derived signals of their own. That's what lets §5
keep every rule 1:1 — aggregation happens by walking up the tree, not by querying across it.

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
| **Drone Bay** | Drone Launcher | Med | Drones, water (propellant) | |
| | Drone Fabricator | Med | Metal parts, electronics | |
| | Docking Clamp | Med | Seals | |
| **Maintenance Corridor** | Hull Access Panel | High | Plating, seals, tools | |
| | Pressure Doors | High | Seals, sensors | |
| | Utility Conduits | Med | Various | |

*Plus a LifeSupportNode in every room (Med danger, needs filters/sensors).*

~32 active equipment pieces + ~4 passive + 10 LifeSupportNodes = ~46 total items.

<!-- "Solar Array Control" renamed "Aux Array Control", and Battery Bank / RTG Bank added,
     to match the generation model in §6 Energy. See Open Question 9. -->

### Buffers and Backpressure

**There is no ship-wide inventory.** Every room keeps its own stores, and **nothing moves
between rooms unless a crew member carries it** — which means a *delivery job*, which means it
can be automated, and which means it can jam.

```
room stores ──► input buffer ──► [ ASSET ] ──► output buffer ──► room stores
     ▲                                                                │
     └──────────── delivery job (crew) ◄──── another room's stores ◄───┘
```

Costed: ~1,480 delivery jobs across the voyage, about **11% more work** than the maintenance
load, taking ~0.07% of crew capacity. It spends the idle roster §3 identified rather than
overloading it, and it finally gives the Cargo Bay and the Loading Crane a job.

**Bulk deliveries need the Loading Crane**, which is a 30 kW intermittent load (§6). Small
consumables move by hand; raw material in the hundreds of units does not. That makes material
movement **power-gated**, and closes §7's death spiral one turn tighter:

> The reactor fails → there is no headroom → the crane can't run → ore can't leave the Cargo
> Bay → the smelter is idle → there is no refined metal → there are no parts → **to fix the
> reactor.**

Every rule in that chain fires correctly. The jam is not a broken automation, a missing crew
member, or an empty store — it is 612 units of ore sitting eleven days away from a machine that
needs it, in a ship that cannot spare 30 kW to carry it there.

Transport is a crew task, so it's automatable — but it can **jam**:

- **Output buffer full** → the asset cannot start its next cycle. It stalls, silently, at full
  health, with nothing broken.
- **Input buffer empty** → `duty:starved` (§4).

That is what turns a sequence of automations into a **chain**: a jam anywhere propagates
*backwards* up the pipeline. A hauling task nobody picks up stops production three steps
upstream, and the asset reporting the problem is not the asset that has it.

Backpressure is the single most important property for §5c's chained automations — without it,
production lines are just lists.

**Per-room stores are what make chains deep.** A consumable now has to be *made* somewhere and
*carried* somewhere else, so a single need spans rooms:

```
Life Support: filters low   → delivery job: fetch filters from Engineering
Engineering:  filters low   → make 60 filters
Engineering:  metal ore low → delivery job: fetch ore from Cargo Bay
```

Three rules, each trivially simple, and the chain is three deep. Jam the bottom one — nobody
picks up the ore delivery — and the smelter idles, the filters are never made, and Life Support
starves. Every rule fired correctly.

> **The room reporting the problem is not the room that has it.**

Other consequences worth keeping: a vented or lost room takes its stores with it, and the
storage caps in §6b now apply *per room* rather than to one global pool, which is a tighter
constraint and makes Cargo Bay overflow a genuine bottleneck during Act I.

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
- Every repair costs a little `maxCondition` (**refurbishment loss**), and the cost is
  **mostly proportional to how much wear it recovers**:

```
loss = 0.05 + 0.022 × (wear recovered)      + 2.0 for a FAULTED rebuild
```

**Why proportional, and not a flat cost per repair.** An earlier draft charged a flat ~0.5
per service. Simulating it (`packages/`) showed that inverts the whole premise: servicing at
75 recovers 25 points for the same price as servicing at 32 recovers 68, so **frequent
maintenance burned an asset's life four times faster than neglect**. Across full 300-year
runs the neglectful strategy genuinely beat the diligent one. The optimal way to play was to
ignore the ship.

Proportional loss removes that. Total ceiling erosion now tracks **total wear**, not visit
count, so every service threshold lands near the same ~56-year service life:

| Service at | Services/yr | Ceiling lost/yr | Service life |
|-----------:|------------:|----------------:|-------------:|
| 75 | 1.20 | 0.72 | 56 yr |
| 55 | 0.67 | 0.69 | 58 yr |
| 32 | 0.44 | 0.68 | 59 yr |

The small fixed overhead still discourages pointless fiddling, and a faulted rebuild carries a
real penalty on top. **The decision moves to where it belongs — fault risk.** Waiting saves
nothing on the ceiling and exposes the asset to the `AT_RISK` failure roll, so diligence is
rewarded by *avoided faults* rather than by the repair counter.

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

The core automation layer, and the thing the player actually plays. Inspired by IoT
event-driven patterns.

### Key Principle

> **Listen anywhere. Act only on yourself.**

An asset may watch events from *any* device on the ship, but the only thing it can act on is
**itself** — plus posting a task to the board (§5b). No asset ever reaches out and commands
another.

*(This sharpens an ambiguity in the earlier draft, which said "no cross-targeting" and then
offered to watch "another device on the ship". Cross-**listening** is fine and necessary —
cross-**acting** is what's forbidden.)*

Why it holds: automations stay locally readable. To understand why a pump turned on, you read
the pump's rules. Nothing else on the ship can have done it to it.

### Three tiers

Every rule is 1:1 — one source, one condition, one action. Complexity comes from **where** a
rule lives, not from making individual rules cleverer.

| Tier | Job | Complexity |
|------|-----|------------|
| **Asset** | React to its own state; post a task | Dumb, local, 1:1 |
| **Facility / System** | Aggregate its children, compose conditions, emit derived signals | **Where the player does clever work** |
| **Ship rules** | Snap-back (§2), speed, alert escalation | Global, few |

Ship rules are the one deliberate exception to "act on yourself" — they act on the *game*, not
on equipment. Keeping them small and separate is what stops the asset rule from eroding.

### Facilities are the aggregators

§4's hierarchy — Ship → Facility → System → Asset — is not just filing. **Facilities and systems
are event participants**, and this is what removes any need for set-queries or wildcard listeners.

A facility holds **counters over its children**, maintained by ordinary 1:1 listeners:

```
[GrowBed-3] → state:ripe      ─►  [Hydroponics] ripeCount.added
[GrowBed-3] → state:empty     ─►  [Hydroponics] ripeCount.removed
```

Because `Countable` is already a shared trait and `limitOver` / `limitUnder` already exist,
**aggregation needs no new primitives at all**:

| Want | Write |
|------|-------|
| "any bed ripe" | `limitOver(0)` on `Hydroponics.ripeCount` |
| "no bed ripe" | `limitUnder(1)` on `Hydroponics.ripeCount` |
| "five or more assets at risk" | `limitOver(5)` on `Ship.atRiskCount` |

No selector syntax, no wildcards, no query engine — and nothing that can't be built by tapping
through menus on a phone (§8).

**Composition lives here too.** A condition combining several inputs is computed **once**, at the
facility, and distributed as a plain event:

```
[Hydroponics]   maintains  plantable        ← the one place the AND lives
[GrowBed-1..6]  ON Hydroponics → plantable  ← six identical, dumb, 1:1 rules
```

Better than six beds each evaluating the same three-way condition: one place to author it, one
place to change it, and the beds stay stupid.

So the **Logic Core** (§7) isn't "make rules cleverer" — it's *author derived signals at the
facility level*. What you buy is an instrument you built, which then composes upward:
beds → Hydroponics → ship health. Player-built instruments stack; queries wouldn't.

**And they inherit their sensors' lies.** A counter maintained incrementally drifts if an event
drops — and §5 says worn sensors *do* drop events. Under a query model that would be a bug.
Here it's the theme: your Hydroponics panel reads 2 ripe when 3 are, and you find out by looking.

#### The cost: boilerplate

Six beds means six listeners; ten LifeSupportNodes means ten. That's the honest price of 1:1.

It's a **UI problem, not a semantic one.** A facility offers *one slot per child of type X*; the
player fills it once with a template and it expands into N real listeners, each still individually
visible, inspectable and overridable. No hidden magic, no new concepts.

### Events (things that happen)

**Shared traits:**
- `Toggleable` — emits `on` / `off`
- `Countable` — emits `added` / `removed`

**State events** (§4) — every active asset emits on band and duty change:
`state:worn` · `state:degraded` · `state:atRisk` · `state:faulted` · `state:destroyed`
`duty:starved` · `duty:unpowered` · `duty:offline`

**Device-specific** — unique per equipment type: `alarm:fire`, `asteroid:detected`,
`job:starved`, `sortie:lost`, `rod:seated`.

### Listeners (conditions)

The console starts deliberately primitive and is expanded by manufactured control hardware —
this is the progression ladder from §7.

| Listener | Fires when | Requires |
|----------|-----------|----------|
| `on` / `off` | A toggleable changes state | — |
| `limitUnder(n)` / `limitOver(n)` | A countable crosses a threshold | — |
| `stateEnters(band)` | An asset enters a §4 condition band | — |
| `and(...)` `or(...)` `not(...)` | Compound conditions | **Logic Core** |
| `every(interval)` / `after(delay)` | Time-based | **Scheduler Module** |
| *(extra slots per asset)* | — | **Signal Relay** |
| `projected(metric, horizon)` | A *derived* value crosses a line — e.g. "stock-out projected within 30 days" | **Telemetry Suite** |

`projected()` is the top of the ladder and by far the most valuable, because consumption rates
change over three centuries. A fixed `limitUnder(50)` that was right in year 20 is wrong by
year 200; "tell me when I have under 30 days left at the *current* burn rate" never goes stale.
Earning it is a real graduation.

### Triggers (actions)

**Self-actions:**

| Trigger | Effect |
|---------|--------|
| `turnOn` / `turnOff` | Duty state (§4) |
| `setPowerPriority(n)` | Reorders itself in the load-shed queue (§6) |
| `queueJob(recipe, qty)` | Standing orders on a fab asset (§7) |
| `vent` | LifeSupportNode empties its room |
| `request(amount)` | Countable draw |

**Board action:** `postTask(type, priority)` — front or back of queue (§5b).

**Feed action:** `emit(severity, message)` — the player writes their **own** alerts into the
signal feed, at a severity they choose (§2). This is worth calling out: the player is building
their own instrumentation, which is exactly the "you are the ship's AI" fantasy. A well-run
ship's feed is largely authored by its own AI.

**Examples:**

| Scenario | Event | Listener | Trigger |
|----------|-------|----------|---------|
| Fire suppression | FireAlarm → `alarm:fire` | LifeSupportNode listens | `vent` (self) |
| Consumable restock | Dispenser → `removed` | `limitUnder(10)` | `postTask("restock", front)` |
| Preventive maintenance | Asset → `state:atRisk` | self | `postTask("repair", front)` |
| Standing order | Inventory → `removed` | `limitUnder(reorder)` | `queueJob(seals, 20)` |
| Brownout response | Self → `duty:unpowered` | self | `emit(warn, "fabricator shed")` |
| Encounter prep | Bridge → `asteroid:detected` | Drone Fabricator | `queueJob(drone, 2)` |

### Building Automations (IFTTT-style)

From an equipment's detail pane:
1. See existing listeners listed, with last-fired time and fire count
2. **"Add listener"** → pick an event to watch (from self or any device on the ship)
3. Pick the condition — gated by what control hardware you've built
4. Pick the action (self-action, post task, or emit to feed)
5. If posting to board: choose front or end of queue priority

### Can automations fail? — yes, and this is load-bearing

If automations were perfectly reliable, the late game would be solved: wire it up once, jack to
maximum speed, and never look again. Something has to erode. But **random failure would be
unfair**, so the erosion has to be legible and preventable.

**The logic never fails. The senses do.**

Rule evaluation is software — you're the ship's AI, and you work. What degrades is the
**instrumentation feeding you**, because every sensor is an asset with a `condition` (§4). A
worn sensor doesn't stop; **it lies**, in the four ways real instruments lie:

| Failure | Behaviour | Consequence |
|---------|-----------|-------------|
| **Drift** | Reported value diverges from actual — a tank reads 40% at 22% | Thresholds fire late, or never |
| **Latency** | The event fires, but hours after the fact | Automations respond to a stale ship |
| **Dropout** | The event doesn't fire at all | Silent — the worst kind |
| **Chatter** | Spurious events fire | False alarms, thrashing rules, snap-backs at 3am |

This is the answer to the whole automation question:

> **You cannot automate your way out of maintaining the things that tell you what's happening.**

Neglecting sensors doesn't break your automations — it quietly *poisons* them, and every rule
built on top inherits the lie. It's also completely fair: a sensor's condition is visible on its
own detail pane like any other asset, so the information is always there. The player just has to
look.

And it produces the right endgame texture. By year 200 your rules are running on 40%-condition
instruments, and you can no longer entirely trust your own ship's telemetry. That's a far more
unsettling late game than equipment simply breaking faster.

**UI consequence:** values sourced from a degraded sensor should render marked — `47%?`, or
dimmed — so uncertainty is visible without being explained. Fits the CLI aesthetic exactly.

### The other failure: nobody comes

The quieter failure mode needs no broken hardware at all.

An automation posts a repair task. The task board takes it. **No engineer is awake**, so it sits
there. The automation worked perfectly and nothing happened.

This is the mechanism that makes §3's insurance premium bite — the cost of a thin roster isn't
paid in throughput, it's paid here, in tasks that are correctly identified and never done. So:

- The Task Board is itself a **system** (§4), so it carries counters like any other: backlog
  size per task type, and age of the oldest unclaimed task.
- Those make stale work a first-class **snap-back trigger** (§2):
  *`TaskBoard.oldestUnclaimed limitOver(40 days)` → drop speed.*
- A player frame-jacking through a decade with no engineer awake should be pulled back by their
  own rules, not discover the wreckage later.

### Living with automations

Over 300 years the player will accumulate dozens of rules across ~46 assets and will absolutely
lose track. The **Automation Console** (§8) is a diagnostic tool as much as an editor:

- Every rule lists **last-fired** and **fire count**.
- **Never fired** is suspicious — a dead rule, usually a threshold that can't be reached or a
  sensor that's dropped out. *"Last fired: 47 years ago."*
- **Firing constantly** is suspicious — thrash, usually chatter or a conflict.
- **Conflict detection**: two rules acting oppositely on one asset with overlapping bands will
  oscillate. The console should flag overlaps rather than silently letting a pump hammer itself
  to death — though letting the player *see* it happen first is the better teacher.

### Authoring and debugging

**Rules can be disabled without deleting.** A disabled rule keeps its place, its history and its
fire count in the console. This is the primary debugging tool — disable half your rules to find
which one is thrashing — and deleting to test would destroy the evidence you need.

**Rules are copyable across assets of a type.** "Apply to all LifeSupportNodes in this facility"
expands into ten **real, individually inspectable, individually overridable** rules. It is an
authoring shortcut, never a live binding — nothing hidden, nothing that changes behind your back.
This is the same mechanism as the facility per-child slot templates above.

---

## 5b. Task Board

The bridge between automated systems and human crew — and it runs **both ways**.

> **Jobs go down to the crew. Requests come back up.**

Same object, opposite direction. Crew post requests to the player: *put me back in cryo*
(§3 withdrawal), *don't roster me with Novak again* (§3 relationships), *I won't do that repair
on no sleep* (§10 refusal), *let me train under the engineer* (§3 cross-training), and
*somebody should look at the water recycler* — crew noticing what the automation missed.

**The player can decline any request, and declining costs morale.** That gives happiness the
mechanical teeth §3's stat table asked for and never got, and it delivers §10's crew-agency
design in v1 without needing an LLM: a request is just a task pointed the other way.

Ignored requests are kept on the record. *"Vasquez flagged the water gauge, four years ago"*
is a much better way to learn that instruments lie than an alert would have been.

- Equipment automations (or the player directly) **post tasks** to the task board.
- Crew members with an empty personal queue **pick tasks from the board**.
- The player can also manually assign tasks directly to a crew member's queue for urgent work.

### Board Pickup Order
1. **Specialisation match** — crew prefer tasks that fit their role (engineers grab repairs, botanists grab hydroponics work).
2. **Priority** — within matching tasks, higher priority first.
3. **FIFO** — ties broken by post order.

This rewards having the right crew awake and makes specialists feel distinct from generalists.

---

## 5c. Automation Cookbook

Worked examples. These double as **test cases** for whoever implements §5, and the failure
cases pin down what the console diagnostics have to catch.

### How chains form

There is no chaining primitive, and there shouldn't be. Because assets **listen anywhere and
act only on themselves** (§5), a chain assembles itself out of ordinary rules:

```
asset A acts on itself  ─►  which emits an event  ─►  asset B is listening  ─►  B acts on itself
```

Nothing commands anything. The pipeline is **emergent**, which means it can also silently come
apart — and that's the interesting part. Combined with buffers (§4), a chain has real hydraulics:
it fills, it stalls, and it applies backpressure upstream.

---

### Chain 1 — Hydroponics, end to end

The canonical chain, and the best place for a player to learn chaining because the consequences
are slow and legible.

**Stage 1 — keep fertiliser stocked** *(Fabricator, tier 0)*
```
[Fabricator]
  ON    Inventory.fertiliser → removed
  WHEN  limitUnder(40)
  DO    queueJob(fertiliser, 20)
```

**Stage 2 — plant when a bed frees up** *(facility composes, beds stay dumb)*

The facility computes plantability **once**; the six beds each carry one trivial rule.

```
[Hydroponics]                                  ← the only place the AND lives
  maintains  plantable = and( Inventory.seeds      limitOver(2),
                              Inventory.fertiliser limitOver(4),
                              Inventory.water      limitOver(20) )

[GrowBed-1..6]                                 ← six identical 1:1 rules
  ON    self → state:empty
  WHEN  Hydroponics.plantable
  DO    postTask("plant", back)
```

Change the planting threshold later and you change it in one place, not six.

**Stage 3 — harvest against the clock** *(tier 0)*
```
[GrowBed-1..6]
  ON    self → state:ripe
  DO    postTask("harvest", FRONT)      ← 8-day window, then it spoils
```

**Stage 4 — clear the output buffer** *(tier 0, and the one everyone forgets)*
```
[GrowBed-1..6]
  ON    self.outputBuffer → added
  WHEN  limitOver(80%)
  DO    postTask("haul to stores", front)
```

**Stage 5 — keep the galley fed** *(tier 0)*
```
[Food Dispenser]
  ON    self.inputBuffer → removed
  WHEN  limitUnder(20)
  DO    postTask("restock dispenser", back)
```

#### The trap: synchronised ripening

Stages 1-5 are individually correct, and together they will **starve the ship**.

Plant all six beds the day the fertiliser arrives, and all six ripen on the same day. Six
harvest tasks land on the board at once — and there is **one botanist**. She harvests two,
maybe three, inside the 8-day window. The rest spoil: seeds gone, fertiliser gone, water gone,
36 days of bed time gone, and a food gap 36 days wide with a 2% margin to absorb it.

Then the surviving beds free up together, replant together, and it happens again.

**Nothing is broken. Every rule fired correctly.** The player built a boom-bust oscillator out
of five reasonable automations, and diagnosing that is the actual game.

#### The fix: pipelining *(requires Scheduler Module)*

Stop planting on availability. Plant on a **phase offset**:

```
[GrowBed-1]  ON every(36 days, offset  0)   WHEN <stage-2 conditions>  DO postTask("plant", back)
[GrowBed-2]  ON every(36 days, offset  6)   ...
[GrowBed-3]  ON every(36 days, offset 12)   ...
[GrowBed-4]  ON every(36 days, offset 18)   ...
[GrowBed-5]  ON every(36 days, offset 24)   ...
[GrowBed-6]  ON every(36 days, offset 30)   ...
```

One harvest every six days, forever, one botanist, no spoilage. The player has discovered
**pipelining** — and the Scheduler Module stops being a convenience unlock and becomes the thing
that fixed their famine.

It's still brittle: miss one planting for want of fertiliser and that bed idles a whole cycle
while its slot marches on. The mature version adds a catch-up rule, which is where the Logic
Core earns its keep:

```
[Hydroponics]                                  ← the facility already counts this
  maintains  ripeCount        (GrowBed-N → state:ripe  ⇒ added
                               GrowBed-N → state:empty ⇒ removed)

[GrowBed-N]                                    ← recover a missed slot without re-synchronising
  ON    self → state:empty
  WHEN  and( self.idleFor after(8 days),
             Hydroponics.ripeCount limitUnder(1) )
  DO    postTask("plant", back)
```

`limitUnder(1)` on the facility counter *is* "no bed is ripe" — no wildcard, no set query, just a
counter and a threshold the player already understands.

#### Don't forget the seed crop *(requires Telemetry Suite)*

```
[Seed Vault]
  ON    projected(seeds, 20 years)
  DO    emit(warn, "seed vault trending to exhaustion") + postTask("schedule seed crop", back)
```

Nothing else in the game warns about this. The vault drains over *centuries*, so no threshold
alarm set in year 20 is meaningful, and by the time `limitUnder()` fires it is far too late to
grow the seeds back. This is the clearest case in the design for why `projected()` is the top
of the ladder.

#### Where this chain breaks

| Break | Symptom | Real cause |
|-------|---------|------------|
| No botanist awake | Beds sit `empty` and `ripe` simultaneously | §3 roster latency |
| Fertiliser starved | Beds never plant | Chemical compounds went to seals/medicine (§7) |
| Power brownout | Growth stretches, harvests drift late | Grow Beds are `dimmable` (§6) |
| Output buffer full | Bed can't replant **after a successful harvest** | Nobody hauling — §4 backpressure |
| Ripe + no harvester | Spoilage | Compounding: seeds, fertiliser, water, and 36 days |
| Seed crop forgotten | *Nothing, for ~100 years* | Then irreversible |

Note the fourth row. A bed that harvested perfectly can still stall, because the failure is
**downstream** of it. The asset reporting the problem is not the asset that has it.

---

### Chain 2 — The encounter (a burst pipeline)

Hydroponics is cyclic. This one fires once every three years and has a hard deadline.

```
[Drone Fabricator]                             ← 1. build ahead of the window
  ON    Bridge → asteroid:detected
  WHEN  and( Inventory.drones limitUnder(6), Inventory.rareCompounds limitOver(80) )
  DO    queueJob(drone, 2)

[Smelter]                                      ← 2. bank propellant before ops start
  ON    Bridge → asteroid:detected
  WHEN  Inventory.water limitUnder(400)
  DO    queueJob(meltIce, 40)

[Medbay / Cryo Control]                        ← 3. wake a pilot, allowing recovery time
  ON    Bridge → asteroid:detected
  WHEN  and( CrewRoster.pilotsAwake limitUnder(1), MissionProfile.window after(90 days) )
  DO    postTask("unfreeze pilot", front)

[Fabricator]                                   ← 4. stand down: the launcher needs the power
  ON    DroneBay → window:open
  DO    setPowerPriority(2)

[Fabricator]                                   ← 5. and come back up
  ON    DroneBay → window:close
  DO    setPowerPriority(7)
```

Step 3 is the one with teeth. Unfreezing costs medical supplies and days of Medbay recovery, so
the rule has to fire *early* — `window after(90 days)` — or the pilot is still convalescing when
the Δv minimum passes. **A correct automation that fires too late is indistinguishable from no
automation.**

Steps 4-5 are the player automating their own power reallocation, which is the §6 harvest/industry
alternation expressed as two rules.

---

### The rules you start with

The ship does not launch empty. The departure crew left **13 standing rules** behind — enough
that it runs itself on day one, with the whole maintenance layer conspicuously absent.

Two constraints shape the set, and both are diegetic:

- **They can only use tier-0 listeners.** No Logic Core, no Scheduler aboard at launch (§7), so
  every inherited rule is a single condition with no guard and no sense of time.
- **They were written for a full ship** — eight crew, Act I abundance, and instruments that
  still told the truth.

| # | Rule | What it does |
|---|------|--------------|
| **Deliveries** | | |
| 1 | Food to Quarters | Quarters food below 40 → fetch 60 from Hydroponics |
| 2 | Filters to Life Support | below 10 → fetch 40 from Engineering |
| 3 | Water to Hydroponics | below 200 → fetch 400 from Life Support |
| 4 | Fertiliser to Hydroponics | below 20 → fetch 40 from Engineering |
| 5 | Ore to Engineering | below 100 → fetch 300 from Cargo Bay |
| 6 | Seals to Maintenance | below 10 → fetch 20 from Engineering |
| 7 | Medicine to Medbay | below 10 → fetch 20 from Engineering |
| **Production** | | |
| 8 | Make filters | Engineering stock below 20 → make 60 |
| 9 | Make seals | below 30 → make 60 |
| 10 | Replant a bed | Bed empty → post a planting job |
| **Safety and upkeep** | | |
| 11 | Fire | Alarm → raise the alert, post a response job. **Does not vent.** |
| 12 | Reactor service | Reactor starts failing → post a repair job, top of the list |
| 13 | Water restock | Life Support water below 500 → post a restock job |

#### The set is the tutorial, because it goes wrong slowly

Nothing here is badly written. It all works on day one. It comes apart because **the ship
changes and the rules cannot**, and each failure teaches one thing at the moment it bites:

| When | What happens | What it teaches |
|------|--------------|-----------------|
| Hour one | Everything runs | What a rule looks like, by reading working ones |
| ~y10-40 | Thresholds sized for eight crew are wrong for five | Rules are yours to maintain, not furniture |
| **~y40** | **A famine interrupts planting; beds fall into phase and food goes boom-bust** | Pipelining — and you need the Scheduler Module |
| ~y100 | A worn gauge kills rule 13 silently | Instruments lie (§5) |
| Always | **None of the 46 assets have a maintenance rule** | The core loop is yours to build |

The grow beds deserve the detail, because it is the best of these. The ship launches with its
six beds **already out of phase** — planted on different days before departure — so rule 10
*preserves* a working stagger indefinitely. It only collapses when a planting is missed for
want of fertiliser: two beds sync, then three, and the phase never recovers on its own.

So the player gets forty good years, one bad harvest, and a permanent boom-bust they have to
diagnose. The trap is inherited; the fix (§5c, phase offsets) has to be earned.

Rule 11 is deliberately the **safe, slow** version — it raises the alarm rather than venting,
because venting needs an occupancy guard and the Logic Core to express it. The player adds
venting themselves later, and the interlock lesson is theirs to learn rather than inherited.

Rule 12 is the single maintenance rule aboard, on the one asset that kills you fastest. It is
there as a **worked example to copy** — the shape of the thing the player must now do 45 more
times.

<!-- TODO: Should the inherited rules carry authorship in the UI ("set by Marchetti, y0")?
     Cheap, and it makes them feel like a legacy rather than a default. -->

### Failure gallery

What the Automation Console exists to surface.

**The dead rule** — perfectly good logic, poisoned input.
```
[Water Recycler]
  ON  Inventory.water → removed   WHEN limitUnder(500)   DO postTask("restock", front)
  ── last fired: 47 years ago ──
```
The water sensor drifted (§5): reports 900, actual 300. The console flags it; the sensor's own
detail pane reads 22% condition. The information was always there.

**The thrash** — a 1° deadband on a drifting, laggy sensor.
```
[LSN-Cargo]  A: ON self.temp limitUnder(15)  DO turnOn
             B: ON self.temp limitOver(16)   DO turnOff
  ── fired 40,118 times ──
```
The node hammers itself on and off, ageing at full `dutyFactor` for nothing. Fix: widen the
deadband.

**The one that should chill** — everything worked.
```
[Reactor Core]
  ON  self → state:atRisk   DO postTask("service", front)
  ── fired 34 times · oldest unclaimed: 1,847 days ──
```
Every rule fired correctly. No engineer has been awake for five years.

**The interlock nobody adds until it's too late.** The naive fire response vents whatever room
is burning — including one with people in it:
```
[LSN-Quarters]  A: ON FireAlarm.Quarters → alarm:fire
                   WHEN and( on, not(Quarters.occupied) )   DO vent (self)
                B: ON FireAlarm.Quarters → alarm:fire
                   WHEN and( on, Quarters.occupied )
                   DO emit(critical, "fire in occupied Quarters") + postTask("fire response", front)
```
The Logic Core isn't a convenience tier. It's the tier where you stop killing your own crew.

#### Hand-author the offsets — but show the timeline

**No stagger button.** Pipelining is the insight the player earns by starving once; a one-tap fix
deletes the discovery that makes the Scheduler Module feel like a graduation.

**But the console shows a cycle timeline** — six beds plotted across 36 days, with overlapping
harvest windows highlighted. The player sees six bars stacked on the same day and understands
immediately, then fixes it themselves.

Diagnose, don't fix. It's the same principle as letting a thrashing rule run visibly before
flagging it.

### Idea — surface a filtered cookbook in-game

This section could double as **player-facing content**: an in-fiction reference the ship's AI
consults, styled as archived mission documentation rather than a tutorial.

Filtering, at minimum by **what the player can actually build** — no `projected()` recipes before
the Telemetry Suite exists — and possibly by current ship state, so the entries offered relate to
systems they're actually running.

**The tension to resolve first:** §5c's most valuable entries are the ones the player is meant to
*discover*. Handing over the pipelining fix would do exactly the damage that argued against a
stagger button — diagnose, don't fix. So the filter probably isn't only "what you've unlocked";
some recipes may need to stay out of the book entirely, or only appear **after** the player has
hit the problem they solve.

Worth deciding alongside onboarding (Open Question 4), since a filtered cookbook is a plausible
answer to "how does the player learn the systems" that costs no separate tutorial.


---

## 6. Resources & Economy

### Raw Materials (from asteroids)

Sourced via **drone harvesting** — see **§6b** for the encounter model, object classes and
yields. Asteroids are **rare** (roughly one every three years), so stockpiling and rationing
are core gameplay.

- Reference: *Delta-V* by Daniel Suarez for hard-sci-fi asteroid mining.

| Raw Material     | Refined Into           | Used For                          |
|------------------|------------------------|-----------------------------------|
| Water ice        | Water                  | Drinking, hydroponics, O₂, **drone propellant** |
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

FOOD (Hydroponics) — see "Grow Bed Cycle" below
  2 Seeds + 4 Fertiliser + 20 Water + Power → 155 Food + 1.8 Seeds   (36 days)
  Crop types: nutrition, medicinal, morale (coffee?)

LIFE SUPPORT (continuous consumption)
  Water       → O₂ (electrolysis) + drinking water
  Power       → atmosphere regulation, heating
  Filters     → air quality (consumable, manufactured from chemical compounds)
```

### Recycling
- Broken/replaced equipment can be **scrapped** back into raw materials at a loss.
- Gives value to failed parts rather than just discarding them.

### Grow Bed Cycle

**Grow Beds are six individual bed assets**, not one machine. That's deliberate: six beds on
independent cycles is what makes staggering possible, and staggering is a real player skill
(§5c).

| State | Meaning |
|-------|---------|
| `empty` | Ready to plant |
| `growing` | ~36 days at full power — **stretches when dimmed** (§6 load shedding) |
| `ripe` | Harvestable. **~8 day window.** |
| `spoiled` | Missed the window. Crop lost, bed needs clearing before replanting. |

Planting and harvesting are both **crew tasks** needing a botanist — so hydroponics is directly
exposed to §3's roster latency. No botanist awake, no food, however healthy the beds are.

| | |
|---|---|
| Planting cost | 2 seeds + 4 fertiliser + 20 water |
| Harvest yield | **155 food** + 1.8 seeds |
| Feeds | ~8 crew, at ~2% margin across the journey |

**The margin is deliberately thin.** One spoiled crop is felt immediately — there is no slack to
absorb a missed harvest.

### Seed Bank

The seed vault is finite, and a harvest returns only **90%** of the seeds it consumed. Left
alone, hydroponics slowly starves itself — over 300 years the drift is ~3,500 seeds, far more
than any plausible starting stock.

The fix is a decision the player has to keep remembering:

- A **seed crop** yields **6 seeds and no food**.
- Running roughly **one planting in twenty** as a seed crop nets the vault slightly positive.

So every twentieth harvest is deliberately sacrificed. Forget for a few decades and nothing
whatsoever appears to be wrong — until the vault runs dry a century later and the colony
starves in a way that cannot be repaired. A slow-burn consequence with no alarm attached to it,
which is exactly what `projected()` (§5) exists for.

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
(1,000 kW) output. The ship departs with **320 rods** against a 300-year journey.

Burn depends on two things, and the second one is the point:

```
rods/year = (delivered kW / 1000) ÷ efficiency
efficiency = 0.65 + 0.35 × (condition / 100)
```

**A worn reactor is weaker *and* thirstier.** Heat transfer degrades, more energy leaves as
waste, and it takes more fuel to deliver each kilowatt.

That second term fixes a perverse incentive. Burn scaled to delivered power alone means a
failing reactor burns *less* fuel — 0.89 rod/yr healthy against 0.70 at 30% condition — so
neglect extended your range. With efficiency in the formula, neglect costs fuel instead:

| Reactor kept at | Rods needed over 300 years | Against 320 |
|-----------------|---------------------------:|-------------|
| ~80% | 287 | 33 spare |
| ~60% | 310 | 10 spare |
| **~40%** | **338** | **short by 18** |
| ~30% | 354 | short by 34 |

So **fuel is not a separate resource to manage — it is a consequence of maintenance.** Keep the
reactor serviced and 320 rods is comfortable. Let it slide and you arrive out of fuel, having
watched a number tick down for two centuries without understanding why it was falling faster
than it should.

Power is also *not free even when you have headroom*: running the smelter around the clock
spends journey margin.

**The escape hatch, and its catch.** More rods can be fabricated from **rare compounds** (12 each,
plus 2 metal parts, §7) — so running low is recoverable, at the cost of the scarcest thing aboard.
But the Fabricator draws 100 kW, and *the reactor is where 100 kW comes from*. Once the rods run
out there is no power to make more.

> **The point of no return is passed some years before the count reaches zero.**

Which is the honest shape of the whole game in miniature: the failure is never the moment the
number hits nothing. It is the earlier, quieter moment when you still had everything you needed
to prevent it.

Every rod inserted is a signal-feed event and a natural milestone marker for §10
("*rod 47 seated — 273 remaining*").

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
| Fuel exhausted | Reactor stops. Rods **can** still be made (12 rare compounds each, §7) — but the Fabricator needs 100 kW, and the reactor was the 100 kW. In practice terminal, because the point of no return is passed some years *before* the count reaches zero. |
| Cascade brownout | Condition damage across all active assets |

#### Battery bank — 3,500 kWh

Sized so that a SCRAM presents the player with one clean, horrible choice:

| Load held | Draw | Endurance |
|-----------|------|-----------|
| Full critical, **colony alive** | 575 kW | **6.1 hours** |
| Cryo banks shed, **colony dead** | 175 kW | **20 hours** |

Six hours to restart a reactor with everyone still breathing, or twenty by killing 200 people.
The entire dilemma falls out of a single capacity figure.

Recharge is capped at **50 kW** and priority-managed like any other load, so refilling after a
SCRAM takes ~70 hours and competes with everything else. The ship is at its most fragile
immediately *after* the crisis, not during it.

#### RTG cost — the crew/colony asymmetry

At 12 kW and **6 rare compounds** each:

| To cover | RTGs | Cost | In fuel rods |
|----------|------|------|--------------|
| Crew-critical load (175 kW) | 15 | 90 rare compounds | 7.5 rods |
| Everything, including cryo (575 kW) | 48 | 288 rare compounds | 24 rods |

So the answer to "should the emergency margin hurt?" is **yes, and specifically here**:

> **RTGs can keep the crew alive indefinitely. They can never keep the colony alive.**

A permanent reactor loss is therefore survivable for the people awake and terminal for the 200
asleep. That asymmetry is worth more than any amount of tuning — and RTG output decays ~0.8%/year
(half-life ~86 years), so even the crew's lifeline is a treadmill, not a solution.

#### Coolant — keep it, as an incident, not a drain

The §4 catalogue lists coolant on the Reactor Core. Keep it, but as a **closed loop with makeup
losses** rather than a steady consumable:

- Normal operation draws ~0.5 chemical compounds/year. Negligible bookkeeping.
- A **coolant leak** is a distinct failure event: dumps 20-40 units at once and forces an
  immediate SCRAM until repaired.

That buys a specific, dramatic failure mode for almost no ongoing overhead — which is the right
trade for a consumable that would otherwise just be a second fuel counter.

---

## 6b. Asteroids & Drone Harvesting

The ship's only source of new matter, and the input the whole §7 economy is starved of.

### The constraint everything follows from

**The ship cannot stop, slow down, or manoeuvre.** It is on a ballistic interstellar cruise
and its delta-v budget is reserved — entirely — for deceleration at the destination. Spending
any of it mid-journey means arriving too fast to stop.

So the ship never intercepts anything. **The drones do.** They carry the delta-v, they match
velocity with the object, they mine, and they burn back to a ship that has continued on
without them the whole time. Every design consequence below falls out of that one fact.

### Encounter lifecycle

```
DETECT ──────► WINDOW OPENS ──────► SORTIES ──────► WINDOW CLOSES
  │                  │                  │                 │
  6-18 months     Δv cost falls     drones round-trip   receding at
  lead time       to a minimum      until it shuts      cruise velocity
                  then rises                            — gone forever
```

Objects are detected **6-18 months ahead** by the Nav Computer and Comms Array. That lead
time is the player's entire preparation budget: build drones, stock propellant, wake a pilot.

### The launch window is a cost curve, not a gate

Δv required for a drone to intercept *and return* falls as the ship closes on the object,
bottoms out near closest approach, then climbs steeply as the object begins receding at
cruise velocity.

| Launch timing | Δv cost | Risk |
|---------------|---------|------|
| Early | High — the drone burns fuel chasing | Safe but expensive; fewer sorties affordable |
| **At the minimum** | Lowest | Optimal — but you must be *ready* |
| Late | Rises steeply | Sorties fail to return; eventually impossible |

So the window is a **decision with a shape**, not a binary in-range flag. Launching early
wastes propellant you need for later sorties; waiting for the optimum is efficient but
worthless if your drones aren't built and fuelled when it arrives. Preparation is the skill.

### Object classes

| Class | Freq | Water ice | Volatiles | Silicates | Metal ore | **Rare elements** |
|-------|------|-----------|-----------|-----------|-----------|-------------------|
| **C-type** (carbonaceous) | 35% | 45% | 35% | 15% | 5% | — |
| **S-type** (silicaceous) | 30% | 10% | 7% | 45% | 35% | 3% |
| **M-type** (metallic) | 20% | 2% | 5% | 15% | 60% | **18%** |
| **Cometary fragment** | 10% | 65% | 30% | 5% | — | — |
| **Exotic** (differentiated) | 5% | — | 10% | 20% | 25% | **45%** |

Rare elements — the §7 choke point — come almost entirely from **M-types and Exotics**,
a quarter of all encounters between them. The other three quarters look, at first glance,
like water and metal you were never short of.

They aren't. See *Propellant* below: the boring rocks are what pay for the valuable ones.

### Propellant — harvesting water costs water

**Drone propellant is water**, used as reaction mass. It is thrown overboard on every sortie
and **never recovered** — unlike the ship's internal water, which the Water Recycler keeps in
a near-closed loop. Drone operations are the ship's one permanent water sink.

At a nominal **6 water per sortie** against a 40-unit haul:

| Class | Water ice / sortie | Water gained | **Net** |
|-------|--------------------|--------------|---------|
| Cometary fragment | 26.0 | 23.4 | **+17.4** |
| C-type | 18.0 | 16.2 | **+10.2** |
| S-type | 4.0 | 3.6 | −2.4 |
| M-type | 0.8 | 0.7 | **−5.3** |
| Exotic | — | — | **−6.0** |

Journey total across ~100 encounters: **≈ +7,760 water** — net positive, but *only* because
comets and C-types subsidise everything else.

Which is the real shape of the encounter table:

> **Mining the rocks you need costs you the water you get from the rocks you don't.**

The rare-bearing objects are water-poor almost by definition, so every M-type and Exotic
sortie runs the tanks down. The 75% of "boring" encounters are the fuel supply for the 25%
that break the famine. Skip them for a decade and the fleet grounds itself — not for want of
drones, but for want of anything to throw out of the back of them.

### Harvest throughput — the tuning spine

The window limits **how much you can take**, not whether you can take it. A rich object you
can only partially strip before it recedes is the normal case.

```
haul per encounter = drones × sorties per window × capacity per sortie
                   = drones × ~4 × 40 units
```

Against §7's requirement of **~6,600 rare elements** over ~100 encounters:

| Fleet | Units / encounter | Rare / encounter | Rare over journey | Verdict |
|-------|-------------------|------------------|-------------------|---------|
| 4 drones | 640 | 43 | 4,320 | **34% short** — cannibalising, losing ground |
| **6 drones** | 960 | 65 | 6,480 | **Break-even.** No margin for losses. |
| 8 drones | 1,280 | 86 | 8,640 | +31% surplus — room to build enhancements |

Metal ore runs comfortable at every fleet size (~24,500 supplied against ~15,700 demanded).
That asymmetry is deliberate: **you are never short of metal and always short of rares.**

### The drones themselves

A drone is **mostly propellant tank and engine**, with a mining head and a small cargo bay
bolted on. That's what sets the 40-unit capacity: every unit hauled back is mass that had to
be accelerated *and* decelerated.

So **capacity trades against Δv**. 40 units is the nominal for a clean intercept; a marginal
object — launched off-optimum, or a hard velocity match — yields *less per sortie*, not merely
fewer sorties. Object choice is richer than "can I reach it".

#### A sortie, phase by phase

| Phase | Duration | Crew |
|-------|----------|------|
| **Prep** — load propellant, diagnostics, flight plan | ~4 h | **Pilot** |
| **Outbound** — matching burn | 20-60 h | Autonomous |
| **On-station** — extraction | 30-80 h | Autonomous |
| **Return** — burn back to the receding ship | 20-60 h | Autonomous |
| **Recovery** — capture on the Docking Clamp, unload to Cargo Bay | ~4 h | **Pilot** |

80-200 h end to end (3-8 days), which is where "~4 sorties per window" comes from.

**A pilot is needed only at the two ends**, not through the cruise. So one pilot *can* run six
drones by staggering launches — but staggered launches can't all hit the Δv minimum together.

> **Fleet throughput is capped by pilot count, not drone count.**

Waking a second pilot is therefore a real decision with a real price (§3: medical consumables,
plus recovery days in the Medbay before they can work).

#### Drones are individual assets

Each drone is its own entity with `condition`, `maxCondition` and a sortie history — `DRN-04`,
not "drone #4 of 6". This costs nothing to model, because §4's asset system already does the
work; a drone is simply an asset that happens to be mobile. What it buys:

- Send the sound drone on the dangerous sortie and hold the worn one back — a real decision.
- Losses arrive as **events**, not a decrement. *"DRN-04 did not return."*
- Per-unit ageing is visible, so the fleet reads as a fleet.

Between encounters they idle for ~3 years, and §4 already handles this with no special case:
`dutyFactor` is 0.0 when `OFFLINE`, so a **mothballed drone barely ages**. Stowing the fleet
between windows is a genuine, rewarded decision rather than a formality.

### The fleet is the investment, and it bootstraps badly

A drone costs **8 metal parts + 6 electronics + 2 seals** (§7) — and those 6 electronics are
**6 rare compounds**. Expanding the fleet spends exactly the resource the fleet exists to
collect.

- Early game: 6 drones is break-even, so any loss puts you underwater.
- Losing a drone costs twice — the haul it would have carried, and the rares to replace it.
- Drones are **assets** (§4): they age, they need servicing, and a worn drone fails more often.
  The fleet adds to the maintenance burden it exists to fund.

### Sortie risk and the aggressiveness dial

Per-sortie failure chance rises with object class hazard (M-types are dense and rough),
drone `condition`, pilot skill, and how hard the margins are being pushed.

The player sets **sortie aggressiveness** per encounter:

| Setting | Propellant margin | Sorties per window | Failure risk |
|---------|-------------------|--------------------|--------------|
| Conservative | Wide | Fewer | Low |
| Standard | Nominal | Baseline (~4) | Moderate |
| Aggressive | Tight | More | High |

A per-encounter risk dial that maps directly onto the game's central theme: take the safe
haul now, or push for the one that gets you out of the hole.

**Failure is graded, not a coin flip.** Most failed sorties cost the *window*, not the drone:

| Outcome | Cost |
|---------|------|
| **Partial haul** — aborted early | Lost tonnage only |
| **Stranded** — returns dry, needs refuelling before it can fly again | Time: sorties lost inside the window |
| **Damaged** — returns with a heavy `condition` / `maxCondition` hit (§4) | Repair burden and a shortened service life |
| **Lost** — did not return | Total, plus the 6 rare compounds to rebuild |

Keeping most failures window-costly rather than fatal is what extends §1's "degrades
gracefully" promise down to the scale of a single encounter.

### Sensors decide what you know

Composition is an **estimate with error bars** until a drone actually arrives. The estimate
narrows as the ship closes, and its quality depends on **Nav Computer** and **Comms Array**
condition (§4).

- Degraded sensors → shorter lead time and wider error bars.
- The player commits a fleet to an object that *might* be Exotic and might be another C-type.
- Neglecting the Bridge means flying blind through the encounters you can't afford to misjudge.

This finally gives the Bridge equipment real mechanical work — until now the Nav Computer and
Comms Array were power draws with no job.

### Encounter spacing — the famine structure

How are ~100 encounters distributed across 300 years? Four candidates:

| Model | Verdict |
|-------|---------|
| **Uniform** — one every ~3 years | **Rejected.** Predictable supply makes stockpiling trivial: hold a three-year buffer forever and you're safe. Kills the rationing the design is built on. |
| **Poisson** — memoryless, mean 3 years | **Rejected.** Clusters and droughts emerge for free, but memorylessly: a 12-year gap can begin at any moment with no warning. Unfair rather than tragic, and unplannable by construction. |
| **Authored** — hand-placed famines | Workable but scripted, and it only works once per player. |
| **Route-shaped** — density follows what the ship is flying through | **Take this.** |

#### The route is the answer

Interstellar space is empty. A hundred encounters can't just happen — so the ship's course was
**chosen before launch to thread them**: the home system's outer debris on the way out,
catalogued rogue objects along the way, and the destination's outer debris on approach.

That's physically honest, and it produces a three-act structure for free:

| Act | Years | Encounters | Character |
|-----|-------|------------|-----------|
| **I — Departure belt** | 0-50 | ~30, and **rich** | Abundance. Big, well-surveyed objects at low Δv. |
| **II — The Long Dark** | 50-260 | ~40 across 210 years | Famine. Gaps of 10-20 years. The game. |
| **III — Arrival debris** | 260-300 | ~30 | Abundance returns — possibly too late to matter. |

Why this is the right shape:

- **The famine coincides with peak equipment decay.** §4's ageing curve bites hardest in the
  middle centuries, exactly when §6b stops delivering. Two systems, one curve, no coordination
  needed.
- **Act I becomes the real difficulty test.** Abundance you must convert into stockpile. A
  player who treats the first fifty years casually is dead by year 150 and won't understand why
  until it's far too late to fix — which is precisely the lesson §7 says the player will only
  learn by nearly losing.
- **Act III is thematically perfect.** You sail into plenty with a wrecked ship and a third of
  your colonists gone. The material arrives; the years to use it don't.
- It **dovetails with Open Question 9(b)** — solar live only at departure and arrival. Power and
  materials both ease at the ends and starve in the middle. Same silhouette, two systems.

#### Act I has to be rich, and the maths says how rich

Demand is **continuous** — equipment ages on a clock, not on encounters — at ~22 rare elements
per year. Supply is lumpy. So Act II runs a structural deficit that must be pre-funded.

With uniform richness the structure is simply **unsurvivable**:

| Act | Supply | Demand | Net | Banked |
|-----|--------|--------|-----|--------|
| I (40 y, 35 enc) | 2,275 | 879 | +1,396 | +1,396 |
| II (220 y, 25 enc) | 1,625 | 4,834 | −3,209 | **−1,813 — dead** |

Act I objects therefore need to yield **~2.5× a mid-journey encounter**, which the fiction
already justifies: belt objects are large, well-surveyed, and cheap to reach — and per §6b's
capacity/Δv trade, **low-Δv intercepts haul more per sortie automatically.** No special case.

| Act | Supply | Demand | Net | Banked |
|-----|--------|--------|-----|--------|
| I (50 y, 30 enc, ×2.5) | 4,875 | 1,099 | +3,776 | +3,776 |
| II (210 y, 40 enc) | 2,600 | 4,614 | −2,014 | +1,762 |
| III (40 y, 30 enc) | 1,950 | 879 | +1,071 | +2,833 |

A diligent player reaches Act III with a surplus. A careless one is underwater somewhere around
year 150, and the §1 outcome tier they reach is essentially **set by how well they played Act I**.

#### Known schedule, unknown yield

Because the route was planned, the player gets the **mission profile from hour one**: a
catalogue of predicted encounters with dates. This is the single most important choice in the
model —

> **The famine is planned for, not sprung.**

The tragedy is failing to prepare for a drought you could see coming, which is a far better
story than being ambushed by a random number. It also gives the player something to *do* with
Act I's abundance besides hoard.

But composition estimates are **pre-launch guesses**, refined only as the ship closes (§6b,
*Sensors decide what you know*). So: **you know when, roughly what, and never exactly.**

#### Uncatalogued objects — the lifeline

Layered on top: ~30% of encounters are **not** in the catalogue. Rogue bodies the pre-launch
survey missed, detected only by the ship's own sensors during the crossing.

- They are the only good news available during the Long Dark.
- Detection is gated by **Nav Computer and Comms Array condition** (§4).
- So a player who let the Bridge rot **never learns the lifeline was there.** No alert, no
  missed-window message — just silence, and a rock passing in the dark.

That gives the Bridge equipment its second job, and it's a crueller one than the first.

#### Storage — should abundance be cappable?

Open. The Cargo Bay's Storage Racks are passive (§4), so raw material could in principle be
banked without limit — but an uncapped hoard makes Act I a pure "grab everything" exercise.

**Proposal: cap raw material storage, leave finished goods generous.** Then Act I isn't
*hoard*, it's **process** — the player must run the smelter and fabricator hard during the one
period they have surplus power to do it, converting raw rock into components before the racks
overflow. That puts the manufacturing system to work during the abundance phase instead of
leaving it idle, and makes the Act I→II transition a genuine logistics problem rather than a
storage-number check.

#### Storage caps — raw is tight, finished is generous

| Tier | Cap per type | Rationale |
|------|-------------:|-----------|
| **Raw materials** | **1,500** | About one exceptional Act I haul. Overflow if you haven't refined the last one. |
| **Refined materials** | 4,000 | Enough to bank the ~2,000 rare-compound Act II deficit. |
| **Components & finished goods** | 20,000 | This is what you're *meant* to stockpile. |

The ratio is the whole point: **you cannot hoard rock.** An Act I M-type yields ~1,440 metal ore
against a 1,500 cap, so a second encounter arriving before you've smelted the first one overflows.

**Overflow applies backpressure** exactly as §4 describes — drones can't unload, sorties stall,
and you lose window time. The punishment for not processing is losing the next haul, not a
warning message.

And the squeeze is *power*, not time: you have ~1.7 years between Act I encounters, which is
ample, but the Smelter's 140 kW never fits in headroom (§6). Act I is spent deciding what to
switch off in order to refine.

#### Famine severity — yes, and make it the difficulty setting

It's the cleanest single lever in the design: it distorts no other system, and it's **diegetic** —
it's simply how much time the mission planners had to survey the route before launch.

| Route | Act II encounters | Character |
|-------|------------------:|-----------|
| **Surveyed** (easy) | ~55, richer | The Long Dark is uncomfortable |
| **Standard** | ~40 | As designed |
| **Sparse** (hard) | ~28, skewed to C-types | Fewer encounters, and more of them carry no rares at all |

Difficulty chosen at launch as a course, not a menu of multipliers.

### Power

The Drone Launcher draws **60 kW** continuously through launch and recovery ops, against
§6's **110 kW** of headroom. During a harvest window:

- The Fabricator (100 kW) can no longer run alongside it.
- The Smelter (140 kW) was already impossible.

So a window forces a **power reallocation for its whole duration** — and the ore you're
hauling in can't be refined until the window closes. Harvest and industry alternate; they
never overlap.

### Automation and snap-back

Preparation automates cleanly: *on `asteroid:detected` → queue drone fabrication, stock
propellant, post a "wake pilot" task*.

The **intercept decision itself should not be automated.** It's the canonical snap-back
event (§2) — the one thing that must pull a frame-jacking player back down to real time,
because it's irreversible, infrequent, and the single highest-stakes call in the game.

Missing a window entirely is a permanent loss and should be recorded prominently in the feed.
"*Object 47-C receding. Intercept no longer possible.*" — three years until the next one.

### Spending ship delta-v — the Act II desperation move

The constraint the whole section rests on is that the ship's Δv is reserved for deceleration.
Breaking it should be *possible* and close to unthinkable — the move a player makes at year 160
with no rare compounds, three failed assets and a catalogue that says nothing for eleven years.

**Proposal: allow it, and price it in the ending rather than the journey.** Spending course
margin does not slow the ship or cost resources — it **permanently caps the best outcome the
player can still reach** (§1). Burn it once and *Perfect arrival* is off the table for good; burn
it twice and *Good* goes too.

- It reads as a real choice rather than an optimisation, because the cost lands somewhere the
  player cannot claw back.
- It's permanent and visible: logged in the mission profile — *"Course margin expended, year
  147"* — and referenced directly in the arrival narrative.
- It cannot trivialise the constraint, because it buys **material, never time**: the ship still
  can't stop, and the ending still remembers.

**What one burn buys: a single otherwise-impossible intercept.** Not extra sorties on a
reachable object — that would just be a discount. It buys reach: an off-route body the sensors
found, or an object whose window you already missed. Yield is then whatever that object's class
and richness give you, harvested normally.

**Three burns exist for the whole journey**, and each one lowers the ceiling:

| Burn | Best outcome still reachable |
|------|------------------------------|
| 1 | *Good arrival* — Perfect is gone |
| 2 | *Rough arrival* |
| 3 | *Skeleton arrival* |
| 4 | Refused — the ship can no longer decelerate. That's a fail state, not a choice. |

A countable, visible resource that only ever spends the ending.

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

### Progression — material gating, not research

**No research tree.** All schematics are aboard from departure; this is a colony vessel, not
an expedition. Research implies growth and discovery, and this game's arc is **decline** —
the drama is in maintaining, not expanding.

**But there is progression**, and it comes from the supply chain instead. The distinction:

| | The gate | Arc it implies |
|---|---|---|
| Research tree | You don't *know how* | Growth, discovery — fights the tone |
| **Material gating** | You know exactly how, you can't **afford** it | Scarcity — reinforces the tone |

The doc already works this way without naming it: fuel rods and RTG banks are fully known
from hour one, and gated purely by 12 and 6 rare compounds respectively. Enhancements extend
the same idea — you can't build the retrofit until you've refined and assembled its
subcomponents, and getting there is the progression.

This gives the player the "I can do a thing I couldn't before" beat with none of the tonal
problem. But it has to be shaped carefully, because the real risk isn't tone — it's
**flattening the decline curve**. Three rules:

#### 1. Enhancements mitigate decline, never reverse it

| Good shapes | Effect |
|-------------|--------|
| **Efficiency retrofit** | Cuts a load — e.g. cryo bank 50 kW → 42 kW. Buys headroom, adds no capability. |
| **Wear reduction** | Better bearings/coolant loop lowers `baseWear` for an asset class (§4). |
| **Yield improvement** | Rare refining 3:10 → 4:10. Attacks the choke point directly. |
| **Redundancy** | A paired unit sharing duty halves `dutyFactor` on each — so *both* age slower. |
| **Automation capability** | See below. |

| Avoid | Why |
|-------|-----|
| Flat production multipliers (+20% fab speed) | They compound, and eventually outrun the decline curve |
| **Reactor output upgrades** | Cancels the central tension outright |
| Anything with no ongoing cost | Free progress breaks the arbitration |

#### 2. Enhancements are assets

An enhancement is a normal piece of equipment with `condition` and `maxCondition` (§4). It
ages, it needs servicing, and eventually it ages out and **the benefit lapses** unless
rebuilt.

That makes progression a **treadmill, not a ratchet** — and it needs no new machinery in the
model whatsoever. An enhancement is just equipment that happens to modify a coefficient.

#### 3. Price them in the choke point

Enhancements cost **rare compounds**. Every one therefore trades directly against fuel,
medicine, or a replacement the player also needs (§7, *Rare compounds are the choke point*).
Progress stays an act of arbitration, never a freebie.

#### The best target: the automation console

Gate the **player's own capability**, not the ship's output. §5's automation console starts
deliberately primitive, and manufactured control hardware expands it:

| Built | Unlocks |
|-------|---------|
| — (start) | One listener per asset; single condition; self-action or post-task |
| **Logic Core** | Author derived signals at facility level — `and` / `or` / `not` |
| **Signal Relay** | More listener slots per asset |
| **Scheduler Module** | Time-based listeners — `every(interval)`, `after(delay)` |
| **Telemetry Suite** | `projected(metric, horizon)` — fires on derived trends, not discrete events |

This is the strongest form of progression available here, because:

- It makes the player **better at the core loop** rather than making the ship stronger, so it
  cannot flatten the difficulty curve.
- It is tonally exact — you are the ship's AI, and you are upgrading *yourself*.
- It **stages the automation system's complexity**, which is a real answer to Open Question 4
  (onboarding): the player meets one concept at a time, in an order the economy sets, instead
  of facing the full IFTTT console on hour one.

#### Slot or host? Two categories

- **Retrofits attach to a host asset.** They don't consume a room slot, and they **die with the
  thing they modify** — which is thematically right, keeps the treadmill honest, and avoids
  double-penalising the player against slots they've already paid for.
- **Control hardware occupies a Bridge slot.** It's ship-wide instrumentation, not a modification
  of any one machine.

#### Enhancement catalogue

**Retrofits** *(attach to host; age and must be rebuilt)*

| Enhancement | Host | Effect | Cost | Hours |
|-------------|------|--------|------|-------|
| LSN Recuperator | LifeSupportNode | 8 → **5 kW** | 4 metal parts, 2 electronics, 2 rare cmp | 36 |
| Cryo Efficiency Retrofit | Cryo Control | 50 → **42 kW** per bank | 12 metal parts, 8 electronics, 10 rare cmp | 144 |
| Grow Bed LED Retrofit | Grow Beds | 120 → **85 kW** | 10 metal parts, 12 electronics, 6 rare cmp | 120 |
| Precision Bearing Set | Any mechanical asset | `baseWear` × 0.7 | 6 metal parts, 2 seals, 3 rare cmp | 48 |
| Reactor Coolant Upgrade | Reactor Core | `baseWear` × 0.75 | 14 metal parts, 6 electronics, 8 rare cmp | 168 |
| Refinery Cascade Stage | Smelter | Rare yield 3:10 → **3.5:10** | 20 rare cmp + 16 metal parts | 192 |
| Paired Assembly | Any asset | Second unit shares duty — `dutyFactor` halves on **both** | Full asset cost + 4 metal parts | — |

The **Refinery Cascade** is the one to watch, because yield improvements on the choke point are
inherently dangerous. Priced honestly: +0.5:10 across ~6,600 rare elements mined is **+330 rare
compounds** over the journey, against a ~40-year service life meaning ~7 rebuilds at 20 each =
150. **Net ≈ +180.** Worth building, nowhere near an auto-win — and if you let it lapse, the gain
stops.

**Control hardware** *(Bridge slot; unlocks §5 listener tiers)*

| Module | Unlocks | Cost | Hours |
|--------|---------|------|-------|
| Signal Relay | +2 listener slots per asset (stackable) | 4 metal parts, 6 electronics, 3 rare cmp | 48 |
| Logic Core | Derived signals at facility level — `and`/`or`/`not` | 8 metal parts, 10 electronics, 6 rare cmp | 96 |
| Scheduler Module | `every(interval)`, `after(delay)` | 6 metal parts, 12 electronics, 8 rare cmp | 120 |
| Telemetry Suite | `projected(metric, horizon)` | 12 metal parts, 24 electronics, **20 rare cmp** | 240 |

#### Other unlock beats worth keeping

- **Schematics can be lost.** Data core damage destroys recipes; recovery is a scarcity
  story rather than a progress story.
- **Improvisation recipes.** Under duress, crew derive *worse but cheaper* substitutes —
  a seal made from scrap that lasts a third as long. Progress shaped like desperation.

### Building new equipment — yes, within limits

- **No new rooms.** The layout is fixed (§4).
- **Additional units of existing equipment, yes** — a second Fabricator, more RTG banks,
  extra grow beds — subject to **per-room equipment slots**.

Expansion is real but self-limiting, because it's power-gated: a second Fabricator is another
100 kW you don't have. "Build more" is a trap the player can walk into, which is the correct
amount of rope.

#### Per-room equipment slots

| Room | Slots | In use | Spare |
|------|------:|-------:|------:|
| Bridge | 7 | 4 | 3 — control hardware lives here |
| Engineering | 7 | 4 | 3 |
| Reactor / Power | 10 | 6 | 4 — RTG banks stack |
| Life Support | 6 | 4 | 2 |
| Hydroponics | 12 | 9 | 3 |
| Medbay | 6 | 4 | 2 |
| Quarters | 6 | 4 | 2 |
| Cargo Bay | 8 | 3 | 5 — storage racks expand |
| Drone Bay | 7 | 4 | 3 — drones are mobile, they don't hold slots |
| Maintenance Corridor | 6 | 4 | 2 |
| **Total** | **75** | **46** | **29** |

Twenty-nine spare slots across the ship, every one of them power-gated. The constraint that
actually binds is §6, not the slot count — which is how it should be.

#### Fabricator precision — no, deliberately

A separate quality stat would mean tracking quality *on produced items*, which forks the entire
inventory model into good seals and bad seals. Enormous complexity for a small thematic gain.

The same fiction is available for free. A worn fabricator's `conditionFactor` (§4) already slows
its jobs, and at `AT_RISK` it gains a chance to **scrap the unit outright** — materials consumed,
nothing produced. Bad workmanship, expressed as loss, with zero new state.

#### Complexity class per asset

Complexity tracks sophistication, not danger — it's what drives replacement cost (§7 assembly).

| Class | Assets | Rare cmp each |
|-------|--------|--------------:|
| **High** (6) | Nav Computer, Fabricator, Reactor Core, O₂ Generator, Cryo Control, Drone Fabricator | 14 |
| **Med** (22) | Comms Array, Smelter, Power Distribution, Battery Bank, RTG Bank, Water Recycler, Atmosphere Regulator, Med Station, Diagnostic Scanner, Loading Crane, Drone Launcher, Pressure Doors, **LifeSupportNode ×10** | 5 |
| **Low** (14) | Workbench, Aux Array Control, **Grow Bed ×6**, Irrigation, Food Dispenser, Rec Terminal, Docking Clamp, Hull Access Panel, Utility Conduits | 2 |

42 active assets (+4 passive). The mix is Med-heavy because of the ten LifeSupportNodes, which
gives **~1,300 rare compounds** for 246 replacements against the 1,378 §7 assumed — 6% under,
comfortably inside the tolerance of the §6b encounter target.

> **Do not charge this twice.** The 14/5/2 figures are the *total* rare-compound cost of a
> replacement, and most of it is already the electronics inside the unit (1 rare compound
> each). Adding the electronics cost on top of the table figure makes the economy ~60% short
> and locks the ship into an unrecoverable death spiral — which is exactly what happened the
> first time the prototype implemented it.

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

#### Signal format

Every signal carries a fixed three-field marker, then a plain sentence:

```
[LVL][FAC][CODE]  message

[CRT][RCT][POWR]  The reactor is failing. It can't make enough power.
[WRN][LFS][RULE]  The water restock rule hasn't run in 47 years.
[WRN][CRG][STOR]  Rare compounds run out in about 90 days.
[WRN][SHP][JOBS]  A repair job has waited five years. No engineer is awake.
[INF][RCT][FUEL]  Fuel rod 47 loaded. 149 left.
[INF][HYD][MOVE]  Fertiliser delivered from Engineering.
[···][QTR][CREW]  Okonkwo: "third week of the same ration block."
```

**The marker is metadata; the message is prose.** The player never has to decode the prefix to
understand a line — the sentence always says it in English. The codes exist so a feed holding
tens of thousands of entries across three centuries can be **scanned, filtered and recognised
by pattern**, which prose alone cannot do. Fixed width means the eye lands in the same place
every time, and the ticker gets a consistent rhythm.

**Level** — severity, and the speed slider's filter floor (§11 Q8):

| | |
|---|---|
| `CRT` | Critical. Holds the ticker, trips snap-back. |
| `WRN` | Warning. Always shown. |
| `INF` | Routine. Suppressed at high speed. |
| `···` | Chatter. Only visible at low speed. |

**Facility** — where it came from:

`BRG` Bridge · `ENG` Engineering · `RCT` Reactor · `LFS` Life Support · `HYD` Hydroponics
`MED` Medbay · `QTR` Quarters · `CRG` Cargo Bay · `DRN` Drone Bay · `MNT` Maintenance
`SHP` ship-wide · `CRW` a person rather than a place

**Code** — what kind of thing happened:

| | | | |
|---|---|---|---|
| `POWR` power | `WEAR` condition | `FAIL` broken | `STOR` stores |
| `MOVE` deliveries | `MAKE` manufacturing | `JOBS` task board | `RULE` automation |
| `CREW` people | `NAVG` course & encounters | `FUEL` fuel | `ATMO` air, water, heat |

Twelve codes, each guessable, and they double as the filter chips on the full feed. `[···][QTR][CREW]`
and `[CRT][RCT][POWR]` are the two ends of the game in the same shape.

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

**See `ARCHITECTURE.md`** — moved out of this document, because a second client (web first,
then iOS) makes the subject *portability* rather than framework choice, which is more than a
subsection can carry.

The short version: the simulation is a **standalone TypeScript library with no UI knowledge**
— deterministic, seeded, integer-ticked, plain-data state. The web client is Svelte over the
DOM, because §8's interface is text and the DOM renders text better than a canvas does. The web
build stays the primary version; iOS ships as a Capacitor build of the same codebase, with a
native client deferred until something specific proves the WebView inadequate.

The split pays off immediately regardless of the second client: a headless core makes a
300-year playthrough run in seconds, which turns this document's tuned numbers into a **test
suite** rather than a spreadsheet argument.

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
   **Largely answered, by two mechanisms and no tutorial:**
   - §7's unlock ladder stages the automation console's complexity, so the player meets one
     concept at a time in an order the economy sets.
   - §5c's **13 inherited rules** are a curriculum that teaches by going wrong slowly: working
     examples to read on hour one, thresholds that drift as the crew shrinks, a grow-bed phase
     collapse around year 40 that demands pipelining, and a rule silently killed by a worn
     gauge around year 100.

   What neither covers: the first hour. The player still has to be shown what a facility, a
   job and the speed control *are*. That is a smaller problem than teaching the systems, and
   probably a handful of feed messages rather than a tutorial mode.
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
