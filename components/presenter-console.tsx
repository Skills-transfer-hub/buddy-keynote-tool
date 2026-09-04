'use client';

import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  EyeOff,
  Grid3X3,
  RotateCcw,
  StickyNote,
  X,
} from 'lucide-react';

import { StudioSlide } from '@/components/studio-slide';
import { Button } from '@/components/ui/button';
import type { Deck, Slide } from '@/lib/studio';
import { animationGroups, nextVisibleIndex } from '@/lib/playback';

export type PresenterConsoleProps = {
  deck: Deck;
  currentIndex: number;
  buildStep: number;
  elapsedSeconds: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  onResetTimer: () => void;
};

function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

function findNextVisibleSlide(slides: readonly Slide[], currentIndex: number) {
  for (let index = currentIndex + 1; index < slides.length; index += 1) {
    if (!slides[index]?.hidden) return slides[index];
  }
  return undefined;
}

export function PresenterConsole({
  deck,
  currentIndex,
  buildStep,
  elapsedSeconds,
  onClose,
  onPrevious,
  onNext,
  onGoTo,
  onResetTimer,
}: PresenterConsoleProps) {
  const hasSlides = deck.slides.length > 0;
  const safeIndex = hasSlides
    ? Math.min(Math.max(currentIndex, 0), deck.slides.length - 1)
    : 0;
  const currentSlide = deck.slides[safeIndex];
  const nextSlide = findNextVisibleSlide(deck.slides, safeIndex);
  const atFirstSlide =
    buildStep === 0 && nextVisibleIndex(deck.slides, safeIndex, -1) === null;
  const atLastSlide =
    !nextSlide && buildStep >= animationGroups(currentSlide).length - 1;
  const elapsedLabel = formatElapsedTime(elapsedSeconds);

  return (
    <dialog
      aria-label="Régie de présentation"
      aria-modal="true"
      className="dark fixed inset-0 z-[100] m-0 flex h-dvh min-h-0 w-screen max-h-none max-w-none flex-col overflow-hidden border-0 bg-[#090a0b] p-0 text-zinc-50"
      open
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-black/30 px-5">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
            Régie Buddy
          </p>
          <h1 className="truncate text-sm font-semibold text-zinc-100">
            {deck.title}
          </h1>
        </div>

        <div className="flex items-center gap-2" aria-label="Chronomètre">
          <Clock3 aria-hidden="true" className="size-4 text-zinc-400" />
          <output
            aria-label={`Temps écoulé : ${elapsedLabel}`}
            className="min-w-[5.5rem] font-mono text-xl font-semibold tabular-nums text-white"
          >
            {elapsedLabel}
          </output>
          <Button
            aria-label="Réinitialiser le chronomètre"
            className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
            onClick={onResetTimer}
            size="icon-sm"
            title="Réinitialiser le chronomètre"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>

        <Button
          aria-label="Quitter la régie"
          className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          variant="outline"
        >
          <X aria-hidden="true" />
          Quitter
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,0.82fr)] xl:overflow-hidden">
        <main
          aria-labelledby="current-slide-heading"
          className="flex min-h-0 flex-col gap-2"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <h2
              className="font-mono font-semibold tracking-[0.14em] uppercase"
              id="current-slide-heading"
            >
              À l’écran
            </h2>
            <span>
              {hasSlides ? safeIndex + 1 : 0} / {deck.slides.length}
            </span>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black p-3 shadow-2xl shadow-black/50"
            style={{ containerType: 'size' }}
          >
            {currentSlide ? (
              <div
                className="overflow-hidden rounded-md"
                style={{
                  width: `min(100cqw, ${deck.aspectRatio === '4:3' ? 133.333 : 177.778}cqh)`,
                }}
              >
                <StudioSlide
                  aspectRatio={deck.aspectRatio}
                  slide={currentSlide}
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Aucune slide à présenter.</p>
            )}
          </div>
        </main>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(8rem,1fr)_minmax(8rem,1fr)] gap-4 xl:overflow-hidden">
          <section aria-labelledby="next-slide-heading" className="min-h-0">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <h2
                className="font-mono font-semibold tracking-[0.14em] uppercase"
                id="next-slide-heading"
              >
                Ensuite
              </h2>
              {nextSlide ? (
                <span className="truncate pl-3">{nextSlide.name}</span>
              ) : null}
            </div>
            <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/70 p-2">
              {nextSlide ? (
                <div className="w-full overflow-hidden rounded">
                  <StudioSlide
                    aspectRatio={deck.aspectRatio}
                    slide={nextSlide}
                  />
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Fin de la présentation</p>
              )}
            </div>
          </section>

          <section
            aria-labelledby="speaker-notes-heading"
            className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.035]"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <StickyNote aria-hidden="true" className="size-4 text-zinc-400" />
              <h2
                className="text-xs font-semibold text-zinc-300"
                id="speaker-notes-heading"
              >
                Notes de l’orateur
              </h2>
            </div>
            <div
              aria-live="polite"
              className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-zinc-200"
            >
              {currentSlide?.notes.trim() || (
                <span className="text-zinc-500">
                  Aucune note pour cette slide.
                </span>
              )}
            </div>
          </section>

          <nav
            aria-labelledby="slide-navigation-heading"
            className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.035]"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Grid3X3 aria-hidden="true" className="size-4 text-zinc-400" />
              <h2
                className="text-xs font-semibold text-zinc-300"
                id="slide-navigation-heading"
              >
                Navigation
              </h2>
            </div>
            <div className="grid min-h-0 grid-cols-5 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-8 xl:grid-cols-5">
              {deck.slides.map((slide, index) => {
                const isCurrent = index === safeIndex;
                const slideLabel = `Aller à la slide ${index + 1} : ${slide.name}${
                  slide.hidden ? ' (masquée)' : ''
                }`;

                return (
                  <button
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={slideLabel}
                    className={`relative flex aspect-square min-w-0 items-center justify-center rounded-lg border font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                      isCurrent
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-black/30 text-zinc-300 hover:border-white/30 hover:bg-white/10'
                    } ${slide.hidden ? 'opacity-45' : ''}`}
                    key={slide.id}
                    onClick={() => onGoTo(index)}
                    title={slideLabel}
                    type="button"
                  >
                    {index + 1}
                    {slide.hidden ? (
                      <EyeOff
                        aria-hidden="true"
                        className="absolute right-1 bottom-1 size-2.5"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-5 py-3">
        <Button
          className="min-w-32 border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white"
          disabled={atFirstSlide}
          onClick={onPrevious}
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" />
          Précédente
        </Button>
        <Button
          className="min-w-32 bg-white text-black hover:bg-zinc-200"
          disabled={atLastSlide}
          onClick={onNext}
        >
          Suivante
          <ChevronRight aria-hidden="true" />
        </Button>
      </footer>
    </dialog>
  );
}
