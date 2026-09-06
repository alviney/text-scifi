/** Drawing an asteroid so it is THAT asteroid.
 *
 *  design/README's motion rule says a discrete marker is a specific thing at a
 *  specific place, and an object you have surveyed twice and are seven days from
 *  deserves to look like itself rather than like the icon for its class. So the
 *  silhouette is seeded off the object's id: same rock, every time you come back
 *  to it, for the whole voyage.
 *
 *  The lit limb is the survey mechanic drawn rather than written. An unsurveyed
 *  object is a shape and nothing else. */

/** mulberry32, the same generator the simulation uses, so the shapes are stable
 *  across reloads and saves without pulling the sim's RNG off-stream. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rock = { verts: number[]; craters: { a: number; d: number; s: number }[]; rot: number };

const VERTS = 18, CRATERS = 5;

export function shapeOf(seed: number): Rock {
  const r = rng(seed + 1);
  const verts: number[] = [];
  for (let i = 0; i < VERTS; i++) verts.push(0.70 + r() * 0.30);
  const craters = [];
  for (let i = 0; i < CRATERS; i++)
    craters.push({ a: r() * Math.PI * 2, d: 0.18 + r() * 0.5, s: 0.07 + r() * 0.13 });
  return { verts, craters, rot: r() * 6 };
}

export function drawRock(cv: HTMLCanvasElement, rock: Rock, lit: boolean,
                         colours: { lit: string; unlit: string; fill: string }) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const w = cv.width, h = cv.height, R = Math.min(w, h) * 0.34;
  const dpr = Math.min(2, devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rock.rot);
  ctx.beginPath();
  for (let i = 0; i < rock.verts.length; i++) {
    const a = (i / rock.verts.length) * Math.PI * 2, rr = R * rock.verts[i];
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  // A flat panel-coloured fill left the rock invisible against the panel it sits
  // on. A shallow vertical gradient gives it a lit top and a dark underside,
  // which is the cheapest thing that reads as a solid object rather than a hole.
  const body = ctx.createLinearGradient(0, -R, 0, R);
  body.addColorStop(0, colours.fill);
  body.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = lit ? colours.lit : colours.unlit;
  ctx.lineWidth = 1.3 * dpr; ctx.stroke();
  // Craters are clipped to the body so nothing spills past the limb.
  ctx.clip();
  for (const k of rock.craters) {
    ctx.beginPath();
    ctx.arc(Math.cos(k.a) * R * k.d, Math.sin(k.a) * R * k.d, R * k.s, 0, Math.PI * 2);
    ctx.fillStyle = lit ? "rgba(0,0,0,.34)" : "rgba(0,0,0,.42)";
    ctx.fill();
  }
  if (lit) {
    const g = ctx.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, "rgba(245,197,24,.22)");
    g.addColorStop(0.6, "rgba(245,197,24,0)");
    ctx.fillStyle = g; ctx.fillRect(-R * 1.4, -R * 1.4, R * 2.8, R * 2.8);
  }
  ctx.restore();
}
