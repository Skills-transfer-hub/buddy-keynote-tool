import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire('/Users/hugo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const out = new URL('./physics-checks/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
// Freeze only the animation clock; the actual exported module and renderer run intact.
await page.addInitScript(() => {
  let now = 1000, id = 0;
  const frames = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  window.cancelAnimationFrame = key => frames.delete(key);
  window.advanceMotion = delta => {
    now += delta;
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(fn => fn(now));
  };
});
await page.goto(pathToFileURL(fileURLToPath(new URL('./buddy-24-gestes.html', import.meta.url))).href);
await page.evaluate(() => document.fonts.ready);
const source = await readFile(new URL('../lib/buddy-motion.js', import.meta.url), 'utf8');
await page.evaluate(async source => { window.motion = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))); }, source);
let elapsed = 0;
const seek = async ms => { assert.ok(ms >= elapsed); await page.evaluate(delta => window.advanceMotion(delta), ms - elapsed); elapsed = ms; };
const advance = async () => { await page.locator('#next').click({ force: true }); elapsed = 0; };
const results = [];
for (let i = 0; i < 12; i++) {
  assert.equal(await page.locator('#counter').textContent(), `${i + 1} / 12`);
  await seek(2800 * .53);
  await page.locator('#stage').screenshot({ path: fileURLToPath(new URL(`transition-${i}.png`, out)), animations: 'allow' });
  const transition = await page.evaluate(i => {
    const data = JSON.parse(document.querySelector('#deck-data').textContent);
    const scene = document.querySelectorAll('.offline-scene')[i];
    return { kind: data.slides[i].transition, mask: getComputedStyle(scene).maskImage, transform: getComputedStyle(scene).transform };
  }, i);
  if (transition.kind === 'dissolve') assert.notEqual(transition.mask, 'none', 'Chromium applied the real radial mask');
  await seek(2800 + 5000 * .53);
  const state = await page.evaluate(i => {
    const data = JSON.parse(document.querySelector('#deck-data').textContent), e = data.slides[i].elements[1];
    const stage = document.querySelector('#stage'), node = document.querySelector(`[data-element-id="message-${i}"]`);
    const glyphs = window.motion.readGlyphs(node, stage, e), layout = window.motion.textLayout(e, glyphs);
    const frame = window.motion.elementFrame(e, .53, '16:9', glyphs);
    return { kind: e.animation, rows: layout.rows.length, words: layout.words.length,
      phase: node.dataset.contactPhase, expectedPhase: frame.physics.phase,
      transform: node.style.transform, expectedTransform: frame.visual.transform,
      glyphCount: glyphs.length, text: glyphs.map(g => g.text).join(''),
      styles: [...node.querySelectorAll('[data-char-index]')].map(slot => ({ index: +slot.dataset.charIndex, clip: slot.firstChild.style.clipPath, transform: slot.firstChild.style.transform })),
      frame, glyphs, box: stage.getBoundingClientRect().toJSON(),
      mask: getComputedStyle(node.closest('.offline-scene')).maskImage };
  }, i);
  assert.equal(state.rows, 2, `${state.kind}: punctuation must stay on its line`);
  assert.equal(state.words, 5, `${state.kind}: words must stay intact`);
  assert.equal(state.phase, state.expectedPhase);
  const numbers = value => [...value.matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)].map(m => Number(m[0]));
  const closeStyle = (a,b) => { let actual=numbers(a),expected=numbers(b); const expand = n => n.length===1?[n[0],n[0],n[0],n[0]]:n.length===2?[n[0],n[1],n[0],n[1]]:n.length===3?[n[0],n[1],n[2],n[1]]:n; if(a.startsWith("inset(")){actual=expand(actual);expected=expand(expected);} assert.equal(actual.length,expected.length, `${a} != ${b}`); actual.forEach((n,j)=>assert.ok(Math.abs(n-expected[j])<.002, `${a} != ${b}`)); };
  closeStyle(state.transform, state.expectedTransform);
  assert.equal(state.mask, 'none', 'transition mask cleared before element action');
  for (const style of state.styles) {
    closeStyle(style.transform, state.frame.glyphStyles[style.index].transform);
    closeStyle(style.clip, state.frame.glyphStyles[style.index].clipPath);
  }
  await page.locator('#stage').screenshot({ path: fileURLToPath(new URL(`element-${i}.png`, out)), animations: 'allow' });
  results.push({ ...transition, ...state });
  await advance(); // finish the current action, keeping the slide
  const final = await page.locator(`[data-element-id="message-${i}"]`).evaluate(node => ({ opacity: node.style.opacity, running: node.dataset.motionRunning, inks: [...node.querySelectorAll('[data-glyph-ink]')].map(ink => ({ transform: ink.style.transform, clip: ink.style.clipPath, visibility: ink.style.visibility })) }));
  assert.equal(final.running, 'false');
  assert.equal(final.opacity, state.kind === 'exit' ? '0' : '1');
  final.inks.forEach(ink => assert.deepEqual(ink, { transform: 'none', clip: 'none', visibility: 'visible' }));
  if (i < 11) await advance();
}
await page.locator('#prev').click({ force: true });
assert.equal(await page.locator('#counter').textContent(), '11 / 12');
assert.deepEqual(errors, []);
await writeFile(new URL('results.json', out), JSON.stringify(results, null, 2));
// A compact contact sheet uses actual browser screenshots for visual review.
await page.setContent(`<html><style>body{margin:0;background:#eee;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px}figure{margin:0;background:#fff}img{width:100%;display:block}figcaption{padding:8px}</style><main>${results.map((r,i)=>`<figure><img src="${new URL(`transition-${i}.png`,out)}"><figcaption>${i+1}. ${r.kind} · transition</figcaption><img src="${new URL(`element-${i}.png`,out)}"><figcaption>${r.kind} · texte</figcaption></figure>`).join('')}</main></html>`);
await page.waitForLoadState('load');
await page.screenshot({ path: fileURLToPath(new URL('contact-sheet.png', out)), fullPage: true });
await browser.close();
console.log(JSON.stringify({ browser: 'Chromium', transitions: 12, textEffects: 12, measuredRows: true, glyphTransforms: true, finalStates: true, maskReset: true, previous: true, errors }));
