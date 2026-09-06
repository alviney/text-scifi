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
  import { classReading, confidence, estimate, estimateComposition, trueMass,
           worthScanning, SCAN_HOURS, dvCost, inWindow, windowOpens, windowCloses,
           windowGone, sortiesFor, WINDOW_LEAD } from "../../../sim/src/encounters.ts";
  import { launchBlocked, sortieCost, waveCost } from "../../../sim/src/sim.ts";
  import { hours, num, MATERIAL, MATERIAL_COLOUR, units, ROOM_OF_FAC,
           haulable, hauling } from "../lib/view.ts";
  import { HOLD } from "../../../sim/src/logistics.ts";
  import { seasonOver } from "../../../sim/src/sim.ts";
  import { LEGS, PREP_DAYS } from "../../../sim/src/legs.ts";
  import { shapeOf, drawRock } from "../lib/rock.ts";
  import { goals } from "../../../sim/src/goals.ts";
  import { ROSTER, type Role } from "../../../sim/src/crew.ts";

  let { ship, frac, progress, send }: {
    ship: State; frac: number; progress: () => number; send: (c: Command) => void } = $props();

  let sky: HTMLCanvasElement | undefined = $state();
  let art: HTMLCanvasElement | undefined = $state();
  let bar: HTMLElement | undefined = $state();
  let picked: number | null = $state(null);
  /** The goals collapse to one line so the object gets the room. Opening them
   *  is the only place on this screen with space for a voice. */
  let openGoals = $state(false);
  /** The hand-off: who comes round at the next cluster, chosen as you go under. */
  let rostering = $state(false);
  let next = $state<Role[]>(["engineer", "engineer", "botanist", "pilot"]);
  const roles = [...new Set(ROSTER)] as Role[];
  const over = $derived(seasonOver(ship) && ship.phase === "season");
  const after = $derived(LEGS[ship.leg + 1]);

  const stage = $derived(goals(ship));
  const stageMet = $derived(stage.filter(g => g.met).length);
  /** The board, newest first. The ticker rotates and forgets; this keeps things
   *  up, with the room that filed them and the day it happened. Chatter is the
   *  ship talking to itself and does not belong on a noticeboard. */
  const board = $derived([...ship.signals].filter(g => g.level !== "chatter").reverse().slice(0, 12));

  const yr = $derived(ship.day / 365);

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
  /** WORKED MEANS THE FLEET WENT THERE. It used to mean "the ship has passed
   *  it", which was the same thing while step() harvested everything it met. */
  const worked = (e: Encounter) => e.flown > 0;
  const gone = (e: Encounter) => windowGone(e, ship.day);
  const open = (e: Encounter) => inWindow(e, ship.day);
  const onStation = (e: Encounter) => ship.sortie?.enc === e.id;

  /** The object the panel is about. Tapping picks one; otherwise it is simply
   *  the next one the ship will meet, because that is the one every decision on
   *  this screen is about. */
  /** The object every decision on this screen is about: whatever the fleet is
   *  working, else the nearest one still in range, else the next to open. */
  const upcoming = $derived(
    cluster.find(e => onStation(e))
    ?? cluster.filter(e => open(e)).sort((a, b) => a.year - b.year)[0]
    ?? cluster.find(e => !gone(e))
    ?? cluster.at(-1) ?? null);
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

  /** §6b: everything about sending the drones somewhere. */
  const wave = $derived(ship.sortie);
  const waveEnc = $derived(wave ? ship.schedule.find(e => e.id === wave.enc) ?? null : null);
  const selDv = $derived(sel ? dvCost(sel, ship.day) : 1);
  const selCost = $derived(sel ? Math.round(waveCost(ship, sel)) : 0);
  const selBlocked = $derived(sel ? launchBlocked(ship, sel) : "no object");
  const selLeft = $derived(sel ? Math.ceil(windowCloses(sel) - ship.day) : 0);
  const selOpensIn = $derived(sel ? Math.ceil(windowOpens(sel) - ship.day) : 0);
  /** Days until this object is at its cheapest. Negative once it is past. */
  const selCheapIn = $derived(sel ? Math.ceil(sel.year * 365 - ship.day) : 0);

  /** The status line above the object's name. */
  const selState = $derived.by(() => {
    if (!sel) return "";
    if (onStation(sel)) return `Fleet on station · ${selLeft}d of window left`;
    if (gone(sel)) return worked(sel) ? `Worked · ${units(sel.landed)} units aboard`
                                      : "Gone · never worked";
    if (open(sel)) return `In range · ${selLeft} day${selLeft === 1 ? "" : "s"} left`;
    return `Opens in ${selOpensIn} day${selOpensIn === 1 ? "" : "s"}`;
  });

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
   *  A worked object keeps its size and goes solid: it is history, not absent,
   *  and shrinking it to a tick lost the shape of the season behind you. */
  const px = (e: Encounter) => Math.max(8, Math.min(26, 7 + units(mass(e).mid) * 0.95));

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

  /** The object's own portrait.
   *
   *  THE EFFECT MUST DEPEND ON THE CANVAS AND NOTHING ELSE. It used to read
   *  `selRock` and `selConf` in its body, and `selConf` is confidence, which is
   *  a function of how far away the object is — so it changed on every game
   *  hour. Every tick tore the effect down and rebuilt it, and rebuilding calls
   *  size(), which sets cv.width and blanks the canvas. That is the flicker: the
   *  rock was being wiped and redrawn from scratch once a second.
   *
   *  Reading them inside frame() instead is safe because frame() runs from
   *  requestAnimationFrame, outside the effect's synchronous tracking window, so
   *  it sees the current values without subscribing to them. The first call has
   *  to be scheduled rather than made directly for the same reason. */
  $effect(() => {
    const cv = art;
    if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const css = getComputedStyle(document.documentElement);
    const colours = {
      lit: css.getPropertyValue("--accent") || "#F5C518",
      unlit: css.getPropertyValue("--faint") || "#4F6070",
      fill: css.getPropertyValue("--rule") || "#2B3841",
    };
    let raf = 0;
    const size = () => {
      const w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
      // Only touch the backing store when it actually changed: assigning to
      // cv.width clears the canvas even when the value is identical.
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    };
    const ro = new ResizeObserver(size); ro.observe(cv);
    const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const rock = selRock;
      if (!rock) return;
      size();
      if (!slow) rock.rot += 0.0016;
      drawRock(cv, rock, selConf >= 0.8, colours);
    };
    raf = requestAnimationFrame(frame);
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
                class:gone={gone(e) && !worked(e)} class:range={open(e) && !onStation(e)}
                class:station={onStation(e)}
                class:on={sel?.id === e.id} class:scanning={scanning(e)}
                onclick={() => picked = e.id}
                title="{classReading(e, conf(e))} · day {Math.round(e.year * 365 - legStart)}">
          <span class="dot"></span>
          <span class="yr">d{Math.round(e.year * 365 - legStart)}</span>
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
        <div class="label" class:live={open(sel) && !gone(sel)}>{selState}</div>
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
        <!-- §6b: THE DECISION. Everything above this is what the ship can tell
             you about the rock; this is what it costs to go and get it. -->
        {#if !gone(sel)}
          <div class="fleet" class:out={onStation(sel)}>
            {#if onStation(sel) && wave}
              <div class="wrow">
                <span class="bar"><i style="width:{(wave.flown / wave.want) * 100}%"></i></span>
                <span class="pc">{wave.flown}/{wave.want} sorties</span>
              </div>
              <div class="wrow small">
                <span>{(wave.landed / 1000).toFixed(1)} of {units(selMass.mid)} units ·
                      {wave.burned.toFixed(0)} water</span>
                <button class="recall" onclick={() => send({ kind: "recall" })}>Recall</button>
              </div>
              {#if ship.bayHeld}
                <div class="hold">Holding station — the Cargo Bay is full.</div>
                <!-- The fix, one tap from the problem. A drone will not burn
                     water to bring a load to a shelf with no room on it, so
                     the length of a wave is set by how fast the bay drains. -->
                {#each haulable(ship, HOLD).slice(0, 2) as h (h.key)}
                  <div class="carry">
                    <span class="what">{num(h.qty)} {(MATERIAL[h.key] ?? h.key).toLowerCase()}</span>
                    {#each h.to as dest}
                      {@const busy = hauling(ship, h.key, dest)}
                      <button class="chip" disabled={busy}
                              onclick={() => send({ kind: "haul", from: HOLD, to: dest, what: h.key })}>
                        {busy ? `going to ${dest}` : `→ ${dest}`}
                      </button>
                    {/each}
                  </div>
                {/each}
              {/if}
            {:else}
              <div class="wrow">
                <span class="dv" class:cheap={selDv < 1.25} class:dear={selDv > 1.8}
                      >×{selDv.toFixed(1)}</span>
                <span class="small">{selCheapIn > 0 ? `cheapest in ${selCheapIn}d`
                                                    : "past its cheapest — it is receding"}</span>
              </div>
              <button class="launch" disabled={!!selBlocked}
                      onclick={() => send({ kind: "launch", enc: sel!.id })}>
                {selBlocked ?? `Send the fleet · ${selCost} water`}
              </button>
            {/if}
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

  <!-- BAND 3 · the season's brief, collapsed to a line. Tapping opens it,
       because a goal is the one thing on this screen with room for a voice. -->
  <button class="goals1" onclick={() => openGoals = !openGoals}
          aria-expanded={openGoals}>
    <span class="g" class:ok={stageMet === stage.length}>{stageMet === stage.length ? "●" : "○"}</span>
    <span>Critical tasks</span>
    <span class="n" class:ok={stageMet === stage.length}>{stageMet}/{stage.length}</span>
    <span class="chev">{openGoals ? "⌄" : "›"}</span>
  </button>

  {#if openGoals}
    <div class="goals">
      {#each stage as g (g.id)}
        <div class="goal" class:met={g.met} class:key={g.critical}>
          <div class="top">
            <span class="gl">{g.met ? "●" : g.critical ? "○" : "◐"}</span>
            <span class="t">{g.name}</span>
            <span class="v">{g.detail}</span>
          </div>
          <!-- §5c: somebody decided this before you existed, and wrote down why.
               It is the only part of this screen that could not be generated
               from the numbers. -->
          <blockquote class="why">{g.because}<cite>— {g.by}, at departure</cite></blockquote>
        </div>
      {/each}
    </div>
  {/if}

  <!-- BAND 4 · the bulletin. Not the ticker: that rotates and forgets, this
       keeps things up with the room that filed them and the day it happened. -->
  <div class="board">
    <div class="label">Bulletin</div>
    {#if board.length === 0}
      <div class="sentence faint">Nothing posted yet.</div>
    {:else}
      {#each board as n, i (n.day + n.code + i)}
        <div class="note {n.level}">
          <!-- The day is the SEASON's, not the voyage's. "d710" is true and
               useless; "d13" is the day the crew would say. -->
          <div class="nh">
            <span class="src">{ROOM_OF_FAC[n.fac] ?? n.fac}{n.by ? ` · ${n.by}` : ""}</span>
            <!-- A note filed before the cluster arrives has no season day to
                 give. "d-20" is arithmetic; "prep" is where you were. -->
            <span>{n.day - legStart >= 0 ? `d${n.day - legStart}` : "prep"}</span>
          </div>
          <div class="nb">{n.text}</div>
        </div>
      {/each}
    {/if}
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

</div>

<style>
  /* §6b — the launch control. The one button that decides a season. */
  .fleet { margin-top: 7px; display: grid; gap: 4px; }
  .wrow { display: flex; align-items: center; gap: 7px; }
  .wrow .small, .fleet .small { font-size: 10px; color: var(--faint); }
  .dv { font-size: 11px; font-weight: 600; color: var(--dim);
        border: 1px solid var(--rule); padding: 1px 5px; }
  .dv.cheap { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .dv.dear { color: var(--warn, #E8A33D);
             border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
  .launch { width: 100%; padding: 6px; font: inherit; font-size: 11px; letter-spacing: .06em;
            text-transform: uppercase; color: var(--bg); background: var(--accent);
            border: 0; cursor: pointer; }
  .launch:disabled { background: transparent; color: var(--faint);
                     border: 1px solid var(--rule); cursor: default;
                     text-transform: none; letter-spacing: 0; }
  .recall { font: inherit; font-size: 10px; color: var(--dim); background: transparent;
            border: 1px solid var(--rule); padding: 2px 7px; cursor: pointer;
            margin-left: auto; }
  .hold { font-size: 10px; color: var(--accent); }
  .carry { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10.5px; }
  .carry .what { color: var(--dim); margin-right: auto; }
  .chip { font: inherit; font-size: 10px; letter-spacing: .04em; color: var(--accent);
          background: transparent; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
          padding: 3px 8px; cursor: pointer; white-space: nowrap; }
  .chip:disabled { color: var(--faint); border-color: var(--rule); cursor: default; }
  .label.live { color: var(--accent); }

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
  /* Every object carries its day. This was cut back to the selected one only
     while a leg had twenty-six of them and the labels ran together; with five
     there is room, and the day an object arrives is half of what the map is
     for. */
  .obj .yr { position: absolute; top: calc(50% + 13px); left: 50%;
             transform: translateX(-50%); white-space: nowrap; }
  .obj.on .yr { color: var(--dim); }
  .dot { display: block; width: var(--d); height: var(--d);
         border: 1.5px solid var(--accent); transform: rotate(45deg); }
  .obj.known .dot { background: var(--accent); }
  /* An object the ship has already passed is history: no colour, no pull. */
  .obj.worked .dot { border-color: var(--ok); background: var(--ok); }
  /* One that went past unworked is the thing this screen exists to prevent. */
  .obj.gone .dot { border-color: var(--faint); background: transparent; opacity: .45; }
  /* In range: reachable RIGHT NOW, which is the only state you can act on. */
  .obj.range .dot { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
  .obj.station .dot { animation: ping .9s ease-in-out infinite; }
  .obj.on .dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
  .obj.scanning .dot { animation: ping 1.1s ease-in-out infinite; }
  @keyframes ping { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .obj.scanning .dot { animation: none } }
  .yr { font-size: 8.5px; color: var(--faint); }
  .obj:hover .dot { border-color: var(--text); }

  /* BAND 2 — the object, matched to the hero so the two read as equal plates. */
  /* MIN-height, not height. This was a fixed 150px to match the map above it —
     two equal plates — and the launch control pushed the survey bar straight
     through the bottom of it and under the goals row. The art column is a grid
     item and stretches to whatever the info column needs, so the plates stay
     equal at whatever height the band settles on. */
  .objd { display: grid; grid-template-columns: minmax(0,1fr) 25%; min-height: 150px;
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

  /* BAND 3 — the brief, one line until you want it. */
  .goals1 { display: grid; grid-template-columns: auto minmax(0,1fr) auto auto;
            gap: 9px; align-items: baseline; width: 100%; text-align: left;
            padding: 11px 12px; border-bottom: 1px solid var(--rule); font-size: 12px; }
  .goals1 .g, .goals1 .n { color: var(--crit); }
  .goals1 .g.ok, .goals1 .n.ok { color: var(--ok); }
  .goals1 .n { font-variant-numeric: tabular-nums; }
  .goals1 .chev { color: var(--faint); }
  .goals1:hover { background: var(--panel); }
  .goals { border-bottom: 1px solid var(--rule); background: var(--panel); padding: 4px 12px 10px; }
  .goal { padding: 9px 0; border-top: 1px solid var(--rule); }
  .goal:first-child { border-top: 0; }
  .goal .top { display: grid; grid-template-columns: 14px minmax(0,1fr); gap: 8px;
               align-items: baseline; }
  .goal .gl { color: var(--dim); font-size: 11px; }
  .goal.met .gl { color: var(--ok); }
  .goal.key:not(.met) .gl { color: var(--crit); }
  .goal .t { font-size: 12.5px; }
  .goal .v { grid-column: 2; font-size: 10.5px; color: var(--faint);
             font-variant-numeric: tabular-nums; margin-top: 1px; }
  .why { margin: 6px 0 0; grid-column: 2; padding-left: 22px; font-size: 11.5px;
         line-height: 1.55; color: var(--dim); }
  .why cite { display: block; margin-top: 5px; font-style: normal; font-size: 10px;
              color: var(--faint); }

  /* BAND 4 — the noticeboard. */
  .board { padding: 11px 12px 6px; border-bottom: 1px solid var(--rule); }
  .note { border-left: 2px solid var(--rule); padding-left: 10px; margin-bottom: 11px; }
  .note.warn { border-left-color: var(--warn); }
  .note.critical { border-left-color: var(--crit); }
  .note.info { border-left-color: var(--ok); }
  .note .nh { display: flex; gap: 8px; align-items: baseline; font-size: 9.5px;
              letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
  .note .nh .src { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
                   white-space: nowrap; }
  .note .nb { font-size: 11.5px; color: var(--dim); line-height: 1.5; margin-top: 3px; }
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
