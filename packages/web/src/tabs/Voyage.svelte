<script lang="ts">
  /** design/README: "A progress bar says where you are; this says what it cost
   *  to get there." Two scales, because 300 years and the next decade are
   *  different questions. Fuel lives here because it is a property of the
   *  journey, not of a room. */
  import type { State } from "../../../sim/src/types.ts";
  import { DAYS, START_RODS } from "../../../sim/src/sim.ts";
  import { fuel, num, power, year } from "../lib/view.ts";

  let { ship, progress }: { ship: State; progress: () => number } = $props();

  let sky: HTMLCanvasElement | undefined = $state();
  let bar: HTMLElement | undefined = $state();

  const p = $derived(power(ship));
  const f = $derived(fuel(ship));
  const yr = $derived(year(ship.day));
  const left = $derived(300 - yr);

  /** The thirty-year lane: the one the player can actually act on. */
  const soon = $derived(ship.schedule.filter(e => e.year > yr && e.year < yr + 30).slice(0, 9));

  $effect(() => {
    if (!sky) return;
    const cv = sky, ctx = cv.getContext("2d")!;
    let raf = 0, stars: { x: number; y: number; z: number }[] = [];
    const dpr = Math.min(2, devicePixelRatio || 1);

    const size = () => {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * cv.width, y: Math.random() * cv.height, z: Math.random() * 0.9 + 0.1,
      }));
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(cv);

    // ARCHITECTURE §4: continuous motion is rAF reading interpolated values, and
    // never a re-render. design/README: a drifting background means TIME PASSING
    // — distinct from a discrete marker travelling, which means a specific thing
    // is moving. Nothing on this canvas is a delivery.
    const css = getComputedStyle(document.documentElement);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dim = css.getPropertyValue("--faint") || "#59503F";
      const acc = css.getPropertyValue("--accent") || "#E8A33D";
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        s.x -= s.z * 0.55 * dpr;
        if (s.x < 0) { s.x = cv.width; s.y = Math.random() * cv.height; }
        ctx.fillStyle = dim; ctx.globalAlpha = 0.25 + s.z * 0.55;
        ctx.fillRect(s.x, s.y, dpr * (s.z > 0.7 ? 2 : 1), dpr);
      }
      ctx.globalAlpha = 1;
      // the ship, holding station in the middle while the sky moves past it
      const cy = cv.height / 2, cx = cv.width * 0.5;
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

<div class="scroll">
  <div class="hero"><canvas bind:this={sky}></canvas></div>

  <div class="pad">
    <div class="label">Voyage</div>
    <div class="big">Year {num(yr)} <span class="dim">of 300</span></div>
    <div class="track"><i bind:this={bar}></i></div>
    <div class="sentence dim">
      Behind you: {num(ship.counters.encountersTaken)} rocks taken,
      {num(ship.counters.encountersMissed)} missed,
      {num(ship.colony.diedAwake + ship.colony.diedFrozen)} people dead.
      Ahead: {num(left)} years.
    </div>
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

  <div class="hr pad">
    <div class="label">Next thirty years</div>
    {#if soon.length === 0}
      <div class="sentence dim">Nothing surveyed ahead. This is the Long Dark.</div>
    {:else}
      <div class="lane">
        {#each soon as e}
          <div class="obj" style="left:{4 + ((e.year - yr) / 30) * 92}%"
               title="{e.cls}-type, year {Math.round(e.year)}">
            <span class="d">{e.richness > 1.5 ? "◆" : "◇"}</span>
            <span class="y">{Math.round(e.year - yr)}y</span>
          </div>
        {/each}
      </div>
      <div class="sentence dim">
        {soon.length} object{soon.length > 1 ? "s" : ""} ahead ·
        {ship.drones} drone{ship.drones === 1 ? "" : "s"} to work them
      </div>
    {/if}
  </div>
</div>

<style>
  .hero { height: 128px; border-bottom: 1px solid var(--rule); background: var(--panel); }
  canvas { display: block; width: 100%; height: 100%; }
  .track { height: 3px; background: var(--panel2); margin: 8px 0; overflow: hidden; }
  .track > i { display: block; height: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); }
  .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; margin-top: 8px; }
  .lane { position: relative; height: 38px; margin: 10px 0 2px; border-bottom: 1px solid var(--rule); }
  .obj { position: absolute; transform: translateX(-50%); text-align: center; }
  .d { display: block; color: var(--accent); font-size: 13px; }
  .y { display: block; color: var(--faint); font-size: 9px; }
</style>
