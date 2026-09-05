# Prototype

Headless simulation core plus a balance harness, per `ARCHITECTURE.md`. TypeScript with
**zero dependencies** — Node 22 strips types natively, so there is no build step.

```
node --experimental-strip-types packages/harness/run.ts       # compare play styles
node --experimental-strip-types packages/harness/validate.ts  # check plan.md's claims
SEEDS=50 node --experimental-strip-types packages/harness/run.ts
```

A full 300-year playthrough (109,500 days, 42 assets) runs in **~0.35s**. Same seed produces
byte-identical output, which is what makes a future native port verifiable.

## What is modelled

Asset wear with condition bands and an eroding ceiling · reactor output and efficiency from
condition · fuel burn · power-gated industry · refining and fabrication · three-act encounters
with the five object classes and drone-limited hauls · maintenance under a labour cap.

**Stubbed for this pass:** individual crew (aggregate labour), hydroponics detail, per-room
stores and deliveries, and the rule engine — player behaviour is a `Policy` instead, which is
what lets the harness compare play styles.

## What it found

Four bugs in this prototype, and **three problems in the design**.

### 1. Flat refurbishment loss rewarded neglect — design

§4 charged a fixed ceiling cost per repair regardless of how much wear was recovered. Servicing
at 75 costs the same as servicing at 32, so frequent maintenance burned an asset's life four
times faster. **The optimal strategy was to neglect the ship**, which inverts the premise.

Fixed by making the loss mostly proportional to wear recovered, with a small fixed overhead:

```
loss = 0.05 + 0.022 x (wear recovered)   (+2.0 for a faulted rebuild)
```

Every service threshold now lands near plan.md's 56-year service life, and the decision moves
to **fault risk**, which punishes waiting instead of rewarding it. This needs writing back
into §4.

### 2. plan.md's rare-compound budget double-counts — design

The complexity table gives 14/5/2 rare compounds per replacement. That figure is the *total*,
and the bulk of it is the electronics inside the unit (1 rare compound each). Charging the
table figure **and** the electronics separately made the economy ~60% short and locked the ship
into a death spiral. §7's arithmetic is right; it is just easy to apply twice. Worth stating
explicitly in the doc.

### 3. Nothing ever fails — design

**0 of 20 runs hit a fail state**, and even the neglectful policy arrives with a mean asset
condition of 22. §1's fail states are currently unreachable. Either the tuning is too forgiving
or fail states need sharper triggers.

### Bugs found in the prototype itself

Servicing an asset already at its ceiling (a no-op that still charged the ceiling, producing a
runaway of 132,813 services and conditions of −17,829) · a faulted asset below the replace
threshold never being repaired, so the reactor died at year 10 and stayed dead for 290 years ·
rare compounds auto-converting into electronics with no reserve, banking 752 electronics while
the replacement needing 14 rare compounds starved · industry running flat out forever rather
than idling when there was nothing to do.

## Where it stands against plan.md

| Metric | plan.md | simulated | |
|---|---|---|---|
| Replacements over 300 years | 246 | 165 | within tolerance |
| Encounters taken | 100 | 86 | holds |
| Fuel rods consumed | 287 | 274 | holds — 5% |
| Asset service life | 56 yr | 77 yr | high, worth a look |

Play styles now order correctly — diligent finishes with the best condition, most replacements
and lowest brownout; neglectful with the worst of each.

**Not yet confirmed:** ~866 raw rare elements still sit unrefined at arrival, which suggests
refining throughput, not asteroid supply, is the binding constraint in the late game. That is
either a finding about §7 or an artefact of the stubbed industry model, and it needs the real
per-room delivery chain before it can be trusted.

**Untested entirely:** the three bets flagged in plan.md — sensor drift, the 2% food margin,
and whether 13,000 maintenance tasks reads as pressure or noise. None of those systems are in
this pass.
