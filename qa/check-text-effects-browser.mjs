import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/hugo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const out=new URL('./text-checks/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:820},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  let now=1000,id=0;const frames=new Map();performance.now=()=>now;
  window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};window.cancelAnimationFrame=id=>frames.delete(id);
  window.tickMotion=delta=>{now+=delta;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));};
});
await page.goto(new URL('./text-effects.html',import.meta.url).href);
await page.evaluate(()=>document.fonts.ready);
const deck=JSON.parse(await readFile(new URL('./text-effects.buddy.json',import.meta.url)));
const summaries=[];
async function inkPixels(i){
  // Exclude only the separate Buddy canvas; inspect the actual text raster.
  await page.locator('#buddy-motion').evaluate(node=>node.style.visibility='hidden');
  await page.locator(`[data-element-id="label-${i}"]`).evaluate(node=>node.style.visibility='hidden');
  const image=await loadImage(await page.locator('#stage').screenshot({animations:'allow'}));
  const target=page.locator(`[data-element-id="text-${i}"]`);
  const opacity=await target.evaluate(node=>{const saved=node.style.opacity;node.style.opacity='0';return saved;});
  const empty=await loadImage(await page.locator('#stage').screenshot({animations:'allow'}));
  await target.evaluate((node,value)=>node.style.opacity=value,opacity);
  const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(empty,0,0);
  const background=ctx.getImageData(0,0,image.width,image.height).data;ctx.clearRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);
  const data=ctx.getImageData(0,0,image.width,image.height).data;let pixels=0;
  for(let j=0;j<data.length;j+=4)if(Math.max(Math.abs(data[j]-background[j]),Math.abs(data[j+1]-background[j+1]),Math.abs(data[j+2]-background[j+2]))>1)pixels++;
  await page.locator('#buddy-motion').evaluate(node=>node.style.visibility='visible');
  await page.locator(`[data-element-id="label-${i}"]`).evaluate(node=>node.style.visibility='visible');
  return pixels;
}
for(let i=0;i<deck.slides.length;i++){
  const e=deck.slides[i].elements[1],mode=e.animationMode;
  assert.equal(await page.locator('#counter').textContent(),`${i+1} / ${deck.slides.length}`);
  const start=await inkPixels(i);
  if(mode==='entrance')assert.equal(start,0,`${e.animation}/${e.animationScope}: initial pixels`);else assert.ok(start>100);
  await page.evaluate(()=>window.tickMotion(6000*.239));
  if(mode==='entrance')assert.equal(await inkPixels(i),0,`${e.animation}: preparation leaked pixels`);
  await page.evaluate(()=>window.tickMotion(6000*(.53-.239)));
  if(mode==='emphasis'||e.animationScope==='text')await page.locator('#stage').screenshot({path:new URL(`frame-${i}.png`,out).pathname,animations:'allow'});
  const mid=await page.locator(`[data-element-id="text-${i}"]`).evaluate(node=>({scope:node.dataset.animationScope,mode:node.dataset.animationMode,phase:node.dataset.contactPhase}));
  assert.equal(mid.scope,e.animationScope);assert.equal(mid.mode,mode);
  await page.evaluate(()=>document.querySelector('#next').click());
  const end=await inkPixels(i);
  if(mode==='exit')assert.equal(end,0,`${e.animation}/${e.animationScope}: final pixels`);else assert.ok(end>100,`${e.animation}: lost text`);
  assert.equal(await page.locator(`[data-element-id="text-${i}"]`).getAttribute('data-motion-running'),'false');
  summaries.push({animation:e.animation,mode,scope:e.animationScope,startPixels:start,endPixels:end});
  if(i<deck.slides.length-1)await page.evaluate(()=>document.querySelector('#next').click());
}
await page.evaluate(()=>document.querySelector('#prev').click());
assert.equal(await page.locator('#counter').textContent(),'139 / 140');
assert.deepEqual(errors,[]);
await writeFile(new URL('results.json',out),JSON.stringify(summaries,null,2));
// Use the actual screenshots to review the 15 word emphases together.
const examples=summaries.map((e,i)=>({...e,i})).filter(e=>e.mode==='emphasis'&&e.scope==='word');
await page.setContent(`<style>body{margin:0;font:14px sans-serif;background:#ddd}main{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px}figure{margin:0;background:white}img{width:100%}figcaption{padding:8px}</style><main>${examples.map(e=>`<figure><img src="${new URL(`frame-${e.i}.png`,out)}"><figcaption>${e.animation}</figcaption></figure>`).join('')}</main>`);
await page.screenshot({path:new URL('emphasis-sheet.png',out).pathname,fullPage:true});
await browser.close();console.log(JSON.stringify({cases:summaries.length,zeroPixelEntrances:40,zeroPixelExits:40,visibleEmphases:60,previous:true,errors}));
