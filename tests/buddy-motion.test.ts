import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as motion from '../lib/buddy-motion.js';
import { startOfflinePresentation } from '../lib/offline-playback.js';
import { makeElement, makeSlide, initialDeck, migrateDeck, transitionLabels, animationLabels, type Transition, type ElementAnimation } from '../lib/studio.ts';
import { animationGroups } from '../lib/playback.ts';

const transitions = Object.keys(transitionLabels) as Transition[];
const actions = (Object.keys(animationLabels) as ElementAnimation[]).filter(kind => kind !== 'none');
const samples = [0,0.05,0.2399,0.24,0.2401,0.35,0.5,0.7,0.8199,0.82,0.8201,0.95,1];

function assertFinite(value: unknown) {
  if (typeof value === 'number') assert(Number.isFinite(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFinite);
}
function bodyContact(actor: ReturnType<typeof motion.transitionFrame>['actor']) {
  const radians = actor.angle * Math.PI / 180;
  const x = actor.anchor.x * actor.sx, y = actor.anchor.y * actor.sy;
  return {x:actor.x+x*Math.cos(radians)-y*Math.sin(radians),y:actor.y+x*Math.sin(radians)+y*Math.cos(radians)};
}

void test('les 24 actions partagent des phases finies et un état final exact', () => {
  for (const aspect of ['16:9','4:3']) {
    for (const action of transitions) for (const direction of [-1,1]) {
      for (const p of samples) assertFinite(motion.transitionFrame(action,p,aspect,direction));
      const final = motion.transitionFrame(action,1,aspect,direction);
      assert.deepEqual(final.incoming,{}); assert.equal(final.actor.alpha,0);
    }
    for (const action of actions) for (const rotation of [-30,0,45,90]) {
      const element={...makeElement('text'),animation:action,rotation,x:0,y:98,w:.25,h:.25};
      for (const p of samples) assertFinite(motion.elementFrame(element,p,aspect));
      assert.equal(motion.elementFrame(element,1,aspect).actor.alpha,0);
    }
  }
});

void test('l’effet attend le contact, et le clap coupe exactement à sa fermeture', () => {
  for (const kind of transitions) {
    assert.deepEqual(motion.transitionFrame(kind,.05).incoming,motion.transitionFrame(kind,.239).incoming);
    assert.equal(motion.transitionFrame(kind,.239).effect,0);
  }
  assert.equal(motion.transitionFrame('cut',.24+.58*.3199).incoming.opacity,0);
  assert.equal(motion.transitionFrame('cut',.24+.58*.32).incoming.opacity,1);
  for(const action of actions) {
    const element={...makeElement('text'),animation:action};
    assert.equal(motion.elementFrame(element,.239).effect,0);
  }
});

void test('le corps et les outils restent attachés pendant l’effort, sans clamp indépendant', () => {
  for(const kind of ['push','lift','zoom'] as const) for(const p of [.24,.4,.6,.82]) {
    const frame=motion.transitionFrame(kind,p);
    const actual=bodyContact(frame.actor);
    assert(Math.hypot(actual.x-frame.actor.contact.x,actual.y-frame.actor.contact.y)<1e-8);
  }
  for(const animation of actions) for(const rotation of [0,45,90]) for(const x of [0,95]) {
    const element={...makeElement('text'),animation,rotation,x,y:90};
    const frame=motion.elementFrame(element,.52,'4:3');
    const actual=bodyContact(frame.actor);
    assert(Math.hypot(actual.x-frame.actor.contact.x,actual.y-frame.actor.contact.y)<1e-8);
    if(frame.actor.tool) assert.deepEqual(frame.actor.tool.grip,frame.actor.contact);
  }
});

void test('les phases de préparation et de relâchement ne font pas sauter les poses', () => {
  for(const kind of transitions) for(const at of [.24,.82]) {
    const before=motion.transitionFrame(kind,at-1e-7).actor;
    const after=motion.transitionFrame(kind,at+1e-7).actor;
    for(const key of ['x','y','angle','sx','sy'] as const) assert(Math.abs(before[key]-after[key])<.01,`${kind} ${at} ${key}`);
  }
  for (let p=.241;p<.819;p+=.001) {
    const a=motion.transitionFrame('wipe',p).actor;
    const b=motion.transitionFrame('wipe',p+.000001).actor;
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.1);
  }
  const clap=motion.transitionFrame('cut',.4);
  const prop=clap.props.find(p=>p.kind==='clap')!;
  const angle=-(1-prop.closure!)*.55;
  assert(Math.abs(clap.actor.contact.x-(prop.x!-52+82*Math.cos(angle)+15*Math.sin(angle)))<1e-8);
  assert(Math.abs(clap.actor.contact.y-(prop.y!-20+82*Math.sin(angle)-15*Math.cos(angle)))<1e-8);
});

void test('écriture progressive, retours à la ligne, espaces et Unicode conservent leurs indices', () => {
  const glyphs=[{index:0,x:20,y:20,width:10,height:20,angle:0},{index:1,x:30,y:20,width:10,height:20,angle:0},{index:3,x:20,y:60,width:10,height:20,angle:0}];
  assert.equal(motion.characterStyle(0,4,0).visibility,'hidden');
  assert.equal(motion.characterProgress(0,4,.5/4),(.5-.16)/.72);
  assert.equal(motion.characterProgress(3,4,.74),0);
  assert.equal(motion.characterProgress(3,4,1),1);
  const current=motion.caretPoint(glyphs,4,.5/4)!;
  assert.equal(current.x,15+10*((.5-.16)/.72));
  const lift=motion.caretPoint(glyphs,4,2.5/4)!;
  assert(lift.x>=15&&lift.x<=35);assert(lift.y<60);
  assert.equal(motion.caretPoint([],0,.5),null);
  for (const boundary of [.88,1,1.16,1.88,3,3.16]) {
    const a=motion.caretPoint(glyphs,4,(boundary-1e-7)/4)!;
    const b=motion.caretPoint(glyphs,4,(boundary+1e-7)/4)!;
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.01);
  }
  const text={...makeElement('text'),text:'A😀\n B',animation:'type' as const};
  assert.equal(Array.from(text.text).length,5);
  assertFinite(motion.elementFrame(text,.5,'16:9',glyphs));
});

void test('le source intégré dans le HTML calcule exactement les mêmes frames que le studio', async () => {
  const source=await readFile(new URL('../lib/buddy-motion.js',import.meta.url),'utf8');
  const portable=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`) as typeof motion;
  for(const action of transitions) for(const p of samples) assert.deepEqual(portable.transitionFrame(action,p,'4:3',-1),motion.transitionFrame(action,p,'4:3',-1));
  for(const action of actions) for(const p of samples) {
    const element={...makeElement('text'),animation:action,rotation:35};
    assert.deepEqual(portable.elementFrame(element,p),motion.elementFrame(element,p));
  }
});

void test('le lecteur autonome termine, rejoue, revient en arrière et conserve les cues simultanés', () => {
  const slide=makeSlide();
  const text={...makeElement('text'),id:'writing',animation:'type' as const,animationTrigger:'after' as const,animationDuration:1000,animationOrder:0,text:'AB\nCD'};
  const emphasis={...makeElement('text'),id:'underline',animation:'emphasis' as const,animationTrigger:'with' as const,animationDuration:1000,animationOrder:1};
  slide.elements=[text,emphasis];slide.transition='push';slide.transitionDuration=1000;slide.autoAdvance=0;
  const second={...slide,id:'second',elements:[]};
  const data={slides:[slide,second],groups:[animationGroups(slide),[[]]],aspectRatio:'16:9'};
  const html=`<main id="stage"><section class="offline-scene"><div data-element-id="writing">${[0,1,3,4].map(i=>`<span data-char-index="${i}">X</span>`).join('')}</div><div data-element-id="underline"></div></section><section class="offline-scene"></section><canvas id="buddy-motion"></canvas></main><span id="counter"></span><button id="next"></button><button id="prev"></button><button id="full"></button><div id="blackout" hidden></div><script id="deck-data" type="application/json">${JSON.stringify(data)}</script>`;
  const dom=new JSDOM(html);const env=dom.window;
  let callback: ((time:number)=>void)|undefined;
  let frames: ReturnType<typeof motion.elementFrame>[]=[];
  Object.assign(env,{CSS:{escape:(v:string)=>v},ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),requestAnimationFrame:(fn:(time:number)=>void)=>{callback=fn;return 1;},cancelAnimationFrame:()=>{callback=undefined;}});
  Object.defineProperty(env.performance,'now',{value:()=>0});
  const runner={...motion,drawMotion:(_canvas: unknown, next: typeof frames)=>{frames=next;}};
  startOfflinePresentation(runner,env);
  callback?.(1500);
  assert.equal(frames.length,2);
  assert(frames.every(frame=>frame.actor.alpha>0));
  (env.document.getElementById('next') as HTMLButtonElement).click();
  assert(frames.every(frame=>frame.actor.alpha===0));
  assert.equal(env.document.querySelector('[data-char-index="4"]')?.getAttribute('style')?.includes('visibility: visible'),true);
  (env.document.getElementById('next') as HTMLButtonElement).click();
  assert.equal(env.document.getElementById('counter')?.textContent,'2 / 2');
  (env.document.getElementById('prev') as HTMLButtonElement).click();
  assert.equal(env.document.getElementById('counter')?.textContent,'1 / 2');
  assert(frames.every(frame=>frame.actor.alpha===0));
  dom.window.close();
});

void test('le catalogue propose 12 transitions et 26 gestes, dont 15 mises en évidence, sérialisables', () => {
  assert.equal(transitions.length,12);assert.equal(actions.length,26);
  for(const transition of transitions) for(const animation of actions) {
    const deck={...initialDeck,slides:[{...makeSlide(),transition,elements:[{...makeElement('text'),animation}]}]};
    const restored=migrateDeck(JSON.parse(JSON.stringify(deck)));
    assert(restored);assert.equal(restored.slides[0].transition,transition);
    assert.equal(restored.slides[0].elements[0].animation,animation);
    assert.equal(restored.schemaVersion,2);
  }
});

void test('les effets par lettre préservent les graphèmes, leur disposition et leur état final', () => {
  assert.deepEqual(motion.graphemes('AB\r\nCD'),['A','B','\n','C','D']);
  assert.deepEqual(motion.graphemes('e\u0301 👨‍👩‍👧‍👦\n👍🏽'),['e\u0301',' ','👨‍👩‍👧‍👦','\n','👍🏽']);
  for(const kind of actions.filter(motion.isLetterAnimation)) {
    for(const index of [0,1,19]) for(const p of samples) assertFinite(motion.characterStyle(index,20,p,kind));
    assert.equal(motion.characterStyle(0,20,0,kind).visibility,'hidden');
    const final=motion.characterStyle(19,20,1,kind);
    assert.equal(final.visibility,'visible');assert.equal(final.clipPath,'none');
    if('opacity' in final) assert.equal(final.opacity,1);
  }
  const signatures=actions.map(animation=>JSON.stringify([motion.elementVisual({...makeElement('text'),animation},.37),motion.characterStyle(3,12,.37,animation)]));
  assert.equal(new Set(signatures).size,12,'Each effect must have a different visible treatment');
});

void test('les nouvelles prises suivent les surfaces et les courbes restent sans saut', () => {
  for(const p of [.24,.4,.62,.82]) {
    const zip=motion.transitionFrame('zip',p);
    assert(Math.abs(zip.actor.tool!.tip.x/1200+zip.actor.tool!.tip.y/675-2*zip.effect)<1e-10);
    const pull=motion.transitionFrame('pull',p);
    assert.equal(pull.actor.tool!.tip.x,(1-pull.effect)*1200);
    const curtain=motion.transitionFrame('curtain',p);
    assert.equal(curtain.actor.tool!.tip.x,(.5+curtain.effect*.5)*1200);
    for(const animation of actions) {
      const element={...makeElement('text'),animation,rotation:35};
      const a=motion.elementFrame(element,p-1e-7).actor,b=motion.elementFrame(element,p+1e-7).actor;
      assert(Math.hypot(a.x-b.x,a.y-b.y)<.01,animation+' pose continuity');
    }
  }
  for(const kind of transitions) {
    for(let p=.245;p<.82;p+=.006) {
      const a=motion.transitionFrame(kind,p).actor,b=motion.transitionFrame(kind,p+.000001).actor;
      assert(Math.hypot(a.x-b.x,a.y-b.y)<.1,kind+' continuous trajectory');
    }
  }
});
