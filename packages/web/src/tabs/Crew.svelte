<script lang="ts">
  /** §3: the roster is an insurance premium, not a workforce. Crew are ~2%
   *  utilised, so the question is never how much they can do — it is whether the
   *  right specialist is already awake when something breaks, and how much of
   *  their life you spent finding out.
   *
   *  §5b: the board runs both ways, so requests from the crew live here too. */
  import type { State } from "../../../sim/src/types.ts";
  import type { Command } from "../../../sim/src/commands.ts";
  import { BANKS, PER_BANK, COLD_GRACE_DAYS, foodBalance,
           WATER_ROOM, WATER_LOW_DAYS, waterDays, waterDraw } from "../../../sim/src/colony.ts";
  import { ROSTER, ageFactor, RETIRE_AGE, THAW_MIN, THAW_MAX, type Role } from "../../../sim/src/crew.ts";
  import { assetName, hours, num, when } from "../lib/view.ts";

  let { ship, frac, send }: { ship: State; frac: number; send: (c: Command) => void } = $props();
  /** A job somebody is on advances smoothly between ticks; one nobody is on
   *  does not move at all, and must not look like it is. */
  const shown = (j: { done: number; work: number; assignee?: string }) =>
    Math.min(j.work, j.done + (j.assignee ? frac : 0));
  const c = $derived(ship.colony);
  const open = $derived(ship.requests.filter(r => !r.answered));
  const roles = $derived([...new Set(ROSTER)] as string[]);
  const awakeRoles = $derived(new Set(ship.crew.map(p => p.role)));
  let tab = $state<"roster" | "jobs" | "banks" | "orders">("roster");
  let waking = $state(false);
  /** which job the player is handing out, if any */
  let handing: string | null = $state(null);

  const roleList = $derived([...new Set(ROSTER)] as Role[]);
  const food = $derived(foodBalance(ship, ship.settings.botanistShare));
  // §6b: water is a survival resource now, so it gets a readout beside the two
  // it sits between. Days, not units — a tank reading 340 means nothing without
  // the draw, and the draw changes every time a bed goes in or someone wakes.
  const tank = $derived(ship.rooms[WATER_ROOM]?.ice ?? 0);
  const wdays = $derived(waterDays(ship));
  const draw = $derived(waterDraw(ship));
  const free = $derived(ship.crew.filter(p => !ship.board.some(t => t.assignee === p.id)));
  const label = (t: { kind: string; target: string; what?: string; to?: string }) =>
    t.kind === "service" ? `Service ${assetName(t.target)}`
    : t.kind === "replace" ? `Replace ${assetName(t.target)}`
    : t.kind === "deliver" ? `Carry ${t.what} to ${t.to}`
    : t.kind === "makeRod" ? "Fabricate a fuel rod"
    : "Build a drone";
</script>

<div class="scroll">
  <div class="pad">
    <div class="label">Crew</div>
    <div class="big">{num(c.frozen + c.awake)} <span class="dim">of 200 alive</span></div>
    <div class="sentence dim">
      {ship.crew.length} awake, {num(c.frozen)} still frozen.
      {#if ship.memorial.length}<span class="crit">{ship.memorial.length} dead.</span>{/if}
    </div>
  </div>

  <!-- §5b: requests come UP. Declining one costs morale, which is what gives
       §3's happiness stat its teeth. -->
  {#if open.length}
    <div class="pad asks">
      <div class="label">They're asking</div>
      {#each open as rq}
        {@const who = ship.crew.find(p => p.id === rq.from)}
        <div class="ask">
          <div class="who">{who?.name ?? "—"} <span class="faint">{when(rq.raised, ship.day)}</span></div>
          <div class="said">“{rq.text}”</div>
          <div class="btns">
            <button class="yes" onclick={() => send({ kind: "answer", request: rq.id, grant: true })}>
              {rq.kind === "cryo" ? "Let them sleep" : "Take them off the roster"}
            </button>
            <button class="no" onclick={() => send({ kind: "answer", request: rq.id, grant: false })}>
              Say no
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="tabs">
    {#each [["roster","Roster"],["jobs",`Jobs${ship.board.length ? " " + ship.board.length : ""}`],["banks","Banks"],["orders","Orders"]] as [id, name]}
      <button class="t" aria-pressed={tab === id} onclick={() => tab = id as typeof tab}>{name}</button>
    {/each}
  </div>

  {#if tab === "roster"}
    <!-- §3: the roster is an insurance premium. Nobody wakes themselves, and
         every person you wake spends a colonist out of a small pool. -->
    <div class="pad wake">
      {#if waking}
        <div class="label">Who do you want?</div>
        {#each roleList as role}
          <button class="role-btn" disabled={ship.pool[role] === 0}
                  onclick={() => { send({ kind: "wake", role }); waking = false; }}>
            <b>{role}</b>
            <span>{ship.pool[role]} left in the bank</span>
          </button>
        {/each}
        <button class="cancel" onclick={() => waking = false}>Not now</button>
      {:else}
        <button class="act" onclick={() => waking = true}>Wake somebody</button>
        <div class="sentence faint">
          They spend {THAW_MIN}–{THAW_MAX} days in the Medbay before they can work, and every
          year awake is a year of their life.
        </div>
      {/if}
    </div>

    {#each ship.crew as p (p.id)}
      <div class="person">
        <div class="line1">
          <span class="nm">{p.name}</span>
          <span class="role">{p.role}</span>
          <span class="age" class:warn={p.age > RETIRE_AGE}>{Math.floor(p.age)}</span>
        </div>
        <div class="line2 dim">
          {#if ship.day < p.fitOn}
            <span class="warn">In the Medbay — fit in {Math.ceil(p.fitOn - ship.day)} days</span>
          {:else}
            {@const job = ship.board.find(t => t.assignee === p.id)}
            {#if job}
              <span class="doing">{label(job)}</span>
              <span class="faint">{hours(job.work - shown(job))} left</span>
            {:else}
              <span class="faint">Idle — nothing assigned</span>
            {/if}
          {/if}
        </div>
        <div class="line2 faint">{p.traits.join(" · ")}{#if p.closeTo.length} · close to {p.closeTo.length}{/if}</div>
        <div class="meters">
          <span class="m"><i style="width:{p.happiness}%" class:crit={p.happiness < 30}></i></span>
          <span class="m"><i style="width:{p.rest}%" class:warn={p.rest < 35}></i></span>
          <span class="pc faint">{Math.round(ageFactor(p.age) * 100)}%</span>
          <button class="frz" onclick={() => send({ kind: "freeze", person: p.id })}>freeze</button>
        </div>
      </div>
    {/each}
    {#if ship.crew.length === 0}
      <div class="pad sentence dim">
        Nobody is awake. The ship is running itself, and running down.
      </div>
    {/if}

    <!-- §3's real crew failure mode: the pools are small and unequal, and
         running one dry is permanent. Pilots are the fragile one. -->
    <div class="pad hr">
      <div class="label">Still in the bank</div>
      {#each roles as role}
        <div class="pool" class:crit={ship.pool[role as keyof typeof ship.pool] === 0}>
          <span>{role}s</span>
          <span class="faint">{awakeRoles.has(role as never) ? "one awake" : "none awake"}</span>
          <span>{ship.pool[role as keyof typeof ship.pool]}</span>
        </div>
      {/each}
      <div class="sentence faint">
        Nobody comes back out of a bank that's empty. No pilots means the drones
        never fly again, and no medic means nobody else ever wakes up.
      </div>
    </div>

    {#if ship.memorial.length}
      <div class="pad hr">
        <div class="label">Lost</div>
        {#each ship.memorial.slice(-8).reverse() as m}
          <div class="mem">
            <span>{m.name}</span>
            <span class="faint">{m.role} · {m.years}y served · {m.cause}</span>
          </div>
        {/each}
      </div>
    {/if}

  {:else if tab === "jobs"}
    <!-- §5b: the board. Jobs go down to the crew — and until you put a name on
         one, it sits here getting older. -->
    <div class="pad">
      <div class="label">The board</div>
      <div class="big">{ship.board.length} <span class="dim">
        {ship.board.length === 1 ? "job" : "jobs"}</span></div>
      <div class="sentence dim">
        {ship.board.filter(t => !t.assignee).length} waiting for somebody ·
        {free.length} idle
      </div>
    </div>
    {#each ship.board as job (job.id)}
      {@const who = ship.crew.find(p => p.id === job.assignee)}
      <div class="job">
        <div class="jline">
          <span class="jname">{label(job)}</span>
          <span class="faint">{hours(job.work)}</span>
        </div>
        <div class="bar"><i style="width:{(shown(job) / job.work) * 100}%"></i></div>
        {#if who}
          <div class="jsub">
            <span class="ok">{who.name} · {hours(job.work - shown(job))} left</span>
            <button class="lnk" onclick={() => send({ kind: "unassign", task: job.id })}>take off</button>
          </div>
        {:else if handing === job.id}
          <div class="hand">
            {#each ship.crew as p}
              <button class="pick" onclick={() => { send({ kind: "assign", task: job.id, person: p.id }); handing = null; }}>
                {p.name.split(" ")[0]}
              </button>
            {/each}
            <button class="lnk" onclick={() => handing = null}>cancel</button>
          </div>
        {:else}
          <div class="jsub">
            <span class="faint">nobody on it · raised {when(job.raised, ship.day)}</span>
            <button class="lnk" disabled={ship.crew.length === 0}
                    onclick={() => handing = job.id}>give it to…</button>
          </div>
        {/if}
      </div>
    {/each}
    {#if ship.board.length === 0}
      <div class="pad sentence faint">
        Nothing to do. Jobs come from you — open a facility, find something worn,
        and raise one.
      </div>
    {/if}

  {:else if tab === "banks"}
    <div class="pad">
      <div class="banks">
        {#each Array(BANKS) as _, i}
          {@const live = i < c.banks}
          <div class="bank" class:dark={!live} class:cold={live && c.cold > 0}>
            {#each Array(PER_BANK) as __, j}<span class="pod"
              class:out={!live || (i === c.banks - 1 && j >= c.frozen - (c.banks - 1) * PER_BANK)}></span>{/each}
          </div>
        {/each}
      </div>
      {#if c.cold > 0}
        <div class="sentence crit">
          Underpowered for {c.cold} days. They hold for {COLD_GRACE_DAYS} — then
          {PER_BANK} people at a time.
        </div>
      {:else}
        <div class="sentence faint">{c.banks} banks powered and holding.</div>
      {/if}
      <div class="two" style="margin-top:12px">
        <div>
          <div class="label">Fed</div>
          <div class:crit={c.fed < 25} class:warn={c.fed < 60}>{num(c.fed)}%</div>
          <div class="bar"><i style="width:{c.fed}%"></i></div>
        </div>
        <div>
          <div class="label">Air</div>
          <div class:crit={c.air < 25} class:warn={c.air < 60}>{num(c.air)}%</div>
          <div class="bar"><i style="width:{c.air}%"></i></div>
        </div>
      </div>
      <div class="sentence dim" style="margin-top:10px">{num(c.food)} meals in the galley</div>
      <div class="label" style="margin-top:14px">Water</div>
      <div class:crit={wdays < 8} class:warn={wdays < WATER_LOW_DAYS}>
        {wdays === Infinity ? "—" : `${Math.round(wdays)} days`}
      </div>
      <div class="bar"><i style="width:{Math.min(100, wdays / 60 * 100)}%"></i></div>
      <div class="sentence faint">
        {num(tank)} in the tank, {draw.toFixed(1)} drawn a day by
        {c.awake} awake and {food.beds} bed{food.beds === 1 ? "" : "s"}.
        {#if wdays < WATER_LOW_DAYS}Carry ice up from the Cargo Bay.{/if}
      </div>
    </div>

  {:else}
    <div class="pad">
      <!-- §6: the locker is finite and nothing is growing yet. Cutting rations
           buys days and costs morale, which costs work rate, which costs you the
           grow beds you were cutting rations to build. -->
      <div class="label">Rations</div>
      <div class="sentence">
        {Math.round(ship.settings.rations * 100)}% —
        {ship.colony.food.toFixed(0)} left in the locker.
      </div>
      <div class="rats">
        {#each [[1,"Full"],[0.75,"Short"],[0.5,"Half"]] as [lvl, name]}
          <button class="rat" aria-pressed={Math.abs(ship.settings.rations - (lvl as number)) < 0.01}
                  onclick={() => send({ kind: "rations", level: lvl as number })}>{name}</button>
        {/each}
      </div>
      <div class="sentence faint">
        {#if food.daysLeft === Infinity}
          The beds are keeping up. Nothing is being eaten into.
        {:else}
          {Math.round(food.daysLeft)} days of locker at this rate ·
          {food.produced.toFixed(1)} grown against {food.eaten.toFixed(1)} eaten
        {/if}
      </div>

      <div class="label" style="margin-top:16px">Crew effort</div>
      <div class="sentence">
        {Math.round(ship.settings.botanistShare * 100)}% goes to the grow beds, the rest to repairs and hauling.
      </div>
      <input type="range" min="0" max="60" value={Math.round(ship.settings.botanistShare * 100)}
             oninput={e => send({ kind: "setting", key: "botanistShare",
                                  value: +(e.currentTarget as HTMLInputElement).value / 100 })} />
      <div class="sentence faint">
        Too little and the galley empties. Too much and nothing gets repaired or carried.
      </div>

      <label class="check">
        <input type="checkbox" checked={ship.settings.crewSelfAssign}
               onchange={e => send({ kind: "setting", key: "crewSelfAssign",
                                     value: (e.currentTarget as HTMLInputElement).checked })} />
        Let the crew take jobs off the board themselves
      </label>
      <div class="sentence faint">
        Off, you hand out every job by name. On, anyone idle picks up the most
        urgent thing waiting. This is the first piece of the ship you stop flying
        by hand.
      </div>

      <label class="check">
        <input type="checkbox" checked={ship.settings.prioritise}
               onchange={e => send({ kind: "setting", key: "prioritise",
                                     value: (e.currentTarget as HTMLInputElement).checked })} />
        Work the reactor and life support first
      </label>
      <label class="check">
        <input type="checkbox" checked={ship.settings.autoRetire}
               onchange={e => send({ kind: "setting", key: "autoRetire",
                                     value: (e.currentTarget as HTMLInputElement).checked })} />
        Put people back under when they ask
      </label>
      <label class="check">
        <input type="checkbox" checked={ship.settings.shedEmptyRooms}
               onchange={e => send({ kind: "setting", key: "shedEmptyRooms",
                                     value: (e.currentTarget as HTMLInputElement).checked })} />
        Stop heating rooms nobody is in
      </label>
      <div class="sentence faint">
        The last one is worth about 56 kW — more than the cargo crane costs to run.
      </div>
    </div>
  {/if}
</div>

<style>
  .asks { background: color-mix(in srgb, var(--warn) 10%, var(--panel)); border-bottom: 1px solid var(--rule); }
  .ask { padding: 6px 0; border-top: 1px solid var(--rule); }
  .ask:first-of-type { border-top: 0; }
  .who { font-size: 11px; }
  .said { margin: 2px 0 6px; }
  .btns { display: flex; gap: 6px; }
  .btns button { border: 1px solid var(--rule); padding: 5px 10px; font-size: 11px; flex: 1; }
  .yes { border-color: var(--accent) !important; color: var(--accent); }
  .no { color: var(--dim); }

  .tabs { display: flex; border-bottom: 1px solid var(--rule); }
  .t { flex: 1; padding: 8px 4px; font-size: 11px; color: var(--dim); }
  .t[aria-pressed="true"] { color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }

  .person { padding: 8px 12px; border-bottom: 1px solid var(--rule); }
  .line1 { display: flex; gap: 8px; align-items: baseline; }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .role { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  .age { font-variant-numeric: tabular-nums; color: var(--dim); }
  .line2 { font-size: 10.5px; }
  .meters { display: flex; gap: 6px; align-items: center; margin-top: 5px; }
  .m { flex: 1; height: 3px; background: var(--panel2); overflow: hidden; }
  .m > i { display: block; height: 100%; background: var(--ok); }
  .m > i.warn { background: var(--warn); } .m > i.crit { background: var(--crit); }
  .pc { font-size: 10px; width: 32px; text-align: right; }
  .frz { font-size: 10px; color: var(--faint); text-decoration: underline; }

  .wake { border-bottom: 1px solid var(--rule); }
  .wake .act { display: block; width: 100%; border: 1px solid var(--accent);
               color: var(--accent); padding: 9px; text-align: center; }
  .role-btn { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
              width: 100%; border: 1px solid var(--rule); padding: 8px 10px; margin-bottom: 5px; }
  .role-btn:disabled { opacity: .35; }
  .role-btn b { font-weight: 500; text-transform: capitalize; }
  .role-btn span { color: var(--dim); font-size: 11px; }
  .cancel { color: var(--dim); font-size: 11px; }
  .doing { color: var(--ok); }

  .job { padding: 8px 12px; border-bottom: 1px solid var(--rule); }
  .jline { display: flex; gap: 10px; align-items: baseline; }
  .jname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job .bar { margin: 5px 0 4px; }
  .jsub { display: flex; gap: 10px; align-items: baseline; font-size: 11px; }
  .jsub > :first-child { flex: 1; }
  .lnk { color: var(--dim); text-decoration: underline; font-size: 10.5px; }
  .lnk:disabled { opacity: .4; text-decoration: none; }
  .hand { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
  .pick { border: 1px solid var(--accent); color: var(--accent); padding: 3px 8px; font-size: 11px; }

  .rats { display: flex; gap: 6px; margin: 4px 0 8px; }
  .rat { flex: 1; border: 1px solid var(--rule); color: var(--dim); padding: 6px; font-size: 11px; }
  .rat[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }

  .pool { display: flex; gap: 10px; font-size: 11.5px; padding: 4px 0; border-bottom: 1px solid var(--rule); }
  .pool > :first-child { flex: 1; }
  .pool.crit { color: var(--crit); }
  .mem { display: flex; justify-content: space-between; gap: 10px; font-size: 11px;
         padding: 4px 0; border-bottom: 1px solid var(--rule); }

  .banks { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin-bottom: 6px; }
  .bank { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px;
          padding: 4px; border: 1px solid var(--rule); background: var(--bg); }
  .bank.cold { border-color: var(--warn); }
  .bank.dark { border-color: var(--crit); opacity: .5; }
  .pod { display: block; aspect-ratio: 1; background: var(--ok); }
  .bank.cold .pod { background: var(--warn); }
  .pod.out { background: var(--panel2); }
  .two { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; }
  input[type=range] { width: 100%; accent-color: var(--accent); margin: 4px 0 6px; }
  .check { display: flex; gap: 8px; align-items: center; margin-top: 10px; font-size: 12px; color: var(--dim); }
</style>
