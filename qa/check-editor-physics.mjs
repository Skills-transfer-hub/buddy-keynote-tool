import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire('/Users/hugo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  let now=1000,id=0;const frames=new Map();
  performance.now=()=>now;
  window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
  window.cancelAnimationFrame=key=>frames.delete(key);
  window.advanceMotion=delta=>{now+=delta;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));};
});
await page.goto('http://localhost:3001/');
await page.getByRole('button',{name:'Présenter',exact:true}).waitFor();
await page.getByLabel('Importer une présentation',{exact:true}).setInputFiles(new URL('./buddy-24-gestes.buddy.json',import.meta.url).pathname);
await page.getByRole('button',{name:'Présenter',exact:true}).click({force:true});
await page.getByRole('region',{name:'Présentation',exact:true}).waitFor();
await page.evaluate(()=>document.fonts.ready);
const snapshots=[];
const tick=async delta=>{await page.evaluate(d=>window.advanceMotion(d),delta);await page.waitForTimeout(30);};
const source=await readFile(new URL('../lib/buddy-motion.js',import.meta.url),'utf8');
await page.evaluate(async source=>{window.motion=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));},source);
const deck=JSON.parse(await readFile(new URL('./buddy-24-gestes.buddy.json',import.meta.url)));
for(let i=0;i<12;i++){
  await page.locator(`.player-incoming [data-element-id="message-${i}"]`).waitFor({state:'attached'});
  await tick(2800*.53);
  await page.locator('.player-stage').screenshot({path:new URL(`./physics-checks/editor-transition-${i}.png`,import.meta.url).pathname,animations:'allow'});
  await tick(2800*(1-.53)+5000*.53);
  const e=deck.slides[i].elements[1];
  const state=await page.evaluate(e=>{
    const node=document.querySelector(`.player-incoming [data-element-id="${e.id}"]`),stage=document.querySelector('.player-stage');
    const glyphs=window.motion.readGlyphs(node,stage,e),frame=window.motion.elementFrame(e,.53,'16:9',glyphs);
    return {kind:e.animation,phase:node.dataset.contactPhase,expected:frame.physics.phase,
      transform:node.style.transform,styles:[...node.querySelectorAll('[data-char-index]')].map(slot=>({index:+slot.dataset.charIndex,visibility:slot.firstChild.style.visibility,transform:slot.firstChild.style.transform})),
      expectedStyles:frame.glyphStyles};
  },e);
  assert.equal(state.phase,state.expected);
  state.styles.forEach(g=>assert.equal(g.visibility,state.expectedStyles[g.index].visibility));
  await page.locator('.player-stage').screenshot({path:new URL(`./physics-checks/editor-element-${i}.png`,import.meta.url).pathname,animations:'allow'});
  snapshots.push(state);
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(30); // finish only
  assert.equal(await page.locator(`.player-incoming [data-element-id="message-${i}"]`).getAttribute('data-motion-running'),'false');
  if(i<11){await page.keyboard.press('ArrowRight');await page.waitForTimeout(30);}
}
await page.keyboard.press('ArrowLeft');await page.waitForTimeout(30);
assert.equal(await page.locator('.player-incoming [data-element-id="message-10"]').count(),1);
await page.keyboard.press('b');assert.equal(await page.getByLabel('Écran noir',{exact:true}).count(),1);
await page.keyboard.press('b');await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Présenter',exact:true}).waitFor();
await page.reload();await page.getByRole('button',{name:'Présenter',exact:true}).waitFor();
assert.equal(await page.locator('[data-element-id="message-10"]').count()>0,true,'imported QA deck survives reload');
assert.deepEqual(errors,[]);
await writeFile(new URL('./physics-checks/editor-results.json',import.meta.url),JSON.stringify(snapshots,null,2));
await browser.close();
console.log(JSON.stringify({editor:true,transitions:12,effects:12,keyboardSkip:true,previous:true,blackout:true,exit:true,persistence:true,errors}));
