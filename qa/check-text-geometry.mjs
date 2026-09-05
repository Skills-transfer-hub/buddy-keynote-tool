import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/hugo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:820},reducedMotion:'reduce'});
await page.goto(new URL('./text-effects.html',import.meta.url).href);
await page.evaluate(()=>document.fonts.ready);
const source=await readFile(new URL('../lib/buddy-motion.js',import.meta.url),'utf8');
await page.evaluate(async source=>{window.motion=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));},source);
const deltas=await page.evaluate(()=>{
  const e=JSON.parse(document.querySelector('#deck-data').textContent).slides[0].elements[1];
  const node=document.querySelector('[data-element-id="text-0"]'),stage=document.querySelector('#stage'),box=stage.getBoundingClientRect();
  const deltas=[];
  for(const rotation of [30,-45,90])for(const kind of ['domino','wobble']){
    const element={...e,rotation,animation:kind,animationScope:'block',animationMode:kind==='wobble'?'emphasis':'entrance'};
    const glyphs=window.motion.readGlyphs(node,stage,element),frame=window.motion.elementFrame(element,.24+.58*.6,'16:9',glyphs);
    window.motion.applyElementFrame(node,frame);
    const matrix=new DOMMatrix(getComputedStyle(node).transform),width=element.w*box.width/100;
    const offset=matrix.transformPoint({x:kind==='wobble'?width/2:-width/2,y:0});
    const actual={x:(element.x+element.w/2)*12+offset.x*1200/box.width,y:(element.y+element.h/2)*675/100+offset.y*1200/box.width};
    deltas.push({kind,rotation,error:Math.hypot(actual.x-frame.physics.materialPoint.x,actual.y-frame.physics.materialPoint.y)});
  }
  return deltas;
});
deltas.forEach(d=>assert.ok(d.error<.001,JSON.stringify(d)));
await page.reload();
const results=await page.evaluate(()=>{
  const data=JSON.parse(document.querySelector('#deck-data').textContent),results=[];
  for(let i=0;i<data.slides.length;i++){
    const e=data.slides[i].elements[1],node=document.querySelector(`[data-element-id="text-${i}"]`);
    results.push({mode:e.animationMode,scope:e.animationScope,running:node.dataset.motionRunning,opacity:node.style.opacity,hidden:[...node.querySelectorAll('[data-glyph-ink]')].every(g=>g.style.visibility==='hidden')});
    if(i<data.slides.length-1)document.querySelector('#next').click();
  }
  return results;
});
for(const r of results){assert.equal(r.running,'false');if(r.mode==='exit')assert.ok(r.opacity==='0'||r.hidden);else assert.equal(r.opacity,'1');}
await browser.close();console.log(JSON.stringify({rotatedBlockContacts:deltas,reducedMotion:results.length}));
