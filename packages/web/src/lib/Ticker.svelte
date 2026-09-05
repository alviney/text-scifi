<script lang="ts">
  /** design/README: feed items at the top of EVERY screen, always. New items
   *  replace the old, so the ship can be monitored from anywhere. A critical
   *  signal turns the strip red and HOLDS it — rotation stops until acknowledged,
   *  which is the visible half of §2's snap-back.
   *
   *  Two entries rather than one, each on a single line. A wrapping message
   *  spent the height on one signal and broke words across lines; two rows spend
   *  it on a second signal instead, which also gives the newest item something
   *  to be newer *than* — you can see the ship moving without opening the feed. */
  import type { State } from "../../../sim/src/types.ts";
  import { LEVEL_MARK, type Signal } from "../../../sim/src/signals.ts";

  let { ship, snapped, onack, onopen }: {
    ship: State; snapped: boolean; onack: () => void; onopen: () => void;
  } = $props();

  const ROWS = 2;
  let shown: Signal[] = $state([]);
  let stacked = $state(0);

  $effect(() => {
    // §11 Q8's severity floor went out with the speed ladder it was built on:
    // it existed because at 8,760x the feed is unreadable, and there is no
    // 8,760x any more. At one game-day per 24 seconds every signal is legible,
    // including the chatter — which is the version of the feed the design says
    // is worth reading.
    const all = ship.signals;
    const feed = all;
    if (!feed.length) return;

    // An unacknowledged critical pins the strip. It stays in the top row and the
    // rotation carries on underneath it, so the alert cannot scroll away while
    // the ship keeps talking.
    const crit = feed.filter(x => x.level === "critical" && x.day > ship.acked);
    if (crit.length) {
      const pin = crit[crit.length - 1];
      const rest = feed.filter(x => x !== pin).slice(-(ROWS - 1)).reverse();
      shown = [pin, ...rest];
      stacked = crit.length - 1;
      return;
    }

    const next = feed.slice(-ROWS).reverse();
    if (next.length !== shown.length || next.some((x, i) => x !== shown[i])) {
      shown = next;
      stacked = Math.max(0, all.filter(x => x.day >= next[0].day).length - 1);
    }
  });
</script>

<!-- Two different jobs, so two different targets. Overloading one tap to mean
     both "open the feed" and "acknowledge this alert" made acknowledging
     unreachable whenever the feed was already open. -->
<div class="ticker" class:pinned={snapped} onclick={() => onopen()}
     role="button" tabindex="0" onkeydown={e => e.key === "Enter" && onopen()}>
  {#if shown.length}
    {#each shown as sig, i}
      <div class="line" class:old={i > 0}
           class:crit={sig.level === "critical" && i === 0 && snapped}>
        <span class="mk">[{LEVEL_MARK[sig.level]}][{sig.fac}][{sig.code}]</span>
        <span class="msg">{sig.text}</span>
        {#if i === 0 && stacked > 0}<span class="plus">+{stacked}</span>{/if}
        {#if i === 0 && snapped}
          <button class="ackbtn" onclick={e => { e.stopPropagation(); onack(); }}>ACK</button>
        {/if}
      </div>
    {/each}
  {:else}
    <div class="line">
      <span class="mk">[  ][NAV][IDLE]</span>
      <span class="msg dim">Quiet.</span>
    </div>
  {/if}
</div>

<style>
  /* Fixed height, not a minimum. The strip sits above every screen and rotates
     constantly, so anything that lets it grow reflows the whole page each time
     an item changes. */
  .ticker {
    display: flex; flex-direction: column; justify-content: center; gap: 4px;
    width: 100%; text-align: left; height: 66px; padding: 8px 12px;
    border-bottom: 1px solid var(--rule);
    background: var(--panel); font-size: 11.5px; cursor: pointer;
  }
  .ticker.pinned { background: color-mix(in srgb, var(--crit) 22%, var(--panel)); }

  .line { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  .line.old { opacity: .55; font-size: 10.5px; }
  .line.crit .msg, .line.crit .mk { color: var(--crit); }

  .mk { color: var(--faint); white-space: pre; flex: none; }
  /* One line each, always. Truncation is the price of never reflowing, and the
     full text is one tap away in the feed. */
  .msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plus { flex: none; color: var(--faint); }
  .ackbtn { flex: none; border: 1px solid var(--crit); color: var(--crit); padding: 0 6px; font-size: 10px; }
</style>
