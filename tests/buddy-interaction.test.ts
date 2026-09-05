import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as motion from '../lib/buddy-motion.js';
import { makeElement, makeSlide, animationLabels, transitionLabels, type ElementAnimation } from '../lib/studio.ts';
import { animationGroups } from '../lib/playback.ts';
import { startOfflinePresentation } from '../lib/offline-playback.js';

const raw = (q: number) => .24 + .58 * q;
const near = (a: number, b: number, message = '') => assert.ok(Math.abs(a-b)<1e-6, `${message}: ${a} != ${b}`);
const rotate = (x: number,y: number,degrees: number) => {const a=degrees*Math.PI/180;return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)};};
function fixture(animation: ElementAnimation, rotation=0) {
  const element={...makeElement('text'),animation,text:'AB CD\nEF',x:20,y:30,w:50,h:40,rotation};
  const positions=[[0,40,40],[1,67,40],[3,135,40],[4,162,40],[6,40,115],[7,67,115]];
  const glyphs=positions.map(([index,x,y])=>({...motion.elementPoint(element,x,y,motion.stageSize()),index,width:20,height:40,angle:rotation,text:element.text[index],boxWidth:28,boxHeight:52,inkLeft:4,inkTop:6,origin:'50% 88.461538%'}));
  return {element,glyphs};
}
function displacement(transform: string) {
  const values=/translate\(([-.\de]+)cqw,([-.\de]+)cqw\)/.exec(transform);
  return {x:values?Number(values[1])*12:0,y:values?Number(values[2])*12:0};
}
function corners(actor: ReturnType<typeof motion.elementFrame>['actor']) {
  return [-42,42].flatMap(x=>[-27,27].map(y=>{const p=rotate(x*actor.sx,y*actor.sy,actor.angle);return {x:actor.x+p.x,y:actor.y+p.y};}));
}

void test('les coins de la silhouette B restent derrière chaque plan d’appui',()=>{
  for(const animation of Object.keys(animationLabels).filter(k=>k!=='none') as ElementAnimation[])for(const rotation of [-45,-6,0,6,30,90]){
    const {element,glyphs}=fixture(animation,rotation);
    for(let q=.03;q<1;q+=.017){const frame=motion.elementFrame(element,raw(q),'16:9',glyphs),n=frame.physics.normal;
      if(!n||!frame.physics.contact)continue;
      const point=frame.actor.tool?.grip||frame.actor.contact;
      const distances=corners(frame.actor).map(v=>(v.x-point.x)*n.x+(v.y-point.y)*n.y);
      assert.ok(Math.min(...distances)>-1e-6,`${animation}/${rotation}: penetration ${Math.min(...distances)}`);
      near(Math.min(...distances),0,`${animation} support`);
    }
  }
});

void test('le tampon imprime uniquement au contact et couvre le mot complet',()=>{
  const {element,glyphs}=fixture('stamp'),layout=motion.textLayout(element,glyphs);
  for(let q=0;q<1;q+=.001){const frame=motion.elementFrame(element,raw(q),'16:9',glyphs),word=layout.words[frame.physics.word];
    const visible=frame.glyphStyles[word.glyphs[0].index].visibility==='visible';
    const u=q*layout.words.length-Math.floor(q*layout.words.length);
    if(Math.abs(u-(.2+.64*.35))>1e-6)assert.equal(visible,u>.2+.64*.35,`q=${q}, u=${u}`);
    if(frame.physics.contact){const tool=frame.actor.tool!;
      const bottom=motion.elementPoint(element,word.x,word.b,motion.stageSize());
      near(tool.tip.x,bottom.x);near(tool.tip.y,bottom.y);
      assert.ok(tool.extent!>=word.w&&tool.depth!>=word.h);
    }
  }
});

void test('le mot attiré puis transporté reste sur la vraie pointe de l’aimant',()=>{
  for(const rotation of [0,30,-45]){
    const {element,glyphs}=fixture('magnet',rotation),layout=motion.textLayout(element,glyphs);
    for(let q=.14;q<.25;q+=.003){const frame=motion.elementFrame(element,raw(q),'16:9',glyphs);
      if(frame.physics.phase!=='carry')continue;
      const word=layout.words[frame.physics.word],offset=displacement(frame.glyphStyles[word.glyphs[0].index].transform);
      const actual=motion.elementPoint(element,word.x+offset.x,word.t+offset.y,motion.stageSize());
      near(actual.x,frame.actor.tool!.tip.x);near(actual.y,frame.actor.tool!.tip.y);
    }
  }
});

void test('le volume affiché ne grandit que pendant la compression du piston',()=>{
  const {element,glyphs}=fixture('inflate');element.animationScope='block';
  const scale=(q:number)=>Number(/scale\(([^,)]+)/.exec(motion.elementFrame(element,raw(.2+.64*q),'16:9',glyphs).visual.transform)![1]);
  near(scale(.2),scale(.3),'return stroke holds volume');
  for(let q=.001;q<.999;q+=.001){const a=motion.elementFrame(element,raw(.2+.64*(q-.001)),'16:9',glyphs),b=motion.elementFrame(element,raw(.2+.64*q),'16:9',glyphs);
    if(b.physics.handle<a.physics.handle-1e-7)near(scale(q),scale(q-.001),'no air on upstroke');
    assert.ok(scale(q)>=scale(q-.001)-1e-7);
  }
});

void test('ponctuation et espacement conservent les vrais mots et lignes',()=>{
  for(const rotation of [0,30,90]){
    const {element}=fixture('reveal',rotation);element.text='A.a\n\nAB';
    const glyphs=[[0,40,40,20,40],[1,57,56,6,8],[2,75,44,18,32],[5,40,150,20,40],[6,110,150,20,40]].map(([index,x,y,width,height])=>({
      ...motion.elementPoint(element,x,y,motion.stageSize()),index,width,height,text:element.text[index],angle:rotation,boxHeight:52,
      slotX:motion.elementPoint(element,x,index<3?40:150,motion.stageSize()).x,
      slotY:motion.elementPoint(element,x,index<3?40:150,motion.stageSize()).y,
    }));
    const layout=motion.textLayout(element,glyphs);
    assert.equal(layout.rows.length,2);
    assert.deepEqual(layout.words.map(word=>word.glyphs.map((g:{text:string})=>g.text).join('')),['A.a','AB']);
  }
});

void test('les glyphes entièrement cachés ne laissent aucun pixel et les italiques gardent leur débordement',()=>{
  const {element,glyphs}=fixture('reveal');
  for(const animation of ['reveal','ribbon','exit'] as ElementAnimation[]){
    const start=motion.elementFrame({...element,animation},raw(0),'16:9',glyphs);
    const end=motion.elementFrame({...element,animation},raw(1),'16:9',glyphs);
    for(const glyph of glyphs)assert.equal((animation==='exit'?end:start).glyphStyles[glyph.index].visibility,'hidden');
  }
  element.animation='type';element.text='f';
  const glyph={...glyphs[0],index:0,text:'f',width:28,boxWidth:20,inkLeft:-2};
  const frame=motion.elementFrame(element,.65,'16:9',[glyph]);
  const insets=[...frame.glyphStyles[0].clipPath.matchAll(/([-\d.]+)%/g)].map(m=>Number(m[1]));
  assert.ok(insets[3]<0,'left italic overhang stays available');
  assert.ok(insets[1]<0,'the moving front can extend beyond the advance width');
});

void test('la pompe se connecte au bord proche sans traverser le texte',()=>{
  const {element,glyphs}=fixture('inflate');element.animationScope='text';
  const frame=motion.scopedElementFrame(element,raw(.2+.64*.5),'16:9',glyphs);
  const hose=frame.props.find(prop=>prop.kind==='hose')!;
  const bounds=motion.textLayout(element,glyphs).bounds;
  const center=motion.elementPoint(element,bounds.x,bounds.y,motion.stageSize());
  const scale=Number(/scale\(([^,)]+)/.exec(frame.glyphStyles[0].transform)![1]);
  assert.ok(hose.from!.x>hose.to!.x);
  near(hose.to!.x,center.x+bounds.w/2*scale,'valve on the transformed right edge');
});

void test('les dominos injoignables exigent une nouvelle poussée, et les gestes ne sautent pas entre mots',()=>{
  const chain=motion.dominoChain([{index:0,lx:0,ly:0,width:20,height:30},{index:1,lx:60,ly:0,width:20,height:30}]);
  assert.equal(chain.items[1].trigger,'buddy');assert.equal(chain.items[0].contactAngle,null);
  for(const animation of ['domino','stamp','magnet','bounce','type'] as ElementAnimation[])for(const rotation of [0,30,-45,90]){
    const {element,glyphs}=fixture(animation,rotation);
    for(let q=.001;q<.999;q+=.0005){const a=motion.elementFrame(element,raw(q-1e-7),'16:9',glyphs).actor,b=motion.elementFrame(element,raw(q+1e-7),'16:9',glyphs).actor;
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.1,`${animation} pose jump at ${q}`);
    }
  }
});

void test('les transitions saisissent les vrais bords et la barre mobile du clap',()=>{
  for(const aspect of ['16:9','4:3'])for(let q=.02;q<1;q+=.017){
    const {width:W,height:H}=motion.stageSize(aspect);
    for(const direction of [-1,1]){
      const frame=motion.transitionFrame('push',raw(q),aspect,direction),effect=frame.effect;
      near(frame.actor.contact.x,direction===1?W*(1-effect):W*effect,'real common border');
    }
    const lift=motion.transitionFrame('lift',raw(q),aspect);near(lift.actor.contact.y,H*(1-lift.effect),'real lower border');
    const drop=motion.transitionFrame('drop',raw(q),aspect);
    const bottom=H*(1+Number(/translateY\(([^%]+)%/.exec(drop.incoming.transform!)![1])/100);
    const top=Math.min(...corners(drop.actor).map(p=>p.y));
    if(drop.physics.contact)near(bottom,top,'drop lands on body');else{assert.ok(bottom<=top+1e-6);near(drop.physics.force,0);}
    const zip=motion.transitionFrame('zip',raw(q),aspect),tip=zip.actor.tool!.tip;
    near(tip.x/W,tip.y/H,'cursor follows the fixed diagonal');near(tip.x/W,zip.effect,'cursor at open material apex');
    const clap=motion.transitionFrame('cut',raw(q),aspect),prop=clap.props.find(p=>p.kind==='clap')!;
    const angle=-(1-prop.closure!)*.55,p=rotate(82,-15,angle*180/Math.PI);
    near(clap.actor.contact.x,prop.x!-52+p.x);near(clap.actor.contact.y,prop.y!-20+p.y);
    assert.equal(clap.incoming.opacity,prop.closure!>=1?1:0);
  }
});

void test('chaque nouvel accessoire émet un dessin réel dans le renderer partagé',()=>{
  const {element,glyphs}=fixture('inflate');
  const frames=[...Object.keys(transitionLabels).map(k=>motion.transitionFrame(k,.53)),
    ...Object.keys(animationLabels).filter(k=>k!=='none').map(animation=>motion.elementFrame({...element,animation},.53,'16:9',glyphs))];
  const commands:string[]=[];
  const ctx=new Proxy({}, {get:(_,name)=>name==='createRadialGradient'?()=>({addColorStop(){}}):(..._args:unknown[])=>{commands.push(String(name));},set:()=>true});
  const canvas={clientWidth:1200,width:1200,height:675,getContext:()=>ctx};
  for(const frame of frames)for(const prop of frame.props){commands.length=0;motion.drawMotion(canvas,[{...frame,props:[prop],actor:{...frame.actor,alpha:0}}]);
    assert.ok(commands.some(c=>['lineTo','arc','roundRect','bezierCurveTo'].includes(c)),`${prop.kind} has no visible geometry`);
  }
});

void test('le lecteur exporté applique les mêmes contacts au DOM, même après skip et retour',()=>{
  const {element,glyphs}=fixture('inflate');element.animationTrigger='after';element.animationDuration=1000;
  const slide={...makeSlide(),transitionDuration:0,elements:[element]};
  const dom=new JSDOM(`<main id="stage"><section class="offline-scene"><div data-element-id="${element.id}">${glyphs.map(g=>`<span data-char-index="${g.index}"><span data-glyph-ink>${g.text}</span></span>`).join('')}</div></section><canvas id="buddy-motion"></canvas></main><span id="counter"></span><button id="next"></button><button id="prev"></button><button id="full"></button><div id="blackout"></div><script id="deck-data">${JSON.stringify({slides:[slide],groups:[animationGroups(slide)],aspectRatio:'16:9'})}</script>`);
  const env=dom.window;let tick:((t:number)=>void)|null=null,applied=0;
  Object.assign(env,{CSS:{escape:(s:string)=>s},ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),requestAnimationFrame:(fn:(t:number)=>void)=>{tick=fn;return 1;},cancelAnimationFrame:()=>{tick=null;}});
  Object.defineProperty(env.performance,'now',{value:()=>0});
  startOfflinePresentation({...motion,readGlyphs:()=>glyphs,drawMotion:()=>{},applyElementFrame:(node:HTMLElement,frame:ReturnType<typeof motion.elementFrame>)=>{applied++;motion.applyElementFrame(node,frame);}},env);
  const target=env.document.querySelector('[data-element-id]') as HTMLElement;
  let last='';
  for(const q of [.2,.3]){(tick as unknown as (t:number)=>void)(raw(q)*1000);if(last)assert.equal(target.style.transform,last);last=target.style.transform;}
  assert.ok(applied>=3,'the DOM must consume contact frames');
  env.document.getElementById('next')!.click();assert.equal(target.style.transform,`rotate(${element.rotation}deg)`);assert.equal(target.dataset.motionRunning,'false');
  dom.window.close();
});
