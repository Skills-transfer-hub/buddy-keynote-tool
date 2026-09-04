import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudioSlide } from '@/components/studio-slide';
import { animationGroups } from './playback';
import type { Deck } from './studio';
import { buddyText } from './buddy';
import studioCss from '@/app/studio.css?raw';

/** A self-contained document. Local image data and the director timeline travel with it. */
export async function exportHtml(deck: Deck): Promise<Blob> {
  const slides = deck.slides.filter((slide) => !slide.hidden);
  const markup = slides
    .map(
      (slide, index) =>
        `<section class="offline-scene" data-index="${index}">${renderToStaticMarkup(createElement(StudioSlide, { slide: { ...slide, elements: slide.elements.map((e) => (e.kind === 'media' ? { ...e, autoplay: false } : e)) }, aspectRatio: deck.aspectRatio, presenting: true, progress: Object.fromEntries(slide.elements.map((e) => [e.id, 1])) }))}</section>`,
    )
    .join('');
  const data = JSON.stringify({
    slides,
    groups: slides.map(animationGroups),
  }).replaceAll('<', '\\u003c');
  const title = deck.title.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!,
  );
  const script = `
const data=JSON.parse(document.getElementById('deck-data').textContent);
const stage=document.getElementById('stage'),actor=document.getElementById('actor'),counter=document.getElementById('counter');
const scenes=[...document.querySelectorAll('.offline-scene')];let index=0,step=0,raf=0,busy=false,finish=null,autoTimer=0;
function select(id){return scenes[index].querySelector('[data-element-id="'+CSS.escape(id)+'"]');}
function textCharacters(el){if(!el)return [];let chars=[...el.querySelectorAll('[data-char-index]')];if(chars.length)return chars;const root=el.querySelector('.studio-text-content')||el.querySelector('code');if(!root)return [];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);let n=0;for(const node of nodes){if(node.parentElement.closest('.studio-code-line-number'))continue;const f=document.createDocumentFragment();for(const c of Array.from(node.textContent)){const span=document.createElement('span');span.textContent=c;span.dataset.charIndex=String(n++);f.appendChild(span);}node.replaceWith(f);}return [...root.querySelectorAll('[data-char-index]')];}
function apply(e,p){const el=select(e.id);if(!el)return;if(e.animation==='type'){const chars=textCharacters(el),count=Math.floor(chars.length*p);chars.forEach((c,i)=>c.style.visibility=i<count?'visible':'hidden');if(!chars.length)el.style.clipPath='inset(0 '+((1-p)*100)+'% 0 0)';}if(e.animation==='reveal')el.style.clipPath='inset(0 '+((1-p)*100)+'% 0 0)';if(e.animation==='rise'){el.style.opacity=e.opacity*p;el.style.transform='rotate('+e.rotation+'deg) translateY('+((1-p)*800/e.h)+'%)';}if(e.animation==='exit')el.style.clipPath='inset(0 '+(p*100)+'% 0 0)';if(e.animation==='emphasis'&&e.kind!=='buddy')el.style.transform='rotate('+e.rotation+'deg) scale('+(1+Math.sin(p*Math.PI)*.05)+')';}
function moveActor(x,y,target=actor){target.style.left=Math.max(4,Math.min(92,x))+'%';target.style.top=Math.max(4,Math.min(88,y))+'%';}
function run(previous){cancelAnimationFrame(raf);clearTimeout(autoTimer);const slide=data.slides[index],groups=data.groups[index],cues=groups[step]||[],td=step===0?slide.transitionDuration:0,total=td+Math.max(0,...cues.map(c=>c.end));stage.querySelectorAll('.export-buddy').forEach(e=>e.remove());const cast=new Map(cues.map(c=>{const b=actor.cloneNode(true);b.removeAttribute('id');b.className='export-buddy';b.style.opacity=0;stage.appendChild(b);return [c.element.id,b];}));const incoming=scenes[index],out=previous==null?null:scenes[previous];scenes.forEach((s,i)=>{s.style.display=i===index||i===previous?'block':'none';s.style.transform='';s.style.opacity='1';s.style.clipPath='';s.style.zIndex=i===index?'2':'1';});groups.forEach((g,i)=>g.forEach(c=>apply(c.element,i<step?1:0)));counter.textContent=(index+1)+' / '+scenes.length;busy=true;actor.style.opacity=1;const start=performance.now();
function tick(now,forced){const t=forced?total:Math.min(total,now-start),p=td?Math.min(1,t/td):1,eased=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;let hasActor=false;cast.forEach(b=>b.style.opacity=0);
if(t<td){hasActor=true;const q=eased;if(slide.transition==='push'){incoming.style.transform='translateX('+((1-q)*100)+'%)';if(out)out.style.transform='translateX('+(-q*100)+'%)';moveActor((1-q)*100,56);}else if(slide.transition==='lift'){incoming.style.transform='translateY('+((1-q)*100)+'%)';if(out)out.style.transform='translateY('+(-q*100)+'%)';moveActor(50,(1-q)*100);}else if(slide.transition==='dissolve'){incoming.style.opacity=q;if(out)out.style.opacity=1-q;moveActor(10+q*80,84);}else if(slide.transition==='zoom'){incoming.style.clipPath='circle('+(q*145)+'% at 50% 50%)';moveActor(50+q*42,50);}else if(slide.transition==='cut'){incoming.style.clipPath='inset(0 0 '+((1-q)*100)+'% 0)';moveActor(50,q*100);}else{incoming.style.clipPath='inset(0 '+((1-q)*100)+'% 0 0)';moveActor(q*100,56);}}
else{incoming.style.transform='';incoming.style.opacity='1';incoming.style.clipPath='';if(out)out.style.display='none';const local=t-td;cues.forEach(c=>{const ep=Math.max(0,Math.min(1,(local-c.start)/(c.end-c.start)));apply(c.element,ep);if(local>=c.start&&local<c.end){const e=c.element,buddy=cast.get(e.id);buddy.style.opacity=1;moveActor(e.animation==='rise'?e.x+e.w/2:e.x+e.w*(e.animation==='exit'?1-ep:ep),e.y+e.h+(e.animation==='rise'?(1-ep)*8:e.animation==='exit'?-e.h/2:0),buddy);if(e.animation==='type'){const chars=textCharacters(select(e.id)),char=chars[Math.min(chars.length-1,Math.max(0,Math.floor(ep*chars.length)-1))];if(char){const a=char.getBoundingClientRect(),b=stage.getBoundingClientRect();moveActor((a.right-b.left)/b.width*100,(a.bottom-b.top)/b.height*100,buddy);}}}});}
actor.style.opacity=hasActor?'1':'0';if(t<total&&!forced)raf=requestAnimationFrame(tick);else{busy=false;finish=null;actor.style.opacity=0;if(slide.autoAdvance)autoTimer=setTimeout(next,step<groups.length-1?0:slide.autoAdvance);}}
finish=()=>{cancelAnimationFrame(raf);tick(performance.now(),true);};if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else raf=requestAnimationFrame(tick);}
function next(){if(busy){finish();return;}if(step<data.groups[index].length-1){step++;run(null);}else if(index<scenes.length-1){const old=index;index++;step=0;run(old);}}
function prev(){if(step>0){step--;run(null);if(finish)finish();}else if(index>0){index--;step=data.groups[index].length-1;run(null);if(finish)finish();}}
document.getElementById('next').onclick=next;document.getElementById('prev').onclick=prev;document.getElementById('full').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){e.preventDefault();next();}if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();prev();}if(e.key.toLowerCase()==='b')document.getElementById('blackout').hidden=!document.getElementById('blackout').hidden;if(e.key.toLowerCase()==='f')document.getElementById('full').click();});
if(scenes.length)run(null);`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{--font-sans:Inter,Arial,sans-serif;--font-mono:'JetBrains Mono',Consolas,monospace}*{box-sizing:border-box}body{margin:0;background:#080808;color:white;font-family:Arial,sans-serif;height:100dvh;display:grid;place-items:center}${studioCss}\n#stage{position:relative;container-type:inline-size;isolation:isolate;overflow:hidden;width:min(100vw,${deck.aspectRatio === '4:3' ? '133.333' : '177.778'}dvh);aspect-ratio:${deck.aspectRatio.replace(':', '/')}}.offline-scene{position:absolute;inset:0}.offline-scene .studio-slide{height:100%}#actor,.export-buddy{position:absolute;z-index:10000;pointer-events:none;padding:.5cqw .7cqw;background:white;color:#111;border:1px solid #222;border-radius:.5cqw;font:1.5cqw/1.05 var(--font-mono);white-space:pre;transform:translate(-35%,-30%)}nav{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center;background:#171717;padding:7px;border:1px solid #555;border-radius:8px;z-index:20000;opacity:0}body:hover nav,nav:focus-within{opacity:1}nav button{background:#fff;color:#111;border:0;border-radius:4px;min-height:32px;padding:4px 12px;cursor:pointer}#counter{font:13px var(--font-mono)}#blackout{position:fixed;inset:0;background:#000;z-index:30000}</style></head><body><main id="stage">${markup}<div id="actor" aria-label="Buddy anime la présentation">${buddyText('work').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div></main><nav aria-label="Navigation du diaporama"><button id="prev" aria-label="Précédent">←</button><span id="counter"></span><button id="next" aria-label="Suivant">→</button><button id="full">Plein écran</button></nav><div id="blackout" hidden></div><script id="deck-data" type="application/json">${data}</script><script>${script}</script></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}
