<script lang="ts">
  /** The Facilities hero, as designed in `design/seedship-console.html`.
   *
   *  Two decks of five bays around a spine, bow left and drive right, so the
   *  shape reads as a ship rather than a grid. It is DOM rather than canvas on
   *  purpose: every bay is a real tap target with the same destination as the
   *  list below it, reached spatially instead of alphabetically.
   *
   *  design/README is strict about what the two markers mean, and getting it
   *  wrong is confusing rather than untidy:
   *
   *    - something MOVING belongs on the spine, travelling between its real
   *      source and destination
   *    - something HELD is not in transit at all — it sits in a room, so it is
   *      badged on that room
   *
   *  The held badge is also kept off the room's status dot. The Cargo Bay reads
   *  green while holding blocked ore, because its equipment is fine — the block
   *  is a logistics problem, and collapsing the two would make the dot mean two
   *  different things. */
  import type { State } from "../../../sim/src/types.ts";
  import { GLYPH, roomBand, roomOf, num, type Band } from "../lib/view.ts";

  let { ship, onpick }: { ship: State; onpick: (room: string) => void } = $props();

  /** Bow to drive. Deck order is the ship's, not the alphabet's. */
  const DECK_A = ["Bridge", "Medbay", "Quarters", "Hydroponics", "Life Support"];
  const DECK_B = ["Cargo Bay", "Maintenance", "Engineering", "Reactor", "Drone Bay"];
  const CODE: Record<string, string> = {
    "Bridge": "BRG", "Medbay": "MED", "Quarters": "QTR", "Hydroponics": "HYD",
    "Life Support": "LFS", "Cargo Bay": "CRG", "Maintenance": "MNT",
    "Engineering": "ENG", "Reactor": "RCT", "Drone Bay": "DRN",
  };
  /** Both decks share the five columns, so a bay's position on the spine is its
   *  column centre — which is why a haul from Engineering (col 3) to Life
   *  Support (col 5) slides from 50% to 90%. */
  const COL = (room: string) => {
    const i = DECK_A.indexOf(room) >= 0 ? DECK_A.indexOf(room) : DECK_B.indexOf(room);
    return i < 0 ? 50 : (i + 0.5) * 20;
  };

  const state = (room: string): { band: Band; off: boolean } => {
    const list = ship.assets.filter(a => roomOf(a) === room);
    return { band: roomBand(list), off: list.length > 0 && list.every(a => a.faulted) };
  };

  /** Raw material sitting in a room it isn't wanted in. */
  const holding = (room: string) => {
    const st = ship.rooms[room];
    if (!st) return 0;
    return st.ore + st.sil + st.rare;
  };

  const moving = $derived(ship.shipments.map(sh => ({
    ...sh,
    at: COL(sh.from) + (COL(sh.to) - COL(sh.from))
        * Math.max(0, Math.min(1, (ship.day - sh.left) / Math.max(1, sh.eta - sh.left))),
  })));
  const stuck = $derived(ship.board.filter(t => t.kind === "deliver"));
  const heldRooms = $derived([...DECK_A, ...DECK_B].filter(r => holding(r) > 40));
  /** Three different reasons a haul sits still, and they are not interchangeable
   *  — "no power spare" printed over a snapped crane sends the player to the
   *  wrong screen. */
  const crane = $derived(ship.assets.find(a => a.id === "crane")!);
</script>

<div class="hull">
  <div class="decks">
    <span class="nose">◄</span>
    <div class="bays">
      {#each [DECK_A, DECK_B] as deck, d}
        {#if d === 1}
          <div class="spine">
            <!-- No key: two consignments of the same material can leave the same
                 room on the same day, so nothing about a shipment is unique. -->
            {#each moving as m}
              <span class="flow" style="left:{m.at}%" title="{num(m.qty)} {m.what}: {m.from} → {m.to}">▸</span>
            {/each}
          </div>
        {/if}
        <div class="deck">
          {#each deck as room (room)}
            {@const st = state(room)}
            <button class="bay s-{st.band}" class:s-off={st.off}
                    class:holding={holding(room) > 40}
                    onclick={() => onpick(room)}>
              {#if holding(room) > 40}<span class="hold" title="held here">⚠</span>{/if}
              <span class="bd">{GLYPH[st.band]}</span>{CODE[room]}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <span class="tail">▷</span>
  </div>

  <div class="hullcap">
    <span>bow</span>
    <span>{moving.length} moving · {heldRooms.length} held</span>
    <span>drive</span>
  </div>

  <p class="note">
    {#if moving.length}
      <span class="ok">▸</span>
      {num(moving[0].qty)} {moving[0].what} on the way from {moving[0].from} to {moving[0].to}.<br>
    {/if}
    {#if stuck.length}
      <span class="crit">⚠</span>
      {stuck[0].what} held in the {stuck[0].from} — shifting it needs the crane,
      {#if crane.faulted}and the crane is broken.
      {:else if ship.brownout}and there's no power spare to run one.
      {:else}and nobody has picked the job up.{/if}
    {:else if !moving.length}
      <span class="faint">Nothing is moving between rooms.</span>
    {/if}
  </p>
</div>

<style>
  .hull { padding: 12px 10px 10px; border-bottom: 1px solid var(--rule);
          background: var(--panel); position: relative; overflow: hidden; }
  .decks { display: flex; align-items: center; gap: 4px; }
  .nose, .tail { flex: none; color: var(--faint); font-size: 15px; line-height: 1; }
  .bays { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .deck { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 3px; }

  .bay { min-width: 0; border: 1px solid var(--rule); background: var(--bg); color: var(--dim);
         font-size: 9px; letter-spacing: .06em; text-align: center; padding: 7px 0 6px;
         font-family: inherit; position: relative; }
  .bay:hover { border-color: var(--accent); color: var(--text); }
  .bay:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .bay .bd { display: block; font-size: 10px; line-height: 1; margin-bottom: 3px; }
  .bay.s-ok .bd { color: var(--ok); }
  .bay.s-warn { border-color: color-mix(in srgb, var(--warn) 45%, var(--rule)); color: var(--text); }
  .bay.s-warn .bd { color: var(--warn); }
  .bay.s-crit { border-color: color-mix(in srgb, var(--crit) 45%, var(--rule));
                background: color-mix(in srgb, var(--crit) 12%, var(--bg)); color: var(--text); }
  .bay.s-crit .bd { color: var(--crit); }
  .bay.s-off { opacity: .45; }
  .bay .hold { position: absolute; top: 2px; right: 3px; font-size: 8px; line-height: 1; color: var(--crit); }
  .bay.holding { border-color: color-mix(in srgb, var(--crit) 45%, var(--rule)); }

  /* The spine carries only things in transit. Position is real: it is the
     consignment's actual progress between two real bays. */
  .spine { height: 14px; position: relative; margin: 2px 0; overflow: hidden; }
  .spine::before { content: ""; position: absolute; left: 0; right: 0; top: 50%;
                   height: 1px; background: var(--rule); }
  .flow { position: absolute; top: 50%; transform: translate(-50%, -50%);
          font-size: 10px; line-height: 1; color: var(--ok);
          transition: left .35s linear; }
  @media (prefers-reduced-motion: reduce) { .flow { transition: none; } }

  .hullcap { display: flex; justify-content: space-between; font-size: 9.5px;
             letter-spacing: .08em; text-transform: uppercase; color: var(--faint); margin-top: 9px; }
  .note { margin: 8px 0 0; font-size: 11px; color: var(--dim); line-height: 1.5; }
</style>
