'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Expand,
  X,
  Pencil,
  MoveRight,
  ArrowUp,
  Eraser,
  MousePointer2,
  Pause,
} from 'lucide-react';
import { Buddy } from '@/components/buddy';
import { Button } from '@/components/ui/button';
import { StudioSlide } from '@/components/studio-slide';
import type { Deck, SlideElement } from '@/lib/studio';
import { animationFrame, easeProgress, groupDuration } from '@/lib/playback';

export type PlaybackState = {
  index: number;
  previousIndex: number | null;
  step: number;
  run: number;
  skip: boolean;
  blackout: boolean;
  laser: boolean;
};

// When cues start together, each action retains a visible Buddy at its object.
function ParallelBuddy({
  element,
  progress,
  stage,
}: {
  element: SlideElement;
  progress: number;
  stage: RefObject<HTMLDivElement | null>;
}) {
  const actor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (element.animation !== 'type' || !stage.current || !actor.current)
      return;
    const characters = stage.current
      .querySelector(`[data-element-id="${CSS.escape(element.id)}"]`)
      ?.querySelectorAll<HTMLElement>('[data-char-index]');
    if (!characters?.length) return;
    const index = Math.min(
      characters.length - 1,
      Math.max(0, Math.floor(progress * characters.length) - 1),
    );
    const rect = characters[index].getBoundingClientRect();
    const bounds = stage.current.getBoundingClientRect();
    actor.current.style.left = `${Math.max(4, Math.min(94, ((rect.right - bounds.left) / bounds.width) * 100))}%`;
    actor.current.style.top = `${Math.max(4, Math.min(86, ((rect.bottom - bounds.top) / bounds.height) * 100))}%`;
  }, [element, progress, stage]);
  const x =
    element.animation === 'rise'
      ? element.x + element.w / 2
      : element.x +
        element.w * (element.animation === 'exit' ? 1 - progress : progress);
  const y =
    element.y +
    element.h +
    (element.animation === 'rise'
      ? (1 - progress) * 8
      : element.animation === 'exit'
        ? -element.h / 2
        : 0);
  return (
    <div
      ref={actor}
      className="buddy-actor"
      data-active="true"
      style={{
        left: `${Math.max(4, Math.min(93, x))}%`,
        top: `${Math.max(4, Math.min(88, y))}%`,
      }}
      aria-label="Buddy anime cet objet"
    >
      <div className="buddy-tool">
        {element.animation === 'exit' ? <Eraser /> : <Pencil />}
      </div>
      <Buddy state="work" ariaLabel="Buddy anime cet objet" />
    </div>
  );
}

export function StudioPlayer({
  deck,
  state,
  onNext,
  onPrevious,
  onClose,
  onBusy,
  controls = true,
}: {
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
  const actor = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const slide = deck.slides[state.index];
  const oldSlide =
    state.previousIndex === null ? null : deck.slides[state.previousIndex];
  const transitionTime = state.step === 0 ? slide.transitionDuration : 0;
  const totalTime = transitionTime + groupDuration(slide, state.step);
  const time = state.skip ? totalTime : elapsed;
  const sceneProgress = transitionTime
    ? easeProgress(time / transitionTime)
    : 1;
  const { progress, active, activeCues } = animationFrame(
    slide,
    state.step,
    Math.max(-1, time - transitionTime),
  );
  const transitioning = time < transitionTime;
  const busy = time < totalTime;
  const direction =
    state.previousIndex !== null && state.previousIndex > state.index ? -1 : 1;

  useEffect(() => {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (state.skip || reduced) {
      onBusy(false);
      const frame = requestAnimationFrame(() =>
        setClock({ run: state.run, elapsed: totalTime }),
      );
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

  useEffect(() => {
    root.current?.focus();
  }, []);

  // The mascot follows the actual text caret, including wrapped lines.
  useLayoutEffect(() => {
    if (
      !active ||
      transitioning ||
      active.element.animation !== 'type' ||
      !stage.current ||
      !actor.current
    )
      return;
    const element = active.element;
    const target = stage.current.querySelector(
      `[data-element-id="${CSS.escape(element.id)}"]`,
    );
    const characters =
      target?.querySelectorAll<HTMLElement>('[data-char-index]');
    if (!characters?.length) return;
    const index = Math.min(
      characters.length - 1,
      Math.max(0, Math.floor(progress[element.id] * characters.length) - 1),
    );
    const rect = characters[index].getBoundingClientRect();
    const bounds = stage.current.getBoundingClientRect();
    actor.current.style.left = `${Math.max(4, Math.min(94, ((rect.right - bounds.left) / bounds.width) * 100))}%`;
    actor.current.style.top = `${Math.max(4, Math.min(86, ((rect.bottom - bounds.top) / bounds.height) * 100))}%`;
  }, [active, progress, transitioning]);

  let incoming: CSSProperties = {};
  let outgoing: CSSProperties = {};
  let x = 91,
    y = 88;
  const p = sceneProgress;
  if (transitioning) {
    if (slide.transition === 'push') {
      incoming = { transform: `translateX(${direction * (1 - p) * 100}%)` };
      outgoing = { transform: `translateX(${-direction * p * 100}%)` };
      x = direction === 1 ? 100 * (1 - p) : 100 * p;
      y = 56;
    } else if (slide.transition === 'wipe') {
      incoming = { clipPath: `inset(0 ${100 * (1 - p)}% 0 0)` };
      x = p * 100;
      y = 56;
    } else if (slide.transition === 'lift') {
      incoming = { transform: `translateY(${(1 - p) * 100}%)` };
      outgoing = { transform: `translateY(${-p * 100}%)` };
      x = 50;
      y = (1 - p) * 100;
    } else if (slide.transition === 'zoom') {
      incoming = { clipPath: `circle(${p * 145}% at 50% 50%)` };
      x = Math.min(92, 50 + p * 45);
      y = 50;
    } else if (slide.transition === 'dissolve') {
      incoming = { opacity: p };
      outgoing = { opacity: 1 - p };
      x = 10 + p * 80;
      y = 84;
    } else {
      incoming = { clipPath: `inset(0 0 ${100 * (1 - p)}% 0)` };
      x = 50;
      y = p * 100;
    }
  } else if (active) {
    const e = active.element;
    const ep = progress[e.id];
    x = e.x + ep * e.w;
    y = e.y + e.h;
    if (e.animation === 'rise') {
      x = e.x + e.w / 2;
      y = e.y + e.h + (1 - ep) * 8;
    }
    if (e.animation === 'exit') {
      x = e.x + e.w * (1 - ep);
      y = e.y + e.h / 2;
    }
  }
  const action = transitioning
    ? {
        push: 'pousse la scène',
        wipe: 'tire le rideau',
        lift: 'soulève la scène',
        cut: 'déroule la scène',
        dissolve: 'éclaire la scène',
        zoom: 'ouvre la scène',
      }[slide.transition]
    : active
      ? {
          type: 'écrit le texte',
          reveal: 'dévoile le contenu',
          rise: 'apporte le contenu',
          emphasis: 'souligne le message',
          exit: 'efface le contenu',
          none: 'attend',
        }[active.element.animation]
      : 'vous laisse la parole';
  const Tool = transitioning
    ? slide.transition === 'lift'
      ? ArrowUp
      : MoveRight
    : active?.element.animation === 'exit'
      ? Eraser
      : Pencil;

  return (
    <section
      ref={root}
      tabIndex={-1}
      className="studio-player"
      aria-label="Présentation"
      data-theme={deck.theme}
    >
      <div
        ref={stage}
        className="player-stage"
        data-aspect={deck.aspectRatio}
        style={{ aspectRatio: deck.aspectRatio === '4:3' ? '4 / 3' : '16 / 9' }}
        onPointerMove={(e) => {
          if (state.laser) {
            const box = e.currentTarget.getBoundingClientRect();
            setPointer({
              x: ((e.clientX - box.left) / box.width) * 100,
              y: ((e.clientY - box.top) / box.height) * 100,
            });
          }
        }}
      >
        {oldSlide && transitioning && (
          <div className="player-scene" style={outgoing} aria-hidden="true">
            <StudioSlide slide={oldSlide} aspectRatio={deck.aspectRatio} />
          </div>
        )}
        <div className="player-scene player-incoming" style={incoming}>
          <StudioSlide
            slide={slide}
            aspectRatio={deck.aspectRatio}
            presenting
            progress={progress}
            activeElementId={active?.element.id}
          />
        </div>
        {transitioning && slide.transition === 'wipe' && (
          <div className="buddy-curtain-edge" style={{ left: `${p * 100}%` }} />
        )}
        {active?.element.animation === 'emphasis' && (
          <div
            className="buddy-underline"
            style={{
              left: `${active.element.x}%`,
              top: `${active.element.y + active.element.h}%`,
              width: `${active.element.w * progress[active.element.id]}%`,
            }}
          />
        )}
        {!transitioning &&
          activeCues
            .filter((cue) => cue !== active)
            .map((cue) => (
              <ParallelBuddy
                key={cue.element.id}
                element={cue.element}
                progress={progress[cue.element.id]}
                stage={stage}
              />
            ))}
        <div
          ref={actor}
          className="buddy-actor"
          data-active={busy}
          style={{
            left: `${Math.max(4, Math.min(93, x))}%`,
            top: `${Math.max(4, Math.min(88, y))}%`,
          }}
          aria-label={`Buddy ${action}.`}
        >
          <div className="buddy-tool">
            <Tool />
          </div>
          <Buddy
            state={busy ? 'work' : 'done'}
            ariaLabel={`Buddy ${action}.`}
          />
        </div>
        {state.laser && (
          <div
            className="laser-pointer"
            style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}
          />
        )}
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
