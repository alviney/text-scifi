# Seedship — Game Design Document

> You are the AI managing a seedship. Your crew sleeps in cryo. A skeleton crew keeps the ship alive. Your job: keep everything running long enough to reach the destination.

---

## 1. Core Concept

A text-driven management/automation game with a CLI-style interface. The player reads status panels, schedules tasks, sets up automations, and tries to keep a fragile ship running across interstellar distances. The tone is industrial and utilitarian — think asset management software in space.

### Win Condition
<!-- TODO: What does "reaching the destination" look like? Is there a scoring system? Multiple endings? -->
- Automate ship systems well enough to engage **frame jacking** — accelerating time passage to reach the destination.
- Crew survival matters. How many survive affects the outcome.

### Lose Condition
<!-- TODO: Is there a hard fail state, or does the game degrade gracefully? -->
- Total crew loss?
- Critical system failure (life support, navigation)?

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

### Equipment Degradation
- All equipment degrades over time (per tick).
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

### Raw Materials
- Sourced from **asteroid harvesting** via drones.
- Asteroids enter range at random intervals (every N years).
  - Limited **window of availability** — after which delta-v cost is prohibitive.
  - Yields: water, metals, rare elements, volatiles.
  - Reference: *Delta-V* by Daniel Suarez for hard-sci-fi asteroid mining.

### Production Chains
<!-- TODO: Map out the production chains -->
```
Asteroid → Raw Ore → Refined Metal → Parts → Equipment
Seed Bank → Hydroponics → Food
Water Ice → Water → Life Support / Hydroponics
```

### Seed Bank
- Finite stock of organic seeds for hydroponics.
- Different crops for nutrition, medicine, morale?

### Energy
- Solar panels (can be manufactured).
- Power budget for all systems?

<!-- TODO: Is energy a bottleneck or just a background system? -->

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

## 10. Open Questions

1. **Narrative** — Is there a story beyond "reach the destination"? Logs from previous AI? Crew backstories?
2. **Difficulty** — What makes the game harder over time? Equipment age? Fewer crew? Longer gaps between asteroids?
3. **Scale** — How big is the ship? How many rooms/systems/crew?
4. **Saving** — Autosave? Manual save? Browser local storage?
5. **Procedural generation** — Are asteroid encounters, equipment failures, crew events randomised?
6. **Frame jacking risk** — What can go wrong if you frame jack too early? Cascade failures?
7. **Tutorial / onboarding** — How does the player learn the systems?
8. **Sound** — Any ambient audio, or purely visual?

---

## Appendix: Inspiration & References

- *Delta-V* by Daniel Suarez — asteroid mining, orbital mechanics
- Industrial IoT / SCADA interfaces — aesthetic and data model
- *FTL: Faster Than Light* — ship management under pressure
- *Dwarf Fortress* — deep simulation, text-driven interface
- `htop`, `tmux`, terminal UIs — visual language
