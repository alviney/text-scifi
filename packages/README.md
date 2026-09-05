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

**Now modelled:** the §5 rule engine, a task board, and sensors that wear and lie.

**Still stubbed:** individual crew (aggregate labour), hydroponics detail, and per-room stores
with deliveries. Player behaviour is a `Policy`, which is what lets the harness compare styles.

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

## The rule engine, and the two bets it tested

`rules.ts` implements §5: a rule watches one thing, tests one condition, takes one action, and
raises a task to a board the crew work through. The ship launches with the inherited rules from
§5c; a player who automates adds their own. Rules read the ship **through its sensors**, and
worn sensors read high — so a rule watching for "below X" is never told the truth.

```
node --experimental-strip-types packages/harness/experiments.ts
```

| Arm | End condition | Faults | Blind days | Brownout |
|-----|--------------:|-------:|-----------:|---------:|
| rules + sensors kept | **55** | 901 | 0% | 5% |
| rules, sensors rot | 35 | 3,641 | 99% | 57% |
| no rules, sensors kept | 36 | 2,207 | 51% | 31% |
| no rules, sensors rot | 29 | 3,138 | 99% | 54% |

**Automation is worth 18.8 condition points**, and a ship without it runs four times the
brownouts. The design's central premise holds.

**Letting the instruments rot costs 20 points** — slightly more than not automating at all.
And the interaction is the interesting part:

> Sensor decay costs **7 points without rules and 20 points with them**. The better automated
> you are, the more instrument decay hurts, because your rules are what the sensors feed.

That is §5's thesis, measured.

### Where the lie has to live

The first implementation put sensor drift on **asset condition**, and it made no measurable
difference at all. The reason is worth keeping: **a faulted machine announces itself however
broken its gauge is**, so drift there only delays routine servicing — which costs nothing under
the corrected refurbishment model.

Drift bites on **stock**, where there is no such backstop. A store reading 900 while holding 300
has nothing to announce it, which is exactly plan.md's water-restock example and why that rule
had not fired in 47 years. Sensors on machines are flavour; **gauges on stores are the
mechanic.**

## Where it stands against plan.md

| Metric | plan.md | simulated | |
|---|---|---|---|
| Replacements over 300 years | 246 | **276** | 12% |
| Encounters taken | 100 | **98** | 2% |
| Fuel rods consumed | 287 | **300** | 5% |
| Asset service life | 56 yr | 46 yr | 18% — runs short |

Every derived figure in plan.md now reproduces within tolerance, from an independent
implementation. Play styles order correctly, and the raw-rare backlog that suggested a refining
bottleneck has gone — it was the dead drone fleet, not throughput.

**Still true, and still a problem:** 0 of 20 runs hit a fail state. §1's fail states remain
unreachable even for a player who neither automates nor maintains anything.

**Still untested:** the 2% food margin, and whether 13,000 maintenance tasks reads as pressure
or noise — hydroponics and individual crew are both still stubbed.
