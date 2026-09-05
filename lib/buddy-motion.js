/**
 * Deterministic choreography shared by the studio and its standalone export.
 * No imports: the exact ESM source is embedded into exported presentations.
 * Coordinates use a 1200-unit stage; both axes share the same physical scale.
 */
export const BUDDY_WIDTH = 84;
export const BUDDY_HEIGHT = 54;

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
export function smooth(value) {
  const p = clamp(value);
  return p * p * p * (p * (p * 6 - 15) + 10);
}
/** One small overshoot, with zero speed at both ends. */
export function settle(value) {
  const p = clamp(value);
  return smooth(p) + 0.32 * Math.sin(Math.PI * p) ** 3;
}
const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const segmentedText = new Map();
/** @param {string} text @returns {string} */
export function normalizeText(text) { return text.replace(/\r\n?/g, '\n'); }
export function graphemes(text) {
  text = normalizeText(text);
  if (!segmentedText.has(text)) {
    if (segmentedText.size >= 64) segmentedText.delete(segmentedText.keys().next().value);
    segmentedText.set(text, Array.from(segmenter.segment(text), part => part.segment));
  }
  return /** @type {string[]} */ (segmentedText.get(text));
}
export function isLetterAnimation(kind) {
  return ['type', 'bounce', 'magnet', 'spotlight', 'domino'].includes(kind);
}
export function needsGlyphLayout(element) {
  return element.animation !== 'none' && (element.kind === 'text' || element.kind === 'code');
}
/** Static SSR/editor fallback. Animated material is exclusively applied from elementFrame. */
export function initialElementVisual(element, progress) {
  const mode=motionMode(element);
  const block=element.animationScope==='block'||!['text','code'].includes(element.kind);
  const hidden = block&&element.animation!=='none'&&(mode === 'exit' ? progress >= 1 : mode==='entrance' && progress <= 0);
  return { opacity: hidden ? 0 : element.opacity, transform: `rotate(${element.rotation}deg)` };
}
export function choreography(value) {
  const p = clamp(value);
  const contact = smooth(p / 0.24);
  const action = clamp((p - 0.24) / 0.58);
  const release = smooth((p - 0.82) / 0.18);
  return {
    p, contact, action, effect: smooth(action), release,
    effort: Math.sin(smooth(action) * Math.PI) * (1 - release),
    phase: p < 0.24 ? 'prepare' : p < 0.82 ? 'act' : 'release',
  };
}
export function stageSize(aspect = '16:9') {
  return { width: 1200, height: aspect === '4:3' ? 900 : 675 };
}
function rotate(x, y, degrees) {
  const a = degrees * Math.PI / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}
export function elementPoint(element, x, y, size) {
  const w = element.w * size.width / 100;
  const h = element.h * size.height / 100;
  const offset = rotate(x - w / 2, y - h / 2, element.rotation);
  return { x: (element.x + element.w / 2) * size.width / 100 + offset.x,
    y: (element.y + element.h / 2) * size.height / 100 + offset.y };
}

/** @typedef {{kind:string,tip:{x:number,y:number},grip:{x:number,y:number},angle:number,rotation:number,normal?:{x:number,y:number},extent?:number,depth?:number}} BuddyTool */
function actorBase(c) {
  return { x: 0, y: 0, angle: 0, sx: 1, sy: 1, alpha: c.p >= 1 ? 0 : smooth(c.p / 0.07) * (1 - smooth((c.p - 0.96) / 0.04)),
    face: c.phase === 'prepare' ? 'o.O' : c.phase === 'release' ? '^.^' : '>_<',
    tool: /** @type {BuddyTool|null} */ (null), contact: { x: 0, y: 0 }, anchor: { x: 0, y: 0 },
    action: '', phase: c.phase };
}
function attachBody(actor, contact, anchor) {
  const offset = rotate(anchor.x * actor.sx, anchor.y * actor.sy, actor.angle);
  actor.x = contact.x - offset.x;
  actor.y = contact.y - offset.y;
  actor.contact = contact;
  actor.anchor = anchor;
  return actor;
}
/** @param {string} kind */
export function transitionFrame(kind, value, aspect = '16:9', direction = 1, hasOutgoing = true) {
  const size=stageSize(aspect),c=choreography(value),q=c.effect,u=c.action;
  const W=size.width,H=size.height;
  /** @type {{transform?:string,clipPath?:string,opacity?:number,transformOrigin?:string,zIndex?:number,maskImage?:string}} */
  let incoming={};
  /** @type {{transform?:string,clipPath?:string,opacity?:number,transformOrigin?:string,zIndex?:number,maskImage?:string}} */
  let outgoing={};
  let actor=actorBase(c);const props=[];
  const physics={kind,contact:c.phase==='act',materialPoint:{x:0,y:0},normal:{x:0,y:0},front:0,force:0};
  const gap=28*(1-c.contact)+18*c.release;
  const press=(point,normal,force=c.effort)=>{
    actor=surfaceActor(c,point,normal,force,gap);
    Object.assign(physics,{materialPoint:point,normal,force});
  };
  const grasp=(point,normal,tool,extent=28,force=c.effort*.5)=>{
    actor=mountedTool(c,{x:point.x+normal.x*gap,y:point.y+normal.y*gap},normal,tool,extent,force);
    Object.assign(physics,{materialPoint:point,normal,force});
  };
  if(kind==='push'){
    const edge=(direction===1?1-q:q)*W;
    incoming={transform:`translateX(${direction*(1-q)*100}%)`};
    outgoing={transform:`translateX(${-direction*q*100}%)`};
    press({x:edge,y:H*.62},{x:direction,y:0});
    props.push({kind:'edge',from:{x:edge,y:0},to:{x:edge,y:H},opacity:1-c.release});
    physics.front=edge;actor.action='pousse le bord de la slide';
  }else if(kind==='lift'){
    const bottom=(1-q)*H;
    incoming={transform:`translateY(${(1-q)*100}%)`};
    outgoing={transform:`translateY(${-q*100}%)`};
    press({x:W*.5,y:bottom},{x:0,y:1});
    props.push({kind:'tray',from:{x:W*.5-46,y:bottom},to:{x:W*.5+46,y:bottom},opacity:1-c.release});
    physics.front=bottom;actor.action='soulève la slide par-dessous';
  }else if(kind==='wipe'){
    const front=q*W;
    incoming={clipPath:`inset(0 ${(1-q)*100}% 0 0)`};
    grasp({x:front,y:H/2},{x:1,y:0},'roller',H);
    physics.front=front;actor.action='tire le rouleau sur la slide';
  }else if(kind==='pull'){
    const edge=(1-q)*W;
    incoming={transform:`translateX(${(1-q)*100}%)`};
    grasp({x:edge,y:H*.54},{x:-1,y:0},'suction');
    props.push({kind:'edge',from:{x:edge,y:0},to:{x:edge,y:H},opacity:1-c.release});
    physics.front=edge;actor.action='tire la slide avec sa ventouse';
  }else if(kind==='curtain'){
    const left=W*(1-q)/2,right=W*(1+q)/2;
    incoming={clipPath:`inset(0 ${(1-q)*50}% 0 ${(1-q)*50}%)`};
    grasp({x:right,y:H*.68},{x:1,y:0},'hook');
    props.push({kind:'edge',from:{x:left,y:0},to:{x:left,y:H},opacity:1-c.release},
      {kind:'edge',from:{x:right,y:0},to:{x:right,y:H},opacity:1-c.release},
      {kind:'curtain-belt',width:W,left,right,travel:q*W/2,opacity:1-c.release});
    physics.front=right;actor.action='ouvre les rideaux reliés par la courroie';
  }else if(kind==='zoom'){
    const diagonal=Math.hypot(W,H),radius=diagonal*q/2;
    incoming={clipPath:`circle(${radius/W*100}cqw at 50% 50%)`};
    grasp({x:W/2+W*q/2,y:H/2+H*q/2},{x:W/diagonal,y:H/diagonal},'hook');
    props.push({kind:'iris',x:W/2,y:H/2,radius,opacity:1-c.release});
    physics.front=radius;actor.action='tire le cadre circulaire';
  }else if(kind==='dissolve'){
    actor.x=W*.16;actor.y=H*.66;
    actor.sx=1+.14*Math.sin(c.contact*Math.PI)-.12*c.effort;
    actor.sy=1-.1*Math.sin(c.contact*Math.PI)+.08*c.effort;
    actor.angle=-5*c.effort;actor.face=c.phase==='act'?'>o<':'^.^';
    const mouth={x:actor.x,y:actor.y},soft=100;
    const radius=(Math.hypot(W-mouth.x,Math.max(mouth.y,H-mouth.y))+soft)*q;
    incoming={maskImage:`radial-gradient(circle at ${mouth.x/W*100}% ${mouth.y/H*100}%, #000 ${Math.max(0,radius-soft)/W*100}cqw, transparent ${radius/W*100}cqw)`};
    props.push({kind:'breath-field',x:mouth.x,y:mouth.y,radius,soft,opacity:(c.phase==='act'?1:0)*(1-c.release)});
    physics.materialPoint=mouth;physics.front=radius;actor.action='souffle un nuage qui révèle la slide';
  }else if(kind==='turn'){
    const angle=(hasOutgoing?q:1-q)*Math.PI/2;
    const depth=1+W*Math.sin(angle)/1800,x=W*Math.cos(angle)/depth;
    const top=H/2-H/(2*depth),bottom=H/2+H/(2*depth);
    outgoing={transform:`perspective(150cqw) rotateY(${q*90}deg)`,transformOrigin:'0% 50%',zIndex:3};
    incoming=hasOutgoing?{zIndex:1}:{zIndex:2,transform:`perspective(150cqw) rotateY(${(1-q)*90}deg)`,transformOrigin:'0% 50%'};
    grasp({x,y:H/2+H*.14/depth},{x:hasOutgoing?-1:1,y:0},'hook');
    props.push({kind:'edge',from:{x,y:top},to:{x,y:bottom},opacity:1-c.release});
    physics.front=x;actor.action='tourne le bord de la page';
  }else if(kind==='drop'){
    const catchY=H-86;
    let bottom,force=0;
    if(u<.5)bottom=catchY*(u/.5)**2;
    else if(u<.62){force=Math.sin((u-.5)/.12*Math.PI);bottom=catchY+8.1*force;}
    else{const carry=smooth((u-.62)/.38);bottom=catchY+(H-catchY)*carry;force=.2*Math.sin(carry*Math.PI);}
    incoming={transform:`translateY(${(bottom/H-1)*100}%)`};
    press({x:W*.5,y:u<.5?catchY:bottom},{x:0,y:1},force);
    if(u<.5)actor.face='o.O';
    physics.contact=c.phase==='act'&&u>=.5;physics.materialPoint={x:W*.5,y:bottom};physics.front=bottom;
    props.push({kind:'tray',from:{x:W*.5-46,y:u<.5?catchY:bottom},to:{x:W*.5+46,y:u<.5?catchY:bottom},opacity:1-c.release});
    actor.action=u<.5?'attend la slide':'amortit puis dépose la slide';
  }else if(kind==='roll'){
    const front=H*(1-q),radius=14;
    incoming={clipPath:`inset(${(1-q)*100}% 0 0 0)`};
    outgoing={clipPath:`inset(0 0 ${q*100}% 0)`};
    grasp({x:W*.68,y:front},{x:0,y:-1},'spool-handle');
    props.push({kind:'paper-roll',from:{x:0,y:front},to:{x:W,y:front},radius,angle:(H-front)/radius,opacity:1-c.release});
    physics.front=front;actor.action='enroule la slide sur la bobine';
  }else if(kind==='zip'){
    const point={x:q*W,y:q*H},diagonal=Math.hypot(W,H);
    incoming={clipPath:`inset(0 ${(1-q)*100}% ${(1-q)*100}% 0)`};
    grasp(point,{x:W/diagonal,y:H/diagonal},'zipper');
    props.push({kind:'zip-seam',from:point,to:{x:W,y:H},left:{x:0,y:point.y},right:{x:point.x,y:0},opacity:1-c.release});
    physics.front=q;actor.action='tire le curseur de la fermeture éclair';
  }else if(kind==='cut'){
    const closure=smooth(u/.32),angle=-(1-closure)*.55;
    const center={x:W*.5,y:H*.68},pivot={x:center.x-52,y:center.y-20};
    const offset=rotate(82,-15,angle*180/Math.PI),normal=rotate(0,-1,angle*180/Math.PI);
    incoming={opacity:closure>=1?1:0};outgoing={opacity:closure>=1?0:1};
    press({x:pivot.x+offset.x,y:pivot.y+offset.y},normal,.7*Math.sin(clamp((u-.25)/.2)*Math.PI));
    props.push({kind:'clap',x:center.x,y:center.y,closure,opacity:1-c.release});
    physics.front=closure;actor.action='abaisse le clap';
  }else throw new Error(`Unknown Buddy transition: ${kind}`);
  if(c.p>=1){incoming={};outgoing={opacity:0};physics.contact=false;}
  return {incoming,outgoing,actor,props,effect:q,phase:c.phase,size,physics};
}

/** Character progress includes a short pen lift between consecutive glyphs. */
export function characterProgress(index, total, effect) {
  if (effect >= 1) return 1;
  return clamp((effect * total - index - 0.16) / 0.72);
}
export function characterStyle(index, total, effect, kind = 'type') {
  if (kind !== 'type') {
    const u=clamp(effect*1.72-index/Math.max(1,total-1)*.72);
    const eased=smooth(u), tail=1-eased;
    const result={visibility:u<=0?'hidden':'visible',clipPath:'none',opacity:smooth(u/.2),
      transform:'none',transformOrigin:'50% 100%',filter:'none'};
    if(kind==='bounce') {
      const hop=Math.sin(u*Math.PI)**2*(1-u)*1.6;
      result.transform=`translateY(${-hop}em) scale(${1+.1*hop},${1-.12*hop})`;
    } else if(kind==='magnet') {
      const side=index%2 ? -1 : 1;
      result.transform=`translate(${side*tail*1.3}em,${-tail*(.8+(index%3)*.22)}em) rotate(${side*tail*24}deg) scale(${1-.25*tail})`;
      result.opacity=smooth(u/.45);
    } else if(kind==='spotlight') {
      result.filter=`blur(${tail*.16}em)`;
      result.opacity=eased;
      result.transform=`translateY(${tail*.08}em)`;
    } else if(kind==='domino') {
      result.transform=`perspective(500px) rotateX(${tail*-85}deg) rotate(${tail*-14}deg)`;
      result.opacity=smooth(u/.25);
    }
    return result;
  }
  const p = characterProgress(index, total, effect);
  return { visibility: p <= 0 ? 'hidden' : 'visible', clipPath: p >= 1 ? 'none' : `inset(0 ${(1 - p) * 100}% 0 0)` };
}

/** @param {any} element */
export function elementVisual(element, effect) {
  const q = clamp(effect);
  const result = { opacity: element.opacity, transform: `rotate(${element.rotation}deg)`, clipPath: 'none' };
  if (element.animation === 'reveal' || (isLetterAnimation(element.animation) && !['text','code'].includes(element.kind))) result.clipPath = `inset(0 ${(1 - q) * 100}% 0 0)`;
  if (element.animation === 'exit') result.clipPath = `inset(0 ${q * 100}% 0 0)`;
  if (element.animation === 'rise') {
    result.opacity = element.opacity * smooth(q / 0.08);
    result.transform = `translateY(${(1 - q) * 800 / element.h}%) rotate(${element.rotation}deg)`;
  }
  if (element.animation === 'stamp') {
    const impact=smooth(q/.16);
    const squash=Math.sin(clamp(q/.45)*Math.PI)*.12;
    result.opacity=element.opacity*impact;
    result.transform=`rotate(${element.rotation}deg) scale(${1+squash*.55},${1-squash})`;
  }
  if (element.animation === 'ribbon') {
    result.opacity=element.opacity*smooth(q/.08);
    result.transform=`rotate(${element.rotation}deg) scaleY(${q})`;
  }
  if (element.animation === 'inflate') {
    const scale=.45+.55*settle(q);
    result.opacity=element.opacity*smooth(q/.12);
    result.transform=`rotate(${element.rotation}deg) scale(${scale})`;
  }
  return result;
}

/** @param {any[]} glyphs */
export function caretPoint(glyphs, total, effect) {
  if (!glyphs.length) return null;
  const cursor = effect * total;
  for (let i = 0; i < glyphs.length - 1; i++) {
    const previous = glyphs[i], next = glyphs[i + 1];
    const begin = previous.index + 0.88, end = next.index + 0.16;
    if (cursor >= begin && cursor < end) {
      const t = smooth((cursor - begin) / (end - begin));
      const a = rotate(previous.width / 2, 0, previous.angle);
      const b = rotate(-next.width / 2, 0, next.angle);
      return { x: (previous.x + a.x) * (1 - t) + (next.x + b.x) * t,
        y: (previous.y + a.y) * (1 - t) + (next.y + b.y) * t - Math.sin(t * Math.PI) * 18 };
    }
  }
  let index = glyphs.findIndex(g => g.index + 0.88 >= cursor);
  if (index < 0) index = glyphs.length - 1;
  const glyph = glyphs[index];
  const fraction = characterProgress(glyph.index, total, effect);
  const offset = rotate((fraction - 0.5) * glyph.width, Math.sin(fraction * Math.PI * 2) * glyph.height * 0.23, glyph.angle);
  const point = { x: glyph.x + offset.x, y: glyph.y + offset.y };
  return point;
}

/** A surface normal points out of the material, toward Buddy. No hidden tip offsets. */
function surfaceActor(c, point, normal, force = 0, gap = 0, referenceNormal = normal) {
  const a=actorBase(c);
  const horizontal=Math.abs(referenceNormal.x)>=Math.abs(referenceNormal.y);
  const side=Math.sign(horizontal?referenceNormal.x:referenceNormal.y)||1;
  const axis=horizontal?(side<0?180:0):(side<0?-90:90);
  let base=Math.atan2(normal.y,normal.x)*180/Math.PI-axis;
  if(base>180)base-=360;if(base<-180)base+=360;
  a.angle=base-(horizontal?side*force*7:0);
  a.sx=1+force*(horizontal?-.15:.09);
  a.sy=1+force*(horizontal?.09:-.15);
  // Keep the same extremal corner throughout the gesture, including at zero
  // effort. A centre-ray anchor lets tilted corners penetrate the material.
  const anchor=horizontal?{x:-side*42,y:-27}:{x:0,y:-side*27};
  return attachBody(a,{x:point.x+normal.x*gap,y:point.y+normal.y*gap},anchor);
}
function mountedTool(c, point, normal, kind, extent = 26, force = 0, depth = 0) {
  const length=(kind==='pencil'?43:40)+depth;
  const grip={x:point.x+normal.x*length,y:point.y+normal.y*length};
  const a=surfaceActor(c,grip,normal,force);
  a.tool={kind,tip:point,grip,normal,extent,depth,angle:Math.atan2(-normal.y,-normal.x),rotation:0};
  return a;
}
function mixPoint(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function boxOf(glyphs){
  const l=Math.min(...glyphs.map(g=>g.lx-g.width/2)),r=Math.max(...glyphs.map(g=>g.lx+g.width/2));
  const t=Math.min(...glyphs.map(g=>g.ly-g.height/2)),b=Math.max(...glyphs.map(g=>g.ly+g.height/2));
  return {l,r,t,b,w:r-l,h:b-t,x:(l+r)/2,y:(t+b)/2,glyphs};
}
export function textLayout(element,glyphs,aspect='16:9'){
  const size=stageSize(aspect),w=element.w*size.width/100,h=element.h*size.height/100;
  const center=elementPoint(element,w/2,h/2,size),chars=graphemes(element.kind==='code'?element.code:element.text||'');
  const measured=glyphs.length?glyphs:[{index:0,x:center.x,y:center.y,width:w,height:h,text:'□'}];
  const local=measured.map(g=>{const point=rotate(g.x-center.x,g.y-center.y,-element.rotation),row=rotate((g.slotX??g.x)-center.x,(g.slotY??g.y)-center.y,-element.rotation);return {...g,lx:point.x+w/2,ly:point.y+h/2,rowY:row.y+h/2,text:g.text??chars[g.index]??'□'};});
  const ink=local.filter(g=>!/\s/u.test(g.text));
  const rows=[];const words=[];
  for(const g of ink){let row=rows.find(r=>Math.abs(r[0].rowY-g.rowY)<Math.min(r[0].boxHeight||r[0].height,g.boxHeight||g.height)*.3);if(!row){row=[];rows.push(row);}row.push(g);}
  for(const row of rows){let word=[];for(const g of row){const last=word.at(-1);if(last&&(g.index>last.index+1)){words.push(boxOf(word));word=[];}word.push(g);}if(word.length)words.push(boxOf(word));}
  return {glyphs:local,rows:rows.map(boxOf),words,bounds:boxOf(ink.length?ink:local),size};
}
const neutralInk=(glyph=null)=>({visibility:'visible',opacity:1,clipPath:'none',transform:'none',transformOrigin:glyph?.origin||'50% 100%',filter:'none',color:'inherit',textShadow:'none',backgroundImage:'none',backgroundClip:'border-box',webkitTextFillColor:'currentColor'});
function glyphPose(dx=0,dy=0,angle=0){return `translate(${dx/12}cqw,${dy/12}cqw) rotate(${angle}deg)`;}
function glyphClip(g,fraction,axis='x',erase=false){
  const bw=Math.max(.001,g.boxWidth||g.width),bh=Math.max(.001,g.boxHeight||g.height);
  const left=g.inkLeft||0,top=g.inkTop||0;
  // Keep italic overhangs and accents outside the advance box. Only the moving
  // front clips ink; the other three edges encompass its complete footprint.
  const edges=[Math.min(0,top-1)/bh*100,Math.min(0,bw-left-g.width-1)/bw*100,
    Math.min(0,bh-top-g.height-1)/bh*100,Math.min(0,left-1)/bw*100];
  const f=erase?1-fraction:fraction;
  if(axis==='x')edges[1]=(1-(left+g.width*f)/bw)*100;
  else edges[2]=(1-(top+g.height*f)/bh)*100;
  return `inset(${edges.map(n=>`${n}%`).join(' ')})`;
}
export function pumpState(q){
  const count=3,cursor=clamp(q)*count,cycle=Math.min(count-1,Math.floor(cursor)),u=q>=1?1:cursor-cycle;
  const down=smooth(u/.55),handle=u<.55?down:1-smooth((u-.55)/.45);
  const delivered=(cycle+down)/count;
  return {cycle,u,handle,delivered,scale:Math.sqrt(.35**2+(1-.35**2)*delivered),compressing:u<.55&&q>0&&q<1};
}
/** One complete state drives the material, the tool and the actor. */
export function legacyElementFrame(element,value,aspect='16:9',glyphs=[]){
  const c=choreography(value),q=c.action,layout=textLayout(element,glyphs,aspect),{size,bounds,rows}=layout;
  const words=element.animation==='domino'?dominoGroups(layout.words):layout.words;
  const world=p=>elementPoint(element,p.x,p.y,size),normal=(x,y)=>rotate(x,y,element.rotation);
  const w=element.w*size.width/100,h=element.h*size.height/100;
  const visual={opacity:element.opacity,transform:`rotate(${element.rotation}deg)`,transformOrigin:'50% 50%',clipPath:'none',filter:'none'};
  const styles=Object.fromEntries(layout.glyphs.map(g=>[g.index,neutralInk(g)]));
  const physics={kind:element.animation,phase:'rest',contact:false,toolPoint:null,materialPoint:null,word:-1,volume:0,handle:0,compressing:false,normal:/** @type {{x:number,y:number}|null} */ (null),footprint:0,events:[]};
  let actor=actorBase(c);const props=[];
  const wordIndex=Math.min(Math.max(0,words.length-1),Math.floor(q*Math.max(1,words.length)));
  const word=words[wordIndex]||bounds,previous=words[Math.max(0,wordIndex-1)]||word;
  const u=q>=1?1:q*Math.max(1,words.length)-wordIndex;
  const put=(group,dx=0,dy=0,angle=0,visible=true)=>{for(const g of group.glyphs)Object.assign(styles[g.index],{transform:glyphPose(dx,dy,angle),visibility:visible?'visible':'hidden'});};
  const mount=(point,n,kind,extent=26,force=0,depth=0)=>{
    const wp=world(point),wn=normal(n.x,n.y);actor=mountedTool(c,wp,wn,kind,extent,force,depth);
    physics.toolPoint=wp;physics.normal=wn;physics.footprint=extent;return actor;
  };
  const press=(point,n,force=0,gap=0,reference=n)=>{
    const wp=world(point),wn=normal(n.x,n.y);actor=surfaceActor(c,wp,wn,force,gap,normal(reference.x,reference.y));
    physics.toolPoint=actor.contact;physics.materialPoint=wp;physics.normal=wn;return actor;
  };
  const kind=element.animation;
  if(kind==='none'){actor.alpha=0;}
  else if(kind==='type'){
    const total=Math.max(1,graphemes(element.kind==='code'?element.code:element.text||'').length);
    for(const g of layout.glyphs){const f=characterProgress(g.index,total,c.effect);Object.assign(styles[g.index],{visibility:f<=0?'hidden':'visible',clipPath:f>=1?'none':glyphClip(g,f)});}
    const cursor=c.effect*total,ordered=layout.glyphs.filter(g=>!/\s/u.test(g.text));
    const current=ordered.find(g=>g.index+.88>=cursor)||ordered.at(-1)||layout.glyphs[0];
    let point={x:current.lx-current.width/2+current.width*characterProgress(current.index,total,c.effect),y:current.ly};
    let extent=current.height,contact=false;
    const fraction=characterProgress(current.index,total,c.effect);
    contact=fraction>0&&fraction<1&&c.phase==='act';
    for(let i=0;i<ordered.length-1;i++){
      const a=ordered[i],b=ordered[i+1],start=a.index+.88,end=b.index+.16;
      if(cursor>=start&&cursor<end){const t=smooth((cursor-start)/(end-start));point=mixPoint({x:a.lx+a.width/2,y:a.ly},{x:b.lx-b.width/2,y:b.ly},t);point.y-=18*Math.sin(t*Math.PI);extent=a.height+(b.height-a.height)*t;contact=false;break;}
    }
    // One flat nib stays mounted during both strokes and lifts. Its vertical
    // footprint is exactly the strip of ink being painted.
    point.y-=18*(1-c.contact)+18*c.release;
    mount(point,{x:-1,y:0},'nib',extent,c.effort*.35);
    physics.materialPoint=world(point);physics.contact=contact;physics.phase=contact?'stroke':'lift';
  }else if(kind==='stamp'){
    for(let i=0;i<words.length;i++)put(words[i],0,0,0,i<wordIndex||(i===wordIndex&&u>=.5));
    const rest={x:word.x,y:word.b-70},last={x:previous.x,y:previous.b-70};
    const tip=u<.25?mixPoint(last,rest,smooth(u/.25)):u<.5?mixPoint(rest,{x:word.x,y:word.b},((u-.25)/.25)**2):u<.65?{x:word.x,y:word.b}:mixPoint({x:word.x,y:word.b},rest,smooth((u-.65)/.35));
    const force=u>=.5&&u<.65?Math.sin((u-.5)/.15*Math.PI):0;
    const travel=smooth(u/.25);
    mount(tip,{x:0,y:-1},'stamp',previous.w+(word.w-previous.w)*travel+8,force,previous.h+(word.h-previous.h)*travel+4);
    physics.phase=u<.5?'approach':u<.65?'print':'lift';physics.contact=u>=.5&&u<.65;physics.word=wordIndex;physics.materialPoint=world({x:word.x,y:word.b});
  }else if(kind==='magnet'){
    const loose=g=>({x:g.x+(g.x>w*.6?-70:70),y:g.t-32});
    const home=g=>({x:g.x,y:g.t});
    for(let i=0;i<words.length;i++){const g=words[i],source=loose(g);put(g,i>wordIndex?source.x-g.x:0,i>wordIndex?source.y-g.t:0);}
    const source=loose(word),dest=home(word),sourceTip={x:source.x,y:source.y-55},destTip={x:dest.x,y:dest.y-8};
    const previousRest=wordIndex?{x:previous.x,y:previous.t-36}:sourceTip;
    let tip,anchor;
    if(u<.2){tip=mixPoint(previousRest,sourceTip,smooth(u/.2));anchor=source;physics.phase='approach';}
    else if(u<.4){tip=sourceTip;anchor=mixPoint(source,tip,smooth((u-.2)/.2));physics.phase='attract';}
    else if(u<.76){const t=smooth((u-.4)/.36);tip=mixPoint(sourceTip,destTip,t);tip.y-=Math.sin(t*Math.PI)*18;anchor=tip;physics.phase='carry';physics.contact=true;}
    else {const t=clamp((u-.76)/.14);anchor=mixPoint(destTip,dest,t*t);tip=mixPoint(destTip,{x:dest.x,y:dest.y-36},smooth((u-.76)/.24));physics.phase='release';}
    put(word,anchor.x-word.x,anchor.y-word.t);
    mount(tip,{x:0,y:-1},'magnet',26,c.effort*.35);
    physics.word=wordIndex;physics.materialPoint=world(anchor);
    if(u>=.2&&u<.76)props.push({kind:'magnetic-link',from:world(tip),to:world(anchor),opacity:.65});
  }else if(kind==='inflate'){
    const pump=pumpState(q),scale=pump.scale;
    visual.transform=`rotate(${element.rotation}deg) scale(${scale})`;
    const machine={x:bounds.l>100?bounds.l-65:bounds.r+65,y:Math.min(h+80,bounds.b+30)};
    const valve={x:w/2+((machine.x<bounds.l?bounds.l:bounds.r)-w/2)*scale,y:h/2+(bounds.y-h/2)*scale};
    const handle={x:machine.x,y:machine.y-32+pump.handle*24};
    press(handle,{x:0,y:-1},pump.compressing?Math.sin(pump.u/.55*Math.PI)*.9:0,28*(1-c.contact)+18*c.release);
    props.push({kind:'pump',x:world(machine).x,y:world(machine).y,rotation:element.rotation,amount:pump.handle*24,opacity:1-c.release},
      {kind:'hose',from:world(machine),to:world(valve),opacity:1-c.release});
    Object.assign(physics,{volume:pump.delivered,handle:pump.handle,compressing:pump.compressing,phase:pump.compressing?'compress':'return',materialPoint:world(valve),contact:c.phase==='act'});
  }else if(kind==='bounce'){
    // The upper face of Buddy is the launcher. Each word leaves it with upward velocity.
    const bottom={x:word.x,y:word.b},last={x:previous.x,y:previous.b+34};
    let top={x:bottom.x,y:bottom.y+34},dy=0,force=0;
    if(u<.22)top=mixPoint(last,top,smooth(u/.22));
    else if(u<.42){top.y+=12*Math.sin((u-.22)/.2*Math.PI);force=Math.sin((u-.22)/.2*Math.PI);}
    else if(u<.52)top.y=bottom.y+34*(1-smooth((u-.42)/.1));
    else if(u<.62){const t=(u-.52)/.1;dy=-8*t**3;top.y=bottom.y+dy;force=.8*Math.sin(t*Math.PI);physics.contact=true;physics.phase='push';}
    else {const t=(u-.62)/.38;dy=-8*(1-t)-99.2*t*(1-t);top.y=bottom.y-8+42*smooth(t);physics.phase='flight';}
    put(word,0,dy);press(top,{x:0,y:1},force);
    physics.materialPoint=world({x:bottom.x,y:bottom.y+dy});physics.word=wordIndex;
  }else if(kind==='domino'){
    const chain=dominoChain(word.glyphs),duration=chain.duration+.45,time=u*duration;
    for(const item of chain.items){const angle=dominoAngle(time-item.start-.2);Object.assign(styles[item.g.index],{transform:glyphPose(0,0,angle)});physics.events.push({index:item.g.index,start:item.start+.2,contactAngle:item.contactAngle});}
    const first=chain.items[0]?.g||word.glyphs[0];
    const age=time-.2,angle=dominoAngle(age);
    const corner=rotate(-first.width/2,-first.height*.8,angle),point={x:first.lx+corner.x,y:first.ly+first.height/2+corner.y};
    const previousFirst=previous.glyphs[0];
    const last={x:previousFirst.lx-previousFirst.width/2-34,y:previousFirst.ly-previousFirst.height*.3};
    if(time<.2){const approach=mixPoint(last,point,smooth(time/.2));press(approach,{x:-1,y:0});}
    else{press(point,rotate(-1,0,angle),age<.28?Math.sin(age/.28*Math.PI):0,age>.28?34*smooth((age-.28)/.2):0,{x:-1,y:0});physics.contact=age<=.28;physics.materialPoint=world(point);}
    physics.word=wordIndex;physics.phase=physics.contact?'push':'cascade';
  }else if(kind==='rise'){
    const dy=(1-smooth(q))*size.height*.12;
    visual.transform=`translateY(${dy/size.height*10000/element.h}%) rotate(${element.rotation}deg)`;
    const base=world({x:bounds.x,y:bounds.b});base.y+=dy;
    actor=surfaceActor(c,base,normal(0,1),Math.sin(q*Math.PI)*.6,28*(1-c.contact)+18*c.release);
    physics.normal=normal(0,1);
    const left=world({x:bounds.l,y:bounds.b}),right=world({x:bounds.r,y:bounds.b});left.y+=dy;right.y+=dy;
    props.push({kind:'tray',from:left,to:right,opacity:1-c.release});
    physics.toolPoint=actor.contact;physics.materialPoint=base;physics.contact=c.phase==='act';
  }else if(kind==='ribbon'){
    const edge=bounds.t+bounds.h*smooth(q);
    for(const g of layout.glyphs){const fraction=clamp((edge-(g.ly-g.height/2))/g.height);Object.assign(styles[g.index],{clipPath:glyphClip(g,fraction,'y'),visibility:fraction<=0?'hidden':'visible'});}
    mount({x:bounds.x,y:edge},{x:0,y:1},'roller',bounds.w,c.effort*.5);
    physics.materialPoint=world({x:bounds.x,y:edge});physics.contact=c.phase==='act';
  }else if(['reveal','exit','emphasis','spotlight'].includes(kind)){
    const rowIndex=Math.min(Math.max(0,rows.length-1),Math.floor(q*Math.max(1,rows.length))),row=rows[rowIndex]||bounds,prev=rows[Math.max(0,rowIndex-1)]||row;
    const t=q>=1?1:q*Math.max(1,rows.length)-rowIndex,move=.18,sweep=clamp((t-move)/(1-move));
    const reverse=kind==='exit',radius=Math.max(24,row.h*.8),extra=kind==='spotlight'?radius:0;
    const start={x:reverse?row.r+extra:row.l-extra,y:kind==='emphasis'?row.b+4:row.y};
    const end={x:reverse?row.l-extra:row.r+extra,y:start.y};
    const previousExtra=kind==='spotlight'?Math.max(24,prev.h*.8):0;
    const previousEnd={x:reverse?prev.l-previousExtra:prev.r+previousExtra,y:kind==='emphasis'?prev.b+4:prev.y};
    const position=t<move?mixPoint(rowIndex?previousEnd:start,start,smooth(t/move)):mixPoint(start,end,smooth(sweep));
    for(let ri=0;ri<rows.length;ri++)for(const g of rows[ri].glyphs){
      if(kind==='emphasis')continue;
      let fraction=ri<rowIndex?1:0;
      if(ri===rowIndex&&t>=move){
        if(kind==='spotlight'){const nearestX=clamp(g.lx,start.x,position.x),distance=Math.hypot(g.lx-nearestX,g.ly-row.y);fraction=clamp((radius-distance)/Math.max(8,radius*.4));}
        else fraction=reverse?clamp((g.lx+g.width/2-position.x)/g.width):clamp((position.x-g.lx+g.width/2)/g.width);
      }
      if(kind==='spotlight')Object.assign(styles[g.index],{opacity:fraction,filter:`blur(${(1-fraction)*.12}em)`});
      else Object.assign(styles[g.index],{clipPath:glyphClip(g,fraction,'x',reverse),visibility:(reverse?fraction>=1:fraction<=0)?'hidden':'visible'});
    }
    if(kind==='emphasis'){
      mount(position,{x:-.65,y:-.759934},'pencil',5,c.effort*.25);
      for(let i=0;i<=rowIndex;i++){const r=rows[i]||bounds;props.push({kind:'underline',from:world({x:r.l,y:r.b+4}),to:world(i<rowIndex?{x:r.r,y:r.b+4}:t<move?{x:r.l,y:r.b+4}:position),opacity:1});}
    }else if(kind==='spotlight'){
      const tip={x:position.x,y:position.y-row.h*.7};mount(tip,{x:0,y:-1},'lamp',28);
      if(t>=move)props.push({kind:'beam',from:world(tip),to:world(position),radius,opacity:1-c.release});
      physics.focus=world(position);physics.radius=radius;
    }else{
      const side=reverse?1:-1;mount(position,{x:side,y:0},kind==='exit'?'eraser':'roller',prev.h+(row.h-prev.h)*smooth(t/move),c.effort*.4);
    }
    physics.materialPoint=world(position);physics.contact=t>=move&&c.phase==='act';physics.phase=t<move?'travel':'sweep';
  }
  actor.action={none:'attend',type:'trace le texte',reveal:'peint le texte',rise:'porte le contenu',emphasis:'souligne les lignes',exit:'efface les lignes',stamp:'imprime chaque mot',bounce:'propulse chaque mot',magnet:'attire, transporte et dépose',ribbon:'déroule le texte',spotlight:'éclaire le texte',domino:'pousse les dominos',inflate:'pompe le texte'}[kind]||'';
  if(value<=0&& !['none','emphasis','exit'].includes(kind))visual.opacity=0;
  if(value>=1){actor.alpha=0;visual.opacity=element.opacity;visual.transform=`rotate(${element.rotation}deg)`;for(const g of layout.glyphs)Object.assign(styles[g.index],neutralInk(g));if(kind==='exit')visual.opacity=0;}
  if(!glyphs.length&& !['text','code'].includes(element.kind)){
    const one=styles[0];visual.opacity*=one.opacity;visual.clipPath=one.clipPath;
    if(one.visibility==='hidden')visual.opacity=0;
    if(one.transform!=='none')visual.transform=`rotate(${element.rotation}deg) ${one.transform}`;
  }
  return {actor,props,effect:c.effect,phase:c.phase,size,visual,glyphStyles:styles,physics};
}
/** Text effects use one unit timeline for ink, tools and Buddy. */
export const emphasisKinds=['emphasis','highlight','circle','frame','doubleUnderline','waveUnderline','brackets','pointer','focus','tint','glow','pulse','wobble','hop','stretch'];
export function motionMode(element){return emphasisKinds.includes(element.animation)?'emphasis':element.animation==='exit'?'exit':element.animationMode||'entrance';}
export function keepsEmphasis(element){return motionMode(element)==='emphasis'&&['emphasis','highlight','circle','frame','doubleUnderline','waveUnderline','brackets','pointer','tint'].includes(element.animation);}
export function motionUnits(element,glyphs,aspect='16:9'){
  const layout=textLayout(element,glyphs,aspect),scope=element.animationScope||(element.animation==='type'||element.animation==='domino'?'character':'word');
  const ink=layout.glyphs.filter(g=>!/\s/u.test(g.text));
  let units;
  if(scope==='block'||!['text','code'].includes(element.kind)){
    const w=element.w*layout.size.width/100,h=element.h*layout.size.height/100;
    units=[{l:0,r:w,t:0,b:h,w,h,x:w/2,y:h/2,glyphs:ink}];
  }else if(scope==='character')units=ink.map(g=>boxOf([g]));
  else if(scope==='text')units=ink.length?[boxOf(ink)]:[];
  else units=layout.words;
  return {...layout,units,scope};
}
function pathSample(paths,fraction){
  const segments=[];let length=0,previous=null;
  for(const path of paths){
    if(previous&&path.length){const distance=Math.max(32,Math.hypot(path[0].x-previous.x,path[0].y-previous.y));segments.push({a:previous,b:path[0],start:length,length:distance,path:null});length+=distance;}
    for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],distance=Math.hypot(b.x-a.x,b.y-a.y);segments.push({a,b,start:length,length:distance,path});length+=distance;}
    previous=path.at(-1);
  }
  const distance=clamp(fraction)*length,drawn=[];let tip=paths[0]?.[0]||{x:0,y:0},last=null,contact=true;
  for(const segment of segments){
    if(distance<segment.start)break;
    const t=clamp((distance-segment.start)/Math.max(.001,segment.length));tip=mixPoint(segment.a,segment.b,t);
    contact=segment.path!==null;
    if(segment.path){if(last!==segment.path){drawn.push([segment.a]);last=segment.path;}drawn.at(-1).push(tip);}
    else {last=null;tip.y-=12*Math.sin(t*Math.PI);}
    if(t<1)break;
  }
  return {paths:drawn,tip,contact};
}
function annotationPaths(kind,g){
  const l=g.l-7,r=g.r+7,t=g.t-7,b=g.b+7,point=(x,y)=>({x,y});
  if(kind==='circle')return [Array.from({length:97},(_,i)=>{const a=-Math.PI/2+i/96*Math.PI*2;return point(g.x+(g.w/2+9)*Math.cos(a),g.y+(g.h/2+9)*Math.sin(a));})];
  if(kind==='frame')return [[point(l,t),point(r,t),point(r,b),point(l,b),point(l,t)]];
  if(kind==='brackets')return [[point(l+7,t),point(l,t),point(l,b),point(l+7,b)],[point(r-7,b),point(r,b),point(r,t),point(r-7,t)]];
  if(kind==='pointer')return [[point(l-32,g.y-24),point(l-4,g.y)],[point(l-14,g.y-2),point(l-4,g.y),point(l-5,g.y-10)]];
  if(kind==='doubleUnderline')return [[point(g.l,b),point(g.r,b)],[point(g.r,b+6),point(g.l,b+6)]];
  if(kind==='waveUnderline')return [Array.from({length:65},(_,i)=>point(g.l+g.w*i/64,b+3*Math.sin(i/64*Math.PI*2*Math.max(1,g.w/28))))];
  return [[point(g.l,kind==='highlight'?g.y:b),point(g.r,kind==='highlight'?g.y:b)]];
}
function unitPose(g,kind,r,coverage,emphasis){
  let dx=0,dy=0,angle=0,sx=1,sy=1,pivot={x:g.x,y:g.y};
  const pulse=Math.sin(Math.PI*r)**2;
  if(emphasis){
    if(kind==='pulse')sx=sy=1+.16*pulse;
    if(kind==='stretch'){sx=1+.22*pulse;sy=1-.06*pulse;}
    if(kind==='wobble'){angle=12*Math.sin(r*Math.PI*4)*Math.sin(r*Math.PI)**2;pivot={x:g.x,y:g.b};}
    if(kind==='hop')dy=-42*pulse;
  }else{
    if(kind==='rise')dy=56*(1-coverage);
    if(kind==='bounce')dy=-54*Math.sin(r*Math.PI)**2;
    if(kind==='magnet'){dx=42*(1-coverage);dy=-48*(1-coverage);}
    if(kind==='domino'){angle=-65*(1-coverage);pivot={x:g.x,y:g.b};}
    if(kind==='inflate')sx=sy=Math.sqrt(Math.max(0,coverage));
  }
  return {dx,dy,angle,sx,sy,pivot};
}
export function elementFrame(element,value,aspect='16:9',glyphs=[]){
  if(!element.animationMode&&!element.animationScope&&!emphasisKinds.includes(element.animation))return legacyElementFrame(element,value,aspect,glyphs);
  return scopedElementFrame(element,value,aspect,glyphs);
}
export function scopedElementFrame(element,value,aspect='16:9',glyphs=[]){
  const c=choreography(value),kind=element.animation==='exit'?'reveal':element.animation,mode=motionMode(element);
  const emph=mode==='emphasis',exit=mode==='exit',layout=motionUnits(element,glyphs,aspect),{size,units,scope}=layout;
  const block=scope==='block'||!['text','code'].includes(element.kind),count=Math.max(1,units.length);
  const index=Math.min(count-1,Math.floor(c.action*count)),u=c.action>=1?1:c.action*count-index;
  const r=clamp((u-.2)/.64),s=smooth(r),world=p=>elementPoint(element,p.x,p.y,size),normal=n=>rotate(n.x,n.y,element.rotation);
  const visual={opacity:element.opacity,transform:`rotate(${element.rotation}deg)`,transformOrigin:'50% 50%',clipPath:'none',filter:'none'};
  const styles=Object.fromEntries(layout.glyphs.map(g=>[g.index,{...neutralInk(g),color:'inherit',textShadow:'none'}]));
  let actor=actorBase(c);const props=[];
  const physics={kind:element.animation,mode,scope,phase:c.phase,contact:false,unit:index,word:index,unitCount:units.length,coverage:/** @type {number[]} */([]),toolPoint:null,materialPoint:null,normal:/** @type {{x:number,y:number}|null} */(null),footprint:0,volume:0,handle:0,compressing:false};
  const mount=(point,n,tool,extent=26,force=0,depth=0)=>{
    const p=world(point),wn=normal(n);actor=mountedTool(c,p,wn,tool,extent,force,depth);
    physics.toolPoint=p;physics.materialPoint=p;physics.normal=wn;physics.footprint=extent;
  };
  const press=(point,n,force=0,reference=n)=>{
    const p=world(point),wn=normal(n);actor=surfaceActor(c,p,wn,force,0,normal(reference));
    physics.toolPoint=actor.contact;physics.materialPoint=p;physics.normal=wn;
  };
  let traceContact=true;
  let activeTip=null,activeNormal={x:-1,y:0},activeTool='roller',activeExtent=26,activeDepth=0,activeForce=0;
  const pathsFor=(g,f)=>pathSample(annotationPaths(kind,g),f);
  for(let i=0;i<units.length;i++){
    const g=units[i],current=i===index,done=i<index||value>=1;
    const localR=done?1:i>index?0:r;
    let delivered=kind==='stamp'?smooth((localR-.35)/.2):kind==='inflate'?pumpState(localR).delivered:smooth(localR);
    if(value<=0)delivered=0;
    const coverage=emph?1:exit?1-delivered:delivered;
    physics.coverage.push(coverage);
    const pose=unitPose(g,kind,localR,coverage,emph);
    const movePoint=p=>{const v=rotate((p.x-pose.pivot.x)*pose.sx,(p.y-pose.pivot.y)*pose.sy,pose.angle);return {x:pose.pivot.x+v.x+pose.dx,y:pose.pivot.y+v.y+pose.dy};};
    const front=g.l+g.w*coverage,edge=g.t+g.h*coverage;
    const wipe=['type','reveal','ribbon','spotlight','stamp'].includes(kind)&&!emph;
    const transform=`translate(${pose.dx/12}cqw,${pose.dy/12}cqw) rotate(${pose.angle}deg) scale(${pose.sx},${pose.sy})`;
    if(block){
      const px=pose.pivot.x-g.w/2,py=pose.pivot.y-g.h/2;
      visual.transform=`rotate(${element.rotation}deg) translate(${(pose.dx+px)/12}cqw,${(pose.dy+py)/12}cqw) rotate(${pose.angle}deg) scale(${pose.sx},${pose.sy}) translate(${-px/12}cqw,${-py/12}cqw)`;
      visual.transformOrigin='50% 50%';
      if(emph&&kind==='glow')visual.filter=`drop-shadow(0 0 ${Math.sin(Math.PI*localR)**2*.9}cqw #eeb94c)`;
      if(emph&&kind==='tint'&&(done||current&&r>0))props.push({kind:'annotation',paths:[[world({x:g.l,y:g.y}),world({x:g.l+g.w*(done?1:s),y:g.y})]],width:g.h,color:'#e99b45',opacity:.28});
      if(!emph){visual.opacity=coverage<=0?0:element.opacity*(wipe||kind==='inflate'?1:coverage);if(wipe)visual.clipPath=kind==='ribbon'?`inset(0 0 ${(1-coverage)*100}% 0)`:`inset(0 ${(1-coverage)*100}% 0 0)`;}
    }else for(const glyph of g.glyphs){
      const ink=styles[glyph.index],bw=glyph.boxWidth||glyph.width,bh=glyph.boxHeight||glyph.height;
      const slotL=glyph.lx-glyph.width/2-(glyph.inkLeft||0),slotT=glyph.ly-glyph.height/2-(glyph.inkTop||0);
      Object.assign(ink,{transform,transformOrigin:`${(pose.pivot.x-slotL)/bw*100}% ${(pose.pivot.y-slotT)/bh*100}%`});
      if(!emph){
        const fraction=wipe?clamp(kind==='ribbon'?(edge-glyph.ly+glyph.height/2)/glyph.height:(front-glyph.lx+glyph.width/2)/glyph.width):coverage;
        ink.visibility=fraction<=0?'hidden':'visible';ink.opacity=wipe||kind==='inflate'?1:coverage;
        if(wipe)ink.clipPath=fraction>=1?'none':glyphClip(glyph,fraction,kind==='ribbon'?'y':'x');
      }
      if(emph&&kind==='tint'){
        const painted=done?1:current?clamp((g.l+g.w*s-glyph.lx+glyph.width/2)/glyph.width):0;
        // A gradient paints only the foreground, retaining the original ink underneath.
        ink.backgroundImage=painted>0?`linear-gradient(90deg,#c96c18 ${painted*100}%,currentColor ${painted*100}%)`:'none';
        ink.backgroundClip=painted>0?'text':'border-box';ink.webkitTextFillColor=painted>0?'transparent':'currentColor';
      }
      if(emph&&kind==='glow'&&current)ink.textShadow=`0 0 ${(.9*Math.sin(Math.PI*r)**2)}em #eeb94c`;
    }
    if(emph&&['emphasis','highlight','circle','frame','doubleUnderline','waveUnderline','brackets','pointer'].includes(kind)&&(done||current&&r>0)){
      const trace=pathsFor(g,done?1:s);
      props.push({kind:'annotation',paths:trace.paths.map(path=>path.map(world)),width:kind==='highlight'?g.h+4:kind==='doubleUnderline'?2:3,color:kind==='highlight'?'#f7ce48':'#d29626',opacity:kind==='highlight'?.28:1});
      if(current){activeTip=trace.tip;activeTool=kind==='highlight'?'roller':'pencil';activeExtent=kind==='highlight'?g.h+4:5;traceContact=trace.contact;}
    }
    if(!current)continue;
    physics.contact=u>=.2&&u<=.84&&c.phase==='act';physics.phase=u<.2?'approach':u>.84?'release':'act';
    const pulse=Math.sin(Math.PI*r)**2;
    if(emph){
      if(['focus','glow'].includes(kind)){
        const tip={x:g.l+g.w*s,y:g.t-18};activeTip=tip;activeTool='lamp';activeNormal={x:0,y:-1};
        if(u>=.2&&u<=.84)props.push({kind:'beam',from:world(tip),to:world({x:tip.x,y:g.y}),radius:Math.max(25,g.h*.9),opacity:pulse*.85});
      }else if(kind==='tint'){activeTip={x:g.l+g.w*s,y:g.y};activeExtent=g.h;}
      else if(['pulse','stretch','wobble','hop'].includes(kind)){
        const n=kind==='hop'?{x:0,y:1}:{x:1,y:0},point=movePoint(kind==='hop'?{x:g.x,y:g.b}:{x:g.r,y:g.y});
        press(point,rotate(n.x,n.y,pose.angle),pulse*.75,n);
      }else if(!activeTip){const trace=pathsFor(g,0);activeTip=trace.tip;activeTool=kind==='highlight'?'roller':'pencil';activeExtent=kind==='highlight'?g.h+4:5;traceContact=trace.contact;}
    }else if(['type','reveal','ribbon','spotlight'].includes(kind)){
      activeTip=kind==='ribbon'?{x:g.x,y:edge}:{x:front,y:g.y};
      activeNormal=kind==='ribbon'?{x:0,y:1}:{x:exit?1:-1,y:0};activeTool=kind==='type'?'nib':exit?'eraser':kind==='spotlight'?'lamp':'roller';activeExtent=kind==='ribbon'?g.w:g.h;
      if(kind==='spotlight')props.push({kind:'beam',from:world({x:front,y:g.t-20}),to:world(activeTip),radius:g.h,opacity:.65});
    }else if(kind==='stamp'){
      const lift=r<.35?70*(1-smooth(r/.35)):r>.55?70*smooth((r-.55)/.45):0;
      activeTip={x:g.x,y:g.b-lift};activeNormal={x:0,y:-1};activeTool='stamp';activeExtent=g.w+6;activeDepth=g.h+4;
      activeForce=r>=.35&&r<=.55?Math.sin((r-.35)/.2*Math.PI):0;physics.contact=physics.contact&&r>=.35&&r<=.55;
    }else if(kind==='magnet'){
      activeTip=movePoint({x:g.x,y:g.t});activeTool='magnet';activeNormal={x:0,y:-1};
    }else if(kind==='inflate'){
      const pump=pumpState(r),machine={x:g.r+62,y:g.b+34},handle={x:machine.x,y:machine.y-32+pump.handle*24};
      press(handle,{x:0,y:-1},pump.compressing?Math.sin(pump.u/.55*Math.PI)*.8:0);
      props.push({kind:'pump',...world(machine),rotation:element.rotation,amount:pump.handle*24,opacity:1-c.release},
        {kind:'hose',from:world(machine),to:world(movePoint({x:g.r,y:g.y})),opacity:1-c.release});
      Object.assign(physics,{volume:coverage,handle:pump.handle,compressing:pump.compressing});
    }else{
      const sideways=kind==='domino',n=sideways?{x:-1,y:0}:{x:0,y:1};
      const point=movePoint(sideways?{x:g.l,y:g.y}:{x:g.x,y:g.b});
      press(point,rotate(n.x,n.y,pose.angle),Math.sin(Math.PI*r)*.65,n);
      if(!sideways)props.push({kind:'tray',from:world(movePoint({x:g.l,y:g.b})),to:world(movePoint({x:g.r,y:g.b})),opacity:1-c.release});
    }
  }
  if(activeTip){
    // A single mounted implement moves during the gap between consecutive units.
    // Ink is frozen during travel and Buddy lifts away from the contact surface.
    const gap=18*(1-c.contact)+18*c.release+(u<.2?14*Math.sin(u/.2*Math.PI)**2:u>.84?18*smooth((u-.84)/.16):0);
    activeTip={x:activeTip.x,y:activeTip.y-gap};
    mount(activeTip,activeNormal,activeTool,activeExtent,activeForce,activeDepth);
  }
  if(index>0&&u<.2&&c.phase==='act'){
    const previous=elementFrame(element,.24+.58*(index-1e-7)/count,aspect,glyphs).actor;
    const t=smooth(u/.2),to=actor;actor={...to,x:previous.x+(to.x-previous.x)*t,y:previous.y+(to.y-previous.y)*t};
    for(const key of ['angle','sx','sy'])actor[key]=previous[key]+(to[key]-previous[key])*t;
    actor.contact=mixPoint(previous.contact,to.contact,t);
    if(previous.tool&&to.tool)actor.tool={...to.tool,tip:mixPoint(previous.tool.tip,to.tool.tip,t),grip:mixPoint(previous.tool.grip,to.tool.grip,t),extent:(previous.tool.extent||26)+((to.tool.extent||26)-(previous.tool.extent||26))*t,depth:(previous.tool.depth||0)+((to.tool.depth||0)-(previous.tool.depth||0))*t};
    physics.contact=false;
  }
  physics.contact=physics.contact&&traceContact;
  actor.action=emph?'met le contenu en évidence':exit?'retire le contenu':'fait apparaître le contenu';
  if(kind==='none'||!units.length){actor.alpha=0;physics.contact=false;}
  if(value>=1){
    actor.alpha=0;visual.transform=`rotate(${element.rotation}deg)`;visual.transformOrigin='50% 50%';visual.clipPath='none';visual.filter='none';
    visual.opacity=exit&&kind!=='none'&&block?0:element.opacity;
    for(const glyph of layout.glyphs){const previous=styles[glyph.index];styles[glyph.index]={...neutralInk(glyph),visibility:exit&&kind!=='none'&&!block?'hidden':'visible',color:'inherit',textShadow:'none',...(kind==='tint'?{backgroundImage:previous.backgroundImage,backgroundClip:previous.backgroundClip,webkitTextFillColor:previous.webkitTextFillColor}:{})};}
  }
  if(!emph&&kind!=='none'&&value<=0&&block)visual.opacity=exit?element.opacity:0;
  if(kind==='none'){visual.opacity=element.opacity;for(const glyph of layout.glyphs)styles[glyph.index]=neutralInk(glyph);}
  return {actor,props,effect:c.effect,phase:c.phase,size,visual,glyphStyles:styles,physics};
}

/** Contact time is solved from the predecessor's rotated corner, not its index. */
export function dominoAngle(age){return age<=0?0:age<.28?35*smooth(age/.28):age<.38?35:35*(1-smooth((age-.38)/.28));}
function dominoContact(g,next){
  const distance=next.lx-next.width/2-g.lx;
  const height=Math.min(g.height,g.ly+g.height/2-(next.ly-next.height/2));
  if(height<=0)return null;
  const reaches=angle=>{
    const a=angle*Math.PI/180,x=g.width/2*Math.cos(a)+height*Math.sin(a);
    const y=g.ly+g.height/2+g.width/2*Math.sin(a)-height*Math.cos(a);
    return x>=distance&&y<=next.ly+next.height/2;
  };
  let hi=null;
  for(let a=0;a<=35;a+=.25)if(reaches(a)){hi=a;break;}
  if(hi===null)return null;
  let lo=Math.max(0,hi-.25);
  for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(reaches(mid))hi=mid;else lo=mid;}
  return hi;
}
function dominoGroups(words){
  const groups=[];
  for(const word of words){let group=[];for(const g of word.glyphs){if(group.length&&dominoContact(group.at(-1),g)===null){groups.push(boxOf(group));group=[];}group.push(g);}if(group.length)groups.push(boxOf(group));}
  return groups;
}
export function dominoChain(glyphs){
  const items=[];let start=0;
  for(let i=0;i<glyphs.length;i++){
    const g=glyphs[i],next=glyphs[i+1];let contactAngle=0,delay=.28;
    if(next){contactAngle=dominoContact(g,next);
      if(contactAngle!==null){let l=0,r=1;for(let k=0;k<30;k++){const m=(l+r)/2;if(35*smooth(m)<contactAngle)l=m;else r=m;}delay=.28*r;}
    }
    const trigger=i===0||items[i-1].contactAngle===null?'buddy':'collision';
    if(trigger==='buddy')start=0;
    items.push({g,start,contactAngle,trigger});start+=delay;
  }
  return {items,duration:(items.at(-1)?.start||0)+.66};
}
/** Apply exactly the state that is drawn on the overlay, before the browser paints. */
export function applyElementFrame(target,frame){
  if(!target)return;
  Object.assign(target.style,frame.visual);
  target.dataset.motionRunning=frame.actor.alpha>0?'true':'false';
  target.dataset.contactPhase=frame.physics.phase;
  for(const slot of target.querySelectorAll('[data-char-index]')){
    const ink=slot.querySelector('[data-glyph-ink]')||slot;
    Object.assign(ink.style,frame.glyphStyles[Number(slot.dataset.charIndex)]||neutralInk());
  }
}

/** Read actual character geometry, preserving Unicode and code newline indices. */
export function readGlyphs(target, stage, element, aspect = '16:9') {
  if (!target || !stage) return [];
  const bounds = stage.getBoundingClientRect();
  if (!bounds.width) return [];
  const scale = stageSize(aspect).width / bounds.width;
  const scene = target.closest('.player-scene,.offline-scene');
  const savedTarget = target.style.transform, savedOrigin=target.style.transformOrigin, savedScene = scene?.style.transform;
  target.style.transform = `rotate(${element.rotation}deg)`;target.style.transformOrigin='50% 50%';
  if(scene)scene.style.transform='none';
  const view=target.ownerDocument.defaultView;
  const measure=target.ownerDocument.createElement('canvas').getContext('2d');
  try {
    return Array.from(target.querySelectorAll('[data-char-index]')).map((node) => {
      const rect=node.getBoundingClientRect(),ink=node.querySelector('[data-glyph-ink]')||node;
      const text=node.textContent||'',style=view.getComputedStyle(ink),fontSize=parseFloat(style.fontSize)||20;
      const slotWidth=parseFloat(view.getComputedStyle(node).width)||node.offsetWidth;
      const slotHeight=parseFloat(view.getComputedStyle(node).height)||node.offsetHeight;
      if(measure)measure.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics=measure?.measureText(text),hasInk=metrics&&metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent>0;
      const width=hasInk?metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight:slotWidth;
      const height=hasInk?metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent:slotHeight;
      const dx=hasInk?(metrics.actualBoundingBoxRight-metrics.actualBoundingBoxLeft-slotWidth)/2:0;
      const dy=hasInk?((metrics.fontBoundingBoxAscent??fontSize*.8)-(metrics.fontBoundingBoxDescent??fontSize*.2)
        +metrics.actualBoundingBoxDescent-metrics.actualBoundingBoxAscent)/2:0;
      const offset=rotate(dx*scale,dy*scale,element.rotation);
      return { index:Number(node.dataset.charIndex),text,
        slotX:((rect.left+rect.right)/2-bounds.left)*scale,slotY:((rect.top+rect.bottom)/2-bounds.top)*scale,
        x:((rect.left+rect.right)/2-bounds.left)*scale+offset.x,
        y:((rect.top+rect.bottom)/2-bounds.top)*scale+offset.y,
        width:width*scale,height:height*scale,angle:element.rotation,
        boxWidth:slotWidth*scale,boxHeight:slotHeight*scale,
        inkLeft:(slotWidth/2+dx-width/2)*scale,inkTop:(slotHeight/2+dy-height/2)*scale,
        origin:`${50+dx/Math.max(1,slotWidth)*100}% ${50+(dy+height/2)/Math.max(1,slotHeight)*100}%` };
    });
  } finally {
    target.style.transform=savedTarget;target.style.transformOrigin=savedOrigin;
    if(scene)scene.style.transform=savedScene;
  }
}

function stroke(ctx, points, width = 2, color = '#191919') {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) ctx.lineTo(p[0],p[1]);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
}
function rect(ctx,x,y,w,h,r,fill,outline='#191919') {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(outline){ctx.strokeStyle=outline;ctx.lineWidth=2;ctx.stroke();}
}
function drawTool(ctx,tool) {
  const {tip,grip,kind}=tool;
  const mark=(points,width=2,color='#191919')=>{stroke(ctx,points,width+3,'#fff');stroke(ctx,points,width,color);};
  ctx.save();ctx.translate(tip.x,tip.y);
  ctx.rotate(Math.atan2(grip.y-tip.y,grip.x-tip.x)+Math.PI/2);
  const length=Math.hypot(grip.x-tip.x,grip.y-tip.y);
  const extent=tool.extent||36;
  if(kind==='pencil'){
    rect(ctx,-4,-length-7,8,length-1,2,'#fff');
    ctx.beginPath();ctx.moveTo(-4,-8);ctx.lineTo(0,0);ctx.lineTo(4,-8);ctx.closePath();ctx.fillStyle='#191919';ctx.fill();
    mark([[0,-11],[0,-length+2]],1);
  }else if(kind==='nib'){
    rect(ctx,-4,-length-5,8,length-8,3,'#fff');
    mark([[0,-10],[-extent/2,-2],[extent/2,-2],[0,-10]],2);
    mark([[-extent/2,0],[extent/2,0]],3,'#191919');
  }else if(kind==='roller'){
    mark([[0,-length],[0,-14],[extent/2-5,-14],[extent/2-5,0]],3);
    rect(ctx,-extent/2,-7,extent,14,4,'#fff');
    mark([[-extent/2+3,2],[extent/2-3,2]],2,'#888');
  }else if(kind==='eraser'){
    mark([[0,-length],[0,-12]],5);
    rect(ctx,-extent/2,-12,extent,12,3,'#fff');
    mark([[-extent/2,0],[extent/2,0]],4);
  }else if(kind==='magnet'){
    mark([[0,-length],[0,-24]],5);
    ctx.beginPath();ctx.moveTo(-12,-2);ctx.lineTo(-12,-19);ctx.quadraticCurveTo(0,-36,12,-19);ctx.lineTo(12,-2);
    ctx.strokeStyle='#fff';ctx.lineWidth=12;ctx.stroke();ctx.strokeStyle='#191919';ctx.lineWidth=8;ctx.stroke();
    mark([[-12,-7],[-12,-1]],8,'#c55947');mark([[12,-7],[12,-1]],8,'#7893ae');
  }else if(kind==='stamp'){
    const depth=tool.depth||10;
    rect(ctx,-5,-length,10,length-depth+5,4,'#fff');
    rect(ctx,-extent/2,-depth,extent,depth,3,'#fff');
    mark([[-extent/2+2,0],[extent/2-2,0]],4);
  }else if(kind==='lamp'){
    mark([[0,-length],[0,-21]],5);
    ctx.beginPath();ctx.moveTo(-6,-23);ctx.lineTo(-18,-4);ctx.lineTo(18,-4);ctx.lineTo(6,-23);ctx.closePath();
    ctx.fillStyle='#f1deb1';ctx.fill();ctx.strokeStyle='#191919';ctx.lineWidth=2;ctx.stroke();
    mark([[-14,-2],[14,-2]],3,'#fff');
  }else if(kind==='suction'){
    mark([[0,-length],[0,-13]],5);
    ctx.beginPath();ctx.moveTo(-16,0);ctx.quadraticCurveTo(0,-30,16,0);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#191919';ctx.lineWidth=2;ctx.stroke();
  }else if(kind==='spool-handle'){
    mark([[0,-length],[0,0]],5);
    rect(ctx,-7,-6,14,12,3,'#fff');
  }else if(kind==='hook'||kind==='zipper'){
    mark([[0,-length],[0,-12]],4);
    ctx.beginPath();ctx.arc(0,-6,6,-Math.PI,Math.PI/2);ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#191919';ctx.lineWidth=3;ctx.stroke();
    if(kind==='zipper')rect(ctx,-7,-18,14,15,3,'#fff');
  }else{
    mark([[0,-length],[0,-12],[13,-12],[13,0],[0,0]],4);
    rect(ctx,-8,-18,16,36,5,'#fff');
    mark([[2,-13],[2,13]],2,'#888');
  }
  ctx.restore();
}
function drawActor(ctx,a,font) {
  if(!a.alpha)return;
  ctx.save();ctx.globalAlpha=a.alpha;
  ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle*Math.PI/180);ctx.scale(a.sx,a.sy);
  rect(ctx,-42,-27,84,54,2,'#fff');
  ctx.fillStyle='#191919';ctx.font=`20px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(a.face,0,0);
  ctx.restore();if(a.tool)drawTool(ctx,a.tool);ctx.restore();
}
function drawProp(ctx,p) {
  if(p.kind==='annotation'){ctx.save();ctx.globalAlpha=p.opacity??1;for(const path of p.paths){if(path.length>1)stroke(ctx,path.map(point=>[point.x,point.y]),p.width,p.color);}ctx.restore();return;}
  ctx.save();ctx.globalAlpha=p.opacity;
  // A light keyline keeps contact and ink legible on both light and dark slides.
  const mark = (points, width = 2, color = '#191919') => {
    stroke(ctx,points,width+3,'#fff');stroke(ctx,points,width,color);
  };
  if(p.kind==='underline')mark([[p.from.x,p.from.y],[p.to.x,p.to.y]],3);
  if(p.kind==='edge')mark([[p.from.x,p.from.y],[p.to.x,p.to.y]],3);
  if(p.kind==='iris'){
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0,p.radius),0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#59675f';ctx.lineWidth=3;ctx.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4;mark([[p.x,p.y],[p.x+Math.cos(a)*p.radius,p.y+Math.sin(a)*p.radius]],1,'#98a29b');}
    rect(ctx,p.x-7,p.y-7,14,14,6,'#fff');
  }
  if(p.kind==='breath-field'&&p.radius>0){
    const inner=Math.max(0,p.radius-p.soft),gradient=ctx.createRadialGradient(p.x,p.y,inner,p.x,p.y,p.radius);
    gradient.addColorStop(0,'rgba(210,225,213,0)');gradient.addColorStop(.55,'rgba(210,225,213,.2)');gradient.addColorStop(1,'rgba(210,225,213,0)');
    ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();
    for(let i=0;i<18;i++){const a=i*Math.PI/9,r=Math.max(0,p.radius-p.soft*.45),length=10+8*Math.sin(i*2);mark([[p.x+Math.cos(a)*r,p.y+Math.sin(a)*r],[p.x+Math.cos(a)*(r+length),p.y+Math.sin(a)*(r+length)]],1,'#899b8c');}
  }
  if(p.kind==='curtain-belt'){
    const W=p.width;
    mark([[10,35],[W-10,35]],2,'#7e8a80');mark([[10,55],[W-10,55]],2,'#7e8a80');
    for(const x of [10,W-10]){ctx.beginPath();ctx.arc(x,45,10,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#566157';ctx.lineWidth=2;ctx.stroke();}
    mark([[p.left,0],[p.left,35]],3);mark([[p.right,0],[p.right,55]],3);
    for(const point of [{x:p.left,y:35},{x:p.right,y:55}])rect(ctx,point.x-5,point.y-4,10,8,2,'#fff');
    for(let x=0;x<W;x+=72){const top=(x-p.travel%72+W)%W,bottom=(x+p.travel%72)%W;stroke(ctx,[[top-3,32],[top+3,38]],2,'#666');stroke(ctx,[[bottom-3,52],[bottom+3,58]],2,'#666');}
  }
  if(p.kind==='paper-roll'){
    const R=p.radius,y=p.from.y,W=p.to.x-p.from.x;
    rect(ctx,p.from.x,y-R,W,2*R,R,'#e7e5dc');
    mark([[p.from.x,y-R*.65],[p.to.x,y-R*.65]],1,'#fff');
    const cy=y+Math.sin(p.angle)*R*.7;
    if(Math.cos(p.angle)>=0)for(let x=p.from.x+16;x<p.to.x-14;x+=55)stroke(ctx,[[x,cy-3],[x+7,cy+3]],2,'#97988e');
    ctx.beginPath();ctx.arc(p.to.x-R,y,R-2,0,Math.PI*2);ctx.strokeStyle='#858b80';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(p.to.x-R,y,R*.45,p.angle,p.angle+Math.PI*1.65);ctx.stroke();
  }
  if(p.kind==='zip-seam'){
    const teeth=(a,b,start=9)=>{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;mark([[a.x,a.y],[b.x,b.y]],2);for(let d=start;d<len;d+=17){const x=a.x+dx*d/len,y=a.y+dy*d/len;mark([[x-dy/len*4,y+dx/len*4],[x+dy/len*4,y-dx/len*4]],3);}};
    const phase=((9-Math.hypot(p.from.x,p.from.y))%17+17)%17;
    teeth(p.from,p.to,phase);teeth(p.left,p.from);teeth(p.right,p.from);
  }
  if(p.kind==='tray'){
    mark([[p.from.x,p.from.y],[p.to.x,p.to.y]],5);
    const dx=p.to.x-p.from.x,dy=p.to.y-p.from.y,len=Math.hypot(dx,dy)||1;
    for(const point of [p.from,p.to])mark([[point.x-dy/len*5,point.y+dx/len*5],[point.x,point.y]],3);
  }
  if(p.kind==='hose'){
    const dx=p.to.x-p.from.x,dy=p.to.y-p.from.y;
    ctx.beginPath();ctx.moveTo(p.from.x,p.from.y);
    ctx.bezierCurveTo(p.from.x+dx*.2,p.from.y+35,p.to.x-dx*.2,p.to.y+dy*.2,p.to.x,p.to.y);
    ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#4d5550';ctx.lineWidth=3;ctx.stroke();
    rect(ctx,p.to.x-4,p.to.y-4,8,8,2,'#fff');
  }
  if(p.kind==='magnetic-link'){
    ctx.setLineDash([3,5]);mark([[p.from.x,p.from.y],[p.to.x,p.to.y]],1,'#7893ae');ctx.setLineDash([]);
  }
  if(p.kind==='beam'){
    const r=p.radius;
    const gradient=ctx.createRadialGradient(p.to.x,p.to.y,0,p.to.x,p.to.y,r);
    gradient.addColorStop(0,'rgba(248,208,116,.30)');gradient.addColorStop(1,'rgba(248,208,116,0)');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(p.to.x,p.to.y,r,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(p.from.x,p.from.y);ctx.lineTo(p.to.x-r*.6,p.to.y);ctx.lineTo(p.to.x+r*.6,p.to.y);ctx.closePath();ctx.fillStyle='rgba(248,208,116,.10)';ctx.fill();
  }
  if(p.kind==='pressure'){
    if(p.horizontal)mark([[p.x-44,p.y],[p.x+44,p.y]],5);
    else mark([[p.x,p.y-34],[p.x,p.y+34]],5);
  }
  if(p.kind==='curtain')mark([[p.x,0],[p.x,p.height]],4);
  if(p.kind==='ring'){
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0,p.radius),0,Math.PI*2);
    ctx.strokeStyle='#fff';ctx.lineWidth=8;ctx.stroke();
    ctx.strokeStyle='#191919';ctx.lineWidth=5;ctx.stroke();
  }
  if(p.kind==='breath')for(let i=0;i<6;i++){
    const distance=25+((p.amount*220+i*26)%160);
    const y=p.y+(i-2.5)*13;
    mark([[p.x+distance,y],[p.x+distance+18,y-4]],2,'#777');
  }
  if(p.kind==='clap'){
    rect(ctx,p.x-52,p.y-20,104,52,4,'#191919','#fff');
    stroke(ctx,[[p.x-35,p.y+8],[p.x+35,p.y+8]],2,'#fff');
    ctx.translate(p.x-52,p.y-20);ctx.rotate(-(1-p.closure)*.55);
    rect(ctx,0,-15,104,15,2,'#fff');
    for(let i=0;i<5;i++)stroke(ctx,[[i*22+4,-13],[i*22+14,-2]],5);
  }
  if(p.kind==='rope'){
    ctx.beginPath();ctx.moveTo(p.from.x,p.from.y);
    ctx.quadraticCurveTo((p.from.x+p.to.x)/2,(p.from.y+p.to.y)/2+18*(1-p.amount),p.to.x,p.to.y);
    ctx.strokeStyle='#fff';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#62625c';ctx.lineWidth=2;ctx.stroke();
  }
  if(p.kind==='spool'){
    mark([[p.from.x,p.from.y],[p.to.x,p.to.y]],14,'#d8d6cb');
    mark([[p.from.x,p.from.y-5],[p.to.x,p.to.y-5]],1,'#777');
    const dx=p.to.x-p.from.x,dy=p.to.y-p.from.y;
    for(let i=0;i<=8;i++){
      const t=i/8,shift=Math.sin(p.amount*Math.PI*8)*3;
      stroke(ctx,[[p.from.x+dx*t,p.from.y+dy*t-3+shift],[p.from.x+dx*t+4,p.from.y+dy*t+3+shift]],1,'#777');
    }
  }
  if(p.kind==='zip'){
    const dx=p.to.x-p.from.x,dy=p.to.y-p.from.y,len=Math.hypot(dx,dy)||1;
    mark([[p.from.x,p.from.y],[p.to.x,p.to.y]],2);
    for(let t=0;t<len;t+=18){
      const x=p.from.x+dx*t/len,y=p.from.y+dy*t/len;
      mark([[x-dy/len*5,y+dx/len*5],[x+dy/len*5,y-dx/len*5]],3);
    }
  }
  if(p.kind==='pump'){
    ctx.translate(p.x,p.y);ctx.rotate((p.rotation||0)*Math.PI/180);
    rect(ctx,-9,-8,18,14,3,'#fff');
    mark([[0,-32+p.amount],[0,0]],3);
    mark([[-22,-32+p.amount],[22,-32+p.amount]],5);
    mark([[-16,7],[16,7]],4);
  }
  if(p.kind==='light'){
    const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,65);
    glow.addColorStop(0,'rgba(248,208,116,.26)');glow.addColorStop(1,'rgba(248,208,116,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,65,0,Math.PI*2);ctx.fill();
  }
  if(p.kind==='field'){
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.ellipse(p.x,p.y,20+i*14,12+i*10,0,0,Math.PI*2);
      ctx.setLineDash([3,6]);ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#8b7165';ctx.lineWidth=1;ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if(p.kind==='pulse'){
    for(let i=0;i<5;i++){
      const a=Math.PI+i*Math.PI/4,r=12+p.amount*28;
      mark([[p.x+Math.cos(a)*r,p.y+Math.sin(a)*r],[p.x+Math.cos(a)*(r+7),p.y+Math.sin(a)*(r+7)]],2);
    }
  }
  ctx.restore();
}

/** Same canvas renderer in the live player and the portable presentation. */
export function drawMotion(canvas, frames, aspect = '16:9', font = 'monospace') {
  if(!canvas)return;
  const width=canvas.clientWidth;
  if(!width)return;
  const size=stageSize(aspect),ratio=typeof devicePixelRatio==='number'?Math.min(2,devicePixelRatio):1;
  const height=width*size.height/size.width;
  if(canvas.width!==Math.round(width*ratio))canvas.width=Math.round(width*ratio);
  if(canvas.height!==Math.round(height*ratio))canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(canvas.width/size.width,0,0,canvas.height/size.height,0,0);
  ctx.clearRect(0,0,size.width,size.height);
  for(const frame of frames)for(const prop of frame.props)drawProp(ctx,prop);
  for(const frame of frames)drawActor(ctx,frame.actor,font);
}
