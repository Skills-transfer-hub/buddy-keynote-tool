import test from 'node:test';
import assert from 'node:assert/strict';
import * as motion from '../lib/buddy-motion.js';
import { makeElement, makeSlide, initialDeck, migrateDeck, animationOptions, emphasisAnimations, type ElementAnimation, type AnimationScope, type AnimationMode } from '../lib/studio.ts';

const scopes:AnimationScope[]=['character','word','text','block'];
const entrances=Object.keys(animationOptions('entrance')).filter(k=>k!=='none') as ElementAnimation[];
const raw=(q:number)=>.24+.58*q;
function fixture(animation:ElementAnimation,animationMode:AnimationMode,animationScope:AnimationScope,rotation=0){
  const element={...makeElement('text'),text:'AB CD\nÉ.',animation,animationMode,animationScope,rotation,x:20,y:30,w:50,h:30};
  const glyphs=[[0,40,40,20,40],[1,65,40,20,40],[3,120,40,20,40],[4,145,40,20,40],[6,40,110,20,40],[7,60,126,5,8]].map(([index,x,y,width,height])=>{
    const slot=motion.elementPoint(element,x,index<6?40:110,motion.stageSize());
    return {...motion.elementPoint(element,x,y,motion.stageSize()),slotX:slot.x,slotY:slot.y,index,text:motion.graphemes(element.text)[index],width,height,angle:rotation,boxWidth:25,boxHeight:52,inkLeft:2,inkTop:6};
  });
  return {element,glyphs};
}
const frame=(f:ReturnType<typeof fixture>,p:number)=>motion.elementFrame(f.element,p,'16:9',f.glyphs) as ReturnType<typeof motion.scopedElementFrame>;

void test('les 4 portées regroupent des graphèmes, des mots, l’encre entière ou la boîte complète',()=>{
  for(const scope of scopes)for(const angle of [0,30,90]){
    const f=fixture('reveal','entrance',scope,angle),layout=motion.motionUnits(f.element,f.glyphs);
    assert.equal(layout.units.length,{character:6,word:3,text:1,block:1}[scope]);
    assert.equal(layout.units.flatMap((g:{glyphs:unknown[]})=>g.glyphs).length,6);
    if(scope==='text')assert.equal(layout.units[0].l,30);
    if(scope==='block'){assert.equal(layout.units[0].l,0);assert.equal(layout.units[0].w,600);}
  }
});

void test('chaque entrée part sans encre, chaque sortie finit sans encre, dans les 4 portées',()=>{
  for(const animation of entrances)for(const mode of ['entrance','exit'] as AnimationMode[])for(const scope of scopes){
    const f=fixture(animation,mode,scope,30);
    for(const p of [0,.1,.239]){
      const state=frame(f,p);
      assert.ok(state.physics.coverage.every(v=>v===(mode==='exit'?1:0)),`${animation}/${mode}/${scope}: initial coverage`);
      if(scope==='block')assert.equal(state.visual.opacity,mode==='exit'?1:0);
      else f.glyphs.forEach(g=>assert.equal(state.glyphStyles[g.index].visibility,mode==='exit'?'visible':'hidden'));
    }
    let previous=frame(f,0).physics.coverage;
    for(let p=.24;p<=.83;p+=.013){
      const state=frame(f,p);
      state.physics.coverage.forEach((v,i)=>assert.ok(mode==='exit'?v<=previous[i]+1e-9:v>=previous[i]-1e-9,`${animation}: ink reverses direction`));
      previous=state.physics.coverage;
    }
    const final=frame(f,1);
    assert.equal(final.visual.transform,'rotate(30deg)');assert.equal(final.actor.alpha,0);
    if(scope==='block')assert.equal(final.visual.opacity,mode==='exit'?0:1);
    else f.glyphs.forEach(g=>assert.equal(final.glyphStyles[g.index].visibility,mode==='exit'?'hidden':'visible'));
  }
});

void test('15 mises en évidence distinctes conservent le texte avant, pendant et après',()=>{
  assert.equal(emphasisAnimations.length,15);
  const signatures=new Set();
  for(const animation of emphasisAnimations){
    for(const scope of scopes){
      const f=fixture(animation,'emphasis',scope);
      for(const p of [0,.239,raw(.45),raw(.72),1]){
        const state=frame(f,p);
        assert.equal(state.visual.opacity,1);
        f.glyphs.forEach(g=>{assert.equal(state.glyphStyles[g.index].visibility,'visible');assert.equal(state.glyphStyles[g.index].opacity,1);});
        if(p===1){assert.equal(state.visual.transform,'rotate(0deg)');f.glyphs.forEach(g=>assert.equal(state.glyphStyles[g.index].transform,'none'));}
      }
    }
    const f=fixture(animation,'emphasis','text');
    signatures.add(JSON.stringify([.4,.58,.7].map(q=>{const state=frame(f,raw(q));return {visual:state.visual,glyphs:state.glyphStyles,props:state.props};})));
  }
  assert.equal(signatures.size,15,'distinct visible geometry, not just distinct labels');
});

void test('les portées n’avancent qu’une unité à la fois et Buddy ne saute pas entre les unités',()=>{
  for(const animation of [...entrances,...emphasisAnimations])for(const scope of ['character','word'] as AnimationScope[]){
    const f=fixture(animation,emphasisAnimations.includes(animation)?'emphasis':'entrance',scope,30),count=motion.motionUnits(f.element,f.glyphs).units.length;
    for(let i=1;i<count;i++){
      const a=frame(f,raw((i-1e-7)/count)),b=frame(f,raw((i+1e-7)/count));
      assert.ok(Math.hypot(a.actor.x-b.actor.x,a.actor.y-b.actor.y)<.1,`${animation}/${scope}: Buddy teleports`);
      if(a.actor.tool&&b.actor.tool)assert.ok(Math.hypot(a.actor.tool.tip.x-b.actor.tool.tip.x,a.actor.tool.tip.y-b.actor.tool.tip.y)<.1,`${animation}: tool teleports`);
    }
    if(!emphasisAnimations.includes(animation)){
      const state=frame(f,raw(.52/count));
      assert.ok(state.physics.coverage.slice(1).every(v=>v===0),`${animation}: future units leak`);
    }
  }
});

void test('modes et portées survivent au JSON, les anciens decks sont migrés et les valeurs invalides rejetées',()=>{
  for(const scope of scopes)for(const mode of ['entrance','exit','emphasis'] as AnimationMode[]){
    const f=fixture(mode==='emphasis'?'highlight':'reveal',mode,scope);
    const deck={...initialDeck,slides:[{...makeSlide(),elements:[f.element]}]};
    const restored=migrateDeck(JSON.parse(JSON.stringify(deck)))!;
    assert.equal(restored.slides[0].elements[0].animationMode,mode);assert.equal(restored.slides[0].elements[0].animationScope,scope);
    assert.equal(migrateDeck({...deck,slides:[{...deck.slides[0],elements:[{...f.element,animationScope:'sentence'}]}]}),null);
    assert.equal(migrateDeck({...deck,slides:[{...deck.slides[0],elements:[{...f.element,animationMode:'unknown'}]}]}),null);
  }
  const f=fixture('exit','exit','text');const legacy={...f.element,animationMode:undefined,animationScope:undefined};
  const restored=migrateDeck({...initialDeck,slides:[{...makeSlide(),elements:[legacy]}]})!;
  assert.equal(restored.slides[0].elements[0].animationMode,'exit');
  assert.equal(restored.schemaVersion,2);
});
