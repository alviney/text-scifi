<script lang="ts">
  /** design/README's "one question per level":
   *    Ship      -> What needs me?
   *    Facility  -> What's wrong in here?
   *    Equipment -> What do I do about it?
   *    Details   -> Show me the numbers (opt-in, never on the way past)
   *
   *  The whole reason the earlier five-tab version felt complicated was mixing
   *  places with lenses. Everything here has an address. */
  import type { Asset, State } from "../../../sim/src/types.ts";
  import type { Command } from "../../../sim/src/commands.ts";
  import { assetName, band, GLYPH, roomBand, roomLine, assetLine, stateWord,
           mark, num, shown, shownStock, shelf, inbound, logistics,
           ROOMS, roomOf } from "../lib/view.ts";
  import { MAXCOND_FLOOR } from "../../../sim/src/sim.ts";
  import Cutaway from "../lib/Cutaway.svelte";
  import { PART_COST, ELEC_COST, RARE_COST } from "../../../sim/src/catalogue.ts";

  let { ship, send }: { ship: State; send: (c: Command) => void } = $props();

  let room: string | null = $state(null);
  let pick: string | null = $state(null);
  let details = $state(false);
  const lg = $derived(logistics(ship));

  const inRoom = (r: string) => ship.assets.filter(a => roomOf(a) === r);
  const asset = $derived(pick ? ship.assets.find(a => a.id === pick) ?? null : null);
  const queued = $derived(asset ? ship.board.some(t => t.target === asset.id) : false);
  const canReplace = $derived(asset
    ? ship.stores.parts >= PART_COST[asset.cls] && ship.stores.electronics >= ELEC_COST[asset.cls]
      && ship.stores.rareCmp >= RARE_COST[asset.cls]
    : false);
</script>

<div class="scroll">
{#if asset}
  <!-- LEVEL 3: what do I do about it? -->
  <button class="back" onclick={() => { pick = null; details = false; }}>‹ {room}</button>
  <div class="pad">
    <div class="label">{room}</div>
    <div class="big">{assetName(asset.id)}</div>
    <div class="sentence">{assetLine(asset, ship.day)}</div>

    <div class="bar"><i style="width:{shown(asset).value}%;
      background:var(--{band(asset) === 'crit' ? 'crit' : band(asset) === 'warn' ? 'warn' : 'ok'})"></i></div>
    <div class="two" style="margin-top:6px">
      <div><div class="label">Condition</div><div>{mark(shown(asset))}</div></div>
      <div><div class="label">Best after repair</div><div class="dim">{num(asset.maxCond)}</div></div>
    </div>

    <div class="acts">
      <button class="act" disabled={queued}
              onclick={() => send({ kind: "raise", action: "service", target: asset!.id })}>
        {queued ? "Job already raised" : "Raise a repair job"}
      </button>
      {#if asset.maxCond < ship.settings.replaceAt}
        <button class="act" disabled={!canReplace}
                onclick={() => send({ kind: "raise", action: "replace", target: asset!.id })}>
          {canReplace ? "Replace it" : "Replace it — not enough materials"}
        </button>
      {/if}
    </div>

    <!-- design/README: nothing was deleted, it was MOVED OFF THE PATH. -->
    <button class="more" onclick={() => details = !details}>
      {details ? "▾" : "▸"} Details
    </button>
    {#if details}
      <div class="kv">
        <div><span class="label">Repairs</span><span>{num(asset.repairs)}</span></div>
        <div><span class="label">Wear/day</span><span>{num(asset.baseWear, 3)}</span></div>
        <div><span class="label">Complexity</span><span>{asset.cls}</span></div>
        <div><span class="label">Sensor</span><span>{num(asset.sensorCond)}</span></div>
        <div><span class="label">True condition</span><span>{num(asset.cond)}</span></div>
        <div><span class="label">Scrap floor</span><span>{MAXCOND_FLOOR}</span></div>
        <div><span class="label">Parts to replace</span><span>{PART_COST[asset.cls]}</span></div>
        <div><span class="label">Rare compounds</span><span>{RARE_COST[asset.cls]}</span></div>
      </div>
      <div class="sentence faint" style="margin-top:6px">
        The sensor reading is what every rule sees. A worn one reads high, so the
        rule watching this is told it is fine.
      </div>
    {/if}
  </div>

{:else if room}
  <!-- LEVEL 2: what's wrong in here? -->
  <button class="back" onclick={() => room = null}>‹ Facilities</button>
  <div class="pad">
    <div class="label">Facility</div>
    <div class="big">{room}</div>
    <div class="sentence dim">{roomLine(inRoom(room))}</div>
  </div>

  <!-- §4: there is no ship-wide inventory. This shelf is the room's own, and
       anything it needs from anywhere else has to be carried here. -->
  <div class="pad hr">
    <div class="label">On the shelf</div>
    {#if shelf(ship, room).length === 0}
      <div class="sentence dim">Empty.</div>
    {:else}
      <div class="grid">
        {#each shelf(ship, room) as it}
          <div><div class="label">{it.name}</div><div>{num(it.qty)}</div></div>
        {/each}
      </div>
    {/if}
    {#each inbound(ship, room) as sh}
      <div class="moving">
        <span class="mv">▸</span>
        {num(sh.qty)} {sh.what} on the way from {sh.from}
        <span class="faint">{sh.eta - ship.day}d</span>
      </div>
    {/each}
    {#each ship.board.filter(t => t.kind === "deliver" && t.to === room) as t}
      <div class="moving crit">
        <span class="mv">◦</span> waiting on {t.what} from {t.from}
        <span class="faint">{ship.day - t.raised}d</span>
      </div>
    {/each}
  </div>
  {#each inRoom(room) as a (a.id)}
    <button class="row" onclick={() => pick = a.id}>
      <span class={band(a)}>{GLYPH[band(a)]}</span>
      <span>{assetName(a.id)}</span>
      <span class="dim">{mark(shown(a))}</span>
      <span class="sub">{stateWord(a)}{a.faulted ? " — stopped" : ""}</span>
    </button>
  {/each}

{:else}
  <!-- LEVEL 1: what needs me? -->
  <Cutaway {ship} onpick={r => room = r} />
  <div class="pad">
    <div class="label">Facilities</div>
    <div class="big">{ship.assets.filter(a => band(a) !== "ok").length}
      <span class="dim">need attention</span></div>
    <div class="sentence dim">
      {ship.board.length} job{ship.board.length === 1 ? "" : "s"} on the board ·
      {ship.colony.awake} crew awake
    </div>
  </div>
  {#each ROOMS as r (r)}
    {@const list = inRoom(r)}
    <button class="row" onclick={() => room = r}>
      <span class={roomBand(list)}>{GLYPH[roomBand(list)]}</span>
      <span>{r}</span>
      <span class="faint">{list.length}</span>
      <span class="sub">{roomLine(list)}</span>
    </button>
  {/each}

  <div class="pad hr">
    <div class="label">Moving things around</div>
    <div class="big">{lg.moving} <span class="dim">in transit</span></div>
    <div class="sentence" class:crit={lg.stuck}>
      {#if lg.crane.faulted}
        The Loading Crane is broken. Nothing bulky is going anywhere.
      {:else if lg.stuck}
        {lg.waiting.length} haul{lg.waiting.length === 1 ? "" : "s"} waiting on power —
        the crane needs 30 kW and there is none spare.
      {:else if lg.waiting.length}
        {lg.waiting.length} haul{lg.waiting.length === 1 ? "" : "s"} waiting for someone to pick it up.
      {:else}
        Nothing stuck.
      {/if}
    </div>
    {#each ship.shipments.slice(0, 6) as sh}
      <div class="moving">
        <span class="mv">▸</span> {num(sh.qty)} {sh.what}
        <span class="dim">{sh.from} → {sh.to}</span>
        <span class="faint">{sh.eta - ship.day}d</span>
      </div>
    {/each}
  </div>

  <div class="pad hr">
    <div class="label">The shop — Engineering</div>
    <div class="grid">
      {#each [["Metal parts","parts",ship.stores.parts],["Electronics","electronics",ship.stores.electronics],["Rare compounds","rareCmp",ship.stores.rareCmp],["Refined metal","refMetal",ship.stores.refMetal]] as [name,key,v]}
        {@const r = shownStock(ship, key as string, v as number)}
        <div><div class="label">{name}</div><div class:warn={r.doubt}>{mark(r)}</div></div>
      {/each}
    </div>
    <div class="sentence faint" style="margin-top:8px">
      A <span class="warn">?</span> means the gauge is worn and reading high.
      Nothing routine touches a gauge — you have to calibrate it yourself.
    </div>
    <button class="act" onclick={() => send({ kind: "calibrate" })}>Calibrate every gauge</button>
  </div>
{/if}
</div>

<style>
  .back { display: block; width: 100%; text-align: left; padding: 8px 12px;
          color: var(--dim); border-bottom: 1px solid var(--rule); font-size: 11px; }
  .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; }
  .grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px 12px; }
  .acts { display: grid; gap: 6px; margin: 14px 0 4px; }
  .act { border: 1px solid var(--accent); color: var(--accent); padding: 8px; text-align: center; font-size: 12px; }
  .act:disabled { border-color: var(--rule); color: var(--faint); cursor: default; }
  .more { color: var(--dim); font-size: 11px; margin-top: 12px; }
  .kv { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 4px 12px; margin-top: 8px; }
  .moving { display: flex; gap: 8px; align-items: baseline; font-size: 11.5px;
            padding: 4px 0; border-bottom: 1px solid var(--rule); }
  .moving .faint { margin-left: auto; }
  .mv { color: var(--accent); }
  .moving.crit .mv { color: var(--crit); }
  .kv > div { display: flex; justify-content: space-between; gap: 8px;
              border-bottom: 1px solid var(--rule); padding: 3px 0; font-size: 11px; }
</style>
