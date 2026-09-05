import { DURATION, TIMES, frameAt, rigAt, elbow, mixPoint } from './motion.mjs';

const sheetURL = './mascot-sheet.png';
const svgNS = 'http://www.w3.org/2000/svg';
const panels = [...document.querySelectorAll('.variant')].map(panel => ({
  panel, style: panel.dataset.style, svg: panel.querySelector('svg'),
}));
const n = value => Number(value.toFixed(3));
const xy = point => `${n(point.x)},${n(point.y)}`;
const path = points => points.map((point, index) => `${index ? 'L' : 'M'}${xy(point)}`).join(' ');
const translate = point => `translate(${n(point.x)} ${n(point.y)})`;
const crops = { body: [97, 100, 496, 462], limb: [727, 265, 457, 172], hand: [139, 755, 395, 333], foot: [716, 788, 466, 319] };

function sprite(style, name, x, y, width, height) {
  return `<svg x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" viewBox="${crops[name].join(' ')}" preserveAspectRatio="none" overflow="hidden"><use href="#sheet-${style}"/></svg>`;
}
function segment(style, a, b, width = 13) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (style === 'drawn') return `<g transform="${translate(a)} rotate(${n(angle)})">${sprite(style, 'limb', -4, -width / 2, distance + 8, width)}</g>`;
  return `<text class="ascii-limb" transform="${translate(a)} rotate(${n(angle)})" x="0" y="6" textLength="${n(Math.max(1, distance))}" lengthAdjust="spacingAndGlyphs">${'─'.repeat(Math.max(1, Math.round(distance / 10)))}</text>`;
}
function limb(style, a, b, bend) {
  const joint = elbow(a, b, bend);
  return segment(style, a, joint) + segment(style, joint, b) + (style === 'ascii' ? `<text class="ascii-limb" x="${n(joint.x)}" y="${n(joint.y + 5)}" text-anchor="middle" font-size="12">○</text>` : '');
}
function hand(style, point) {
  if (style === 'drawn') return sprite(style, 'hand', point.x - 27, point.y - 11, 27, 23);
  return `<text class="ascii-limb" x="${n(point.x)}" y="${n(point.y + 6)}" text-anchor="end">⊣</text>`;
}
function drawBody(rig, frame) {
  const transform = `${translate(rig.center)} rotate(${n(rig.angle)}) scale(${n(rig.sx)} ${n(rig.sy)})`;
  if (rig.illustrated) {
    const effort = rig.effort;
    const leftAngle = effort * 65, rightAngle = -effort * 65;
    const eyeScale = frame.time >= 13650 ? 1.12 : frame.penDown ? .84 : 1;
    // Cropped eye sprites articulate independently; the body remains the generated artwork.
    return `<g data-body="drawn" transform="${transform}"><svg x="-44" y="-38" width="88" height="76" viewBox="97 100 496 462" preserveAspectRatio="none">
      <rect x="268" y="246" width="260" height="95" fill="#ffedbf"/>
      <use href="#sheet-drawn" mask="url(#face-mask)"/>
      <g transform="translate(315 ${n(294 - rig.observing * 12)}) rotate(${n(leftAngle)}) scale(1 ${n(eyeScale)})"><svg x="-45" y="-45" width="90" height="90" viewBox="270 249 90 90"><use href="#sheet-drawn"/></svg></g>
      <g transform="translate(476 ${n(294 - rig.observing * 12)}) rotate(${n(rightAngle)}) scale(1 ${n(eyeScale)})"><svg x="-45" y="-45" width="90" height="90" viewBox="431 249 90 90"><use href="#sheet-drawn"/></svg></g>
    </svg></g>`;
  }
  // A geometric outline preserves Buddy's box while making its physical edge exact.
  return `<g data-body="${rig.style}" transform="${transform}"><rect data-body-outline x="-44" y="-31" width="88" height="62" rx="2" fill="#f8faf9" stroke="#193d36" stroke-width="1.8"/><text class="ascii-body" x="${n(rig.observing * 5)}" y="${n(6 - rig.observing * 3)}" text-anchor="middle">${rig.face}</text></g>`;
}
function drawRig(rig, frame) {
  let result = `<ellipse cx="${n(rig.center.x)}" cy="352" rx="${rig.limbs ? 51 : 46}" ry="4" fill="#173f3512"/>`;
  if (rig.limbs) {
    for (let i = 0; i < 2; i++) {
      const foot = rig.feet[i];
      const hip = { x: rig.center.x + (i ? 22 : -22), y: rig.center.y + 25 };
      const ankle = { x: foot.x, y: foot.y - 8 };
      result += limb(rig.style, hip, ankle, i ? -1 : 1);
      result += rig.illustrated ? sprite(rig.style, 'foot', foot.x - 12, foot.y - 21, 31, 21)
        : `<text class="ascii-limb" x="${n(foot.x - 10)}" y="${n(foot.y)}">╰─</text>`;
    }
    result += limb(rig.style, { x: rig.center.x - 27, y: rig.center.y - 5 }, { x: rig.otherHand.x - 15, y: rig.otherHand.y }, -1);
    result += hand(rig.style, rig.otherHand);
  }
  result += drawBody(rig, frame);
  if (rig.limbs) {
    result += limb(rig.style, { x: rig.center.x + 31, y: rig.center.y - 6 }, { x: rig.hand.x - 15, y: rig.hand.y }, 1);
    result += hand(rig.style, rig.hand);
  } else if (frame.time >= TIMES.release) {
    // A collar is bolted directly to Buddy's corner: no hidden arm or floating tool.
    const attachment = { x: rig.center.x + 42, y: rig.center.y - 30 };
    result += `<rect data-attachment x="${n(attachment.x - 7)}" y="${n(attachment.y - 5)}" width="14" height="10" rx="3" fill="#1d6958" stroke="#102f28" stroke-width="1.5"/><circle cx="${n(attachment.x)}" cy="${n(attachment.y)}" r="2" fill="#f4e5a2"/>`;
  }
  return result;
}
function pencil(frame) {
  const { root, tip } = frame;
  const shaftEnd = mixPoint(root, tip, .94);
  const u = { x: (tip.x - root.x) / 158, y: (tip.y - root.y) / 158 };
  const side = { x: -u.y * 4.5, y: u.x * 4.5 };
  const eraser = mixPoint(root, tip, .055);
  return `<g data-pencil opacity="${n(frame.pencilAlpha)}"><path d="M${xy(root)} L${xy(shaftEnd)}" stroke="#193e33" stroke-width="11" stroke-linecap="round"/><path d="M${xy(root)} L${xy(shaftEnd)}" stroke="#e5b95a" stroke-width="7" stroke-linecap="round"/><path d="M${xy(root)} L${xy(eraser)}" stroke="#e78c73" stroke-width="7" stroke-linecap="round"/><path d="M${n(shaftEnd.x + side.x)},${n(shaftEnd.y + side.y)} L${xy(tip)} L${n(shaftEnd.x - side.x)},${n(shaftEnd.y - side.y)}Z" fill="#e9d8ad" stroke="#213e32" stroke-width="1"/><circle data-nib cx="${n(tip.x)}" cy="${n(tip.y)}" r="1.5" fill="#162f24"/></g>`;
}
function drawScene(frame, style) {
  const rig = rigAt(style, frame);
  const s = frame.slide;
  let html = `<path class="floor" d="M24 350H618"/><path d="M42 366H128M498 366H596" stroke="#e5ebe7"/>
    <rect x="${n(s.x + 4)}" y="${s.y + 6}" width="${s.width}" height="${s.height}" rx="7" fill="#173f350d"/>
    <g data-slide transform="translate(${n(s.x)} ${s.y})"><rect width="${s.width}" height="${s.height}" rx="6" fill="white" stroke="#b3c9bd" stroke-width="2"/>
    <path d="M0 46H260" stroke="#d6e3dc"/><circle cx="20" cy="22" r="4" fill="#32876e"/><text x="32" y="27" class="scene-label" font-size="12" font-weight="600" fill="#496658">UNE IDÉE PREND FORME</text>
    <text x="23" y="79" class="scene-label" font-size="12" fill="#a1b3a8">BUDDY / 01</text><line x1="23" y1="149" x2="238" y2="149" stroke="#dae7df" stroke-dasharray="3 5"/>
    <text x="23" y="203" class="scene-label" font-size="10" fill="#93aa9b">Le geste fait avancer l’idée.</text></g>`;
  html += frame.ink.map((points, index) => `<path data-ink="${index}" class="ink" d="${path(points)}"/>`).join('');
  if (frame.pressing) html += `<path data-contact d="M${n(frame.contact.x)} ${n(frame.contact.y - 9)}v25" stroke="#277b61" stroke-width="3" stroke-linecap="round"/>`;
  if (frame.time > TIMES.release && frame.time < TIMES.pickup) html += `<g opacity="${n(1 - (frame.time - TIMES.release) / (TIMES.pickup - TIMES.release))}"><path d="M138 306h24m-19 0v-14m14 14v-14" fill="none" stroke="#a9bfb1" stroke-width="3"/></g>`;
  html += drawRig(rig, frame);
  html += pencil(frame);
  // Grip is painted over the shaft; it must visibly encircle the pencil.
  if (frame.time >= TIMES.pickup && rig.limbs) html += hand(style, { x: frame.root.x + 8, y: frame.root.y });
  if (frame.penDown) html += `<circle data-contact-ink cx="${n(frame.tip.x)}" cy="${n(frame.tip.y)}" r="3.5" fill="#1d69581b"/>`;
  return html;
}

for (const panel of panels) {
  panel.svg.innerHTML = `<defs><image id="sheet-${panel.style}" width="1254" height="1254" href="${sheetURL}"/>
    <mask id="face-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254"><rect width="1254" height="1254" fill="white"/><rect x="268" y="246" width="96" height="95" fill="black"/><rect x="429" y="246" width="99" height="95" fill="black"/></mask></defs>`;
  panel.layer = document.createElementNS(svgNS, 'g');
  panel.layer.dataset.scene = panel.style;
  panel.svg.append(panel.layer);
}

let time = 0, playing = false, speed = 1, last = null, request = null;
const timeline = document.querySelector('#timeline');
const play = document.querySelector('#play');
const phaseLabel = document.querySelector('#phase');
const formatTime = value => (value / 1000).toFixed(2).replace('.', ',');

function render() {
  const frame = frameAt(time);
  for (const panel of panels) {
    panel.layer.innerHTML = drawScene(frame, panel.style);
    panel.svg.dataset.time = String(time);
    panel.svg.dataset.penDown = String(frame.penDown);
  }
  timeline.value = String(time);
  timeline.setAttribute('aria-valuetext', `${formatTime(time)} secondes, ${frame.label}`);
  document.querySelector('#time').textContent = `${formatTime(time)} / 14,40 s`;
  if (phaseLabel.textContent !== frame.label) phaseLabel.textContent = frame.label;
  document.querySelectorAll('.chapter').forEach(button => button.classList.toggle('active', Number(button.dataset.seek) === (time >= TIMES.release ? TIMES.release : 0)));
}
function setPlaying(value) {
  playing = value; last = null;
  if (request !== null) cancelAnimationFrame(request);
  request = null;
  play.setAttribute('aria-label', playing ? 'Mettre en pause les trois simulations' : 'Lire les trois simulations');
  document.querySelector('#play-icon').textContent = playing ? 'Ⅱ' : '▶';
  document.querySelector('#play-label').textContent = playing ? 'Pause' : 'Lire';
  if (playing) request = requestAnimationFrame(tick);
}
function tick(now) {
  if (last !== null) time = Math.min(DURATION, time + Math.min(100, now - last) * speed);
  last = now; render();
  if (time >= DURATION) setPlaying(false);
  else if (playing) request = requestAnimationFrame(tick);
}
function seek(value) { time = Math.min(DURATION, Math.max(0, value)); last = null; render(); }
play.addEventListener('click', () => { if (time >= DURATION) seek(0); setPlaying(!playing); });
document.querySelector('#replay').addEventListener('click', () => { seek(0); setPlaying(true); });
timeline.addEventListener('input', () => { setPlaying(false); seek(Number(timeline.value)); });
document.querySelectorAll('[data-seek]').forEach(button => button.addEventListener('click', () => { setPlaying(false); seek(Number(button.dataset.seek)); }));
document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => {
  speed = Number(button.dataset.speed); last = null;
  document.querySelectorAll('[data-speed]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
}));
document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-choice]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  panels.forEach(panel => panel.panel.classList.toggle('selected', panel.style === button.dataset.choice));
  const title = button.closest('.variant').querySelector('h2').textContent;
  document.querySelector('#selection').textContent = `Direction retenue pour cette comparaison : ${title}.`;
}));
document.addEventListener('keydown', event => {
  if (event.target.closest('button, input, select, textarea, [contenteditable]')) return;
  if (event.code === 'Space') { event.preventDefault(); if (time >= DURATION) seek(0); setPlaying(!playing); }
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    event.preventDefault(); setPlaying(false); seek(time + (event.code === 'ArrowRight' ? 100 : -100));
  }
  if (event.code === 'Home' || event.code === 'End') { event.preventDefault(); setPlaying(false); seek(event.code === 'Home' ? 0 : DURATION); }
});
document.addEventListener('visibilitychange', () => { last = null; });
// Deliberately paused on entry, including for reduced-motion preferences.
render();
