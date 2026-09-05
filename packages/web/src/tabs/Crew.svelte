<script lang="ts">
  /** §3: the roster is an insurance premium, not a workforce. Crew are ~2%
   *  utilised, so the question is never how much they can do — it is whether the
   *  right specialist is already awake when something breaks, and how much of
   *  their life you spent finding out.
   *
   *  §5b: the board runs both ways, so requests from the crew live here too. */
  import type { State } from "../../../sim/src/types.ts";
  import type { Command } from "../../../sim/src/commands.ts";
  import { BANKS, PER_BANK, COLD_GRACE_DAYS } from "../../../sim/src/colony.ts";
  import { ROSTER, ageFactor, RETIRE_AGE } from "../../../sim/src/crew.ts";
  import { num, when } from "../lib/view.ts";

  let { ship, send }: { ship: State; send: (c: Command) => void } = $props();
  const c = $derived(ship.colony);
  const open = $derived(ship.requests.filter(r => !r.answered));
  const roles = $derived([...new Set(ROSTER)] as string[]);
  const awakeRoles = $derived(new Set(ship.crew.map(p => p.role)));
  let tab = $state<"roster" | "banks" | "orders">("roster");
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
    {#each [["roster","Roster"],["banks","Banks"],["orders","Standing orders"]] as [id, name]}
      <button class="t" aria-pressed={tab === id} onclick={() => tab = id as typeof tab}>{name}</button>
    {/each}
  </div>

  {#if tab === "roster"}
    {#each ship.crew as p (p.id)}
      <div class="person">
        <div class="line1">
          <span class="nm">{p.name}</span>
          <span class="role">{p.role}</span>
          <span class="age" class:warn={p.age > RETIRE_AGE}>{Math.floor(p.age)}</span>
        </div>
        <div class="line2 dim">
          {p.traits.join(" · ")}
          {#if p.closeTo.length}· close to {p.closeTo.length}{/if}
        </div>
        <div class="meters">
          <span class="m"><i style="width:{p.happiness}%" class:crit={p.happiness < 30}></i></span>
          <span class="m"><i style="width:{p.rest}%" class:warn={p.rest < 35}></i></span>
          <span class="pc faint">{Math.round(ageFactor(p.age) * 100)}%</span>
          <button class="frz" onclick={() => send({ kind: "freeze", person: p.id })}>freeze</button>
        </div>
      </div>
    {/each}
    {#if ship.crew.length === 0}
      <div class="pad sentence crit">Nobody is awake.</div>
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
    </div>

  {:else}
    <div class="pad">
      <div class="label">Crew effort</div>
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
