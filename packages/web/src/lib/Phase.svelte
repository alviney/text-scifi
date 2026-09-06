<script lang="ts">
  /** Where you are in the leg, above everything else.
   *
   *  The voyage is five harvest seasons now, and which of the three beats you
   *  are in changes what the whole interface is for: during PREP you are queuing
   *  work for hands that cannot hold a spanner yet, during SEASON you are
   *  running it, and during TRANSIT you are not there at all. */
  import type { State } from "../../../sim/src/types.ts";
  import { LEGS } from "../../../sim/src/legs.ts";
  import { clock, num } from "./view.ts";

  let { ship }: { ship: State } = $props();

  const leg = $derived(LEGS[ship.leg]);
  const objects = $derived(ship.schedule.filter(e => e.leg === ship.leg));
  const left = $derived(objects.filter(e => e.year > ship.day / 365).length);
  const dayOfSigned = $derived(ship.day - Math.round(leg.year * 365));
  const dayOf = $derived(Math.max(0, dayOfSigned));
  const coming = $derived(ship.crew.filter(c => ship.day < c.fitOn));
  const nextLeg = $derived(LEGS[ship.leg + 1]);
  const yearsOut = $derived(nextLeg ? nextLeg.year - ship.day / 365 : 300 - ship.day / 365);
</script>

<!-- Two rows above the map, not three.
     "Leg 1 of 5" was saying in words what the five segments along the bottom
     edge already say in two pixels, and the separate clock bar was repeating the
     day a third time. The leg has a NAME and the ship is on a DAY of it; the
     hour rides along because it ticks once a real second and is the part of the
     readout that shows the ship is running. -->
<div class="phase p-{ship.phase}">
  <span class="name">{leg.name}</span>
  <span class="state">
    {#if ship.phase === "prep"}
      {-dayOfSigned} days out · {coming.length} coming round
    {:else if ship.phase === "season"}
      day {num(dayOf)} <b>{clock(ship.hour)}</b>
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
  .state b { color: var(--text); font-weight: 400; font-variant-numeric: tabular-nums; }
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
