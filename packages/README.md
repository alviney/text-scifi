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

## The colony, and why nothing used to fail

An earlier pass reported "§1's fail states are unreachable" as a finding about the design. That
was wrong, and worth recording as a lesson: **the sim had no people in it.** Its only endings
were "out of fuel" and "arrived". The O₂ generator could be dead for two centuries and nothing
happened, because nobody was aboard to suffocate. A model with no deaths in it will always
report that a neglected ship arrives safely.

`colony.ts` adds the half that kills you: crew who eat and breathe, six grow beds that must be
tended, air that depends on the O₂ generator and the LifeSupportNodes, and cryo banks that need
490 kW met before they get any power at all. Crucially, **labour is now people rather than a
constant** — lose crew and the ship stops being repaired, which is the spiral §1 describes.

Fail states are now reachable, and they discriminate:

| Arm | Arrived | End cond | Died awake | Died frozen |
|-----|--------:|---------:|-----------:|------------:|
| diligent | 100% | 55 | 0 | 182 |
| steady | 100% | 56 | 0 | 48 |
| no gauges | 100% | 35 | 0 | 192 |
| **no rules** | **0%** | — | 8 | 192 |
| **neglectful** | **0%** | — | 8 | 190 |
| **underfed** | **0%** | — | 8 | 192 |

Three distinct causes, all ending in *crew lost*: never automating, never maintaining, and
under-tending hydroponics. **A ship with no automation dies every time**, which is exactly what
§1 claims and had never been demonstrated.

### Resolved: the year-278 cascade

Diagnosed by tracing the endgame year by year:

```
y277   reactor cond 68, maxCond 68, output 1000   <- serviced normally
y278   reactor cond 25, maxCond 65, output  649   <- ceiling crossed the replace line
y279   reactor cond 90, maxCond 99, output 1000   <- replaced, a year too late
```

The maintenance policy **abandoned any asset whose ceiling fell past the replacement
threshold** and waited for parts. That is sensible for a grow bed and catastrophic for the
reactor: at `ageFactor` 1.9 it sheds ~118 condition points a year, so it free-fell from 65 to
25 in months while the replacement was queued. Output collapsed, the cryo banks lost power, and
after the 21-day grace they went dark four at a time.

The fix is one line — keep servicing while waiting, because the ceiling is already written off:

| | faults | colonists lost | end condition |
|---|---:|---:|---:|
| Before | 2,943 | 182 | 55 |
| After | **46** | **45** | **61** |

A 64x reduction in faults across the whole game from a single policy rule, and on seed 1 a
diligent ship now arrives with **200 of 200 alive and zero faults** — the first time §1's
*Perfect arrival* has been shown to be reachable. Written back into §4.

Note also that **steady now slightly outperforms diligent** (25 colonists lost against 45).
The fixed overhead in the refurbishment model means over-servicing has a mild cost, so there
is an optimum service interval rather than "more is always better". That looks like a feature,
but it is untuned.

### Previously unresolved (kept for the record)

A well-run ship still loses 182 of 192 colonists, and tracing it shows they die **in a single
cascade at year 278** rather than bleeding away. The reactor slides from condition 42 to 12 in
a short window at the very end of the voyage and the banks go dark four at a time.

That is not the slow decline the design intends, and it is not yet diagnosed. Adding thermal
mass to the banks (21 days of grace, so a dip does not kill) did not change it, which rules out
brief brownouts. Something about the endgame — Act III material arriving, or the replacement
threshold sitting exactly at the reactor's floor — is worth a session on its own.

Until that is understood, treat *died frozen* as untuned. *Arrived* and *died awake* look right.

**Still untested:** whether 13,000 maintenance tasks reads as pressure or noise. That one needs
a player, not a harness.
