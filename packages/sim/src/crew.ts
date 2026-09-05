/** §3: the people, as people.
 *
 *  The aggregate colony model (banks, food, air) is still in colony.ts — this is
 *  the layer on top of it that gives the awake crew names, roles, moods and
 *  opinions. plan.md is blunt about why: "Okonkwo took the hull repair" is a
 *  story; "crew member 4 took the hull repair" is a log line. The feed does not
 *  work without names, and the feed is most of the game.
 *
 *  §3's other load-bearing claim is that crew are a LATENCY resource, not a
 *  throughput one — average utilisation is about 2%, so what matters is never
 *  how much work they can do, it is whether the right specialist is already
 *  awake when something breaks. That is why waking someone is expensive and
 *  freezing them is free. */
import { type Rng, chance, next, pick, range } from "./rng.ts";

export type Role = "engineer" | "botanist" | "medic" | "pilot";

export type Trait = "insomniac" | "steady hands" | "claustrophobic" | "night owl"
                  | "meticulous" | "restless" | "even-tempered";

export type Person = {
  id: string;
  name: string;
  role: Role;
  /** 0-100. Rises slowly with work, and is simply gone when they die. */
  skill: number;
  happiness: number;
  rest: number;
  health: number;
  traits: Trait[];
  /** §3: formed by working the same shifts for years. Cheap, and it is most of
   *  what makes a death land. */
  closeTo: string[];
  /** §3: cryo arrests ageing, being awake does not. Nobody lives 300 years. */
  age: number;
  /** day they were last woken, for "years served" */
  wokeOn: number;
  asleep: boolean;
  /** §3: "unfreezing is expensive — the crew member spends a few days in medbay
   *  recovering before they can work". Day they are fit for duty. */
  fitOn: number;
  /** the task they are on. One thing at a time. */
  task?: string;
  /** they have asked to go back under and the player has not answered */
  asked: boolean;
};

/** §5b: the board runs BOTH ways. Jobs go down to the crew; requests come up. */
export type Request = {
  id: string;
  from: string;
  kind: "cryo" | "rest" | "pairing" | "flag";
  about?: string;
  raised: number;
  text: string;
  /** left on the record whether or not it was ever answered (§5b) */
  answered: "granted" | "declined" | null;
};

export type Memorial = {
  name: string; role: Role; years: number; cause: string; day: number;
};

const GIVEN = ["Ada", "Nour", "Kai", "Ines", "Tomas", "Priya", "Sol", "Marek", "Zaya", "Ondine",
               "Bram", "Lucia", "Hana", "Emeka", "Rafi", "Vera", "Anton", "Mira", "Yusuf", "Elke"];
const FAMILY = ["Okonkwo", "Novak", "Vasquez", "Marchetti", "Adeyemi", "Lindqvist", "Haddad",
                "Sorokin", "Delacroix", "Yamashita", "Brennan", "Osei", "Kovač", "Ferreira",
                "Nakamura", "Bahrami", "Olsen", "Rivas", "Thackeray", "Amari"];
const TRAITS: Trait[] = ["insomniac", "steady hands", "claustrophobic", "night owl",
                         "meticulous", "restless", "even-tempered"];

/** §3: 6-8 active crew, and the roster wants one of each speciality awake. */
export const ROSTER: Role[] = ["engineer", "engineer", "engineer", "botanist", "botanist",
                               "medic", "pilot", "pilot"];

/** §3's role extinction, made concrete. The 200 colonists are not
 *  interchangeable: the pools are small and unequal, and pilots are the fragile
 *  one — 525 role-years total, so a single continuously-awake pilot consumes
 *  more than half of it. Run the pilots out and asteroid harvesting stops
 *  permanently: no pilots, no rare compounds, no ship. Run the medics out and
 *  you cannot safely unfreeze anyone ever again. */
export const POOL: Record<Role, number> = { engineer: 44, botanist: 34, medic: 22, pilot: 15 };

/** Which speciality to thaw next: the one furthest below its share of the
 *  roster that still has anyone left in the bank.
 *
 *  Falling back to "the first role in ROSTER" instead produced a ship crewed by
 *  seven engineers and a botanist by year 49, which is not a roster, and it
 *  drained the engineer pool at three times the rate of any other. */
export function nextRole(crew: Person[], pool: Record<Role, number>): Role | null {
  const target: Record<string, number> = {};
  for (const r of ROSTER) target[r] = (target[r] ?? 0) + 1;
  const have: Record<string, number> = {};
  for (const c of crew) if (!c.asleep) have[c.role] = (have[c.role] ?? 0) + 1;
  let best: Role | null = null, worst = Infinity;
  for (const role of Object.keys(target) as Role[]) {
    if (pool[role] <= 0) continue;
    const gap = (have[role] ?? 0) - target[role];
    if (gap < worst) { worst = gap; best = role; }
  }
  return best;
}

export function makePerson(r: Rng, role: Role, day: number, n: number): Person {
  const name = `${pick(r, GIVEN)} ${pick(r, FAMILY)}`;
  const traits: Trait[] = [pick(r, TRAITS)];
  if (chance(r, 0.45)) { const t = pick(r, TRAITS); if (t !== traits[0]) traits.push(t); }
  return {
    id: `p${n}`, name, role, age: Math.round(range(r, 26, 34)),
    skill: Math.round(range(r, 45, 85)),
    happiness: Math.round(range(r, 70, 95)),
    rest: 100, health: 100,
    traits, closeTo: [], wokeOn: day, fitOn: day + THAW_DAYS, asleep: false, asked: false,
  };
}

/** Make someone whose name nobody aboard already has.
 *
 *  Two people called Kai on an eight-person ship reads as a bug rather than a
 *  coincidence, and so does a roster with three Adeyemis on it. Both halves of
 *  the name have to be clear, because the feed uses whichever fits: "Okonkwo
 *  took the hull repair" is only a story if there is one Okonkwo. */
export function makeDistinct(r: Rng, role: Role, day: number, id: number,
                             aboard: Person[]): Person {
  const taken = new Set(aboard.flatMap(o => o.name.split(" ")));
  let p = makePerson(r, role, day, id);
  for (let guard = 0; guard < 40; guard++) {
    if (!p.name.split(" ").some(part => taken.has(part))) break;
    p = makePerson(r, role, day, id);
  }
  return p;
}

export function newCrew(r: Rng): Person[] {
  const out: Person[] = [];
  for (const role of ROSTER) out.push(makeDistinct(r, role, 0, out.length, out));
  return out;
}

export const awake = (crew: Person[]) => crew.filter(c => !c.asleep);
export const onDuty = (crew: Person[], day: number) =>
  crew.filter(c => !c.asleep && day >= c.fitOn && c.health > 20);
export const years = (c: Person, day: number) => Math.floor((day - c.wokeOn) / 365);

/** §3's stat table, made mechanical.
 *
 *  A tired, unhappy or unwell person works slower. This is the "throughput"
 *  half, and it is deliberately shallow — the interesting half is which
 *  specialities are awake when something goes wrong. */
export function effort(c: Person): number {
  if (c.asleep) return 0;
  return (0.55 + 0.45 * (c.skill / 100))
       * (0.4 + 0.6 * (c.rest / 100))
       * (0.5 + 0.5 * (c.happiness / 100))
       * (c.health / 100)
       * ageFactor(c.age);
}

/** §3: "a crew member wakes at ~30, works ~35 years, and must be refrozen
 *  before they age out". Full strength to 60, then it goes. */
export const ageFactor = (age: number) =>
  age <= 60 ? 1 : Math.max(0.15, 1 - (age - 60) / 30);

/** §3: freezing is cheap and instant; the cost gate is on waking them up. */
export const THAW_DAYS = 5;

export const RETIRE_AGE = 65;
export const END_AGE = 88;

/** Does the roster have someone who can actually do this? §3's whole point: the
 *  question is never capacity, it is whether the right person is already awake. */
export const hasAwake = (crew: Person[], role: Role) =>
  crew.some(c => !c.asleep && c.role === role && c.health > 30);

/** Pre-written, because §10's LLM chatter is a later thing and the request
 *  system has to work without it. */
const CRYO_LINES = [
  "I've done my twenty years. Put me back under.",
  "I'm no use to you like this. Let me sleep.",
  "I want to see the new world with the rest of them. Please.",
];
const REST_LINES = [
  "I haven't slept properly in weeks. I'll make a mistake.",
  "Take me off the roster for a while.",
];

let seqBase = 0;

/** One day for the people. Returns anything they want to say to the player. */
export function tickCrew(crew: Person[], r: Rng, day: number, load: number,
                         fed: number, air: number, dimmed: boolean): Request[] {
  const out: Request[] = [];
  const up = awake(crew);

  for (const c of up) {
    // Rest recovers on a light day and is spent on a heavy one. `load` is jobs
    // per awake head, so a ship in crisis grinds its people down.
    const drain = 0.9 * Math.min(2.5, load) - 0.55;
    c.rest = Math.max(0, Math.min(100, c.rest - drain
      + (c.traits.includes("insomniac") ? -0.15 : 0)));

    // §3: happiness is driven by conditions, deaths and workload.
    let mood = 0.05;
    if (fed < 60) mood -= 0.25;
    if (air < 60) mood -= 0.35;
    if (dimmed) mood -= 0.06;                    // the lights are down and they know it
    if (c.rest < 35) mood -= 0.22;
    if (c.traits.includes("even-tempered")) mood *= 0.6;
    c.happiness = Math.max(0, Math.min(100, c.happiness + mood));

    if (c.health < 100) c.health = Math.min(100, c.health + 0.4);

    // §3: being awake ages you, and the real cost of crewing is not death, it is
    // colonist-years burned. Lean on your best engineer for eighty years and you
    // have spent her whole life.
    c.age += 1 / 365;
    if (!c.asked && c.age > RETIRE_AGE && chance(r, 0.004)) {
      c.asked = true;
      out.push({ id: `rq${day}-${c.id}`, from: c.id, kind: "cryo", raised: day,
                 text: `I'm ${Math.floor(c.age)}. Put me back under while there's still some of me left.`,
                 answered: null });
    }

    // §3's withdrawal ladder ends here: not mutiny, a request. Quieter and worse.
    if (!c.asked && c.happiness < 30 && chance(r, 0.02)) {
      c.asked = true;
      out.push({ id: `rq${day}-${c.id}`, from: c.id, kind: "cryo", raised: day,
                 text: pick(r, CRYO_LINES), answered: null });
    } else if (!c.asked && c.rest < 25 && chance(r, 0.01)) {
      c.asked = true;
      out.push({ id: `rq${day}-${c.id}`, from: c.id, kind: "rest", raised: day,
                 text: pick(r, REST_LINES), answered: null });
    }
  }

  // §3: relationships form by working the same shifts over years. Almost free,
  // and without them a death is a number.
  // Capped: everyone being close to everyone is the same as nobody being close
  // to anyone, and a death has to cost something specific.
  if (up.length > 1 && chance(r, 0.0016)) {
    const a = pick(r, up), b = pick(r, up);
    if (a.id !== b.id && !a.closeTo.includes(b.id)
        && a.closeTo.length < 3 && b.closeTo.length < 3) {
      a.closeTo.push(b.id); b.closeTo.push(a.id);
    }
  }
  return out;
}

/** A death is the heaviest event in the game (§3) and everyone who knew them
 *  feels it. */
export function mourn(crew: Person[], dead: Person) {
  for (const c of crew) {
    if (c.asleep) continue;
    if (c.closeTo.includes(dead.id)) c.happiness = Math.max(0, c.happiness - 22);
    else c.happiness = Math.max(0, c.happiness - 6);
  }
}
