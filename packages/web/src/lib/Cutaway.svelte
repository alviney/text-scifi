<script lang="ts">
  /** The Facilities hero. design/README is specific about what the motion means,
   *  and getting it wrong is confusing rather than untidy:
   *
   *    - a discrete marker TRAVELLING means a specific thing is moving
   *    - something HELD is badged on the room that holds it, never on the spine
   *
   *  So every marker here is a real shipment with a real source and destination,
   *  interpolated between the two rooms it is actually going between. Nothing
   *  moves for decoration. */
  import type { State } from "../../../sim/src/types.ts";
  import { roomBand, roomOf } from "../lib/view.ts";

  let { ship, onpick }: { ship: State; onpick: (room: string) => void } = $props();

  /** Bow to stern. The order is the ship, not the alphabet. */
  const BAY = ["Bridge", "Medbay", "Quarters", "Hydroponics", "Life Support",
               "Cargo Bay", "Drone Bay", "Engineering", "Reactor", "Maintenance"];
  const SHORT: Record<string, string> = {
    "Bridge": "BRG", "Medbay": "MED", "Quarters": "QTR", "Hydroponics": "HYD",
    "Life Support": "LSP", "Cargo Bay": "CRG", "Drone Bay": "DRN",
    "Engineering": "ENG", "Reactor": "RCT", "Maintenance": "MNT",
  };

  let cv: HTMLCanvasElement | undefined = $state();
  const bands = $derived(BAY.map(r =>
    roomBand(ship.assets.filter(a => roomOf(a) === r))));
  const held = $derived(BAY.map(r => {
    const st = ship.rooms[r];
    if (!st) return 0;
    return st.ore + st.sil + st.rare + st.ice + st.vol;
  }));

  $effect(() => {
    if (!cv) return;
    const c = cv, ctx = c.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; };
    size();
    const ro = new ResizeObserver(size); ro.observe(c);
    let raf = 0;
    const css = getComputedStyle(document.documentElement);
    const at = (i: number) => (0.055 + (i / (BAY.length - 1)) * 0.89) * c.width;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const tone = (n: string) => css.getPropertyValue(n).trim() || "#888";
      const faint = tone("--faint"), accent = tone("--accent");
      const ok = tone("--ok"), warn = tone("--warn"), crit = tone("--crit");
      ctx.clearRect(0, 0, c.width, c.height);
      const y = c.height * 0.52;

      // hull: one line, because the ship is a corridor with rooms off it
      ctx.strokeStyle = faint; ctx.globalAlpha = 0.45; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(at(0), y); ctx.lineTo(at(BAY.length - 1), y); ctx.stroke();
      ctx.globalAlpha = 1;

      BAY.forEach((room, i) => {
        const x = at(i);
        ctx.fillStyle = bands[i] === "crit" ? crit : bands[i] === "warn" ? warn : ok;
        ctx.beginPath(); ctx.arc(x, y, 3.6 * dpr, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = faint;
        ctx.font = `${9 * dpr}px ${css.getPropertyValue("--font") || "monospace"}`;
        ctx.textAlign = "center";
        ctx.fillText(SHORT[room], x, y + 16 * dpr);

        // HELD, not moving: badged on the room, per design/README. A stack of
        // ore in the Cargo Bay is a logistics problem, not a transfer.
        if (held[i] > 20) {
          const h = Math.min(18, 3 + held[i] / 90) * dpr;
          ctx.fillStyle = accent; ctx.globalAlpha = 0.5;
          ctx.fillRect(x - 3 * dpr, y - 8 * dpr - h, 6 * dpr, h);
          ctx.globalAlpha = 1;
        }
      });

      // MOVING: one marker per consignment, between its real endpoints.
      for (const sh of ship.shipments) {
        const a = BAY.indexOf(sh.from), b = BAY.indexOf(sh.to);
        if (a < 0 || b < 0) continue;
        const span = Math.max(1, sh.eta - sh.left);
        const t = Math.max(0, Math.min(1, (ship.day - sh.left) / span));
        const x = at(a) + (at(b) - at(a)) * t;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(x, y - 5 * dpr); ctx.lineTo(x + 4 * dpr, y); ctx.lineTo(x, y + 5 * dpr);
        ctx.lineTo(x - 4 * dpr, y); ctx.closePath(); ctx.fill();
      }

      // a haul nobody can start: it sits at its source and does not travel
      for (const t of ship.board) {
        if (t.kind !== "deliver") continue;
        const a = BAY.indexOf(t.from ?? "");
        if (a < 0) continue;
        ctx.strokeStyle = crit; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.arc(at(a), y, 6.5 * dpr, 0, Math.PI * 2); ctx.stroke();
      }
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  });

  function tap(e: MouseEvent) {
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const f = (e.clientX - rect.left) / rect.width;
    const i = Math.round(((f - 0.055) / 0.89) * (BAY.length - 1));
    if (i >= 0 && i < BAY.length) onpick(BAY[i]);
  }
</script>

<div class="hero">
  <canvas bind:this={cv} onclick={tap} role="presentation"></canvas>
</div>

<style>
  .hero { height: 92px; background: var(--panel); border-bottom: 1px solid var(--rule); }
  canvas { display: block; width: 100%; height: 100%; cursor: pointer; }
</style>
