// The material, contact and three rigs all read this one deterministic clock.
export const DURATION = 14400;
export const TIMES = { contact: 1300, push: 1650, stop: 4650, release: 5250, pickup: 6250, ready: 7450, written: 12950 };
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const ease = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
const phase = (t, a, b) => ease((t - a) / (b - a));
const mix = (a, b, q) => a + (b - a) * q;
export const mixPoint = (a, b, q) => ({ x: mix(a.x, b.x, q), y: mix(a.y, b.y, q) });
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// Single-line pen strokes, including the dot of the j as a separate stroke.
// Sampling once gives the ink and nib exactly the same arc-length geometry.
function stroke(start, commands) {
  let p = { x: start[0], y: start[1] };
  const points = [p];
  for (const command of commands) {
    const from = p;
    if (command.length === 2) {
      p = { x: command[0], y: command[1] }; points.push(p);
    } else {
      const [x1, y1, x2, y2, x, y] = command;
      for (let i = 1; i <= 36; i++) {
        const t = i / 36, s = 1 - t;
        points.push({ x: s ** 3 * from.x + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t ** 3 * x,
          y: s ** 3 * from.y + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t ** 3 * y });
      }
      p = points.at(-1);
    }
  }
  return points.map(point => ({ x: 398 + point.x * 1.03, y: 162 + point.y * 1.03 }));
}
export const STROKES = [
  stroke([0, 54], [[0, 0], [38, -4, 39, 25, 2, 26], [45, 23, 42, 59, 0, 54]]),
  stroke([58, 28], [[34, 17, 32, 57, 51, 55], [68, 55, 72, 28, 58, 28]]),
  stroke([77, 55], [[78, 29], [79, 20, 100, 22, 98, 41], [98, 55]]),
  stroke([112, 27], [[110, 61], [109, 78, 90, 72, 98, 64]]),
  stroke([113, 12], [[113.7, 12.6]]),
  stroke([140, 28], [[116, 17, 114, 57, 133, 55], [150, 55, 154, 28, 140, 28]]),
  stroke([159, 28], [[152, 59, 173, 65, 180, 28], [178, 55]]),
  stroke([190, 55], [[191, 27], [191, 39, 198, 21, 208, 29]]),
];
const lengths = STROKES.map(points => points.slice(1).reduce((sum, point, i) => sum + length(points[i], point), 0));
const totalLength = lengths.reduce((a, b) => a + b, 0);
const liftMs = 115;
const minimumStrokeMs = 80;
let cursor = TIMES.ready;
export const STROKE_TIMES = lengths.map((value, index) => {
  const start = cursor;
  const duration = minimumStrokeMs + (TIMES.written - TIMES.ready - liftMs * (STROKES.length - 1) - minimumStrokeMs * STROKES.length) * value / totalLength;
  cursor += duration + (index < STROKES.length - 1 ? liftMs : 0);
  return { start, end: start + duration, length: value };
});

function prefix(points, fraction, total) {
  let remaining = clamp(fraction) * total;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const distance = length(points[i - 1], points[i]);
    if (remaining < distance) { result.push(mixPoint(points[i - 1], points[i], remaining / distance)); break; }
    result.push(points[i]); remaining -= distance;
  }
  return result;
}
export function writingAt(time) {
  const ink = [];
  let tip = STROKES[0][0], down = false, activeStroke = -1;
  for (let i = 0; i < STROKES.length; i++) {
    const timing = STROKE_TIMES[i];
    if (time >= timing.end) { ink.push(STROKES[i]); tip = STROKES[i].at(-1); }
    else if (time >= timing.start) {
      const segment = prefix(STROKES[i], (time - timing.start) / (timing.end - timing.start), timing.length);
      ink.push(segment); tip = segment.at(-1); down = true; activeStroke = i; break;
    } else if (i > 0) {
      const u = clamp((time - STROKE_TIMES[i - 1].end) / liftMs);
      tip = mixPoint(STROKES[i - 1].at(-1), STROKES[i][0], ease(u));
      tip.y -= 12 * Math.sin(Math.PI * u); break;
    } else break;
  }
  return { ink, tip, down, activeStroke };
}

export function frameAt(value) {
  const time = clamp(value, 0, DURATION);
  const push = phase(time, TIMES.push, TIMES.stop);
  const slide = { x: 260 + 105 * push, y: 78, width: 260, height: 224 };
  const pressing = time >= TIMES.contact && time <= TIMES.stop;
  const loading = phase(time, TIMES.contact, TIMES.push);
  const unloading = phase(time, TIMES.stop, TIMES.release);
  const force = loading * (1 - unloading);
  const contact = { x: slide.x, y: 350 - 62 * (1 + force * .06) * Math.cos(8 * force * Math.PI / 180) };
  const gap = 58 * (1 - phase(time, 350, TIMES.contact)) + 24 * unloading;
  const writing = writingAt(time);
  const parkedTip = { x: 299, y: 246 };
  let tip = parkedTip;
  const pencilAlpha = phase(time, TIMES.release, 5500);
  if (time >= TIMES.pickup && time < TIMES.ready) {
    const q = phase(time, TIMES.pickup, TIMES.ready);
    tip = mixPoint(parkedTip, STROKES[0][0], q);
    tip.y -= 26 * Math.sin(Math.PI * q);
  } else if (time >= TIMES.ready) tip = { ...writing.tip };
  if (time >= TIMES.written) {
    const q = phase(time, TIMES.written, 13650);
    tip = mixPoint(writing.tip, { x: 618, y: 271 }, q);
    tip.y -= 35 * Math.sin(Math.PI * q);
  }
  const penLength = 158;
  const root = { x: tip.x - Math.sqrt(Math.max(1, penLength ** 2 - (291 - tip.y) ** 2)), y: 291 };
  if (time < TIMES.pickup) {
    // The pencil rests on a small stand until Buddy grips its butt.
    root.x = parkedTip.x - Math.sqrt(penLength ** 2 - (291 - parkedTip.y) ** 2);
  }
  let label = 'Se préparer';
  if (time >= 350) label = 'Approcher le bord';
  if (time >= TIMES.contact) label = 'Prendre appui';
  if (time >= TIMES.push) label = 'Pousser la slide';
  if (time >= TIMES.stop) label = 'Relâcher';
  if (time >= TIMES.release) label = 'Saisir le crayon';
  if (time >= TIMES.pickup) label = 'Placer la pointe';
  if (time >= TIMES.ready) label = writing.down ? 'Tracer « Bonjour »' : 'Lever la pointe';
  if (time >= TIMES.written) label = 'Lever le crayon';
  if (time >= 13650) label = 'Regarder le résultat';
  return { time, slide, contact, gap, force, pressing, tip, root, pencilAlpha, ink: writing.ink,
    penDown: writing.down, activeStroke: writing.activeStroke, label, writing: time >= TIMES.pickup };
}

// Contact is solved at the rightmost corner of the compressed, tilted box.
export function rigAt(style, frame, walking = true) {
  const { time, force, contact, gap, root } = frame;
  const illustrated = style === 'drawn';
  const limbs = style !== 'silhouette';
  let angle = limbs ? 7 * force : 8 * force;
  let sx = 1 - force * (limbs ? .05 : .13), sy = 1 + force * .06;
  const rad = angle * Math.PI / 180;
  const extentX = 44 * sx * Math.cos(rad) + 31 * sy * Math.sin(rad);
  const extentY = 44 * sx * Math.sin(rad) + 31 * sy * Math.cos(rad);
  let center = limbs ? { x: contact.x - 76 - gap, y: 291 + force * 3 }
    : { x: contact.x - extentX - gap, y: 350 - extentY };
  if (!limbs && time > TIMES.stop && time < TIMES.release) {
    center.y -= 6 * Math.sin(Math.PI * (time - TIMES.stop) / (TIMES.release - TIMES.stop)) ** 2;
  }
  let hand = { x: contact.x - gap, y: contact.y };
  let otherHand = { x: hand.x, y: hand.y + 14 };
  const pickup = phase(time, TIMES.release, TIMES.pickup);
  const targetCenter = limbs ? { x: root.x - 61, y: 291 } : { x: root.x - 42, y: 321 };
  if (pickup > 0) {
    center = mixPoint(center, targetCenter, pickup);
    hand = mixPoint(hand, root, pickup);
    otherHand = mixPoint(otherHand, mixPoint(root, frame.tip, .12), pickup);
    angle *= 1 - pickup; sx = mix(sx, 1, pickup); sy = mix(sy, 1, pickup);
  }
  const observing = phase(time, 13650, DURATION);
  // The writing attachment remains fixed on the body; only gaze changes at rest.
  const face = time >= 13650 ? '^.^' : frame.penDown ? '•.ᵔ' : force > .2 ? '>_<' : '^.^';
  const feet = limbs && walking ? feetAt(time) : [{ x: center.x - 24, y: 350 }, { x: center.x + 25, y: 350 }];
  return { style, illustrated, limbs, center, angle, sx, sy, hand, otherHand,
    feet, face, observing, effort: force,
    bodyContact: { x: center.x + extentX, y: center.y + 44 * sx * Math.sin(rad) - 31 * sy * Math.cos(rad) } };
}

let footPlan;
function feetAt(time) {
  if (!footPlan) {
    // A support stays fixed in world space while the other foot swings.
    // Precompute from absolute time so seeking never changes the choreography.
    footPlan = [];
    const bodyX = t => rigAt('ascii', frameAt(t), false).center.x;
    const start = bodyX(0);
    const planted = [start - 24, start + 25];
    let swing = null;
    for (let t = 0; t <= DURATION; t += 10) {
      if (swing && t >= swing.end) { planted[swing.side] = swing.to; swing = null; }
      const x = bodyX(t);
      if (!swing && !(t >= TIMES.contact && t < TIMES.push)) {
        const errors = [x - 24 - planted[0], x + 25 - planted[1]];
        const side = Math.abs(errors[0]) > Math.abs(errors[1]) ? 0 : 1;
        if (Math.abs(errors[side]) > 18) {
          const end = Math.min(t + 220, t < TIMES.contact ? TIMES.contact : DURATION);
          swing = { side, from: planted[side], to: bodyX(end) + (side ? 25 : -24) + Math.sign(errors[side]) * 5, start: t, end };
        }
      }
      const feet = planted.map(x => ({ x, y: 350 }));
      if (swing) {
        const u = clamp((t - swing.start) / Math.max(1, swing.end - swing.start));
        feet[swing.side] = { x: mix(swing.from, swing.to, ease(u)), y: 350 - 15 * Math.sin(Math.PI * u) };
      }
      footPlan.push(feet);
    }
  }
  const index = Math.floor(time / 10), q = time / 10 - index;
  return footPlan[index].map((foot, i) => mixPoint(foot, (footPlan[index + 1] || footPlan[index])[i], q));
}

export function elbow(a, b, bend = 1) {
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  const depth = Math.max(8, Math.min(26, 42 - distance * .3)) * bend;
  return { x: (a.x + b.x) / 2 - dy / (distance || 1) * depth,
    y: (a.y + b.y) / 2 + dx / (distance || 1) * depth };
}
