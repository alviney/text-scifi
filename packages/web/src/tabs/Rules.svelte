<script lang="ts">
  /** design/README: three attempts at this hero failed before the answer turned
   *  out to be SPECIFICITY — show one rule actually firing: the room, the
   *  condition that tripped, the action taken, and whether it worked. When
   *  nothing is running it holds the last firing and relabels itself, so the
   *  panel is never empty and never claims to be live when it isn't.
   *
   *  The panel is a FIXED height. Firings vary in length and without that the
   *  whole page reflows every few seconds — the one thing a persistent,
   *  always-animating element must never do. */
  import type { State } from "../../../sim/src/types.ts";
  import type { Command } from "../../../sim/src/commands.ts";
  import { assetName, roomOf, when, num, ROOMS } from "../lib/view.ts";

  let { ship, send }: { ship: State; send: (c: Command) => void } = $props();

  const fired = $derived(
    ship.rules.filter(r => r.lastFired >= 0)
               .sort((a, b) => b.lastFired - a.lastFired)[0]);

  const live = $derived(fired ? ship.day - fired.lastFired < 2 : false);

  const target = $derived(fired
    ? ship.assets.find(a => a.id === fired.watch) ?? null : null);

  const room = $derived(target ? roomOf(target) : "Stores");

  const verb: Record<string, string> = {
    service: "raise a repair job", replace: "order a replacement",
    makeRod: "fabricate a fuel rod", makeDrone: "build a drone",
  };

  /** The blind spot: parts of the ship nothing watches. design/README calls the
   *  "nothing watches the reactor" moment too good to lose. */
  const watched = $derived(new Set(ship.rules.filter(r => r.kind === "condition").map(r => r.watch)));
  const byRoom = $derived(ROOMS.map(r => {
    const list = ship.assets.filter(a => roomOf(a) === r);
    return { room: r, total: list.length, covered: list.filter(a => watched.has(a.id)).length };
  }));

  let adding = $state(false);
  let pickId = $state("reactor");
  let threshold = $state(60);

  function add() {
    send({ kind: "addRule", rule: {
      id: `usr-${pickId}-${ship.day}`, watch: pickId, kind: "condition",
      threshold, action: "service", inherited: false, fires: 0, lastFired: -1 } });
    adding = false;
  }
</script>

<div class="scroll">
  <!-- HERO: fixed 190px, two lines reserved -->
  <div class="theatre">
    <div class="tl">
      <span class="label">{live ? "firing now" : "last"}</span>
      <span class="faint">{fired ? when(fired.lastFired, ship.day) : ""}</span>
      <span class="pulse" class:on={live}></span>
    </div>
    {#if fired}
      <div class="rm">{room}</div>
      <div class="cond">
        {#if fired.kind === "condition"}
          {assetName(fired.watch)} fell below {fired.threshold}
        {:else}
          {fired.watch.split(":")[1]} dropped under {fired.threshold}
        {/if}
      </div>
      <div class="act">→ {verb[fired.action]}</div>
      <div class="out faint">
        fired {num(fired.fires)} time{fired.fires === 1 ? "" : "s"} ·
        {fired.inherited ? "left by the departure crew" : "yours"}
      </div>
    {:else}
      <div class="rm faint">—</div>
      <div class="cond faint">No rule has fired yet.</div>
      <div class="act faint">The ship launched with three.</div>
      <div class="out"></div>
    {/if}
  </div>

  <div class="pad">
    <div class="label">Coverage</div>
    <div class="big">{watched.size} <span class="dim">of {ship.assets.length} watched</span></div>
    <div class="sentence dim">
      {ship.rules.length} rules aboard · {num(ship.counters.ruleFires)} firings so far
    </div>
    {#each byRoom.filter(r => r.covered < r.total) as r}
      <div class="gap">
        <span class:crit={r.covered === 0}>{r.room}</span>
        <span class="faint">{r.covered}/{r.total}</span>
        {#if r.covered === 0}<span class="crit">nothing watches this</span>{/if}
      </div>
    {/each}
    {#if byRoom.every(r => r.covered === r.total)}
      <div class="sentence faint">Every machine aboard is watched by something.</div>
    {/if}
  </div>

  <div class="hr pad">
    {#if adding}
      <div class="label">New rule</div>
      <!-- design/README: rules read as SENTENCES, assembled from menus, so you
           can check it means what you meant before saving. -->
      <div class="builder">
        When
        <select bind:value={pickId}>
          {#each ship.assets as a}<option value={a.id}>{assetName(a.id)}</option>{/each}
        </select>
        drops below
        <input type="number" min="5" max="95" bind:value={threshold} />
        , raise a repair job.
      </div>
      <div class="sentence faint">
        Sixty is the number the balance runs settle on, and anywhere from
        fifty-five to sixty-five plays the same.
      </div>
      <div class="acts">
        <button class="act" onclick={add}>Save it</button>
        <button class="act ghost" onclick={() => adding = false}>Cancel</button>
      </div>
    {:else}
      <button class="act" onclick={() => adding = true}>Write a rule</button>
    {/if}
  </div>

  <div class="hr">
    {#each [...ship.rules].sort((a, b) => b.fires - a.fires) as r (r.id)}
      <div class="row">
        <span class:faint={r.fires === 0} class:accent={r.fires > 0}>{r.fires === 0 ? "○" : "●"}</span>
        <span>
          {#if r.kind === "condition"}{assetName(r.watch)}{:else}{r.watch.split(":")[1]}{/if}
          <span class="dim">below {r.threshold}</span>
        </span>
        <span class="faint">{num(r.fires)}</span>
        <span class="sub">
          {verb[r.action]} · {r.inherited ? "inherited" : "yours"}
          {#if r.fires === 0} · <span class="faint">never fired</span>{/if}
          {#if !r.inherited}
            <button class="del" onclick={() => send({ kind: "removeRule", id: r.id })}>remove</button>
          {/if}
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .theatre {
    height: 190px; padding: 12px; background: var(--panel);
    border-bottom: 1px solid var(--rule); display: grid;
    grid-template-rows: auto auto 1fr 1fr auto; align-content: start; gap: 4px;
  }
  .tl { display: flex; gap: 8px; align-items: center; }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .pulse.on { background: var(--accent); animation: beat 1.1s ease-in-out infinite; }
  @keyframes beat { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
  .rm { color: var(--accent); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
  .cond { font-size: 15px; }
  .act:not(button) { color: var(--dim); }
  .out { font-size: 10.5px; }
  .gap { display: flex; gap: 10px; font-size: 11.5px; padding: 3px 0; border-bottom: 1px solid var(--rule); }
  .gap > :first-child { flex: 1; }
  .builder { line-height: 2.1; margin: 6px 0; }
  .builder select, .builder input {
    font: inherit; background: var(--panel2); color: var(--text);
    border: 1px solid var(--rule); padding: 2px 4px; max-width: 100%;
  }
  .builder input { width: 62px; }
  .acts { display: flex; gap: 8px; margin-top: 8px; }
  button.act { border: 1px solid var(--accent); color: var(--accent); padding: 8px 12px; font-size: 12px; flex: 1; }
  button.act.ghost { border-color: var(--rule); color: var(--dim); }
  .del { color: var(--faint); text-decoration: underline; font-size: 10px; }
</style>
