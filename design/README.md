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

§8 listed ten screens flat. Five are tabs — **Ship, Crew, Auto, Mfg, Nav**, one per
system the player manages — and the other five drill off the thing they describe
(Task board and Inventory from Ship; the three detail panes from their parent).
This keeps §8's promise that every feed line links to its source.

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

### Not yet designed

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
