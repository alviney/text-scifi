<script lang="ts">
  /** The one screen before the voyage: a seed and a sentence.
   *
   *  The automation toggle that used to live here is gone. Every voyage now
   *  starts with no rules and nobody awake, because the opening phase is meant
   *  to be hands-on — that is the thing being felt out, and offering a shortcut
   *  past it on the front screen is how it would never get played. */
  let { saved, onstart, oncontinue }: {
    saved: { day: number; alive: number; at: number } | null;
    onstart: (o: { seed: number }) => void;
    oncontinue: () => void;
  } = $props();

  let seed = $state(Math.floor(Math.random() * 9000) + 1000);
</script>

<div class="start">
  <div class="mark">
    <div class="cap">Colony vessel</div>
    <h1>SEEDSHIP</h1>
    <div class="sub">200 sleepers · 300 years · one caretaker</div>
  </div>

  {#if saved}
    <button class="cont" onclick={oncontinue}>
      Continue — year {Math.floor(saved.day / 365)}, {saved.alive} alive
    </button>
  {/if}

  <div class="brief">
    <p>Two hundred colonists are asleep. Nobody is awake, nothing is automated,
       and the ship has three hundred years of wear ahead of it.</p>
    <p>Wake someone. Everything else follows from that.</p>
  </div>

  <div class="opt">
    <div class="label">Seed</div>
    <input type="number" bind:value={seed} min="1" max="999999" />
    <div class="hint">Same seed, same three hundred years — asteroids, faults and all.</div>
  </div>

  <button class="go" onclick={() => onstart({ seed })}>Get under way</button>
</div>

<style>
  .start { padding: 26px 20px; overflow-y: auto; }
  .mark { margin-bottom: 26px; }
  .cap { font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: var(--faint); }
  h1 { margin: 2px 0 4px; font-size: 30px; letter-spacing: .16em; font-weight: 500; color: var(--accent); }
  .sub { color: var(--dim); font-size: 12px; }
  .opt { margin-bottom: 20px; }
  .brief { margin-bottom: 22px; color: var(--dim); }
  .brief p { margin: 0 0 8px; max-width: 42ch; }
  input { font: inherit; background: var(--panel2); color: var(--text);
          border: 1px solid var(--rule); padding: 5px 8px; width: 120px; margin-top: 4px; }
  .hint { color: var(--faint); font-size: 11px; margin-top: 4px; }
  .go, .cont { display: block; width: 100%; border: 1px solid var(--accent); color: var(--accent);
               padding: 12px; text-align: center; margin-top: 8px; }
  .cont { margin-bottom: 22px; border-color: var(--rule); color: var(--text); }
</style>
