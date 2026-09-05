<script lang="ts">
  /** The one screen before the voyage. Two real questions and a seed.
   *
   *  The automation toggle is here because it is genuinely undecided: plan.md
   *  §5c argues the ship should launch with thirteen inherited rules as a
   *  curriculum that teaches by going wrong slowly, but a ship that watches
   *  nothing is a different game and might be a better one. Playing both is the
   *  only way to find out, so it is a choice on the front screen rather than a
   *  constant in the source. */
  let { saved, onstart, oncontinue }: {
    saved: { day: number; alive: number; at: number } | null;
    onstart: (o: { seed: number; inherited: boolean }) => void;
    oncontinue: () => void;
  } = $props();

  let seed = $state(Math.floor(Math.random() * 9000) + 1000);
  let inherited = $state(true);
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

  <div class="opt">
    <div class="label">The departure crew left you</div>
    <div class="pick">
      <button aria-pressed={inherited} onclick={() => inherited = true}>
        <b>Standing rules</b>
        <span>Fifteen automations, already running. Some of them are wrong.</span>
      </button>
      <button aria-pressed={!inherited} onclick={() => inherited = false}>
        <b>Nothing</b>
        <span>The ship watches itself. You write every rule, or none.</span>
      </button>
    </div>
  </div>

  <div class="opt">
    <div class="label">Seed</div>
    <input type="number" bind:value={seed} min="1" max="999999" />
    <div class="hint">Same seed, same three hundred years — asteroids, faults and all.</div>
  </div>

  <button class="go" onclick={() => onstart({ seed, inherited })}>Get under way</button>
</div>

<style>
  .start { padding: 26px 20px; overflow-y: auto; }
  .mark { margin-bottom: 26px; }
  .cap { font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: var(--faint); }
  h1 { margin: 2px 0 4px; font-size: 30px; letter-spacing: .16em; font-weight: 500; color: var(--accent); }
  .sub { color: var(--dim); font-size: 12px; }
  .opt { margin-bottom: 20px; }
  .pick { display: grid; gap: 6px; margin-top: 6px; }
  .pick button { border: 1px solid var(--rule); padding: 9px 11px; text-align: left; display: grid; gap: 2px; }
  .pick button[aria-pressed="true"] { border-color: var(--accent); background: var(--panel); }
  .pick b { font-weight: 500; }
  .pick span { color: var(--dim); font-size: 11px; }
  input { font: inherit; background: var(--panel2); color: var(--text);
          border: 1px solid var(--rule); padding: 5px 8px; width: 120px; margin-top: 4px; }
  .hint { color: var(--faint); font-size: 11px; margin-top: 4px; }
  .go, .cont { display: block; width: 100%; border: 1px solid var(--accent); color: var(--accent);
               padding: 12px; text-align: center; margin-top: 8px; }
  .cont { margin-bottom: 22px; border-color: var(--rule); color: var(--text); }
</style>
