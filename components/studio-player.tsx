'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Expand, X, MousePointer2, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudioSlide } from '@/components/studio-slide';
import type { Deck } from '@/lib/studio';
import { animationFrame, groupDuration } from '@/lib/playback';
import { choreography, keepsEmphasis, motionMode, transitionFrame, elementFrame, applyElementFrame, drawMotion, readGlyphs, needsGlyphLayout } from '@/lib/buddy-motion.js';

export type PlaybackState = {
  index: number;
  previousIndex: number | null;
  step: number;
  run: number;
  skip: boolean;
  blackout: boolean;
  laser: boolean;
};

export function StudioPlayer({ deck, state, onNext, onPrevious, onClose, onBusy, controls = true }: {
  deck: Deck;
  state: PlaybackState;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  controls?: boolean;
}) {
  const [clock, setClock] = useState({ run: state.run, elapsed: 0 });
  const elapsed = clock.run === state.run ? clock.elapsed : 0;
  const [pointer, setPointer] = useState({ x: 50, y: 50 });
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  const repaint = useRef<() => void>(() => undefined);
  const glyphCache = useRef(new Map<string, ReturnType<typeof readGlyphs>>());
  const measuredRun = useRef(state.run);
  const slide = deck.slides[state.index];
  const oldSlide = state.previousIndex === null ? null : deck.slides[state.previousIndex];
  const transitionTime = state.step === 0 ? slide.transitionDuration : 0;
  const totalTime = transitionTime + groupDuration(slide, state.step);
  const time = state.skip ? totalTime : elapsed;
  const { progress: rawProgress, active, activeCues } = animationFrame(slide, state.step, Math.max(-1, time - transitionTime));
  const transitioning = time < transitionTime;
  const busy = time < totalTime;
  const direction = state.previousIndex !== null && state.previousIndex > state.index ? -1 : 1;
  const transition = transitionFrame(slide.transition, transitionTime ? time / transitionTime : 1, deck.aspectRatio, direction, !!oldSlide);
  const action = transitioning ? transition.actor.action : active ? motionMode(active.element)==='emphasis'?'met le contenu en évidence':motionMode(active.element)==='exit'?'retire le contenu':'fait apparaître le contenu' : 'vous laisse la parole';

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (state.skip || reduced) {
      onBusy(false);
      const frame = requestAnimationFrame(() => setClock({ run: state.run, elapsed: totalTime }));
      return () => cancelAnimationFrame(frame);
    }
    onBusy(totalTime > 0);
    let frame = 0;
    const start = performance.now();
    function tick(now: number) {
      const value = Math.min(totalTime, now - start);
      setClock({ run: state.run, elapsed: value });
      if (value < totalTime) frame = requestAnimationFrame(tick);
      else onBusy(false);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.run, state.skip, totalTime, onBusy]);

  useEffect(() => { root.current?.focus(); }, []);
  useLayoutEffect(() => {
    if (measuredRun.current !== state.run) { glyphCache.current.clear(); measuredRun.current = state.run; }
    repaint.current = () => {
      const node = stage.current;
      if (!node || !canvas.current) return;
      const frames = [];
      if (transitioning) frames.push(transition);
      const activeIds = new Set(activeCues.map(cue => cue.element.id));
      for (const element of slide.elements) {
        const raw = rawProgress[element.id] ?? (element.animation === 'none' ? 1 : 0);
        const target = node.querySelector('.player-incoming')?.querySelector(`[data-element-id="${CSS.escape(element.id)}"]`);
        if (needsGlyphLayout(element) && !glyphCache.current.has(element.id))
          glyphCache.current.set(element.id, readGlyphs(target, node, element, deck.aspectRatio));
        const frame = elementFrame(element, raw, deck.aspectRatio, glyphCache.current.get(element.id) ?? []);
        applyElementFrame(target, frame);
        if (!transitioning && (activeIds.has(element.id) || (keepsEmphasis(element) && raw > 0))) frames.push(frame);
      }
      const font = getComputedStyle(node).getPropertyValue('--font-mono').trim() || 'monospace';
      drawMotion(canvas.current, frames, deck.aspectRatio, font);
    };
    repaint.current();
  });
  useEffect(() => {
    const refresh = () => { glyphCache.current.clear(); repaint.current(); };
    const observer = new ResizeObserver(refresh);
    if (stage.current) observer.observe(stage.current);
    let mounted = true;
    void document.fonts?.ready.then(() => { if (mounted) refresh(); });
    return () => { mounted = false; observer.disconnect(); };
  }, []);

  return (
    <section ref={root} tabIndex={-1} className="studio-player" aria-label="Présentation" data-theme={deck.theme}>
      <div ref={stage} className="player-stage" data-aspect={deck.aspectRatio}
        style={{ aspectRatio: deck.aspectRatio === '4:3' ? '4 / 3' : '16 / 9' }}
        onPointerMove={(e) => {
          if (state.laser) { const box=e.currentTarget.getBoundingClientRect(); setPointer({ x:(e.clientX-box.left)/box.width*100, y:(e.clientY-box.top)/box.height*100 }); }
        }}>
        {oldSlide && transitioning && <div className="player-scene" style={transition.outgoing} aria-hidden="true"><StudioSlide slide={oldSlide} aspectRatio={deck.aspectRatio} presenting progress={Object.fromEntries(oldSlide.elements.map(element => [element.id, 1]))} /></div>}
        <div className="player-scene player-incoming" style={transitioning ? transition.incoming : {}}>
          <StudioSlide slide={slide} aspectRatio={deck.aspectRatio} presenting progress={rawProgress} activeElementId={active?.element.id} />
        </div>
        <canvas ref={canvas} className="buddy-motion-layer" aria-hidden="true" data-motion-phase={transitioning ? transition.phase : active ? choreography(rawProgress[active.element.id]).phase : 'idle'} />
        {state.laser && <div className="laser-pointer" style={{ left:`${pointer.x}%`, top:`${pointer.y}%` }} />}
      </div>
      {controls && (
        <>
          <div className="player-top">
            <span>
              {state.index + 1} / {deck.slides.length}
            </span>
            <div>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Plein écran"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else
                    void document.documentElement
                      .requestFullscreen()
                      .catch(() => undefined);
                }}
              >
                <Expand />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Quitter"
                onClick={onClose}
              >
                <X />
              </Button>
            </div>
          </div>
          <nav className="player-controls" aria-label="Navigation">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Précédent"
              onClick={onPrevious}
            >
              <ArrowLeft />
            </Button>
            <span>Buddy {action}.</span>
            <Button
              variant="secondary"
              size="icon"
              aria-label={busy ? 'Terminer le mouvement' : 'Suivant'}
              onClick={onNext}
            >
              {busy ? <Pause /> : <ArrowRight />}
            </Button>
          </nav>
          <p className="player-shortcuts">
            <MousePointer2 size={14} /> Flèches · B écran noir · L pointeur ·
            Échap quitter
          </p>
        </>
      )}
      {state.blackout && (
        <div className="player-blackout" aria-label="Écran noir" />
      )}
    </section>
  );
}
