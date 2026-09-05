import { build, stop } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initialDeck, makeSlide, makeElement, transitionLabels, animationLabels } from '../lib/studio.ts';
import * as motion from '../lib/buddy-motion.js';
const transitions=Object.keys(transitionLabels),effects=Object.keys(animationLabels).filter(k=>k!=='none');
const deck={...initialDeck,id:'buddy-24-gestes',title:'Buddy — 24 gestes',slides:transitions.map((transition,i)=>{
 const slide=makeSlide();slide.id=`gesture-${i}`;slide.name=`${i+1} · ${transitionLabels[transition]}`;slide.transition=transition;slide.transitionDuration=2800;slide.tone=i%2?'ink':'paper';slide.autoAdvance=null;
 const title=makeElement('text');title.id=`caption-${i}`;title.text=`${transitionLabels[transition]} · ${animationLabels[effects[i]]}`;title.x=10;title.y=9;title.w=80;title.h=10;title.animation='none';title.style.fontSize=20;title.style.color=i%2?'#ccc':'#555';
 const text=makeElement('text');text.id=`message-${i}`;text.text='Bonjour.\r\nLes idées prennent vie.';text.x=15;text.y=33;text.w=74;text.h=32;text.animation=effects[i];text.animationTrigger='after';text.animationDuration=5000;text.style.fontSize=62;text.style.color=i%2?'#fff':'#171717';
 slide.elements=[title,text];return slide;
})};
await writeFile('qa/buddy-24-gestes.buddy.json',JSON.stringify(deck,null,2));
const result=await build({entryPoints:['lib/html-export.ts'],bundle:true,platform:'browser',format:'esm',write:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:args.path.startsWith('@/')?resolve(process.cwd(),args.path.slice(2).replace(/\?raw$/,'')):resolve(args.resolveDir,args.path.replace(/\?raw$/,'')),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}],alias:{'@':process.cwd()},logLevel:'silent'});
const {exportHtml}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const html=await (await exportHtml(deck)).text();await writeFile('qa/buddy-24-gestes.html',html);
for(const reduced of [false,true]){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;let tick;
 w.ResizeObserver=class{observe(){}};w.matchMedia=()=>({matches:reduced});w.CSS={escape:s=>s};w.requestAnimationFrame=fn=>{tick=fn;return 1;};w.cancelAnimationFrame=()=>{tick=null;};Object.defineProperty(w.performance,'now',{value:()=>0});
 const script=w.document.querySelector('script[type="module"]').textContent;
 assert(!/^import /m.test(script));w.eval(script.replace(/^export /gm,''));
 const scenes=[...w.document.querySelectorAll('.offline-scene')];assert.equal(scenes.length,12);
 for(let i=0;i<12;i++){
  assert.equal(w.document.getElementById('counter').textContent,`${i+1} / 12`);
  const node=scenes[i].querySelector(`[data-element-id="message-${i}"]`),element=deck.slides[i].elements[1];
  const slots=[...node.querySelectorAll('[data-char-index]')];
  if(motion.needsGlyphLayout(element)){
   assert.equal(slots.map(s=>s.textContent).join(''),'Bonjour.Les idées prennent vie.');
   assert.equal(Number(slots.at(-1).dataset.charIndex),motion.graphemes(element.text).length-1);
  }
  if(!reduced){
   for(const phase of [.24,.53,.82]){
    tick?.(2800+5000*phase);
    const frame=motion.elementFrame(element,phase);
    const expected=frame.visual;
    assert.equal(node.style.clipPath,expected.clipPath);
    for(const slot of slots){const ink=slot.querySelector('[data-glyph-ink]');const style=frame.glyphStyles[Number(slot.dataset.charIndex)];assert.equal(ink.style.visibility,style?.visibility||'visible');}
   }
   w.document.getElementById('next').click();
  }
  for(const slot of slots)assert.equal(slot.querySelector('[data-glyph-ink]').style.visibility,'visible');
  assert.equal(node.dataset.motionRunning,'false');
  if(i<11)w.document.getElementById('next').click();
 }
 w.document.getElementById('prev').click();assert.equal(w.document.getElementById('counter').textContent,'11 / 12');dom.window.close();
}
console.log(JSON.stringify({transitions:12,textEffects:12,generatedHtmlBytes:html.length,allExportedEffectsExecuted:true,reducedMotion:true,crlf:true,skip:true,previous:true}));
await stop();process.exit(0);
