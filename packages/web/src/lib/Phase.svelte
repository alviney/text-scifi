<script lang="ts">
  /** Where you are in the leg, above everything else.
   *
   *  The voyage is five harvest seasons now, and which of the three beats you
   *  are in changes what the whole interface is for: during PREP you are queuing
   *  work for hands that cannot hold a spanner yet, during SEASON you are
   *  running it, and during TRANSIT you are not there at all. */
  import type { State } from "../../../sim/src/types.ts";
  import { LEGS } from "../../../sim/src/legs.ts";
  import { num } from "./view.ts";

  let { ship }: { ship: State } = $props();

  const leg = $derived(LEGS[ship.leg]);
  const objects = $derived(ship.schedule.filter(e => e.leg === ship.leg));
  const left = $derived(objects.filter(e => e.year > ship.day / 365).length);
  const dayOf = $derived(Math.max(0, ship.day - Math.round(leg.year * 365)));
  const coming = $derived(ship.crew.filter(c => ship.day < c.fitOn));
  const nextLeg = $derived(LEGS[ship.leg + 1]);
  const yearsOut = $derived(nextLeg ? nextLeg.year - ship.day / 365 : 300 - ship.day / 365);
</script>

<div class="phase p-{ship.phase}">
  <span class="tag">Leg {ship.leg + 1} of {LEGS.length}</span>
  <span class="name">{leg.name}</span>
  <span class="state">
    {#if ship.phase === "prep"}
      {coming.length} coming round
    {:else if ship.phase === "season"}
      day {num(dayOf)} · {left} of {objects.length} ahead
    {:else if ship.phase === "transit"}
      dark · {yearsOut.toFixed(1)} years out
    {:else}
      arrived
    {/if}
  </span>
  <!-- The strip's own bottom edge is the voyage indicator: five segments, one
       lit. It replaces the border rather than sitting under it, so five legs
       cost the layout two pixels instead of a whole row. -->
  <span class="voy" aria-hidden="true">
    {#each LEGS as _, i}<i class:done={i < ship.leg} class:now={i === ship.leg}></i>{/each}
  </span>
</div>

<style>
  .voy { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 2px; }
  .voy i { flex: 1; height: 2px; background: var(--rule); }
  .voy i.done { background: var(--faint); }
  .voy i.now { background: var(--accent); }
  .phase { position: relative; display: flex; gap: 8px; align-items: baseline; padding: 6px 12px;
           border-bottom: 1px solid var(--rule); font-size: 11px; }
  .tag { color: var(--faint); letter-spacing: .08em; text-transform: uppercase; flex: none; }
  .name { color: var(--accent); flex: 1; min-width: 0; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap; }
  .state { color: var(--dim); flex: none; font-variant-numeric: tabular-nums; }
  .p-transit { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .p-prep .state { color: var(--warn); }
</style>
