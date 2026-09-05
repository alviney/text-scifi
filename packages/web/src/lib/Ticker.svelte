<script lang="ts">
  /** design/README: one feed item at the top of EVERY screen, always. New items
   *  replace the old one, so the ship can be monitored from anywhere. A critical
   *  signal turns the strip red and HOLDS it — rotation stops until acknowledged,
   *  which is the visible half of §2's snap-back. */
  import type { State } from "../../../sim/src/types.ts";
  import { LEVEL_MARK, type Signal } from "../../../sim/src/signals.ts";
  import { rank } from "./engine.ts";

  let { ship, snapped, floor, onack, onopen }: {
    ship: State; snapped: boolean; floor: number; onack: () => void; onopen: () => void;
  } = $props();

  let held: Signal | undefined = $state();
  let stacked = $state(0);
  let shownDay = $state(-1);

  $effect(() => {
    // §11 Q8: at speed, only what clears the floor reaches the strip. What is
    // suppressed is still counted, so the +n badge shows how much went past.
    const all = ship.signals;
    const feed = all.filter(x => rank(x.level) >= floor);
    if (!feed.length) return;
    // A critical signal pins the strip until it is acknowledged.
    const crit = feed.filter(x => x.level === "critical" && x.day > ship.acked);
    if (crit.length) { held = crit[crit.length - 1]; stacked = crit.length - 1; return; }
    const last = feed[feed.length - 1];
    if (last.day !== shownDay || held !== last) {
      shownDay = last.day;
      stacked = all.filter(x => x.day >= last.day).length - 1;
      held = last;
    }
  });
</script>

<!-- Two different jobs, so two different targets. Overloading one tap to mean
     both "open the feed" and "acknowledge this alert" made acknowledging
     unreachable whenever the feed was already open. -->
<div class="ticker" class:pinned={snapped} onclick={() => onopen()}
     role="button" tabindex="0" onkeydown={e => e.key === "Enter" && onopen()}>
  {#if held}
    <span class="mk">[{LEVEL_MARK[held.level]}][{held.fac}][{held.code}]</span>
    <span class="msg">{held.text}</span>
    {#if stacked > 0}<span class="plus">+{stacked}</span>{/if}
    {#if snapped}
      <button class="ackbtn" onclick={e => { e.stopPropagation(); onack(); }}>ACK</button>
    {/if}
  {:else}
    <span class="mk">[  ][NAV][IDLE]</span>
    <span class="msg dim">{floor > 0 ? "Nothing worth stopping for." : "Quiet."}</span>
  {/if}
</div>

<style>
  .ticker {
    display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: left;
    padding: 8px 12px; border-bottom: 1px solid var(--rule);
    background: var(--panel); font-size: 11.5px; cursor: pointer;
  }
  .ticker.pinned { background: color-mix(in srgb, var(--crit) 22%, var(--panel)); }
  .ticker.pinned .msg { color: var(--crit); }
  .mk { color: var(--faint); white-space: pre; flex: none; }
  .ticker.pinned .mk { color: var(--crit); }
  .msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plus { flex: none; color: var(--faint); }
  .ackbtn { flex: none; border: 1px solid var(--crit); color: var(--crit); padding: 0 6px; font-size: 10px; }
</style>
