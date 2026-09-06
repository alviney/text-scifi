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
  import { fuel, hours, num, power, MATERIAL } from "../lib/view.ts";
  import { seasonOver } from "../../../sim/src/sim.ts";
  import { LEGS } from "../../../sim/src/legs.ts";
  import { ROSTER, type Role } from "../../../sim/src/crew.ts";

  let { ship, frac, progress, send }: {
    ship: State; frac: number; progress: () => number; send: (c: Command) => void } = $props();

  let sky: HTMLCanvasElement | undefined = $state();
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

  /** The window the hero covers, and how many objects it will draw.
   *
   *  Thirty years put eighteen diamonds across the strip in Act I, most of them
   *  overlapping — which defeats the point, since the reason they are here is to
   *  read size at a glance. Fifteen years and a cap of eight keeps them apart,
   *  and fifteen years is still comfortably "coming up". */
  const HORIZON = 15;
  const SHOWN = 8;
  const window_ = $derived(ship.schedule.filter(e => e.year > yr && e.year < yr + HORIZON));
  const ahead = $derived(window_.slice(0, SHOWN));
  const sel = $derived(picked === null ? null : ship.schedule.find(e => e.id === picked) ?? null);
  const selConf = $derived(sel ? confidence(sel, yr) : 0);
  const selMass = $derived(sel ? estimate(trueMass(sel), sel, selConf) : { lo: 0, hi: 0, mid: 0, err: 0 });

  const conf = (e: Encounter) => confidence(e, yr);
  const mass = (e: Encounter) => estimate(trueMass(e), e, conf(e));
  const scanning = (e: Encounter) => ship.scans.some(x => x.enc === e.id);

  /** Marker size is the estimated haul, clamped so the smallest is still a
   *  tappable target and the biggest does not swallow its neighbours. */
  const px = (e: Encounter) => Math.max(8, Math.min(22, 6 + mass(e).mid / 150));
  const xpc = (e: Encounter) => 16 + ((e.year - yr) / HORIZON) * 80;

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
      const cy = cv.height * 0.5, cx = cv.width * 0.13;
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(cx + 11 * dpr, cy); ctx.lineTo(cx - 8 * dpr, cy - 5 * dpr);
      ctx.lineTo(cx - 4 * dpr, cy); ctx.lineTo(cx - 8 * dpr, cy + 5 * dpr);
      ctx.closePath(); ctx.fill();
      if (bar) bar.style.transform = `scaleX(${progress()})`;
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  });
</script>

{#if sel}
  <!-- The detail screen: one object, and everything the ship can tell about it. -->
  <div class="scroll">
    <button class="back" onclick={() => picked = null}>‹ Voyage</button>
    <div class="pad">
      <div class="label">Object ahead</div>
      <div class="big">{classReading(sel, selConf)}</div>
      <div class="sentence dim">
        {(sel.year - yr).toFixed(1)} years out.
        {#if selConf < 0.45}
          Little more than a return off the array — it could be almost anything.
        {:else if selConf < 0.8}
          Enough for a guess. Another look would tighten it.
        {:else}
          As good a reading as you will get from here.
        {/if}
      </div>

      <div class="label" style="margin-top:14px">Estimated haul</div>
      <div class="big">{num(selMass.lo)}<span class="dim">–</span>{num(selMass.hi)}
        <span class="dim">units</span></div>
      <div class="conf">
        <div class="bar"><i style="width:{selConf * 100}%"></i></div>
        <span class="faint">{Math.round(selConf * 100)}% confidence · {sel.scans}
          scan{sel.scans === 1 ? "" : "s"}</span>
      </div>

      <div class="label" style="margin-top:14px">What's in it</div>
      {#each estimateComposition(sel, selConf) as row}
        <div class="comp">
          <span>{MATERIAL[row.what] ?? row.what}</span>
          <span class="bar"><i style="width:{Math.min(100, row.mid * 100)}%"></i></span>
          <span class="faint">{(row.lo * 100).toFixed(0)}–{(row.hi * 100).toFixed(0)}%</span>
        </div>
      {/each}

      {#if scanning(sel)}
        {@const sc = ship.scans.find(x => x.enc === sel!.id)!}
        <div class="scanning">
          <div class="bar"><i style="width:{Math.min(100, ((sc.done + frac) / sc.work) * 100)}%"></i></div>
          <span class="faint">Array is looking — {hours(Math.max(0, sc.work - sc.done - frac))} left</span>
        </div>
      {:else if worthScanning(sel, yr)}
        <button class="act" onclick={() => send({ kind: "rescan", enc: sel!.id })}>
          Rescan — {hours(SCAN_HOURS)}
        </button>
      {:else}
        <button class="act" disabled>Nothing more to learn from here</button>
      {/if}
      <div class="sentence faint">
        The array is yours to point. It costs an hour and the reading comes back
        on the feed.
      </div>
    </div>
  </div>

{:else}
  <div class="scroll">
    <div class="hero">
      <canvas bind:this={sky}></canvas>
      <!-- Tap targets are DOM over the canvas, not hit-tested pixels: an object
           you can prod is the whole point of putting it here. -->
      <div class="objs">
        {#each ahead as e (e.id)}
          <button class="obj" style="left:{xpc(e)}%; --d:{px(e)}px"
                  class:known={conf(e) >= 0.8} class:scanning={scanning(e)}
                  onclick={() => picked = e.id}
                  title="{classReading(e, conf(e))} · {(e.year - yr).toFixed(1)}y">
            <span class="dot"></span>
            <span class="yr">{Math.round(e.year - yr)}y</span>
          </button>
        {/each}
      </div>
    </div>

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
      {#if window_.length}
        <div class="sentence faint">
          {window_.length} object{window_.length === 1 ? "" : "s"} inside fifteen years{
            window_.length > SHOWN ? ` (nearest ${SHOWN} shown)` : ""} ·
          {ship.drones} drone{ship.drones === 1 ? "" : "s"} to work them ·
          tap one to survey it
        </div>
      {:else}
        <div class="sentence faint">Nothing surveyed ahead. This is the Long Dark.</div>
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
{/if}

<style>
  .hero { height: 128px; border-bottom: 1px solid var(--rule);
          background: var(--panel); position: relative; }
  canvas { display: block; width: 100%; height: 100%; }
  .objs { position: absolute; inset: 0; }
  .obj { position: absolute; top: 50%; transform: translate(-50%, -50%);
         display: grid; gap: 3px; justify-items: center; padding: 6px 4px; }
  .dot { display: block; width: var(--d); height: var(--d);
         border: 1px solid var(--accent); transform: rotate(45deg); }
  .obj.known .dot { background: var(--accent); }
  .obj.scanning .dot { animation: ping 1.1s ease-in-out infinite; }
  @keyframes ping { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .obj.scanning .dot { animation: none } }
  .yr { font-size: 9px; color: var(--faint); }
  .obj:hover .dot { border-color: var(--text); }

  .back { display: block; width: 100%; text-align: left; padding: 8px 12px;
          color: var(--dim); border-bottom: 1px solid var(--rule); font-size: 11px; }
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
