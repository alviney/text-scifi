<script lang="ts">
  /** 200 lives, and the two numbers that decide whether they keep breathing.
   *  The cryo grid is the hero: eight banks, each 25 people, and it goes dark
   *  four pods at a time when the reactor cannot hold 490 kW. */
  import type { State } from "../../../sim/src/types.ts";
  import type { Command } from "../../../sim/src/commands.ts";
  import { BANKS, PER_BANK, COLD_GRACE_DAYS, CREW_TARGET } from "../../../sim/src/colony.ts";
  import { num } from "../lib/view.ts";

  let { ship, send }: { ship: State; send: (c: Command) => void } = $props();
  const c = $derived(ship.colony);
  const share = $derived(Math.round(ship.settings.botanistShare * 100));
</script>

<div class="scroll">
  <div class="pad">
    <div class="label">Crew</div>
    <div class="big">{num(c.frozen + c.awake)} <span class="dim">of 200 alive</span></div>
    <div class="sentence dim">
      {c.awake} awake and working, {num(c.frozen)} still frozen.
      {#if c.diedFrozen}<span class="crit">{num(c.diedFrozen)} lost in the banks.</span>{/if}
    </div>
  </div>

  <div class="hero pad">
    <div class="label">Cryo banks</div>
    <div class="banks">
      {#each Array(BANKS) as _, i}
        {@const live = i < c.banks}
        <div class="bank" class:dark={!live} class:cold={live && c.cold > 0}>
          {#each Array(PER_BANK) as __, j}<span class="pod"
            class:out={!live || (i === c.banks - 1 && j >= c.frozen - (c.banks - 1) * PER_BANK)}></span>{/each}
        </div>
      {/each}
    </div>
    {#if c.cold > 0}
      <div class="sentence crit">
        Banks underpowered for {c.cold} days. They hold for {COLD_GRACE_DAYS} —
        then {PER_BANK} people at a time.
      </div>
    {:else}
      <div class="sentence faint">{c.banks} banks powered and holding.</div>
    {/if}
  </div>

  <div class="hr pad">
    <div class="label">Condition of the living</div>
    <div class="two">
      <div>
        <div class="label">Fed</div>
        <div class:crit={c.fed < 25} class:warn={c.fed < 60}>{num(c.fed)}%</div>
        <div class="bar"><i style="width:{c.fed}%"></i></div>
      </div>
      <div>
        <div class="label">Air</div>
        <div class:crit={c.air < 25} class:warn={c.air < 60}>{num(c.air)}%</div>
        <div class="bar"><i style="width:{c.air}%"></i></div>
      </div>
    </div>
    <div class="sentence dim" style="margin-top:10px">
      {num(c.food)} meals in the galley · {c.awake} of {CREW_TARGET} berths filled
    </div>
  </div>

  <div class="hr pad">
    <div class="label">Standing orders</div>
    <div class="sentence">
      {share}% of crew effort goes to the grow beds, the rest to repairs.
    </div>
    <input type="range" min="0" max="60" value={share}
           oninput={e => send({ kind: "setting", key: "botanistShare",
                                value: +(e.currentTarget as HTMLInputElement).value / 100 })} />
    <div class="sentence faint">
      Too little and the galley empties. Too much and nothing gets repaired.
      The margin either way is about two percent.
    </div>

    <label class="check">
      <input type="checkbox" checked={ship.settings.prioritise}
             onchange={e => send({ kind: "setting", key: "prioritise",
                                   value: (e.currentTarget as HTMLInputElement).checked })} />
      Work the reactor and life support first
    </label>
  </div>
</div>

<style>
  .hero { background: var(--panel); border-bottom: 1px solid var(--rule); }
  .banks { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin: 10px 0 6px; }
  .bank { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px;
          padding: 4px; border: 1px solid var(--rule); background: var(--bg); }
  .bank.cold { border-color: var(--warn); }
  .bank.dark { border-color: var(--crit); opacity: .5; }
  .pod { display: block; aspect-ratio: 1; background: var(--ok); }
  .bank.cold .pod { background: var(--warn); }
  .pod.out { background: var(--panel2); }
  .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; }
  input[type=range] { width: 100%; accent-color: var(--accent); margin: 4px 0 6px; }
  .check { display: flex; gap: 8px; align-items: center; margin-top: 12px; font-size: 12px; color: var(--dim); }
</style>
