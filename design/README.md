# Design

## `seedship-console.html`

Interface mockup for **§8** of `plan.md`. Ten mobile screens in the CLI idiom,
navigable — tap facility rows, feed lines and equipment to drill in.

Published as an Artifact: https://claude.ai/code/artifact/945fd10c-ff3a-4be4-b784-a354aee59ce4

### State depicted

Year 147, mid-Long-Dark (§6b Act II), so the screens have something real to show:
reactor at 38% condition and `AT_RISK` delivering 780 kW against an 890 kW baseline,
84 rare compounds with a stock-out projected, 4 of 6 drones, no engineer or pilot awake,
and a service task unclaimed for 1,847 days.

Figures are illustrative but consistent with the tuned economy in `plan.md`.

### Information architecture

**Three tabs, and a ticker above everything.**

An earlier five-tab version mixed two organising ideas — some tabs were *places*
(Workshop is Engineering) and some were *lenses* — giving two routes to the same object,
which is what made navigation feel complicated even when each screen was simple.

| Tab | Holds |
|-----|-------|
| **Voyage** | Where the ship is going. The storytelling surface. |
| **Facilities** | Everything with an address — the ten rooms, and Automation, Jobs and Stores from its root |
| **Crew** | Everyone aboard, awake or asleep |

Workshop and Automation lost their tabs and are found where they live — Engineering, and
the equipment a rule is attached to. Automation is *also* reachable from the Facilities
root, because "which of my rules is broken" is a real question with no single address.

### Position means location

On the ship cutaway the two cargo markers work differently, because they mean different things:

- Something **moving** sits on the spine and travels between its real source and destination.
- Something **held** is not in transit at all — it sits in a room, so it is badged on that room.

Getting this wrong is confusing rather than merely untidy: a held marker placed for visual
balance reads as movement that isn't happening, from a room the material isn't in.

A held badge is also kept separate from the room's status dot. The Cargo Bay reads green while
holding blocked ore, because its *equipment* is fine — the block is a logistics problem, and
collapsing the two would make the status dot mean two different things.

### The ticker

One feed item at the top of **every** screen, always. New items replace the old one, so
the ship can be monitored from anywhere without navigating to look.

A serious alert turns the strip red and **holds it** — rotation stops until acknowledged.

That hold is the visible half of §2's **snap-back**: the same event that pins the strip
drops the speed, and the same acknowledgement releases both. §5 already treats
"unacknowledged for X hours" as a rule, so acknowledgement existed in the design — it just
had no surface. Tapping the ticker opens the full feed.

At 8,760× items arrive faster than anyone can read, so an item holds for a minimum dwell
and a `+n` badge counts what stacked behind it. This is §11 Q8's severity floor doing its
work: at 1× the strip carries crew chatter, at full speed only warnings survive — so
**the strip's content tells the player what speed they are at** without showing a number.

### Voyage

A progress bar says where you are; this says what it cost to get there — *"Behind you:
38 rocks taken, 6 missed, 7 people dead. Ahead: 153 years."*

Two scales, because 300 years and the next decade are different questions. The whole
voyage puts the Long Dark in front of the player as a long stretch of nothing. The
thirty-year lane is the one they act on, with a hollow diamond for an object nobody
surveyed before launch — unknown rather than merely uncertain.

Fuel lives here because it is a property of the journey, not of a room.

### One question per level

The governing rule: **complex systems, simple to navigate.** Each level answers exactly
one question, and answers it in a sentence before it shows a number.

| Level | Question |
|-------|----------|
| Ship | What needs me? |
| Facility | What's wrong in here? |
| Equipment | What do I do about it? |
| **Details** | Show me the numbers — opt-in, never on the way past |

Equipment detail used to open with twelve figures. It now opens with *"Failing. It hasn't
been serviced in six years"*, one bar, and the only two numbers that decide anything —
780 kW made against 890 kW needed. Wear rate, repair count, fuel, coolant and the ageing
history moved one tap away into **Details**.

Nothing was deleted; it was **moved off the path**. A number stays on the path only when
it *is* the decision (780/890 kW; four working years of pilot left; 84 rare compounds
and 90 days).

### Plain language

The notation in `plan.md` §5 and §5c is a **specification, not an interface.** Players
never see `limitUnder(500)` or `postTask("service", front)`.

Rules have names and read as sentences — *"When water drops below 500, add a job to
restock it."* The builder works by picking each phrase from a menu, and the sentence
reassembles as you go, so you can check it means what you meant before saving.

| Internal | Player-facing |
|----------|---------------|
| `AT_RISK` | Failing |
| `SHED` | Powered down |
| `maxCondition` | Best after repair |
| `DEAD` / `THRASH` / `STALLED` | Never runs / Fighting itself / Waiting 5 years |
| `unclaimed 1,847d` | Waiting 5 years |
| `role-years` | Working years left |
| `M-type (est.)` | Probably metal |
| Manufacturing / Task board | Workshop / Jobs |

The one mark kept is the trailing `?` on a reading from a worn gauge — it is a symbol
rather than jargon, and Stores explains it once in plain English.

Two conventions worth preserving:

- **Status is the only colour.** The interface is monochrome; state is the sole
  chromatic element. Colour never carries meaning alone — `●` `◐` `○` differ by glyph.
- **Degraded readings are marked.** A trailing `?` on any value sourced from a
  worn sensor (§5), e.g. `Water 900?`. No explanation in the UI.

### Skins

Five interchangeable treatments, switchable in the page. Every skin defines the same
token set, so **no screen markup changes between them** — only colour, typeface and
shadow. If a skin needs different markup, it is a redesign, not a skin.

| Skin | Axis | Face |
|------|------|------|
| **Amber CRT** | retro screen, warm | IBM Plex Mono |
| **Phosphor** | retro screen, cold | IBM Plex Mono |
| **Blueprint** | paper, light | Roboto Mono |
| **Teletype** | paper, near-monochrome | Courier Prime |
| **Hazard** | modern screen | JetBrains Mono |

Amber is the saved baseline. Blueprint is the one worth genuinely testing — it takes
"asset management software in space" literally rather than reaching for a CRT, and it
is the only treatment comfortable in daylight on a phone.

### Rejected

`style-studies.html` compared a dense telemetry layout and a command-stream layout
against these rows. **Rows won.** Dense telemetry was rejected as a direction — more
information per screen is not the goal, and its 15px rows are unreachable by thumb.
The command stream was rejected for the same reason plus its prompt, which promises
typing the game does not support.

### Not yet designed

- **Delivery arrival animation.** Right now a delivery is either travelling or badged as held —
  the *moment of arrival* passes silently. Worth making it land: the marker reaching its
  destination bay, that bay's stores ticking up, and the badge clearing. It is the one point in
  the logistics loop where the player gets paid for setting a chain up correctly, and a chain
  that visibly completes is what makes the next one worth building.

- Speed slider and snap-back controls — a status-bar readout only. Where the actual
  control lives on a phone is unresolved, and it is the most-used control in the game.
- The §5c cycle timeline (six beds across 36 days, overlaps highlighted) is stubbed
  as a button.

---

## `style-studies.html`

Three **structural** approaches to the same screens, compared side by side.
Palette and typeface are held constant at Amber CRT throughout, so every visible
difference is information design rather than colour.

Published: https://claude.ai/code/artifact/2efcfec3-2990-4abb-a5ca-5932c9348cf4

| Study | Approach |
|-------|----------|
| **A · Rows** | Current design. List rows, drill-down, five tabs. One thing per line. |
| **B · Dense telemetry** | Column grid, ~16 assets visible at once, five variables per line plus a trend sparkline. `htop`, not a list. |
| **C · Command stream** | No tabs, no screens. One log; detail expands inline where the event sits. |

### Conclusion

**A for structure, B for detail panes, C for the feed.** They are not exclusive, and
treating them as a single choice is the mistake.

- **Rows stay the navigation model** — tappable, and legible cold on hour one.
- **Equipment detail should adopt B's density.** The condition history and trend
  columns show the §4 ageing curve the whole game turns on; key-value pairs cannot.
  Cost: 15px rows are readable but not tappable, so B needs a second interaction
  layer wherever it is used.
- **The feed should adopt C's inline expansion**, so tapping an alert unfolds it in
  place rather than throwing the player to another screen and losing the thread.
  C also puts cause next to effect — the stalled task and the sleeping engineer
  appear in the same breath, which a screen boundary prevents.

**Avoid C's command prompt.** Once there is a `>`, players will type, and a tap-only
game that looks typeable is a broken contract on a phone. Everything else in C
survives as feed behaviour.
