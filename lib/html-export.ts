import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudioSlide } from '@/components/studio-slide';
import { animationGroups } from './playback';
import type { Deck } from './studio';
import {
  motionSource,
  playbackSource,
  studioCss,
} from './generated/export-assets';

/** A self-contained document. Local image data and the director timeline travel with it. */
export async function exportHtml(deck: Deck): Promise<Blob> {
  const slides = deck.slides.filter((slide) => !slide.hidden);
  const markup = slides
    .map(
      (slide, index) =>
        `<section class="offline-scene" data-index="${index}">${renderToStaticMarkup(createElement(StudioSlide, { slide: { ...slide, elements: slide.elements.map((e) => (e.kind === 'media' ? { ...e, autoplay: false } : e)) }, aspectRatio: deck.aspectRatio, presenting: true, progress: Object.fromEntries(slide.elements.map((e) => [e.id, 0])) }))}</section>`,
    )
    .join('');
  const data = JSON.stringify({
    slides,
    groups: slides.map(animationGroups),
    aspectRatio: deck.aspectRatio,
  }).replaceAll('<', '\\u003c');
  const title = deck.title.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!,
  );
  const script = `${motionSource}\n${playbackSource}\nstartOfflinePresentation({clamp,choreography,transitionFrame,elementFrame,applyElementFrame,keepsEmphasis,needsGlyphLayout,readGlyphs,drawMotion});`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{--font-sans:Inter,Arial,sans-serif;--font-mono:'JetBrains Mono',Consolas,monospace}*{box-sizing:border-box}body{margin:0;background:#080808;color:white;font-family:Arial,sans-serif;height:100dvh;display:grid;place-items:center}${studioCss}\n#stage{position:relative;container-type:inline-size;isolation:isolate;overflow:hidden;width:min(100vw,${deck.aspectRatio === '4:3' ? '133.333' : '177.778'}dvh);aspect-ratio:${deck.aspectRatio.replace(':', '/')}}.offline-scene{position:absolute;inset:0;display:none}.offline-scene:first-child{display:block}.offline-scene .studio-slide{height:100%}nav{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center;background:#171717;padding:7px;border:1px solid #555;border-radius:8px;z-index:20000;opacity:0}body:hover nav,nav:focus-within{opacity:1}nav button{background:#fff;color:#111;border:0;border-radius:4px;min-height:32px;padding:4px 12px;cursor:pointer}#counter{font:13px var(--font-mono)}#blackout{position:fixed;inset:0;background:#000;z-index:30000}</style></head><body><main id="stage">${markup}<canvas id="buddy-motion" class="buddy-motion-layer" aria-label="Buddy anime la présentation"></canvas></main><nav aria-label="Navigation du diaporama"><button id="prev" aria-label="Précédent">←</button><span id="counter"></span><button id="next" aria-label="Suivant">→</button><button id="full">Plein écran</button></nav><div id="blackout" hidden></div><script id="deck-data" type="application/json">${data}</script><script type="module">${script}</script></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}
