<script lang="ts">
  import { onMount } from "svelte";
  import { Engine } from "./lib/engine.ts";
  import type { State } from "../../sim/src/types.ts";
  import { LEVEL_MARK } from "../../sim/src/signals.ts";
  import { clock, num, year, when } from "./lib/view.ts";
  import Ticker from "./lib/Ticker.svelte";
  import Start from "./lib/Start.svelte";
  import Phase from "./lib/Phase.svelte";
  import { save, load, peek, clear } from "./lib/save.ts";
  import Voyage from "./tabs/Voyage.svelte";
  import Facilities from "./tabs/Facilities.svelte";
  import Crew from "./tabs/Crew.svelte";
  import Rules from "./tabs/Rules.svelte";

  let engine = $state<Engine>(new Engine(1));
  let running = $state(false);
  let saved = $state(peek());
  let ship = $state<State>(engine.state);
  let snapped = $state(false);
  /** fraction of the current game-hour elapsed, for smoothing progress bars */
  let frac = $state(0);
  let tab = $state("voyage");
  let feedOpen = $state(false);
  let showAll = $state(true);

  let off: (() => void) | null = null;

  function begin(e: Engine) {
    off?.(); engine.stop();
    engine = e;
    // The store is a plain callback, not a Svelte store: the engine publishes at
    // 12Hz while the sim may tick 1,200 times a second. ARCHITECTURE §4 — the
    // two rates are deliberately not coupled.
    off = engine.subscribe(s => {
      ship = { ...s };            // new identity so $state sees the change
      frac = engine.frac;
      snapped = engine.snapped;
    });
    engine.onSave = s => { save(s); saved = peek(); };
    engine.start();
    running = true;
    // Prototype hook. The whole point of apply(state, command) is that the game
    // is drivable from outside the UI, so exposing it costs nothing and makes
    // the thing testable from a script: seedship.send({kind:"addRule", ...}).
    (window as unknown as { seedship: Engine }).seedship = engine;
  }

  onMount(() => () => { off?.(); engine.stop(); });

  const TABS = [["voyage", "Voyage"], ["facilities", "Facilities"],
                ["crew", "Crew"], ["rules", "Rules"]];
</script>

<svelte:body />

<div class="shell" class:pre={!running}>
{#if !running}
  <Start {saved}
         onstart={o => { clear(); saved = null; begin(new Engine(o.seed)); }}
         oncontinue={() => { const st = load(); if (st) begin(new Engine(1, { from: st })); }} />
{:else}
  <Ticker {ship} {snapped}
          onack={() => engine.send({ kind: "ack" })}
          onopen={() => feedOpen = true} />

  <Phase {ship} />

  {#if ship.dead}
    <div class="end scroll">
      <div class="pad">
        <div class="label">Year {num(year(ship.day))}</div>
        <div class="big" class:crit={ship.dead !== "arrived"}>
          {ship.dead === "arrived" ? "Arrived." : ship.dead === "out of fuel"
            ? "The reactor went cold." : "The colony did not make it."}
        </div>
        <div class="sentence">
          {num(ship.colony.frozen + ship.colony.awake)} of 200 alive.
          {num(ship.counters.encountersTaken)} rocks worked,
          {num(ship.counters.encountersMissed)} missed.
          {num(ship.counters.faults)} things broke.
          {num(ship.counters.services)} repairs made.
        </div>
        <button class="act" onclick={() => { clear(); saved = null; running = false; }}>Again</button>
      </div>
    </div>
  {:else if tab === "voyage"}
    <Voyage {ship} {frac} progress={() => engine.progress()} send={c => engine.send(c)} />
  {:else if tab === "facilities"}
    <Facilities {ship} send={c => engine.send(c)} />
  {:else if tab === "crew"}
    <Crew {ship} {frac} send={c => engine.send(c)} />
  {:else}
    <Rules {ship} send={c => engine.send(c)} />
  {/if}

  <nav>
    {#each TABS as [id, name]}
      <button class="tab" aria-pressed={tab === id} onclick={() => tab = id}>{name}</button>
    {/each}
  </nav>

  {#if feedOpen}
    <!-- design/README borrowed C's inline expansion: the feed opens in place
         rather than throwing the player to another screen. -->
    <div class="sheet">
      <div class="fhead">
        <button class="back" onclick={() => feedOpen = false}>‹ Close feed</button>
        <button class="chip" aria-pressed={showAll}
                onclick={() => showAll = !showAll}>chatter</button>
      </div>
      <div class="scroll feed">
        {#each [...ship.signals].filter(x => showAll || x.level !== "chatter").reverse() as sig}
          <div class="line {sig.level}">
            <span class="mk">[{LEVEL_MARK[sig.level]}][{sig.fac}][{sig.code}]</span>
            <span>{sig.text}</span>
            <span class="faint">{when(sig.day, ship.day)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}
</div>

<style>
  .bar2 {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px; min-width: 0;
    border-bottom: 1px solid var(--rule); font-size: 11px;
  }
  .yr { color: var(--accent); flex: none; }
  .clock { flex: 1; min-width: 0; color: var(--dim); font-variant-numeric: tabular-nums; }
  .clock b { color: var(--text); font-weight: 400; }

  nav { display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
        border-top: 1px solid var(--rule); background: var(--panel); }
  .tab { min-height: 76px; padding: 8px 2px; font-size: 11px; color: var(--dim); min-width: 0; }
  .tab[aria-pressed="true"] { color: var(--accent); box-shadow: inset 0 2px 0 var(--accent); }

  .sheet { position: fixed; inset: 0; max-width: 560px; margin: 0 auto;
           background: var(--bg); display: grid;
           grid-template-rows: auto minmax(0,1fr); grid-template-columns: minmax(0,1fr); }
  .fhead { display: flex; align-items: center; justify-content: space-between;
           gap: 8px; padding-right: 12px; border-bottom: 1px solid var(--rule); }
  .fhead .back { border: 0; }
  .back { text-align: left; padding: 10px 12px; color: var(--dim);
          border-bottom: 1px solid var(--rule); font-size: 11px; }
  .feed { padding: 4px 0; }
  .line { display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 8px;
          padding: 5px 12px; border-bottom: 1px solid var(--rule); font-size: 11px; }
  .mk { color: var(--faint); white-space: pre; }
  .line.critical .mk, .line.critical { color: var(--crit); }
  .line.warn .mk { color: var(--warn); }
  .line.chatter { color: var(--dim); }
  .shell.pre { grid-template-rows: minmax(0,1fr); }
  .end .act { border: 1px solid var(--accent); color: var(--accent);
              padding: 9px 14px; margin-top: 14px; display: inline-block; }
</style>
