<script lang="ts">
  /** design/README: "A progress bar says where you are; this says what it cost
   *  to get there." Fuel lives here because it is a property of the journey.
   *
   *  The hero now carries the objects ahead as well as the drift. Two different
   *  motions, and design/README is strict about not confusing them: the
   *  starfield drifting means TIME PASSING, and each diamond is a specific thing
   *  at a specific distance — it moves left because the ship is closing on it,
   *  not for decoration. Size is the estimated haul, so "a big one is coming" is
   *  legible without reading a number. */
  import type { Encounter, State } from "../../../sim/src/types.ts";
  import type { Command } from "../../../sim/src/commands.ts";
  import { DAYS, START_RODS } from "../../../sim/src/sim.ts";
  import { classReading, confidence, estimate, estimateComposition,
           trueMass, worthScanning, SCAN_HOURS } from "../../../sim/src/encounters.ts";
  import { fuel, hours, num, power, MATERIAL, MATERIAL_COLOUR, units } from "../lib/view.ts";
  import { seasonOver } from "../../../sim/src/sim.ts";
  import { LEGS, PREP_DAYS } from "../../../sim/src/legs.ts";
  import { shapeOf, drawRock } from "../lib/rock.ts";
  import { ROSTER, type Role } from "../../../sim/src/crew.ts";

  let { ship, frac, progress, send }: {
    ship: State; frac: number; progress: () => number; send: (c: Command) => void } = $props();

  let sky: HTMLCanvasElement | undefined = $state();
  let art: HTMLCanvasElement | undefined = $state();
  let bar: HTMLElement | undefined = $state();
  let picked: number | null = $state(null);
  /** The hand-off: who comes round at the next cluster, chosen as you go under. */
  let rostering = $state(false);
  let next = $state<Role[]>(["engineer", "engineer", "botanist", "pilot"]);
  const roles = [...new Set(ROSTER)] as Role[];
  const over = $derived(seasonOver(ship) && ship.phase === "season");
  const after = $derived(LEGS[ship.leg + 1]);

  const p = $derived(power(ship));
  const f = $derived(fuel(ship));
  const yr = $derived(ship.day / 365);
  const left = $derived(300 - Math.floor(yr));

  /** THE HERO IS THE SEASON, NOT A ROLLING HORIZON.
   *
   *  It used to show a fifteen-year window, which was the right answer while the
   *  voyage was three hundred continuous years. It is the wrong answer now: the
   *  ship is only awake for five clusters of ninety days, and inside one of them
   *  "eleven years out" is not a thing anybody can act on. §1b's whole claim is
   *  that a leg is the unit of play, so the rail runs day 0 to day 90 of THIS
   *  leg and every object in the cluster sits on it at the day it arrives.
   *
   *  That also fixes what the old hero could not say: how far through the season
   *  you are. The fill and the marker are the answer, and they are the same
   *  progress bar the leg strip's five segments summarise. */
  const legStart = $derived(Math.round(LEGS[ship.leg].year * 365));
  const legDays = $derived(LEGS[ship.leg].days);
  const dayIn = $derived(ship.day - legStart);
  /** Objects in this cluster, in the order the ship meets them. */
  const cluster = $derived(ship.schedule.filter(e => e.leg === ship.leg));
  /** Where an object sits on the rail, kept off both ends so it stays tappable. */
  const xpc = (e: Encounter) =>
    4 + Math.max(0, Math.min(1, (e.year * 365 - legStart) / legDays)) * 92;
  /** How far through the season the ship is. Negative during prep — the cluster
   *  has not started, so the marker waits at the line's start. */
  const seasonPc = $derived(Math.max(0, Math.min(100, (dayIn / legDays) * 100)));
  const worked = (e: Encounter) => e.id < ship.next;

  /** The object the panel is about. Tapping picks one; otherwise it is simply
   *  the next one the ship will meet, because that is the one every decision on
   *  this screen is about. */
  const upcoming = $derived(cluster.find(e => !worked(e)) ?? null);
  const sel = $derived(picked === null ? upcoming
                                       : ship.schedule.find(e => e.id === picked) ?? upcoming);
  const selConf = $derived(sel ? confidence(sel, yr) : 0);
  const selMass = $derived(sel ? estimate(trueMass(sel), sel, selConf) : { lo: 0, hi: 0, mid: 0, err: 0 });
  const selDay = $derived(sel ? Math.round(sel.year * 365 - legStart) : 0);
  const selAway = $derived(sel ? Math.max(0, Math.round(sel.year * 365 - ship.day)) : 0);
  const selRock = $derived(sel ? shapeOf(sel.id * 2654435761) : null);
  /** The composition stripe: shares only, no per-material numbers. At this scale
   *  every line would read 1 or 3, which carries less than the share does. */
  const selMix = $derived(sel ? estimateComposition(sel, selConf) : []);

  const conf = (e: Encounter) => confidence(e, yr);
  const mass = (e: Encounter) => estimate(trueMass(e), e, conf(e));
  const scanning = (e: Encounter) => ship.scans.some(x => x.enc === e.id);

  /** Marker size is the estimated haul, and it is sized off the DISPLAY units
   *  rather than raw mass on purpose: the number under the map and the size of
   *  the diamond should be saying the same thing.
   *
   *  This was calibrated against the old twenty-six-object schedule and every
   *  rock pinned the ceiling once a season went down to five bigger ones — five
   *  identical diamonds, which is the one thing this map exists not to be. With
   *  five objects there is about eighty pixels of rail each, so a 20-unit rock
   *  can afford to look like a 20-unit rock. An object already worked shrinks to
   *  a tick: the weight belongs on what is still ahead of you. */
  const px = (e: Encounter) =>
    worked(e) ? 5 : Math.max(8, Math.min(26, 7 + units(mass(e).mid) * 0.95));

  $effect(() => {
    if (!sky) return;
    const cv = sky, ctx = cv.getContext("2d")!;
    let raf = 0, stars: { x: number; y: number; z: number }[] = [];
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * cv.width, y: Math.random() * cv.height, z: Math.random() * 0.9 + 0.1 }));
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(cv);
    const css = getComputedStyle(document.documentElement);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dim = css.getPropertyValue("--faint") || "#4F6070";
      const acc = css.getPropertyValue("--accent") || "#F5C518";
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        s.x -= s.z * 0.55 * dpr;
        if (s.x < 0) { s.x = cv.width; s.y = Math.random() * cv.height; }
        ctx.fillStyle = dim; ctx.globalAlpha = 0.25 + s.z * 0.55;
        ctx.fillRect(s.x, s.y, dpr * (s.z > 0.7 ? 2 : 1), dpr);
      }
      ctx.globalAlpha = 1;
      // The ship marker is DOM on the rail now, positioned by the day it is on,
      // rather than painted at a fixed 13% of a canvas that meant nothing.
      if (bar) bar.style.transform = `scaleX(${progress()})`;
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  });

  /** The object's own portrait. Separate effect from the starfield because it
   *  redraws on a different thing: the starfield is time passing, this is which
   *  rock you are looking at. */
  $effect(() => {
    const cv = art, rock = selRock;
    if (!cv || !rock) return;
    const lit = selConf >= 0.8;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const css = getComputedStyle(document.documentElement);
    const colours = {
      lit: css.getPropertyValue("--accent") || "#F5C518",
      unlit: css.getPropertyValue("--faint") || "#4F6070",
      fill: css.getPropertyValue("--rule") || "#2B3841",
    };
    let raf = 0;
    const size = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
    size();
    const ro = new ResizeObserver(size); ro.observe(cv);
    const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!slow) rock.rot += 0.0016;
      drawRock(cv, rock, lit, colours);
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  });
</script>

<div class="scroll">
  <!-- BAND 1 · the season rail. Day 0 to day 90 of this leg, every object in
       the cluster on it, the ship where it actually is. -->
  <div class="hero">
    <canvas bind:this={sky}></canvas>
    <div class="rail">
      <div class="line"></div>
      <div class="fill" style="width:{seasonPc}%"></div>
      <div class="ship" style="left:{seasonPc}%">➤</div>
      <!-- Tap targets are DOM over the canvas, not hit-tested pixels: an object
           you can prod is the whole point of putting it here. -->
      {#each cluster as e (e.id)}
        <button class="obj" style="left:{xpc(e)}%; --d:{px(e)}px"
                class:known={conf(e) >= 0.8} class:worked={worked(e)}
                class:on={sel?.id === e.id} class:scanning={scanning(e)}
                onclick={() => picked = e.id}
                title="{classReading(e, conf(e))} · day {Math.round(e.year * 365 - legStart)}">
          <span class="dot"></span>
          {#if sel?.id === e.id}
            <span class="yr">d{Math.round(e.year * 365 - legStart)}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="ends">
      <span>{ship.phase === "prep" ? `${-dayIn} days to the belt` : "day 0"}</span>
      <span>day {legDays}</span>
    </div>
  </div>

  <!-- BAND 2 · the object, the same height as the map. Two equal plates: where
       you are, and what is coming. The rock is drawn rather than iconic, and it
       is the same rock every time you come back to it. -->
  {#if sel}
    <div class="objd">
      <div class="info">
        <div class="label">
          {worked(sel) ? "Worked" : "Next object"} · day {selDay}{
            worked(sel) ? "" : selAway > 0 ? ` · ${selAway} days` : " · now"}
        </div>
        <div class="name" class:unk={selConf < 0.45}>{classReading(sel, selConf)}</div>
        <div class="haul">
          <b>{units(selMass.lo)}–{units(selMass.hi)}</b><em>units</em>
        </div>
        {#if selConf < 0.45}
          <div class="cbar unk"></div>
          <div class="ckey"><span>composition unknown</span></div>
        {:else}
          <div class="cbar">
            {#each selMix as row}
              <i style="width:{Math.min(100, row.share * 100)}%;
                        background:{MATERIAL_COLOUR[row.what] ?? 'var(--dim)'}"></i>
            {/each}
          </div>
          <div class="ckey">
            {#each selMix.slice(0, 4) as row}
              <span><i style="background:{MATERIAL_COLOUR[row.what] ?? 'var(--dim)'}"></i>{
                (MATERIAL[row.what] ?? row.what).replace(/^(Metal |Water |Rare )/, "").toLowerCase()
              }</span>
            {/each}
          </div>
        {/if}
        <div class="foot">
          {#if scanning(sel)}
            {@const sc = ship.scans.find(x => x.enc === sel!.id)!}
            <span class="bar"><i style="width:{Math.min(100, ((sc.done + frac) / sc.work) * 100)}%"></i></span>
            <span class="pc">looking · {hours(Math.max(0, sc.work - sc.done - frac))}</span>
          {:else}
            <span class="bar"><i style="width:{selConf * 100}%"></i></span>
            <span class="pc">{Math.round(selConf * 100)}% · {sel.scans} scan{sel.scans === 1 ? "" : "s"}</span>
            {#if worthScanning(sel, yr) && !worked(sel)}
              <button class="scan" onclick={() => send({ kind: "rescan", enc: sel!.id })}>
                Rescan {hours(SCAN_HOURS)}
              </button>
            {/if}
          {/if}
        </div>
      </div>
      <div class="art">
        <canvas bind:this={art}></canvas>
        <div class="tagd">d{selDay}</div>
      </div>
    </div>
  {/if}

    {#if ship.phase === "transit"}
      <div class="pad dark">
        <div class="label">The long dark</div>
        <div class="big">{(after ? after.year - ship.day / 365 : 300 - ship.day / 365).toFixed(1)}
          <span class="dim">years to go</span></div>
        <div class="sentence dim">
          Everyone is under. The reactor is throttled and the ship is cold.
          Nothing is running, so nothing is wearing out.
        </div>
      </div>
    {/if}

    {#if over}
      <!-- The cluster is behind you. The only thing left is to say who wakes up
           at the next one — decades from now, with whatever you leave them. -->
      <div class="pad handoff">
        <div class="label">The season is over</div>
        {#if rostering}
          <div class="sentence dim">
            Four berths. {after ? `${Math.round(after.year - ship.day / 365)} years to ${after.name}.`
                                : "The last stretch to target."}
          </div>
          {#each next as _, i}
            <div class="berth">
              <span class="faint">{i + 1}</span>
              {#each roles as r}
                <button class="pick" aria-pressed={next[i] === r}
                        disabled={ship.pool[r] <= 0}
                        onclick={() => next[i] = r}>{r.slice(0, 3)}</button>
              {/each}
            </div>
          {/each}
          <div class="sentence faint">
            {roles.map(r => `${ship.pool[r]} ${r}s`).join(" · ")} left in the bank
          </div>
          <button class="act" onclick={() => send({ kind: "goDark", next: [...next] })}>
            Put everyone under
          </button>
        {:else}
          <div class="sentence">
            {num(ship.counters.encountersTaken)} objects worked.
            Whatever is on the shelves now is what the next crew inherit.
          </div>
          <button class="act" onclick={() => rostering = true}>Choose the next crew</button>
        {/if}
      </div>
    {/if}

    <div class="pad">
      <div class="label">Voyage</div>
      <div class="big">Year {num(Math.floor(yr))} <span class="dim">of 300</span></div>
      <div class="track"><i bind:this={bar}></i></div>
      <div class="sentence dim">
        Behind you: {num(ship.counters.encountersTaken)} rocks taken,
        {num(ship.counters.encountersMissed)} missed,
        {num(ship.colony.diedAwake + ship.colony.diedFrozen)} people dead.
        Ahead: {num(left)} years.
      </div>
      {#if ship.phase === "transit"}
        <div class="sentence faint">Nothing ahead. This is the Long Dark.</div>
      {:else}
        <div class="sentence faint">
          {cluster.filter(e => !worked(e)).length} of {cluster.length} objects left in
          {LEGS[ship.leg].name} · {ship.drones} drone{ship.drones === 1 ? "" : "s"} to
          work them · tap one on the rail to survey it
        </div>
      {/if}
    </div>

    <div class="hr pad">
      <div class="label">Fuel</div>
      <div class="big">{num(ship.rods, 1)} <span class="dim">rods</span></div>
      <div class="sentence dim">
        {#if !f.onTrack}
          <span class="crit">Short.</span> {num(f.needed)} rods to finish the voyage at
          this burn, and {num(ship.rods, 1)} aboard.
        {:else}
          On track: {num(f.needed)} more rods will finish the voyage.
          Started with {START_RODS}, {num(ship.counters.rodsMade)} made since.
        {/if}
      </div>
      <div class="two">
        <div><div class="label">Made</div><div class:crit={p.short}>{num(p.made)} kW</div></div>
        <div><div class="label">Needed</div><div class="dim">{num(p.needed)} kW</div></div>
      </div>
    </div>
</div>

<style>
  /* BAND 1 — the season rail through the drift. */
  .hero { height: 150px; border-bottom: 1px solid var(--rule);
          background: var(--panel); position: relative; overflow: hidden; }
  .hero > canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .rail { position: absolute; inset: 0; }
  .rail .line { position: absolute; left: 0; right: 0; top: 74px; height: 1px;
                background: var(--rule); }
  .rail .fill { position: absolute; left: 0; top: 74px; height: 1px; background: var(--accent); }
  .rail .ship { position: absolute; top: 66px; transform: translateX(-50%);
                color: var(--accent); font-size: 13px; line-height: 1;
                text-shadow: 0 0 8px rgba(245,197,24,.55); pointer-events: none; }
  .ends { position: absolute; left: 12px; right: 12px; bottom: 8px; display: flex;
          justify-content: space-between; font-size: 9px; color: var(--faint);
          letter-spacing: .08em; text-transform: uppercase; pointer-events: none; }

  .obj { position: absolute; top: 74px; transform: translate(-50%, -50%);
         display: grid; gap: 3px; justify-items: center; padding: 8px 1px; }
  /* The label only ever belongs to the selected object — twenty-six of them
     under a 430px rail is not a readout, it is a texture. */
  .obj .yr { position: absolute; top: calc(50% + 12px); left: 50%;
             transform: translateX(-50%); white-space: nowrap; }
  .dot { display: block; width: var(--d); height: var(--d);
         border: 1.5px solid var(--accent); transform: rotate(45deg); }
  .obj.known .dot { background: var(--accent); }
  /* An object the ship has already passed is history: no colour, no pull. */
  .obj.worked .dot { border-color: var(--faint); background: var(--faint); }
  .obj.on .dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
  .obj.scanning .dot { animation: ping 1.1s ease-in-out infinite; }
  @keyframes ping { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .obj.scanning .dot { animation: none } }
  .yr { font-size: 8.5px; color: var(--faint); }
  .obj:hover .dot { border-color: var(--text); }

  /* BAND 2 — the object, matched to the hero so the two read as equal plates. */
  .objd { display: grid; grid-template-columns: minmax(0,1fr) 25%; height: 150px;
          border-bottom: 1px solid var(--rule); }
  .objd .info { padding: 10px 12px; display: flex; flex-direction: column; min-width: 0; }
  .objd .art { position: relative; border-left: 1px solid var(--rule); background: var(--panel); }
  .objd .art > canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .objd .tagd { position: absolute; left: 0; right: 0; bottom: 6px; text-align: center;
                font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase;
                color: var(--faint); }
  .objd .name { font-size: 15px; margin: 2px 0 1px; }
  .objd .name.unk { color: var(--dim); }
  .haul { display: flex; align-items: baseline; gap: 6px; }
  .haul b { font-weight: 500; font-size: 23px; line-height: 1.1; letter-spacing: -.02em; }
  .haul em { font-style: normal; font-size: 10.5px; letter-spacing: .1em;
             text-transform: uppercase; color: var(--faint); }
  .cbar { margin-top: 7px; display: flex; height: 5px; overflow: hidden; background: var(--panel2); }
  .cbar i { display: block; height: 100%; min-width: 2px; }
  .cbar.unk { background: repeating-linear-gradient(90deg,
              var(--panel2) 0 4px, transparent 4px 8px); }
  .ckey { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 2px 10px;
          font-size: 9.5px; color: var(--faint); }
  .ckey span { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .ckey i { display: inline-block; width: 6px; height: 6px; flex: none; }
  .objd .foot { margin-top: auto; display: flex; align-items: center; gap: 7px; }
  .objd .foot .bar { flex: 1; height: 3px; background: var(--panel2); overflow: hidden; }
  .objd .foot .bar i { display: block; height: 100%; background: var(--accent); }
  .objd .pc { font-size: 10px; color: var(--faint); white-space: nowrap; }
  .scan { flex: none; white-space: nowrap; font-size: 10.5px; padding: 4px 9px;
          border: 1px solid var(--accent); color: var(--accent); }
  .track { height: 3px; background: var(--panel2); margin: 8px 0; overflow: hidden; }
  .track > i { display: block; height: 100%; background: var(--accent);
               transform-origin: left; transform: scaleX(0); }
  .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; margin-top: 8px; }
  .conf { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .conf .bar { flex: 1; }
  .conf .faint { font-size: 10.5px; white-space: nowrap; }
  .comp { display: grid; grid-template-columns: 70px minmax(0,1fr) 62px; gap: 8px;
          align-items: center; font-size: 11px; padding: 3px 0; }
  .comp .bar { height: 3px; }
  .comp .faint { text-align: right; }
  .dark { background: color-mix(in srgb, var(--accent) 6%, transparent);
          border-bottom: 1px solid var(--rule); }
  .handoff { background: var(--panel); border-bottom: 1px solid var(--rule); }
  .berth { display: flex; gap: 5px; align-items: center; margin-bottom: 5px; }
  .berth .faint { width: 12px; }
  .berth .pick { flex: 1; border: 1px solid var(--rule); color: var(--dim);
                 padding: 5px 0; font-size: 10.5px; text-transform: uppercase; }
  .berth .pick[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
  .berth .pick:disabled { opacity: .3; }
  .scanning { margin-top: 16px; display: grid; gap: 5px; }
  .scanning .faint { font-size: 11px; }
  .act { display: block; width: 100%; border: 1px solid var(--accent); color: var(--accent);
         padding: 9px; text-align: center; margin-top: 16px; }
  .act:disabled { border-color: var(--rule); color: var(--faint); }
</style>
