'use client';

import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Download,
  Expand,
  FileUp,
  HelpCircle,
  Maximize2,
  Pause,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

import { Buddy, BuddyLogo, type BuddyState } from '@/components/buddy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type Transition = 'cut' | 'push' | 'wipe' | 'lift';
type TextAnimation = 'instant' | 'type' | 'reveal' | 'steps';
type SlideTone = 'paper' | 'ink' | 'mist';
type SlideLayout = 'headline' | 'statement' | 'split';

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  transition: Transition;
  textAnimation: TextAnimation;
  tone: SlideTone;
  layout: SlideLayout;
  notes: string;
};

type Deck = {
  schemaVersion: 1;
  id: string;
  title: string;
  slides: Slide[];
  updatedAt: string;
};

type EditorSnapshot = {
  deck: Deck;
  activeId: string;
};

type PresentationState = {
  index: number;
  previousIndex: number | null;
  direction: -1 | 1;
  buildStep: number;
  buildRun: number;
  preview: boolean;
  run: number;
};

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: unknown) => unknown;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: WebMcpTool,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const STORAGE_KEY = 'sth-buddy-keynote-v1';

const initialDeck: Deck = {
  schemaVersion: 1,
  id: 'sth-keynote-demo',
  title: 'Le savoir en mouvement',
  updatedAt: '2026-09-04T00:00:00.000Z',
  slides: [
    {
      id: 'opening',
      eyebrow: 'STH KEYNOTE · 2026',
      title: 'Le savoir circule.\nLes équipes avancent.',
      body: 'Une seule source de vérité pour transmettre les pratiques qui font gagner du temps.',
      transition: 'push',
      textAnimation: 'reveal',
      tone: 'paper',
      layout: 'headline',
      notes: 'Marquer une pause après la première phrase. Puis introduire Buddy.',
    },
    {
      id: 'problem',
      eyebrow: 'LE CONSTAT',
      title: 'Le contexte se perd\nentre les outils.',
      body: 'Les décisions, les méthodes et les automatismes restent dispersés. STH les rend transmissibles.',
      transition: 'wipe',
      textAnimation: 'steps',
      tone: 'mist',
      layout: 'statement',
      notes: 'Donner un exemple concret vécu par une équipe produit.',
    },
    {
      id: 'buddy',
      eyebrow: 'BUDDY ENTRE EN SCÈNE',
      title: 'Chaque mouvement\na une intention.',
      body: 'Buddy orchestre les transitions et révèle le texte au rythme de votre discours.',
      transition: 'lift',
      textAnimation: 'type',
      tone: 'ink',
      layout: 'split',
      notes: 'Laisser Buddy terminer son mouvement avant de reprendre.',
    },
  ],
};

const transitionLabels: Record<Transition, string> = {
  cut: 'Buddy coupe',
  push: 'Buddy pousse',
  wipe: 'Buddy balaie',
  lift: 'Buddy soulève',
};

const transitionDescriptions: Record<Transition, string> = {
  cut: 'Un clin d’œil, puis la scène change.',
  push: 'Buddy pousse la nouvelle scène depuis la droite.',
  wipe: 'Buddy traverse l’écran et révèle la scène.',
  lift: 'Buddy soulève la scène depuis le bas.',
};

const animationLabels: Record<TextAnimation, string> = {
  instant: 'Instantané',
  type: 'Buddy écrit',
  reveal: 'Buddy dévoile',
  steps: 'Buddy déroule',
};

const layoutLabels: Record<SlideLayout, string> = {
  headline: 'Titre',
  statement: 'Déclaration',
  split: 'Duo avec Buddy',
};

const toneLabels: Record<SlideTone, string> = {
  paper: 'Papier',
  mist: 'Brume',
  ink: 'Encre',
};

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function sceneDuration(slide: Slide) {
  if (slide.textAnimation === 'type') {
    const titleDuration = Math.min(900, slide.title.length * 18);
    const bodyDuration = Math.min(900, slide.body.length * 12);
    return 620 + titleDuration + 120 + bodyDuration + 100;
  }
  if (slide.textAnimation === 'steps') return 1260;
  if (slide.textAnimation === 'reveal') return 1480;
  return 820;
}

function isValidDeck(value: unknown): value is Deck {
  if (!value || typeof value !== 'object') return false;
  const deck = value as Record<string, unknown>;
  if (
    deck.schemaVersion !== 1 ||
    typeof deck.id !== 'string' ||
    typeof deck.title !== 'string' ||
    typeof deck.updatedAt !== 'string' ||
    !Array.isArray(deck.slides) ||
    deck.slides.length === 0
  ) {
    return false;
  }

  const ids = new Set<string>();
  return deck.slides.every((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const slide = candidate as Record<string, unknown>;
    if (typeof slide.id !== 'string' || ids.has(slide.id)) return false;
    ids.add(slide.id);
    return (
      typeof slide.title === 'string' &&
      slide.title.length <= 120 &&
      typeof slide.body === 'string' &&
      slide.body.length <= 320 &&
      typeof slide.eyebrow === 'string' &&
      slide.eyebrow.length <= 48 &&
      typeof slide.notes === 'string' &&
      slide.notes.length <= 2000 &&
      typeof slide.transition === 'string' &&
      Object.hasOwn(transitionLabels, slide.transition) &&
      typeof slide.textAnimation === 'string' &&
      Object.hasOwn(animationLabels, slide.textAnimation) &&
      typeof slide.tone === 'string' &&
      Object.hasOwn(toneLabels, slide.tone) &&
      typeof slide.layout === 'string' &&
      Object.hasOwn(layoutLabels, slide.layout)
    );
  });
}

function makeSlide(title?: string, body?: string): Slide {
  return {
    id: createId('slide'),
    eyebrow: 'NOUVELLE IDÉE',
    title: title?.trim() || 'Donnez du relief\nà votre message.',
    body: body?.trim() || 'Écrivez ici le point que votre audience doit retenir.',
    transition: 'push',
    textAnimation: 'reveal',
    tone: 'paper',
    layout: 'headline',
    notes: '',
  };
}

function TypedText({
  as,
  text,
  className,
  startAt,
  maxDuration,
}: {
  as: 'p' | 'h2';
  text: string;
  className: string;
  startAt: number;
  maxDuration: number;
}) {
  const Tag = as;
  const characters = Array.from(text);
  const delayPerCharacter = Math.min(
    as === 'h2' ? 18 : 12,
    maxDuration / Math.max(1, characters.length),
  );

  return (
    <Tag className={`${className} typed-sequence`} aria-label={text.replaceAll('\n', ' ')}>
      <span aria-hidden="true">
        {characters.map((character, index) =>
          character === '\n' ? (
            <br key={`break-${index}`} />
          ) : (
            <span
              className="typed-character"
              key={`${character}-${index}`}
              style={
                {
                  '--character-delay': `${startAt + index * delayPerCharacter}ms`,
                } as CSSProperties
              }
            >
              {character}
            </span>
          ),
        )}
      </span>
    </Tag>
  );
}

function SlideSurface({
  slide,
  editable = false,
  presenting = false,
  showBuddy = true,
  buildStep = 1,
  onChange,
  onBeginEdit,
  onEndEdit,
}: {
  slide: Slide;
  editable?: boolean;
  presenting?: boolean;
  showBuddy?: boolean;
  buildStep?: number;
  onChange?: (patch: Partial<Slide>) => void;
  onBeginEdit?: () => void;
  onEndEdit?: () => void;
}) {
  return (
    <article
      className={`slide-surface${presenting ? ' presentation-slide' : ''}`}
      data-tone={slide.tone}
      data-layout={slide.layout}
      data-text-animation={presenting ? slide.textAnimation : undefined}
      data-build-step={presenting ? buildStep : undefined}
    >
      <div className="slide-grid" aria-hidden="true" />
      <div className="slide-copy">
        {editable ? (
          <input
            className="slide-eyebrow-input"
            value={slide.eyebrow}
            onFocus={onBeginEdit}
            onBlur={onEndEdit}
            onChange={(event) => onChange?.({ eyebrow: event.target.value })}
            aria-label="Surtitre de la diapositive"
            maxLength={48}
          />
        ) : presenting && slide.textAnimation === 'type' ? (
          <TypedText
            as="p"
            className="slide-eyebrow"
            text={slide.eyebrow}
            startAt={500}
            maxDuration={160}
          />
        ) : (
          <p className="slide-eyebrow">{slide.eyebrow}</p>
        )}
        {editable ? (
          <textarea
            className="slide-title-input"
            value={slide.title}
            onFocus={onBeginEdit}
            onBlur={onEndEdit}
            onChange={(event) => onChange?.({ title: event.target.value })}
            aria-label="Titre de la diapositive"
            rows={3}
            maxLength={120}
          />
        ) : presenting && slide.textAnimation === 'type' ? (
          <TypedText
            as="h2"
            className="slide-title"
            text={slide.title}
            startAt={620}
            maxDuration={900}
          />
        ) : (
          <h2 className="slide-title">{slide.title}</h2>
        )}
        {editable ? (
          <textarea
            className="slide-body-input"
            value={slide.body}
            onFocus={onBeginEdit}
            onBlur={onEndEdit}
            onChange={(event) => onChange?.({ body: event.target.value })}
            aria-label="Texte de la diapositive"
            rows={3}
            maxLength={320}
          />
        ) : presenting && slide.textAnimation === 'type' ? (
          <TypedText
            as="p"
            className="slide-body"
            text={slide.body}
            startAt={620 + Math.min(900, slide.title.length * 18) + 120}
            maxDuration={900}
          />
        ) : (
          <p className="slide-body">{slide.body}</p>
        )}
      </div>
      {showBuddy ? (
        <div className="slide-buddy-zone" aria-hidden="true">
          <Buddy state="done" className="slide-buddy" />
          {slide.layout === 'split' ? (
            <span className="buddy-prompt">$ buddy stage --ready</span>
          ) : null}
        </div>
      ) : null}
      <span className="slide-brand">Skills Transfer Hub.</span>
    </article>
  );
}

export default function Home() {
  const [deck, setDeck] = useState<Deck>(initialDeck);
  const [activeId, setActiveId] = useState(initialDeck.slides[0].id);
  const [presentation, setPresentation] = useState<PresentationState | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [saveState, setSaveState] = useState<
    'loading' | 'saving' | 'saved' | 'error'
  >('loading');
  const [statusMessage, setStatusMessage] = useState('Présentation prête.');
  const [hydrated, setHydrated] = useState(false);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const editCheckpoint = useRef<EditorSnapshot | null>(null);
  const deckRef = useRef(deck);
  const importInputRef = useRef<HTMLInputElement>(null);
  const presentationRef = useRef<HTMLElement>(null);
  const presentButtonRef = useRef<HTMLButtonElement>(null);

  const activeIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === activeId),
  );
  const activeSlide = deck.slides[activeIndex] ?? deck.slides[0];
  const presentedSlide = presentation ? deck.slides[presentation.index] : null;
  const outgoingSlide =
    presentation?.previousIndex === null || presentation?.previousIndex === undefined
      ? null
      : deck.slides[presentation.previousIndex];
  const transitionLabel = useMemo(
    () => transitionLabels[activeSlide.transition],
    [activeSlide.transition],
  );

  const setDeckDirect = useCallback((updater: (current: Deck) => Deck) => {
    setDeck((current) => {
      const next = updater(current);
      deckRef.current = next;
      return next;
    });
  }, []);

  const commit = useCallback(
    (updater: (current: Deck) => Deck) => {
      setDeckDirect((current) => {
        editCheckpoint.current = null;
        undoStack.current = [
          ...undoStack.current.slice(-39),
          { deck: current, activeId },
        ];
        redoStack.current = [];
        return {
          ...updater(current),
          updatedAt: new Date().toISOString(),
        };
      });
      setHistoryState({ canUndo: true, canRedo: false });
    },
    [activeId, setDeckDirect],
  );

  const checkpoint = useCallback(() => {
    editCheckpoint.current = { deck: deckRef.current, activeId };
  }, [activeId]);

  const finishCheckpoint = useCallback(() => {
    editCheckpoint.current = null;
  }, []);

  const consumeCheckpoint = useCallback(() => {
    const snapshot = editCheckpoint.current;
    if (!snapshot) return;
    editCheckpoint.current = null;
    undoStack.current = [...undoStack.current.slice(-39), snapshot];
    redoStack.current = [];
    setHistoryState({ canUndo: true, canRedo: false });
  }, []);

  const updateSlide = useCallback(
    (slideId: string, patch: Partial<Slide>, record = true) => {
      const updater = (current: Deck) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === slideId ? { ...slide, ...patch } : slide,
        ),
        updatedAt: new Date().toISOString(),
      });
      if (record) commit(updater);
      else {
        consumeCheckpoint();
        setDeckDirect(updater);
      }
    },
    [commit, consumeCheckpoint, setDeckDirect],
  );

  const addSlideFromContent = useCallback(
    (title?: string, body?: string) => {
      const slide = makeSlide(title, body);
      commit((current) => {
        const currentIndex = current.slides.findIndex(
          (item) => item.id === activeId,
        );
        const insertAt = currentIndex < 0 ? current.slides.length : currentIndex + 1;
        const slides = [...current.slides];
        slides.splice(insertAt, 0, slide);
        return { ...current, slides };
      });
      setActiveId(slide.id);
      setStatusMessage('Nouvelle diapositive créée.');
      return slide;
    },
    [activeId, commit],
  );

  const duplicateActive = useCallback(() => {
    const source = deckRef.current.slides.find((slide) => slide.id === activeId);
    if (!source) return;
    const duplicate = { ...source, id: createId('slide') };
    commit((current) => {
      const index = current.slides.findIndex((slide) => slide.id === activeId);
      const slides = [...current.slides];
      slides.splice(index + 1, 0, duplicate);
      return { ...current, slides };
    });
    setActiveId(duplicate.id);
    setStatusMessage('Diapositive dupliquée.');
  }, [activeId, commit]);

  const deleteActive = useCallback(() => {
    const current = deckRef.current;
    if (current.slides.length <= 1) return;
    const index = current.slides.findIndex((slide) => slide.id === activeId);
    const nextActive = current.slides[Math.max(0, index - 1)]?.id;
    commit((deckValue) => ({
      ...deckValue,
      slides: deckValue.slides.filter((slide) => slide.id !== activeId),
    }));
    if (nextActive) setActiveId(nextActive);
    setStatusMessage('Diapositive supprimée.');
  }, [activeId, commit]);

  const moveActive = useCallback(
    (direction: -1 | 1) => {
      const current = deckRef.current;
      const index = current.slides.findIndex((slide) => slide.id === activeId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.slides.length) return;
      commit((deckValue) => {
        const slides = [...deckValue.slides];
        const [moved] = slides.splice(index, 1);
        slides.splice(target, 0, moved);
        return { ...deckValue, slides };
      });
      setStatusMessage(`Diapositive déplacée en position ${target + 1}.`);
    },
    [activeId, commit],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    editCheckpoint.current = null;
    redoStack.current.push({ deck: deckRef.current, activeId });
    deckRef.current = previous.deck;
    setDeck(previous.deck);
    setActiveId(
      previous.deck.slides.some((slide) => slide.id === previous.activeId)
        ? previous.activeId
        : previous.deck.slides[0].id,
    );
    setStatusMessage('Modification annulée.');
    setHistoryState({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    });
  }, [activeId]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    editCheckpoint.current = null;
    undoStack.current.push({ deck: deckRef.current, activeId });
    deckRef.current = next.deck;
    setDeck(next.deck);
    setActiveId(
      next.deck.slides.some((slide) => slide.id === next.activeId)
        ? next.activeId
        : next.deck.slides[0].id,
    );
    setStatusMessage('Modification rétablie.');
    setHistoryState({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    });
  }, [activeId]);

  const startPresentation = useCallback(
    (preview: boolean) => {
      const index = Math.max(
        0,
        deckRef.current.slides.findIndex((slide) => slide.id === activeId),
      );
      setIsAnimating(
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      setPresentation({
        index,
        previousIndex: null,
        direction: 1,
        buildStep: deckRef.current.slides[index].textAnimation === 'steps' ? 0 : 1,
        buildRun: 0,
        preview,
        run: Date.now(),
      });
      setBlackout(false);
      setShowHelp(false);
      if (!preview && document.documentElement.requestFullscreen) {
        void document.documentElement.requestFullscreen().catch(() => {
          setStatusMessage('La présentation reste ouverte sans plein écran.');
        });
      }
    },
    [activeId],
  );

  const closePresentation = useCallback(() => {
    setPresentation(null);
    setBlackout(false);
    setShowHelp(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
    window.setTimeout(() => presentButtonRef.current?.focus(), 0);
  }, []);

  const stepPresentation = useCallback(
    (direction: -1 | 1) => {
      if (!presentation) return;
      if (isAnimating) {
        setIsAnimating(false);
        return;
      }
      const currentSlide = deckRef.current.slides[presentation.index];
      if (
        direction === 1 &&
        currentSlide.textAnimation === 'steps' &&
        presentation.buildStep === 0
      ) {
        setIsAnimating(
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        setPresentation((current) =>
          current
            ? {
                ...current,
                previousIndex: null,
                buildStep: 1,
                buildRun: Date.now(),
              }
            : current,
        );
        return;
      }
      const target = Math.min(
        deckRef.current.slides.length - 1,
        Math.max(0, presentation.index + direction),
      );
      if (target === presentation.index) return;
      setIsAnimating(
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      setPresentation((current) =>
        current
          ? {
              ...current,
              previousIndex: current.index,
              index: target,
              direction,
              buildStep:
                deckRef.current.slides[target].textAnimation === 'steps' ? 0 : 1,
              buildRun: 0,
              run: Date.now(),
            }
          : current,
      );
    },
    [isAnimating, presentation],
  );

  const goToPresentationEdge = useCallback((edge: 'start' | 'end') => {
    const target = edge === 'start' ? 0 : deckRef.current.slides.length - 1;
    setIsAnimating(
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    setPresentation((current) =>
      current
        ? {
            ...current,
            previousIndex: current.index,
            index: target,
            direction: edge === 'start' ? -1 : 1,
            buildStep:
              deckRef.current.slides[target].textAnimation === 'steps' ? 0 : 1,
            buildRun: 0,
            run: Date.now(),
          }
        : current,
    );
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isValidDeck(parsed)) {
          deckRef.current = parsed;
          // oxlint-disable-next-line react/react-compiler -- hydrate once from browser storage
          setDeck(parsed);
          setActiveId(parsed.slides[0].id);
          setStatusMessage('Présentation restaurée depuis ce navigateur.');
        }
      }
      setSaveState('saved');
    } catch {
      setStatusMessage('La sauvegarde locale n’a pas pu être restaurée.');
      setSaveState('error');
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // oxlint-disable-next-line react/react-compiler -- reflects an external storage write
    setSaveState('saving');
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
        setSaveState('saved');
      } catch {
        setSaveState('error');
        setStatusMessage('Sauvegarde locale indisponible. Exportez le fichier pour conserver vos changements.');
      }
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [deck, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    function flushLocalDeck() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deckRef.current));
      } catch {
        // The explicit export remains available if browser storage is blocked.
      }
    }
    window.addEventListener('pagehide', flushLocalDeck);
    return () => window.removeEventListener('pagehide', flushLocalDeck);
  }, [hydrated]);

  useEffect(() => {
    if (presentation) presentationRef.current?.focus();
  }, [presentation]);

  useEffect(() => {
    if (!presentation || !presentedSlide) return;
    // oxlint-disable-next-line react/react-compiler -- restarts the director timeline when the scene changes
    setIsAnimating(true);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setIsAnimating(false);
      return;
    }
    const duration =
      presentedSlide.textAnimation === 'steps' && presentation.buildRun > 0
        ? 620
        : sceneDuration(presentedSlide);
    const timeout = window.setTimeout(() => setIsAnimating(false), duration);
    return () => window.clearTimeout(timeout);
  }, [presentation, presentedSlide]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextInputTarget(event.target)) return;

      if (presentation) {
        const isButtonActivation =
          event.target instanceof HTMLElement &&
          Boolean(event.target.closest('button, a')) &&
          (event.key === ' ' || event.key === 'Enter');
        if (isButtonActivation) return;
        if (event.key === 'Escape') {
          if (showHelp) setShowHelp(false);
          else closePresentation();
          return;
        }
        if (showHelp) return;
        if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) {
          event.preventDefault();
          stepPresentation(1);
          return;
        }
        if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
          event.preventDefault();
          stepPresentation(-1);
          return;
        }
        if (event.key === 'Home') goToPresentationEdge('start');
        if (event.key === 'End') goToPresentationEdge('end');
        if (event.key.toLowerCase() === 'b') setBlackout((value) => !value);
        if (event.key.toLowerCase() === 'f') toggleFullscreen();
        if (event.key === '?') setShowHelp((value) => !value);
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateActive();
      }
      if (modifier && event.key === 'Enter') {
        event.preventDefault();
        startPresentation(false);
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1);
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    closePresentation,
    duplicateActive,
    goToPresentationEdge,
    moveActive,
    presentation,
    redo,
    showHelp,
    startPresentation,
    stepPresentation,
    toggleFullscreen,
    undo,
  ]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };

    const register = (tool: WebMcpTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, options)).catch(() => undefined);
      } catch {
        // Browsers without the proposed WebMCP implementation keep the visible UI.
      }
    };

    register({
      name: 'get_buddy_keynote',
      title: 'Lire la présentation Buddy',
      description: 'Retourne le titre, le nombre de diapositives et leur ordre actuel.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        const current = deckRef.current;
        return {
          title: current.title,
          slideCount: current.slides.length,
          slides: current.slides.map((slide, index) => ({
            index: index + 1,
            id: slide.id,
            title: slide.title,
            transition: slide.transition,
            textAnimation: slide.textAnimation,
          })),
        };
      },
    });

    register({
      name: 'create_buddy_slide',
      title: 'Créer une diapositive Buddy',
      description: 'Ajoute une diapositive après la sélection actuelle et l’ouvre dans l’éditeur.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          body: { type: 'string', maxLength: 320 },
        },
        required: ['title'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== 'object') {
          throw new Error('Un titre est requis.');
        }
        const value = input as { title?: unknown; body?: unknown };
        if (
          typeof value.title !== 'string' ||
          value.title.trim().length === 0 ||
          value.title.length > 120
        ) {
          throw new Error('Le titre doit contenir entre 1 et 120 caractères.');
        }
        if (value.body !== undefined && typeof value.body !== 'string') {
          throw new Error('Le texte doit être une chaîne de caractères.');
        }
        const slide = addSlideFromContent(
          value.title,
          typeof value.body === 'string' ? value.body : undefined,
        );
        return { id: slide.id, title: slide.title, status: 'created' };
      },
    });

    return () => lifecycle.abort();
  }, [addSlideFromContent]);

  function updateActive(patch: Partial<Slide>, record = true) {
    updateSlide(activeSlide.id, patch, record);
  }

  function exportDeck() {
    const blob = new Blob([JSON.stringify(deckRef.current, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${deckRef.current.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'buddy-keynote'}.buddydeck.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Présentation exportée.');
  }

  async function importDeck(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isValidDeck(parsed)) throw new Error('Format non reconnu');
      commit(() => ({ ...parsed, updatedAt: new Date().toISOString() }));
      setActiveId(parsed.slides[0].id);
      setStatusMessage('Présentation importée.');
    } catch {
      setStatusMessage('Import impossible : fichier Buddy invalide.');
    }
  }

  function handleDeckTitleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  const directorState: BuddyState = isAnimating ? 'work' : 'done';

  return (
    <main className="keynote-app">
      <header
        className="app-toolbar"
        inert={presentation ? true : undefined}
        aria-hidden={presentation ? true : undefined}
      >
        <div className="brand-lockup">
          <BuddyLogo />
          <div>
            <strong>Buddy Keynote</strong>
            <span>Skills Transfer Hub</span>
          </div>
        </div>

        <div className="deck-title-field">
          <Input
            value={deck.title}
            onFocus={checkpoint}
            onBlur={finishCheckpoint}
            onKeyDown={handleDeckTitleKeyDown}
            onChange={(event) => {
              consumeCheckpoint();
              setDeckDirect((current) => ({
                ...current,
                title: event.target.value,
                updatedAt: new Date().toISOString(),
              }));
            }}
            aria-label="Titre de la présentation"
            maxLength={80}
          />
          <span>
            {saveState === 'loading'
              ? 'Chargement…'
              : saveState === 'saving'
                ? 'Enregistrement…'
                : saveState === 'error'
                  ? 'Sauvegarde indisponible · export conseillé'
                  : 'Enregistré dans ce navigateur'}
          </span>
        </div>

        <div className="toolbar-actions">
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept=".json,.buddydeck"
            onChange={importDeck}
            aria-label="Importer une présentation Buddy"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Importer"
            title="Importer"
            onClick={() => importInputRef.current?.click()}
          >
            <FileUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Exporter"
            title="Exporter"
            onClick={exportDeck}
          >
            <Download />
          </Button>
          <span className="toolbar-separator" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Annuler"
            title="Annuler (⌘Z)"
            disabled={!historyState.canUndo}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rétablir"
            title="Rétablir (⇧⌘Z)"
            disabled={!historyState.canRedo}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <span className="toolbar-separator" />
          <Button variant="outline" onClick={() => startPresentation(true)}>
            <Maximize2 data-icon="inline-start" />
            Aperçu
          </Button>
          <Button ref={presentButtonRef} onClick={() => startPresentation(false)}>
            <Play data-icon="inline-start" />
            Présenter
          </Button>
        </div>
      </header>

      <div
        className="editor-grid"
        inert={presentation ? true : undefined}
        aria-hidden={presentation ? true : undefined}
      >
        <aside className="slides-panel" aria-label="Diapositives">
          <div className="panel-heading">
            <div>
              <span className="eyebrow-label">DIAPOSITIVES</span>
              <strong>{deck.slides.length} scènes</strong>
            </div>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => addSlideFromContent()}
              aria-label="Ajouter une diapositive"
            >
              <Plus />
            </Button>
          </div>

          <div className="slide-list">
            {deck.slides.map((slide, index) => (
              <button
                type="button"
                className="slide-thumbnail"
                data-active={slide.id === activeId || undefined}
                key={slide.id}
                onClick={() => setActiveId(slide.id)}
                aria-label={`Diapositive ${index + 1} : ${slide.title.replace('\n', ' ')}`}
                aria-current={slide.id === activeId ? 'true' : undefined}
              >
                <span className="slide-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="thumbnail-frame">
                  <SlideSurface slide={slide} />
                </span>
              </button>
            ))}
          </div>

          <Button className="add-slide-button" variant="ghost" onClick={() => addSlideFromContent()}>
            <Plus data-icon="inline-start" />
            Nouvelle diapositive
          </Button>
        </aside>

        <section className="stage-panel" aria-label="Zone d’édition">
          <div className="stage-meta">
            <span>
              Scène {activeIndex + 1} sur {deck.slides.length}
            </span>
            <span className="stage-status">
              <span className="status-dot" />
              {transitionLabel}
            </span>
          </div>
          <div className="canvas-wrap">
            <SlideSurface
              slide={activeSlide}
              editable
              onBeginEdit={checkpoint}
              onEndEdit={finishCheckpoint}
              onChange={(patch) => updateActive(patch, false)}
            />
          </div>
          <div className="canvas-toolbar" aria-label="Actions de la diapositive">
            <Button size="sm" variant="ghost" onClick={() => startPresentation(true)}>
              <Sparkles data-icon="inline-start" />
              Animer avec Buddy
            </Button>
            <span />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Déplacer vers le haut"
              title="Déplacer vers le haut (⌥↑)"
              disabled={activeIndex === 0}
              onClick={() => moveActive(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Déplacer vers le bas"
              title="Déplacer vers le bas (⌥↓)"
              disabled={activeIndex === deck.slides.length - 1}
              onClick={() => moveActive(1)}
            >
              <ArrowDown />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Dupliquer la diapositive"
              title="Dupliquer (⌘D)"
              onClick={duplicateActive}
            >
              <Copy />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Supprimer la diapositive"
              title="Supprimer"
              disabled={deck.slides.length === 1}
              onClick={deleteActive}
            >
              <Trash2 />
            </Button>
          </div>
        </section>

        <aside className="inspector-panel" aria-label="Réglages">
          <Tabs defaultValue="scene" className="inspector-tabs">
            <TabsList variant="line">
              <TabsTrigger value="scene">Mise en scène</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="scene">
              <section className="inspector-section buddy-director-card">
                <div className="director-copy">
                  <span className="eyebrow-label">BUDDY DIRECTOR</span>
                  <strong>{transitionLabel}</strong>
                  <p>{transitionDescriptions[activeSlide.transition]}</p>
                </div>
                <Buddy state="done" caption="Prêt pour la scène." />
              </section>

              <section className="inspector-section form-stack">
                <div className="field">
                  <span id="layout-label">Composition</span>
                  <Select
                    value={activeSlide.layout}
                    onValueChange={(value) =>
                      value && updateActive({ layout: value as SlideLayout })
                    }
                  >
                    <SelectTrigger className="w-full" aria-labelledby="layout-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(layoutLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="inspector-section">
                <div className="section-title">
                  <strong>Fond</strong>
                  <span>Diapositive entière</span>
                </div>
                <fieldset className="tone-picker">
                  <legend className="sr-only">Fond de la diapositive</legend>
                  {(['paper', 'mist', 'ink'] as const).map((tone) => (
                    <button
                      type="button"
                      key={tone}
                      data-tone={tone}
                      data-active={activeSlide.tone === tone || undefined}
                      onClick={() => updateActive({ tone })}
                      aria-label={toneLabels[tone]}
                      title={toneLabels[tone]}
                    >
                      <span>{toneLabels[tone]}</span>
                    </button>
                  ))}
                </fieldset>
              </section>

              <section className="inspector-section form-stack">
                <div className="field">
                  <span id="transition-label">Transition</span>
                  <Select
                    value={activeSlide.transition}
                    onValueChange={(value) =>
                      value && updateActive({ transition: value as Transition })
                    }
                  >
                    <SelectTrigger className="w-full" aria-labelledby="transition-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(transitionLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="field">
                  <span id="animation-label">Animation du texte</span>
                  <Select
                    value={activeSlide.textAnimation}
                    onValueChange={(value) =>
                      value && updateActive({ textAnimation: value as TextAnimation })
                    }
                  >
                    <SelectTrigger className="w-full" aria-labelledby="animation-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(animationLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <Button className="preview-transition" variant="outline" onClick={() => startPresentation(true)}>
                <Play data-icon="inline-start" />
                Jouer la scène
              </Button>
            </TabsContent>

            <TabsContent value="notes">
              <section className="inspector-section form-stack">
                <label htmlFor="speaker-notes">Notes de l’orateur</label>
                  <Textarea
                    id="speaker-notes"
                    value={activeSlide.notes}
                    onFocus={checkpoint}
                    onBlur={finishCheckpoint}
                    onChange={(event) => updateActive({ notes: event.target.value }, false)}
                    placeholder="Ce que vous souhaitez dire, sans l’afficher au public."
                    rows={8}
                    maxLength={2000}
                  />
                <p className="notes-hint">Les notes restent invisibles pendant la présentation.</p>
              </section>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <output className="app-status sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </output>

      {presentation && presentedSlide ? (
        <section
          ref={presentationRef}
          tabIndex={-1}
          className="presentation-mode"
          data-preview={presentation.preview || undefined}
          aria-label="Mode présentation"
        >
          <div
            className="presentation-stage"
            data-skip-animation={!isAnimating || undefined}
          >
            {outgoingSlide ? (
              <div
                key={`out-${presentation.run}`}
                className="presentation-frame presentation-frame-outgoing"
                data-transition={presentedSlide.transition}
                data-direction={presentation.direction}
                aria-hidden="true"
              >
                <SlideSurface slide={outgoingSlide} showBuddy={false} />
              </div>
            ) : null}
            <div
              key={`in-${presentation.index}-${presentation.run}`}
              className="presentation-frame presentation-frame-incoming"
              data-transition={presentedSlide.transition}
              data-direction={presentation.direction}
            >
              <SlideSurface
                slide={presentedSlide}
                presenting
                showBuddy={false}
                buildStep={presentation.buildStep}
              />
            </div>
            <div
              key={`buddy-${presentation.run}-${presentation.buildRun}`}
              className="director-buddy"
              data-transition={presentedSlide.transition}
              data-direction={presentation.direction}
              data-build={presentation.buildRun > 0 || undefined}
            >
              <Buddy
                state={directorState}
                ariaLabel={isAnimating ? 'Buddy met la scène en place.' : 'Buddy a terminé la scène.'}
              />
              <span className="director-line" />
            </div>
          </div>

          <div className="presentation-progress" aria-hidden="true">
            <span
              style={{
                width: `${((presentation.index + 1) / deck.slides.length) * 100}%`,
              }}
            />
          </div>

          <div className="presentation-topbar">
            <span className="presentation-count">
              {String(presentation.index + 1).padStart(2, '0')} /{' '}
              {String(deck.slides.length).padStart(2, '0')}
            </span>
            <div>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Aide clavier"
                title="Aide clavier (?)"
                onClick={() => setShowHelp(true)}
              >
                <HelpCircle />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Plein écran"
                title="Plein écran (F)"
                onClick={toggleFullscreen}
              >
                <Expand />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Quitter la présentation"
                title="Quitter (Échap)"
                onClick={closePresentation}
              >
                <X />
              </Button>
            </div>
          </div>

          <nav className="presentation-controls" aria-label="Navigation de la présentation">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Diapositive précédente"
              disabled={presentation.index === 0}
              onClick={() => stepPresentation(-1)}
            >
              <ArrowLeft />
            </Button>
            <div className="presentation-director-status">
              <Buddy
                state={directorState}
                ariaLabel={isAnimating ? 'Buddy met la scène en place.' : 'Buddy attend la suite.'}
              />
              <div>
                <span className="eyebrow-label">BUDDY DIRECTOR</span>
                <strong>{isAnimating ? 'Mise en scène…' : 'À vous de parler.'}</strong>
              </div>
            </div>
            <Button
              variant="secondary"
              size="icon"
              aria-label={isAnimating ? 'Terminer l’animation' : 'Diapositive suivante'}
              disabled={!isAnimating && presentation.index === deck.slides.length - 1}
              onClick={() => stepPresentation(1)}
            >
              {isAnimating ? <Pause /> : <ArrowRight />}
            </Button>
          </nav>

          <p className="sr-only" aria-live="polite">
            Diapositive {presentation.index + 1} sur {deck.slides.length}.{' '}
            {presentedSlide.title.replace('\n', ' ')}
          </p>

          {blackout ? (
            <button
              type="button"
              className="blackout-screen"
              onClick={() => setBlackout(false)}
              aria-label="Quitter l’écran noir"
            >
              <span>B pour reprendre</span>
            </button>
          ) : null}

          {showHelp ? (
            <div className="keyboard-help-backdrop">
              <dialog
                open
                className="keyboard-help"
                aria-labelledby="keyboard-help-title"
              >
                <div className="keyboard-help-heading">
                  <div>
                    <span className="eyebrow-label">MODE SCÈNE</span>
                    <h2 id="keyboard-help-title">Raccourcis de présentation</h2>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Fermer l’aide" onClick={() => setShowHelp(false)}>
                    <X />
                  </Button>
                </div>
                <dl>
                  <div><dt>Espace · →</dt><dd>Terminer l’animation, puis avancer</dd></div>
                  <div><dt>←</dt><dd>Revenir à la scène précédente</dd></div>
                  <div><dt>B</dt><dd>Afficher ou quitter l’écran noir</dd></div>
                  <div><dt>F</dt><dd>Basculer en plein écran</dd></div>
                  <div><dt>Échap</dt><dd>Revenir à l’éditeur</dd></div>
                </dl>
              </dialog>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
