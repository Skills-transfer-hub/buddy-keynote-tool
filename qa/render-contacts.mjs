import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { transitionFrame, elementFrame, drawMotion, graphemes } from '../lib/buddy-motion.js';
import { transitionLabels, animationLabels, makeElement } from '../lib/studio.ts';
const require=createRequire(import.meta.url);
const {createCanvas}=require('/Users/hugo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
for(const group of ['transitions','texte']){
 const sheet=createCanvas(1440,960),out=sheet.getContext('2d');out.fillStyle='#e9e8e2';out.fillRect(0,0,1440,960);
 const entries=Object.entries(group==='transitions'?transitionLabels:animationLabels).filter(([k])=>k!=='none');
 for(let i=0;i<entries.length;i++){
  const [kind,label]=entries[i],paper=i%2===0,canvas=createCanvas(1200,675);Object.defineProperty(canvas,'clientWidth',{value:1200});
  const e={...makeElement('text'),animation:kind,x:20,y:32,w:60,h:32,text:'Bonjour.\nLes idées prennent vie.'};
  const glyphs=graphemes(e.text).map((c,n)=>({index:n,x:245+(n%17)*28,y:250+Math.floor(n/17)*70,width:28,height:54,angle:0}));
  const frame=group==='transitions'?transitionFrame(kind,.52):elementFrame(e,.52,'16:9',glyphs);
  drawMotion(canvas,[frame]);const col=i%3,row=Math.floor(i/3),x=col*480,y=row*240;
  out.fillStyle=paper?'#fff':'#171717';out.fillRect(x+8,y+8,464,224);
  out.fillStyle=paper?'#222':'#fff';out.font='18px sans-serif';out.fillText(label,x+22,y+34);
  const cx=Math.max(200,Math.min(1000,frame.actor.x)),cy=Math.max(90,Math.min(585,frame.actor.y));
  out.drawImage(canvas,cx-200,cy-85,400,180,x+40,y+47,400,180);
 }
 await writeFile(`qa/contacts-${group}.png`,sheet.toBuffer('image/png'));
}
