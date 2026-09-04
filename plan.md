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
| | Solar Array Control | Low | — | |
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

~30 active equipment pieces + ~4 passive + 10 LifeSupportNodes = ~44 total items.

### Equipment Degradation
- Active equipment degrades over time (per game-hour). Passive does not.
- **Maintenance window**: hasn't been serviced in N days → moves to "at risk".
- **Danger rating**: Low / Medium / High.
  - High-danger equipment left unmaintained increases risk to the crew member repairing it.
  - The longer the neglect, the higher the accident chance.

### Equipment States
<!-- TODO: Define the full state machine — operational, degraded, at-risk, failed, destroyed? -->

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
  Metal parts + Electronics + Seals → Equipment (pumps, motors, drones, solar panels)
  Metal parts + Electronics         → Components (replacement parts for existing equipment)
  Metal parts                       → Tools, plating, structural repairs

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
- **Power is a budget.** The reactor produces a finite amount; the player allocates across systems.
- Solar panels can be manufactured to supplement.
- If power is critically low, the player may have to **shut down cryo tanks** — killing colonists to keep the ship alive.
- Each room/system has a power draw. Shutting down non-essential systems frees up power.

<!-- TODO: Specific power numbers — what draws how much? -->
<!-- TODO: Can the reactor degrade / need fuel? Or is it always-on? -->

---

## 7. Manufacturing

- The player schedules manufacturing tasks on fabrication equipment.
- Inputs: raw materials + time.
- Outputs: components, parts, new equipment.

<!-- TODO: Is there a tech tree / research system? -->
<!-- TODO: Can the player build NEW facilities, or only maintain existing ones? -->

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

---

## Appendix: Inspiration & References

- *Delta-V* by Daniel Suarez — asteroid mining, orbital mechanics
- Industrial IoT / SCADA interfaces — aesthetic and data model
- *FTL: Faster Than Light* — ship management under pressure
- *Dwarf Fortress* — deep simulation, text-driven interface
- `htop`, `tmux`, terminal UIs — visual language
