'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Braces,
  ChartNoAxesColumn,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  FolderOpen,
  Grid3X3,
  Group,
  ImagePlus,
  Layers,
  Lock,
  Monitor,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  Shapes,
  Sparkles,
  StickyNote,
  Table2,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Unlock,
  Video,
  ZoomIn,
  ZoomOut,
  Printer,
  Users,
} from 'lucide-react';
import { Buddy, BuddyLogo } from '@/components/buddy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { StudioSlide } from '@/components/studio-slide';
import {
  StudioInspector,
  Choice,
  NumberField,
  ToggleField,
} from '@/components/studio-inspector';
import { StudioPlayer, type PlaybackState } from '@/components/studio-player';
import { PresenterConsole } from '@/components/presenter-console';
import { StudioWebMcp } from '@/components/studio-webmcp';
import {
  initialDeck,
  makeElement,
  makeSlide,
  createId,
  migrateDeck,
  elementLabels,
  animationLabels,
  animationModeLabels, animationScopeLabels, animationModeFor, animationOptions,
  animationTriggerLabels,
  transitionLabels,
  transitionDescriptions,
  animationDescriptions,
  transitionDurations,
  animationDurationFor,
  themeLabels,
  aspectRatioLabels,
  type Deck,
  type Slide,
  type SlideElement,
  type SlideElementKind,
  type DeckTheme,
} from '@/lib/studio';
import { animationGroups, nextVisibleIndex } from '@/lib/playback';
import {
  listLocalDecks,
  restoreLocalDeck,
  saveLocalDeck,
} from '@/lib/local-decks';

import { SharedProjectDialog } from '@/components/shared-project-dialog';
import { SharedSession, createShared, connectionFromUrl, type SharedConnection, type SharedState } from '@/lib/shared/client';
import { listShared, type CachedShared } from '@/lib/shared/cache';

type Snapshot = { deck: Deck; activeId: string; selected: string[] };
type AudienceMessage =
  | { type: 'snapshot'; deck: Deck; playback: PlaybackState | null }
  | { type: 'busy'; busy: boolean; run: number }
  | { type: 'ready' | 'next' | 'previous' | 'close' | 'blackout' | 'laser' };
const isInput = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(
    target.closest(
      'input,textarea,select,[contenteditable=true],[role=dialog]',
    ),
  );
const copy = <T,>(value: T): T => structuredClone(value);
const fileName = (title: string) =>
  title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'buddy-keynote';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function IconAction({
  title,
  children,
  onClick,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

export default function Home() {
  const [shared, setShared] = useState<SharedState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedLibrary, setSharedLibrary] = useState<CachedShared[]>([]);
  const [personName, setPersonName] = useState('Invité');
  const sharedRef = useRef<SharedSession | null>(null);
  const documentEpoch = useRef(0);
  const creatingShared = useRef(false);
  const readOnly = shared?.role === 'viewer' || shared?.role === 'loading';
  const [deck, setDeck] = useState<Deck>(initialDeck);
  const [activeId, setActiveId] = useState(initialDeck.slides[0].id);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspector, setInspector] = useState('format');
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [sorter, setSorter] = useState(false);
  const [status, setStatus] = useState('Prêt.');
  const [saveState, setSaveState] = useState('Chargement…');
  const [hydrated, setHydrated] = useState(false);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [library, setLibrary] = useState<Deck[] | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [presenter, setPresenter] = useState(false);
  const [audience, setAudience] = useState(false);
  const [audienceReady, setAudienceReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [printing, setPrinting] = useState(false);
  const deckRef = useRef(deck);
  const activeRef = useRef(activeId);
  const selectedRef = useRef(selected);
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const transaction = useRef<{ snapshot: Snapshot; recorded: boolean } | null>(
    null,
  );
  const dragSnapshot = useRef<SlideElement[]>([]);
  const clipboard = useRef<SlideElement[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const replaceImage = useRef<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const audienceWindow = useRef<Window | null>(null);
  const playbackRef = useRef(playback);
  const busyRef = useRef(false);
  const commands = useRef({
    next: () => {},
    previous: () => {},
    close: () => {},
    blackout: () => {},
    laser: () => {},
  });
  const presentButton = useRef<HTMLButtonElement>(null);
  const presentationStartedAt = useRef(0);
  const activeIndex = Math.max(
    0,
    deck.slides.findIndex((s) => s.id === activeId),
  );
  const slide = deck.slides[activeIndex];
  const element = slide.elements.find((e) => e.id === selected.at(-1));

  function snapshot(): Snapshot {
    return {
      deck: deckRef.current,
      activeId: activeRef.current,
      selected: selectedRef.current,
    };
  }
  function select(ids: string[]) {
    selectedRef.current = ids;
    setSelected(ids);
  }
  function activate(id: string) {
    activeRef.current = id;
    setActiveId(id);
    select([]);
  }
  function install(next: Deck) {
    deckRef.current = next;
    setDeck(next);
    setRevision((n) => n + 1);
  }
  function openShared(connection: SharedConnection) {
    documentEpoch.current++;
    sharedRef.current?.dispose();
    transaction.current = null;
    undoRef.current = []; redoRef.current = [];
    setHistory({undo:0,redo:0});
    const session = new SharedSession(connection, next => {
      if (sharedRef.current !== session) return;
      install(next);
      if (!next.slides.some(s => s.id === activeRef.current)) activate(next.slides[0].id);
      const current = next.slides.find(s => s.id === activeRef.current)!;
      const remaining = selectedRef.current.filter(id => current.elements.some(e => e.id === id));
      if (remaining.length !== selectedRef.current.length) select(remaining);
      const playing = playbackRef.current;
      if (playing && (!next.slides[playing.index] || playing.previousIndex !== null && !next.slides[playing.previousIndex])) commands.current.close();
      setHydrated(true);
    }, value => {
      if (sharedRef.current === session) {setShared(value); setSaveState(value.message); setHydrated(true);}
    }, setHistory);
    sharedRef.current = session;
    session.name = personName; session.slideId = activeRef.current;
    window.history.replaceState(null, '', `/#shared=${connection.id}&key=${connection.token}`);
    void session.start();
  }
  const hydrateShared = useEffectEvent(openShared);
  function switchDocument(next: Deck) {
    documentEpoch.current++;
    sharedRef.current?.dispose(); sharedRef.current = null;
    setShared(null); setSaveState('Enregistrement…');
    window.history.replaceState(null, '', '/');
    undoRef.current=[]; redoRef.current=[]; transaction.current=null;
    setHistory({undo:0,redo:0}); install(next); activate(next.slides[0].id);
  }
  async function saveBeforeSwitch() {
    if (sharedRef.current) await sharedRef.current.flush();
    else await saveLocalDeck(deckRef.current);
  }
  const followSharedLink = useEffectEvent(async (connection: SharedConnection) => {await saveBeforeSwitch();openShared(connection);});
  async function beginSharing() {
    creatingShared.current = true;
    try {
      const next = deckRef.current;
      const epoch = documentEpoch.current;
      await saveBeforeSwitch();
      const connection = await createShared(next);
      if (epoch === documentEpoch.current) openShared(connection);
    } finally { creatingShared.current = false; }
  }
  async function leaveShared() {
    await saveBeforeSwitch();
    const local = await restoreLocalDeck();
    switchDocument(local ?? structuredClone(initialDeck)); setShareOpen(false);
  }
  function beginEdit() {
    sharedRef.current?.history.stopCapturing();
    transaction.current = { snapshot: snapshot(), recorded: false };
  }
  function endEdit() {
    sharedRef.current?.history.stopCapturing();
    transaction.current = null;
  }
  function commit(updater: (value: Deck) => Deck) {
    const current = deckRef.current;
    if (creatingShared.current) return;
    if (sharedRef.current?.state.role === 'viewer' || sharedRef.current?.state.role === 'loading') return;
    const next = updater(current);
    if (next === current) return;
    if (sharedRef.current) {
      sharedRef.current.commit(current, {...next, updatedAt: new Date().toISOString()});
      return;
    }
    if (!transaction.current || !transaction.current.recorded) {
      undoRef.current = [
        ...undoRef.current.slice(-59),
        transaction.current?.snapshot ?? snapshot(),
      ];
      if (transaction.current) transaction.current.recorded = true;
    }
    redoRef.current = [];
    install({ ...next, updatedAt: new Date().toISOString() });
    setHistory({ undo: undoRef.current.length, redo: 0 });
  }
  function patchSlide(patch: Partial<Slide>) {
    commit((value) => ({
      ...value,
      slides: value.slides.map((s) =>
        s.id === activeRef.current ? { ...s, ...patch } : s,
      ),
    }));
  }
  function patchElement(id: string, patch: Partial<SlideElement>) {
    commit((value) => ({
      ...value,
      slides: value.slides.map((s) =>
        s.id === activeRef.current
          ? {
              ...s,
              elements: s.elements.map((e) =>
                e.id === id ? ({ ...e, ...patch } as SlideElement) : e,
              ),
            }
          : s,
      ),
    }));
  }
  function undo() {
    if (sharedRef.current) {if (sharedRef.current.state.role !== 'viewer') sharedRef.current.history.undo(); return;}
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(snapshot());
    transaction.current = null;
    install(previous.deck);
    activate(previous.activeId);
    select(previous.selected);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  }
  function redo() {
    if (sharedRef.current) {if (sharedRef.current.state.role !== 'viewer') sharedRef.current.history.redo(); return;}
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(snapshot());
    transaction.current = null;
    install(next.deck);
    activate(next.activeId);
    select(next.selected);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  }
  function addElement(kind: SlideElementKind) {
    if (slide.elements.length >= 300) {
      setStatus('Cette diapositive contient déjà 300 objets.');
      return;
    }
    if (kind === 'image') {
      replaceImage.current = null;
      imageInput.current?.click();
      return;
    }
    const item = makeElement(kind);
    item.z = Math.max(0, ...slide.elements.map((e) => e.z)) + 1;
    if (item.kind === 'text' && slide.tone === 'ink')
      item.style.color = '#ffffff';
    if (item.kind === 'chart' && slide.tone === 'ink')
      item.datasets = item.datasets.map((dataset) => ({
        ...dataset,
        color: '#eeeeee',
      }));
    if (item.kind === 'shape' && slide.tone === 'ink') item.stroke = '#eeeeee';
    patchSlide({ elements: [...slide.elements, item] });
    select([item.id]);
    setInspector('format');
  }
  function addSlide(
    layout: 'title' | 'blank' | 'code' | 'comparison' = 'title',
  ) {
    if (deck.slides.length >= 250) {
      setStatus('Cette présentation contient déjà 250 diapositives.');
      return;
    }
    const next = makeSlide();
    next.name =
      layout === 'blank' ? 'Diapositive vide' : 'Nouvelle diapositive';
    if (layout === 'blank') next.elements = [];
    if (layout === 'code') {
      const title = makeElement('text');
      if (title.kind === 'text') {
        title.text = 'Montrez comment ça fonctionne.';
        title.x = 7;
        title.y = 8;
        title.w = 86;
        title.h = 15;
        title.style.fontSize = 44;
        title.style.fontWeight = 700;
      }
      const code = makeElement('code');
      Object.assign(code, { x: 7, y: 30, w: 86, h: 58 });
      next.elements = [title, code];
    }
    if (layout === 'comparison') {
      next.elements = [makeElement('text'), makeElement('text')];
      next.elements.forEach((e, i) => {
        if (e.kind === 'text') {
          e.text = `${i ? 'Après' : 'Avant'}\nVotre idée en quelques mots.`;
          e.x = 7 + i * 47;
          e.y = 22;
          e.w = 39;
          e.h = 58;
          e.style.fontSize = 38;
        }
      });
    }
    commit((value) => {
      const slides = [...value.slides];
      slides.splice(activeIndex + 1, 0, next);
      return { ...value, slides };
    });
    activate(next.id);
  }
  function duplicateSlide() {
    if (deck.slides.length >= 250) {
      setStatus('Cette présentation contient déjà 250 diapositives.');
      return;
    }
    const next = copy(slide);
    next.id = createId('slide');
    next.name = `${slide.name} — copie`;
    const groups = new Map<string, string>();
    next.elements = next.elements.map((e) => {
      if (e.groupId && !groups.has(e.groupId))
        groups.set(e.groupId, createId('group'));
      return {
        ...e,
        id: createId('element'),
        ...(e.groupId ? { groupId: groups.get(e.groupId) } : {}),
      };
    });
    commit((value) => {
      const slides = [...value.slides];
      slides.splice(activeIndex + 1, 0, next);
      return { ...value, slides };
    });
    activate(next.id);
  }
  function deleteSelection() {
    if (selected.length) {
      patchSlide({
        elements: slide.elements.filter(
          (e) => !selected.includes(e.id) || e.locked,
        ),
      });
      select([]);
    } else if (deck.slides.length > 1) {
      commit((value) => ({
        ...value,
        slides: value.slides.filter((s) => s.id !== slide.id),
      }));
      activate(deck.slides[activeIndex === 0 ? 1 : activeIndex - 1].id);
    }
  }
  function moveSlide(id: string, target: number) {
    commit((value) => {
      const slides = [...value.slides];
      const index = slides.findIndex((s) => s.id === id);
      if (index < 0) return value;
      const [moving] = slides.splice(index, 1);
      slides.splice(Math.max(0, Math.min(slides.length, target)), 0, moving);
      return { ...value, slides };
    });
  }
  function selectElement(id: string, additive = false) {
    const currentSlide = deckRef.current.slides.find(
      (s) => s.id === activeRef.current,
    )!;
    const target = currentSlide.elements.find((e) => e.id === id);
    const ids = target?.groupId
      ? currentSlide.elements
          .filter((e) => e.groupId === target.groupId)
          .map((e) => e.id)
      : [id];
    if (additive)
      select(
        selectedRef.current.includes(id)
          ? selectedRef.current.filter((v) => !ids.includes(v))
          : [...new Set([...selectedRef.current, ...ids])],
      );
    else if (!selectedRef.current.includes(id)) select(ids);
  }
  function transform(id: string, patch: Partial<SlideElement>) {
    if ('w' in patch || 'h' in patch) {
      patchElement(id, patch);
      return;
    }
    const origin = dragSnapshot.current.find((e) => e.id === id);
    if (!origin) {
      patchElement(id, patch);
      return;
    }
    if ('x' in patch || 'y' in patch) {
      const items = dragSnapshot.current.filter(
        (e) => selectedRef.current.includes(e.id) && !e.locked,
      );
      let dx = (patch.x ?? origin.x) - origin.x,
        dy = (patch.y ?? origin.y) - origin.y;
      if (snap) {
        dx = Math.round((origin.x + dx) * 2) / 2 - origin.x;
        dy = Math.round((origin.y + dy) * 2) / 2 - origin.y;
      }
      dx = Math.max(
        -Math.min(...items.map((e) => e.x)),
        Math.min(dx, 100 - Math.max(...items.map((e) => e.x + e.w))),
      );
      dy = Math.max(
        -Math.min(...items.map((e) => e.y)),
        Math.min(dy, 100 - Math.max(...items.map((e) => e.y + e.h))),
      );
      commit((value) => ({
        ...value,
        slides: value.slides.map((s) =>
          s.id === activeRef.current
            ? {
                ...s,
                elements: s.elements.map((e) => {
                  const source = items.find((item) => item.id === e.id);
                  return source
                    ? { ...e, x: source.x + dx, y: source.y + dy }
                    : e;
                }),
              }
            : s,
        ),
      }));
    } else patchElement(id, patch);
  }
  function duplicateObjects(
    source = slide.elements.filter((e) => selected.includes(e.id)),
  ) {
    if (!source.length) {
      duplicateSlide();
      return;
    }
    if (slide.elements.length + source.length > 300) {
      setStatus('La limite est de 300 objets par diapositive.');
      return;
    }
    const groups = new Map<string, string>();
    const highest = Math.max(0, ...slide.elements.map((e) => e.z));
    const objects = source.map((e, i) => {
      if (e.groupId && !groups.has(e.groupId))
        groups.set(e.groupId, createId('group'));
      return {
        ...copy(e),
        id: createId('element'),
        x: Math.min(100 - e.w, e.x + 2),
        y: Math.min(100 - e.h, e.y + 2),
        z: highest + i + 1,
        ...(e.groupId ? { groupId: groups.get(e.groupId) } : {}),
      };
    });
    patchSlide({ elements: [...slide.elements, ...objects] });
    select(objects.map((e) => e.id));
  }
  function groupSelection(remove = false) {
    const groupId = remove ? undefined : createId('group');
    patchSlide({
      elements: slide.elements.map((e) =>
        selected.includes(e.id) ? { ...e, groupId } : e,
      ),
    });
  }
  function align(axis: 'left' | 'center' | 'top' | 'middle' | 'distribute') {
    const items = slide.elements.filter(
      (e) => selected.includes(e.id) && !e.locked,
    );
    if (!items.length) return;
    const ordered = [...items].sort((a, b) => a.x - b.x);
    const left = items.length > 1 ? Math.min(...items.map((e) => e.x)) : 5;
    const right =
      items.length > 1 ? Math.max(...items.map((e) => e.x + e.w)) : 95;
    const top = items.length > 1 ? Math.min(...items.map((e) => e.y)) : 5;
    const bottom =
      items.length > 1 ? Math.max(...items.map((e) => e.y + e.h)) : 95;
    const gap =
      items.length > 1
        ? (right - left - items.reduce((sum, e) => sum + e.w, 0)) /
          (items.length - 1)
        : 0;
    patchSlide({
      elements: slide.elements.map((e) => {
        if (!items.some((item) => item.id === e.id)) return e;
        if (axis === 'left') return { ...e, x: left };
        if (axis === 'center') return { ...e, x: (left + right - e.w) / 2 };
        if (axis === 'top') return { ...e, y: top };
        if (axis === 'middle') return { ...e, y: (top + bottom - e.h) / 2 };
        const index = ordered.findIndex((item) => item.id === e.id);
        return {
          ...e,
          x:
            left +
            ordered.slice(0, index).reduce((sum, item) => sum + item.w, 0) +
            gap * index,
        };
      }),
    });
  }
  function layer(direction: -1 | 1) {
    if (!element) return;
    const sorted = [...slide.elements].sort((a, b) => a.z - b.z);
    const index = sorted.findIndex((e) => e.id === element.id);
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    patchSlide({ elements: sorted.map((e, z) => ({ ...e, z })) });
  }
  function applyTheme(theme: DeckTheme, all = true) {
    const tone = theme === 'terminal' ? 'ink' : 'paper';
    commit((value) => ({
      ...value,
      theme,
      slides: value.slides.map((s) =>
        !all && s.id !== activeId
          ? s
          : {
              ...s,
              tone,
              elements: s.elements.map((e) =>
                e.kind === 'text'
                  ? {
                      ...e,
                      style: {
                        ...e.style,
                        color: tone === 'ink' ? '#ffffff' : '#171717',
                        fontFamily: theme === 'editorial' ? 'Georgia' : 'Inter',
                        background: 'transparent',
                      },
                    }
                  : e.kind === 'chart'
                    ? {
                        ...e,
                        datasets: e.datasets.map((dataset, index) => ({
                          ...dataset,
                          color: (tone === 'ink'
                            ? ['#eeeeee', '#bbbbbb', '#888888', '#666666']
                            : ['#171717', '#555555', '#888888', '#bbbbbb'])[
                            index % 4
                          ],
                        })),
                      }
                    : e.kind === 'shape'
                      ? { ...e, stroke: tone === 'ink' ? '#eeeeee' : '#171717' }
                      : e.kind === 'table'
                        ? {
                            ...e,
                            fill: tone === 'ink' ? '#262626' : '#ffffff',
                            textColor: tone === 'ink' ? '#ffffff' : '#171717',
                          }
                        : e,
              ),
            },
      ),
    }));
  }
  async function imageFiles(
    files: FileList | File[],
    replaceId: string | null = null,
  ) {
    const items: SlideElement[] = [];
    const targetId = activeRef.current;
    const epoch = documentEpoch.current;
    for (const file of Array.from(files).slice(0, 12)) {
      if (slide.elements.length + items.length >= 300) break;
      if (
        !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        setStatus('Images PNG, JPEG, WebP ou GIF, jusqu’à 5 Mo chacune.');
        continue;
      }
      let src: string;
      try {
        src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('Image illisible.'));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } catch {
        setStatus(`Impossible de lire l’image « ${file.name} ».`);
        continue;
      }
      if (epoch !== documentEpoch.current) return;
      if (replaceId) {
        commit((value) => ({
          ...value,
          slides: value.slides.map((s) =>
            s.id === targetId
              ? {
                  ...s,
                  elements: s.elements.map((e) =>
                    e.id === replaceId && e.kind === 'image'
                      ? { ...e, src, alt: file.name }
                      : e,
                  ),
                }
              : s,
          ),
        }));
        return;
      }
      const item = makeElement('image');
      if (item.kind === 'image') {
        item.src = src;
        item.alt = file.name;
        item.z =
          Math.max(0, ...slide.elements.map((e) => e.z)) + items.length + 1;
        items.push(item);
      }
    }
    if (epoch !== documentEpoch.current) return;
    if (items.length) {
      commit((value) => ({
        ...value,
        slides: value.slides.map((s) =>
          s.id === targetId
            ? { ...s, elements: [...s.elements, ...items].slice(0, 300) }
            : s,
        ),
      }));
      if (activeRef.current === targetId) select(items.map((e) => e.id));
      setInspector('format');
      setStatus(`${items.length} image(s) ajoutée(s).`);
    }
  }
  async function importDeck(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setStatus('Fichier trop volumineux (50 Mo maximum).');
      return;
    }
    try {
      let next: Deck | null,
        warnings: string[] = [];
      if (/\.(pptx|odp)$/i.test(file.name)) {
        const office = await import('@/lib/office');
        const result = await office.importOffice(file);
        next = migrateDeck(result.deck);
        warnings = result.warnings;
      } else next = migrateDeck(JSON.parse(await file.text()));
      if (!next) throw new Error('Format de présentation invalide.');
      await saveBeforeSwitch();
      next = { ...next, id: createId('deck') };
      switchDocument(next);
      activate(next.slides[0].id);
      setStatus(
        warnings.length
          ? `Import terminé. ${warnings.join(' ')}`
          : 'Présentation importée.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import impossible.');
    }
  }
  async function exportDeck(format: 'json' | 'pptx' | 'odp' | 'html') {
    try {
      const current = deckRef.current;
      if (format === 'json')
        download(
          new Blob([JSON.stringify(current)], { type: 'application/json' }),
          `${fileName(current.title)}.buddydeck.json`,
        );
      else if (format === 'html') {
        const html = await import('@/lib/html-export');
        download(
          await html.exportHtml(current),
          `${fileName(current.title)}.html`,
        );
      } else {
        const office = await import('@/lib/office');
        download(
          format === 'pptx'
            ? await office.exportPptx(current)
            : office.exportOdp(current),
          `${fileName(current.title)}.${format}`,
        );
      }
      setStatus(
        format === 'pptx' || format === 'odp'
          ? 'Export Office simplifié. Animations Buddy, médias et certains objets ne sont pas reproduits à l’identique. Conservez aussi le fichier Buddy.'
          : 'Présentation exportée.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export impossible.');
    }
  }
  function setPlaying(value: PlaybackState | null) {
    if (!value || value.skip || value.run !== playbackRef.current?.run) {
      const busy = Boolean(value && !value.skip);
      busyRef.current = busy;
      setPlaybackBusy(busy);
    }
    playbackRef.current = value;
    setPlayback(value);
  }
  /* oxlint-disable react/react-compiler -- Stable RAF callback intentionally reads the latest channel and playback from refs. */
  const onBusy = useCallback(
    (busy: boolean) => {
      busyRef.current = busy;
      setPlaybackBusy(busy);
      if (audience)
        channel.current?.postMessage({
          type: 'busy',
          busy,
          run: playbackRef.current?.run,
        });
    },
    [audience],
  );
  /* oxlint-enable react/react-compiler */
  function togglePlayback(key: 'blackout' | 'laser') {
    const p = playbackRef.current;
    if (p) setPlaying({ ...p, [key]: !p[key] });
  }
  function start(index: number, inPresenter = false) {
    const state: PlaybackState = {
      index,
      previousIndex: null,
      step: 0,
      run: 1,
      skip: false,
      blackout: false,
      laser: false,
    };
    if (inPresenter) {
      if (!('BroadcastChannel' in window)) {
        setStatus(
          'La régie multi-fenêtres n’est pas disponible dans ce navigateur.',
        );
        return;
      }
      channel.current?.close();
      const id = createId('audience');
      const session = new BroadcastChannel(id);
      channel.current = session;
      session.onmessage = (event: MessageEvent<AudienceMessage>) => {
        if (event.data.type === 'ready')
          session.postMessage({
            type: 'snapshot',
            deck: deckRef.current,
            playback: playbackRef.current,
          });
        if (event.data.type === 'next') commands.current.next();
        if (event.data.type === 'previous') commands.current.previous();
        if (event.data.type === 'close') commands.current.close();
        if (event.data.type === 'blackout') commands.current.blackout();
        if (event.data.type === 'laser') commands.current.laser();
        if (
          event.data.type === 'busy' &&
          event.data.run === playbackRef.current?.run
        ) {
          const busy = event.data.busy && !playbackRef.current.skip;
          busyRef.current = busy;
          setPlaybackBusy(busy);
        }
      };
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('audience', id);
      const opened = window.open(
        url.href,
        'buddy-keynote-audience',
        'popup,width=1280,height=720',
      );
      if (!opened) {
        session.close();
        channel.current = null;
        setStatus('Autorisez la fenêtre de présentation pour ouvrir la régie.');
        return;
      }
      audienceWindow.current = opened;
    }
    endEdit();
    busyRef.current = true;
    setPlaying(state);
    setPresenter(inPresenter);
    setElapsedSeconds(0);
  }
  function close() {
    setPlaying(null);
    setPresenter(false);
    busyRef.current = false;
    channel.current?.postMessage({
      type: 'snapshot',
      deck: deckRef.current,
      playback: null,
    });
    audienceWindow.current?.close();
    audienceWindow.current = null;
    channel.current?.close();
    channel.current = null;
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    setTimeout(() => presentButton.current?.focus(), 0);
  }
  function goTo(index: number) {
    const p = playbackRef.current;
    if (!p) return;
    busyRef.current = true;
    setPlaying({
      ...p,
      index,
      previousIndex: p.index,
      step: 0,
      run: p.run + 1,
      skip: false,
    });
  }
  function next() {
    const p = playbackRef.current;
    if (!p) return;
    if (busyRef.current) {
      busyRef.current = false;
      setPlaying({ ...p, skip: true });
      return;
    }
    const current = deckRef.current.slides[p.index];
    if (p.step < animationGroups(current).length - 1) {
      busyRef.current = true;
      setPlaying({
        ...p,
        previousIndex: null,
        step: p.step + 1,
        run: p.run + 1,
        skip: false,
      });
    } else {
      const target = nextVisibleIndex(deckRef.current.slides, p.index, 1);
      if (target !== null) goTo(target);
      else setStatus('Fin de la présentation.');
    }
  }
  function previous() {
    const p = playbackRef.current;
    if (!p) return;
    const target =
      p.step > 0
        ? p.index
        : nextVisibleIndex(deckRef.current.slides, p.index, -1);
    if (target !== null)
      setPlaying({
        ...p,
        index: target,
        previousIndex: null,
        step:
          p.step > 0
            ? p.step - 1
            : animationGroups(deckRef.current.slides[target]).length - 1,
        run: p.run + 1,
        skip: true,
      });
  }
  useEffect(() => {
    commands.current = {
      next,
      previous,
      close,
      blackout: () => togglePlayback('blackout'),
      laser: () => togglePlayback('laser'),
    };
  });

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('audience');
    if (id) {
      // oxlint-disable-next-line react/react-compiler -- hydrate the audience route from the browser URL once
      setAudience(true);
      const session = new BroadcastChannel(id);
      channel.current = session;
      session.onmessage = (event: MessageEvent<AudienceMessage>) => {
        if (event.data.type === 'snapshot') {
          const valid = migrateDeck(event.data.deck);
          if (!valid) return;
          deckRef.current = valid;
          setDeck(valid);
          playbackRef.current = event.data.playback;
          setPlayback(event.data.playback);
          setAudienceReady(true);
        }
      };
      session.postMessage({ type: 'ready' });
      return () => session.close();
    }
    try { setPersonName(localStorage.getItem('buddy-collaborator-name') || 'Invité'); } catch { /* Use default nickname. */ }
    const connection = connectionFromUrl();
    const onHashChange = () => { const next=connectionFromUrl(); if(next) void followSharedLink(next).catch(()=>setStatus('Exportez votre présentation avant de changer de projet.')); };
    window.addEventListener('hashchange',onHashChange);
    if (connection) {
      hydrateShared(connection);
      return () => { window.removeEventListener('hashchange',onHashChange); sharedRef.current?.dispose(); sharedRef.current=null; };
    }
    let live = true;
    const epoch = documentEpoch.current;
    void restoreLocalDeck()
      .then(async (saved) => {
        if (!live || epoch !== documentEpoch.current) return;
        if (saved) {
          deckRef.current = saved;
          setDeck(saved);
          activeRef.current = saved.slides[0].id;
          setActiveId(saved.slides[0].id);
        }
        try {
          await saveLocalDeck(saved ?? deckRef.current);
          if (live && epoch === documentEpoch.current) setSaveState('Enregistré sur cet appareil');
        } catch {
          if (live) {
            setSaveState('Export conseillé');
            setStatus(
              'Votre contenu est chargé, mais le stockage local est indisponible. Exportez le fichier Buddy pour le conserver.',
            );
          }
        }
      })
      .catch(() => {
        if (live) {
          setSaveState('Sauvegarde indisponible');
          setStatus(
            'Impossible de restaurer la sauvegarde. Le fichier d’origine est conservé.',
          );
        }
      })
      .finally(() => {
        if (live) setHydrated(true);
      });
    return () => {
      live = false; window.removeEventListener('hashchange',onHashChange); sharedRef.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (!hydrated || !revision || audience || sharedRef.current) return;
    // oxlint-disable-next-line react/react-compiler -- report the pending external IndexedDB write
    setSaveState('Enregistrement…');
    let current = true;
    const timer = setTimeout(() => {
      if (sharedRef.current) return;
      void saveLocalDeck(deck)
        .then(() => {
          if (current) setSaveState('Enregistré sur cet appareil');
        })
        .catch(() => {
          if (current) {
            setSaveState('Export conseillé');
            setStatus(
              'Sauvegarde indisponible. Exportez le fichier Buddy pour conserver vos changements.',
            );
          }
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [deck, revision, hydrated, audience]);
  useEffect(() => {
    const flush = () => {
      if (sharedRef.current) { void sharedRef.current.flush(); return; }
      if (hydrated && revision && !audience)
        void saveLocalDeck(deckRef.current).catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [hydrated, revision, audience]);
  useEffect(() => {
    if (sharedRef.current) {sharedRef.current.name=personName; sharedRef.current.slideId=activeId;}
  }, [personName, activeId]);
  useEffect(() => {
    if (presenter)
      channel.current?.postMessage({ type: 'snapshot', deck, playback });
  }, [deck, playback, presenter]);
  useEffect(() => {
    if (!playback || audience || playbackBusy) return;
    const current = deck.slides[playback.index];
    if (!current?.autoAdvance) return;
    const duration =
      playback.step < animationGroups(current).length - 1
        ? 0
        : current.autoAdvance;
    const timer = setTimeout(() => commands.current.next(), duration);
    return () => clearTimeout(timer);
  }, [playback, deck, audience, playbackBusy]);
  useEffect(() => {
    if (!presenter) return;
    presentationStartedAt.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(
        Math.floor((Date.now() - presentationStartedAt.current) / 1000),
      );
      if (audienceWindow.current?.closed) commands.current.close();
    }, 1000);
    return () => clearInterval(timer);
  }, [presenter]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!hydrated && !audience) return;
      if (isInput(event.target)) return;
      if (playback) {
        if (
          (event.key === ' ' || event.key === 'Enter') &&
          event.target instanceof HTMLElement &&
          event.target.closest('button,a')
        )
          return;
        if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
          event.preventDefault();
          if (audience) channel.current?.postMessage({ type: 'next' });
          else next();
        }
        if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
          event.preventDefault();
          if (audience) channel.current?.postMessage({ type: 'previous' });
          else previous();
        }
        if (event.key === 'Escape') {
          if (audience) channel.current?.postMessage({ type: 'close' });
          else close();
        }
        if (event.key.toLowerCase() === 'b') {
          if (audience) channel.current?.postMessage({ type: 'blackout' });
          else togglePlayback('blackout');
        }
        if (event.key.toLowerCase() === 'l') {
          if (audience) channel.current?.postMessage({ type: 'laser' });
          else togglePlayback('laser');
        }
        if (event.key.toLowerCase() === 'f') {
          if (document.fullscreenElement) void document.exitFullscreen();
          else
            void document.documentElement
              .requestFullscreen()
              .catch(() => undefined);
        }
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
        duplicateObjects();
      }
      if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        select(slide.elements.map((e) => e.id));
      }
      if (modifier && event.key.toLowerCase() === 'c' && selected.length) {
        event.preventDefault();
        clipboard.current = copy(
          slide.elements.filter((e) => selected.includes(e.id)),
        );
        setStatus('Objets copiés.');
      }
      if (
        modifier &&
        event.key.toLowerCase() === 'v' &&
        clipboard.current.length
      ) {
        event.preventDefault();
        duplicateObjects(clipboard.current);
      }
      if (modifier && event.key.toLowerCase() === 'g' && selected.length) {
        event.preventDefault();
        groupSelection(event.shiftKey);
      }
      if (modifier && event.key === 'Enter') {
        event.preventDefault();
        start(activeIndex);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      }
      if (event.key === 'Escape') select([]);
      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        moveSlide(slide.id, activeIndex + (event.key === 'ArrowUp' ? -1 : 1));
      } else if (
        selected.length &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        const distance = event.shiftKey ? 1 : 0.1;
        patchSlide({
          elements: slide.elements.map((e) =>
            selected.includes(e.id) && !e.locked
              ? {
                  ...e,
                  x: Math.max(
                    0,
                    Math.min(
                      100 - e.w,
                      e.x +
                        (event.key === 'ArrowRight'
                          ? distance
                          : event.key === 'ArrowLeft'
                            ? -distance
                            : 0),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      100 - e.h,
                      e.y +
                        (event.key === 'ArrowDown'
                          ? distance
                          : event.key === 'ArrowUp'
                            ? -distance
                            : 0),
                    ),
                  ),
                }
              : e,
          ),
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  useEffect(() => {
    const handler = () => setPrinting(false);
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  if (audience)
    return audienceReady && playback ? (
      <StudioPlayer
        deck={deck}
        state={playback}
        onNext={() => channel.current?.postMessage({ type: 'next' })}
        onPrevious={() => channel.current?.postMessage({ type: 'previous' })}
        onClose={() => channel.current?.postMessage({ type: 'close' })}
        onBusy={onBusy}
      />
    ) : (
      <div className="audience-wait">
        <Buddy
          caption={
            audienceReady
              ? 'La présentation est terminée.'
              : 'Connexion à la régie…'
          }
        />
      </div>
    );
  const audienceInert = Boolean(playback) || !hydrated;

  return (
    <main className="studio-app" data-theme={deck.theme}>
      {!readOnly && <StudioWebMcp
        deck={deck}
        onCreate={(title, body) => {
          if (deck.slides.length >= 250)
            throw new Error('Limite de 250 diapositives atteinte.');
          const next = makeSlide(title, body);
          commit((value) => {
            const slides = [...value.slides];
            slides.splice(activeIndex + 1, 0, next);
            return { ...value, slides };
          });
          activate(next.id);
          return next.id;
        }}
      />}
      <div
        className="studio-editor"
        inert={audienceInert ? true : undefined}
        aria-hidden={audienceInert ? true : undefined}
      >
        <header className="studio-header">
          <div className="studio-brand">
            <BuddyLogo />
            <strong>Buddy Keynote</strong>
            <span className="studio-version">Studio</span>
          </div>
          <div className="studio-document">
            <Input
              disabled={readOnly}
              aria-label="Nom de la présentation"
              value={deck.title}
              maxLength={120}
              onFocus={beginEdit}
              onBlur={endEdit}
              onChange={(e) =>
                commit((value) => ({ ...value, title: e.target.value }))
              }
            />
            <span title={shared?.error}>{saveState}{shared ? ` · ${shared.role==='viewer'?'Lecture seule':`${shared.people.length} connecté(s)`}` : ''}</span>
          </div>
          <div className="studio-header-actions">
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}><Users/>Partager</Button>
            <IconAction
              title="Mes présentations"
              onClick={() => {
                void listShared().then(setSharedLibrary).catch(()=>setSharedLibrary([]));
                void listLocalDecks()
                  .then(setLibrary)
                  .catch(() => setStatus('Bibliothèque indisponible.'));
              }}
            >
              <FolderOpen />
            </IconAction>
            <IconAction
              title="Annuler (⌘Z)"
              disabled={readOnly || !history.undo}
              onClick={undo}
            >
              <Undo2 />
            </IconAction>
            <IconAction
              title="Rétablir (⇧⌘Z)"
              disabled={readOnly || !history.redo}
              onClick={redo}
            >
              <Redo2 />
            </IconAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" />}
              >
                <Download />
                Fichier
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <DropdownMenuItem onClick={() => importInput.current?.click()}>
                  <FileUp />
                  Importer Buddy / PPTX / ODP
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void exportDeck('json')}>
                  Enregistrer un fichier Buddy
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportDeck('pptx')}>
                  Exporter PowerPoint (.pptx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportDeck('odp')}>
                  Exporter OpenDocument (.odp)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportDeck('html')}>
                  Exporter le diaporama HTML
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setPrinting(true);
                    setTimeout(() => window.print(), 200);
                  }}
                >
                  <Printer />
                  Imprimer / PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => start(activeIndex, true)}
            >
              <Monitor />
              Régie
            </Button>
            <Button
              ref={presentButton}
              size="sm"
              onClick={() => start(activeIndex)}
            >
              <Play />
              Présenter
            </Button>
          </div>
        </header>
        <nav inert={readOnly || undefined} className="studio-ribbon" aria-label="Outils d’insertion">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" />}
            >
              <Plus />
              Diapositive
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuItem onClick={() => addSlide()}>
                Titre et contenu
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addSlide('blank')}>
                Diapositive vide
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addSlide('code')}>
                Démonstration de code
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addSlide('comparison')}>
                Comparaison
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ribbon-divider" />
          {(
            [
              [Type, 'text'],
              [Shapes, 'shape'],
              [ImagePlus, 'image'],
              [Braces, 'code'],
              [Table2, 'table'],
              [ChartNoAxesColumn, 'chart'],
              [Video, 'media'],
            ] as const
          ).map(([Icon, kind]) => (
            <Button
              key={kind}
              variant="ghost"
              size="sm"
              onClick={() => addElement(kind)}
            >
              <Icon />
              {elementLabels[kind]}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => addElement('buddy')}>
            <BuddyLogo />
            Buddy
          </Button>
          <span className="ribbon-spacer" />
          <Button
            variant={inspector === 'animate' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setInspector('animate')}
          >
            <Sparkles />
            Animer
          </Button>
        </nav>
        <div className="studio-workspace">
          <aside className="studio-filmstrip" aria-label="Diapositives">
            <div className="filmstrip-heading">
              <span>{deck.slides.length} diapositives</span>
              <IconAction
                title="Vue trieuse"
                onClick={() => setSorter((v) => !v)}
              >
                <Grid3X3 />
              </IconAction>
            </div>
            <div className="filmstrip-items">
              {deck.slides.map((item, index) => (
                <button
                  type="button"
                  className="filmstrip-slide"
                  data-active={item.id === slide.id}
                  data-hidden={item.hidden}
                  key={item.id}
                  onClick={() => activate(item.id)}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData('application/buddy-slide', item.id)
                  }
                  onDragOver={(e) => {
                    if (
                      e.dataTransfer.types.includes('application/buddy-slide')
                    )
                      e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData(
                      'application/buddy-slide',
                    );
                    if (id) moveSlide(id, index);
                  }}
                  aria-label={`Diapositive ${index + 1} : ${item.name}`}
                  aria-current={item.id === slide.id ? 'true' : undefined}
                >
                  <span className="filmstrip-number">
                    {index + 1}
                    {item.hidden && <EyeOff size={12} />}
                  </span>
                  <span className="filmstrip-preview">
                    <StudioSlide slide={item} aspectRatio={deck.aspectRatio} />
                  </span>
                  <span className="filmstrip-title">{item.name}</span>
                </button>
              ))}
            </div>
            <div className="filmstrip-footer">
              <IconAction
                title="Monter la diapositive"
                disabled={activeIndex === 0}
                onClick={() => moveSlide(slide.id, activeIndex - 1)}
              >
                <ArrowUp />
              </IconAction>
              <IconAction
                title="Descendre la diapositive"
                disabled={activeIndex === deck.slides.length - 1}
                onClick={() => moveSlide(slide.id, activeIndex + 1)}
              >
                <ArrowDown />
              </IconAction>
              <IconAction
                title="Dupliquer la diapositive"
                onClick={duplicateSlide}
              >
                <Copy />
              </IconAction>
              <IconAction
                title="Nouvelle diapositive"
                onClick={() => addSlide()}
              >
                <Plus />
              </IconAction>
            </div>
          </aside>
          <section
            className="studio-canvas-panel"
            aria-label="Éditeur de diapositive"
          >
            <div className="studio-arrange">
              <span>
                <MousePointer2 size={15} />
                {selected.length
                  ? `${selected.length} objet${selected.length > 1 ? 's' : ''}`
                  : 'Sélection'}
              </span>
              <div>
                <IconAction
                  title="Aligner à gauche"
                  disabled={!selected.length}
                  onClick={() => align('left')}
                >
                  <AlignStartVertical />
                </IconAction>
                <IconAction
                  title="Centrer horizontalement"
                  disabled={!selected.length}
                  onClick={() => align('center')}
                >
                  <AlignCenterVertical />
                </IconAction>
                <IconAction
                  title="Aligner en haut"
                  disabled={!selected.length}
                  onClick={() => align('top')}
                >
                  <AlignStartHorizontal />
                </IconAction>
                <IconAction
                  title="Centrer verticalement"
                  disabled={!selected.length}
                  onClick={() => align('middle')}
                >
                  <AlignCenterHorizontal />
                </IconAction>
                <IconAction
                  title="Distribuer horizontalement"
                  disabled={selected.length < 3}
                  onClick={() => align('distribute')}
                >
                  <ArrowRight />
                </IconAction>
                <span className="ribbon-divider" />
                <IconAction
                  title="Grouper (⌘G)"
                  disabled={selected.length < 2}
                  onClick={() => groupSelection()}
                >
                  <Group />
                </IconAction>
                <IconAction
                  title="Dégrouper (⇧⌘G)"
                  disabled={!element?.groupId}
                  onClick={() => groupSelection(true)}
                >
                  <Ungroup />
                </IconAction>
                <IconAction
                  title="Dupliquer (⌘D)"
                  onClick={() => duplicateObjects()}
                >
                  <Copy />
                </IconAction>
                <IconAction
                  title="Supprimer la sélection"
                  disabled={!selected.length && deck.slides.length <= 1}
                  onClick={deleteSelection}
                >
                  <Trash2 />
                </IconAction>
              </div>
            </div>
            {sorter ? (
              <div className="studio-sorter">
                {deck.slides.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      activate(item.id);
                      setSorter(false);
                    }}
                  >
                    <StudioSlide slide={item} aspectRatio={deck.aspectRatio} />
                    <span>
                      {index + 1}. {item.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div
                className="studio-canvas-scroll"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('Files'))
                    e.preventDefault();
                }}
                onDrop={(e) => {
                  if (e.dataTransfer.files.length) {
                    e.preventDefault();
                    void imageFiles(e.dataTransfer.files);
                  }
                }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) select([]);
                }}
              >
                <div
                  className="studio-canvas-mat"
                  data-grid={grid}
                  style={{
                    width: `${zoom}%`,
                    maxWidth: `${zoom === 100 ? 1120 : (1120 * zoom) / 100}px`,
                  }}
                >
                  <StudioSlide
                    slide={slide}
                    aspectRatio={deck.aspectRatio}
                    editable={!readOnly}
                    selectedIds={selected}
                    onSelect={selectElement}
                    onTransformStart={() => {
                      beginEdit();
                      dragSnapshot.current = copy(
                        deckRef.current.slides.find(
                          (s) => s.id === activeRef.current,
                        )!.elements,
                      );
                    }}
                    onTransform={transform}
                    onTransformEnd={endEdit}
                    onTextChange={(id, text) => patchElement(id, { text })}
                  />
                </div>
              </div>
            )}
            <div className="studio-canvas-bottom">
              <span>
                {activeIndex + 1} / {deck.slides.length} · {deck.aspectRatio}
              </span>
              <div>
                <Button
                  variant={grid ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setGrid((v) => !v)}
                >
                  <Grid3X3 />
                  Grille
                </Button>
                <Button
                  variant={snap ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSnap((v) => !v)}
                >
                  Magnétisme
                </Button>
                <IconAction
                  title="Zoom arrière"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                >
                  <ZoomOut />
                </IconAction>
                <button className="zoom-reset" onClick={() => setZoom(100)}>
                  {zoom}%
                </button>
                <IconAction
                  title="Zoom avant"
                  onClick={() => setZoom((z) => Math.min(200, z + 10))}
                >
                  <ZoomIn />
                </IconAction>
              </div>
            </div>
            <div className="studio-notes" inert={readOnly || undefined}>
              <StickyNote size={16} />
              <Textarea
                aria-label="Notes de l’orateur"
                value={slide.notes}
                maxLength={10000}
                rows={2}
                placeholder="Notes de l’orateur — visibles uniquement dans la régie."
                onFocus={beginEdit}
                onBlur={endEdit}
                onChange={(e) => patchSlide({ notes: e.target.value })}
              />
            </div>
          </section>
          <aside inert={readOnly || undefined} className="studio-inspector" aria-label="Inspecteur">
            <Tabs value={inspector} onValueChange={setInspector}>
              <TabsList variant="line" className="inspector-nav">
                <TabsTrigger value="format">Format</TabsTrigger>
                <TabsTrigger value="animate">Animer</TabsTrigger>
                <TabsTrigger value="layers">Calques</TabsTrigger>
              </TabsList>
              <TabsContent value="format">
                <div className="inspector-heading">
                  <strong>
                    {element ? elementLabels[element.kind] : 'Diapositive'}
                  </strong>
                  {element && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => select([])}
                    >
                      Diapo
                    </Button>
                  )}
                </div>
                {element ? (
                  <StudioInspector
                    key={element.id}
                    element={element}
                    onChange={(patch) => patchElement(element.id, patch)}
                    onBegin={beginEdit}
                    onEnd={endEdit}
                    onReplaceImage={() => {
                      replaceImage.current = element.id;
                      imageInput.current?.click();
                    }}
                  />
                ) : (
                  <>
                    <section className="inspector-block">
                      <label className="studio-field" htmlFor="slide-name">
                        Nom
                        <Input
                          id="slide-name"
                          value={slide.name}
                          maxLength={120}
                          onFocus={beginEdit}
                          onBlur={endEdit}
                          onChange={(e) => patchSlide({ name: e.target.value })}
                        />
                      </label>
                      <Choice
                        label="Format du document"
                        value={deck.aspectRatio}
                        options={aspectRatioLabels}
                        onChange={(aspectRatio) =>
                          commit((value) => ({
                            ...value,
                            aspectRatio: aspectRatio as Deck['aspectRatio'],
                          }))
                        }
                      />
                    </section>
                    <section className="inspector-block">
                      <h3>Thème du document</h3>
                      <div className="theme-gallery">
                        {Object.entries(themeLabels).map(([theme, label]) => (
                          <button
                            key={theme}
                            type="button"
                            data-theme={theme}
                            data-active={deck.theme === theme}
                            onClick={() => applyTheme(theme as DeckTheme)}
                          >
                            <span>Aa</span>
                            <strong>{label}</strong>
                          </button>
                        ))}
                      </div>
                      <p className="field-help">
                        Applique des couleurs contrastées et la police à toutes
                        les diapositives.
                      </p>
                    </section>
                    <section className="inspector-block">
                      <h3>Arrière-plan</h3>
                      <div className="tone-swatches">
                        {(['paper', 'mist', 'ink'] as const).map((tone) => (
                          <button
                            key={tone}
                            type="button"
                            data-tone={tone}
                            data-active={slide.tone === tone}
                            onClick={() =>
                              patchSlide({
                                tone,
                                elements: slide.elements.map((e) =>
                                  e.kind === 'text'
                                    ? {
                                        ...e,
                                        style: {
                                          ...e.style,
                                          color:
                                            tone === 'ink'
                                              ? '#ffffff'
                                              : '#171717',
                                        },
                                      }
                                    : e.kind === 'chart'
                                      ? {
                                          ...e,
                                          datasets: e.datasets.map(
                                            (dataset, index) => ({
                                              ...dataset,
                                              color: (tone === 'ink'
                                                ? [
                                                    '#eeeeee',
                                                    '#bbbbbb',
                                                    '#888888',
                                                    '#666666',
                                                  ]
                                                : [
                                                    '#171717',
                                                    '#555555',
                                                    '#888888',
                                                    '#bbbbbb',
                                                  ])[index % 4],
                                            }),
                                          ),
                                        }
                                      : e.kind === 'shape'
                                        ? {
                                            ...e,
                                            stroke:
                                              tone === 'ink'
                                                ? '#eeeeee'
                                                : '#171717',
                                          }
                                        : e,
                                ),
                              })
                            }
                          >
                            {tone === 'paper'
                              ? 'Blanc'
                              : tone === 'mist'
                                ? 'Gris'
                                : 'Noir'}
                          </button>
                        ))}
                      </div>
                      <ToggleField
                        label="Masquer dans le diaporama"
                        checked={slide.hidden}
                        onChange={(hidden) => patchSlide({ hidden })}
                      />
                    </section>
                    <section className="inspector-block">
                      <Buddy caption="Sélectionnez un objet pour le modifier." />
                    </section>
                  </>
                )}
              </TabsContent>
              <TabsContent value="animate">
                <section className="inspector-block buddy-motion-card">
                  <Buddy
                    state="work"
                    caption="Apparition, disparition et 15 mises en évidence."
                  />
                  <Button onClick={() => start(activeIndex)} variant="outline">
                    <Play />
                    Voir Buddy agir
                  </Button>
                </section>
                <section className="inspector-block">
                  <h3>Transition de la diapositive</h3>
                  <Choice
                    label="Action de Buddy"
                    value={slide.transition}
                    options={transitionLabels}
                    onChange={(transition) =>
                      patchSlide({
                        transition: transition as Slide['transition'],
                        transitionDuration: transitionDurations[transition as Slide['transition']],
                      })
                    }
                  />
                  <p className="motion-description">{transitionDescriptions[slide.transition]}</p>
                  <NumberField
                    label="Durée (secondes)"
                    value={slide.transitionDuration / 1000}
                    min={0.4}
                    max={5}
                    step={0.1}
                    onBegin={beginEdit}
                    onEnd={endEdit}
                    onChange={(v) =>
                      patchSlide({ transitionDuration: v * 1000 })
                    }
                  />
                  <ToggleField
                    label="Avancement automatique"
                    checked={slide.autoAdvance !== null}
                    onChange={(v) =>
                      patchSlide({ autoAdvance: v ? 5000 : null })
                    }
                  />
                  {slide.autoAdvance !== null && (
                    <NumberField
                      label="Attente (secondes)"
                      value={slide.autoAdvance / 1000}
                      min={1}
                      max={120}
                      onChange={(v) => patchSlide({ autoAdvance: v * 1000 })}
                    />
                  )}
                </section>
                {element && (
                  <section className="inspector-block">
                    <h3>{elementLabels[element.kind]} sélectionné</h3>
                    <Choice label="Type d’effet" value={animationModeFor(element)} options={animationModeLabels}
                      onChange={(mode) => patchElement(element.id, { animationMode: mode as SlideElement['animationMode'], animation: mode === 'emphasis' ? 'highlight' : 'reveal' })} />
                    <Choice label="Appliquer à" value={element.animationScope || (element.kind === 'text' || element.kind === 'code' ? 'word' : 'block')}
                      options={element.kind === 'text' || element.kind === 'code' ? animationScopeLabels : {block:'Bloc complet'}}
                      onChange={(scope) => patchElement(element.id, {animationScope:scope as SlideElement['animationScope'],animationDuration:animationDurationFor(element.animation,element.kind==='text'?element.text:element.kind==='code'?element.code:'',scope as NonNullable<SlideElement['animationScope']>)})} />
                    <p className="field-help">Texte entier : les lettres ensemble. Bloc complet : l’objet avec son fond et son cadre.</p>
                    <Choice
                      label="Animation"
                      value={element.animation==='exit'?'reveal':element.animation}
                      options={animationOptions(animationModeFor(element))}
                      onChange={(animation) =>
                        patchElement(element.id, {
                          animation: animation as SlideElement['animation'],
                          animationDuration: animationDurationFor(animation as SlideElement['animation'], element.kind === 'text' ? element.text : element.kind === 'code' ? element.code : '', element.animationScope || 'word'),
                        })
                      }
                    />
                    <p className="motion-description">{animationDescriptions[element.animation]}</p>
                    <Choice
                      label="Déclenchement"
                      value={element.animationTrigger}
                      options={animationTriggerLabels}
                      onChange={(animationTrigger) =>
                        patchElement(element.id, {
                          animationTrigger:
                            animationTrigger as SlideElement['animationTrigger'],
                        })
                      }
                    />
                    <div className="inspector-row">
                      <NumberField
                        label="Ordre"
                        value={element.animationOrder}
                        min={0}
                        max={100}
                        onChange={(animationOrder) =>
                          patchElement(element.id, { animationOrder })
                        }
                      />
                      <NumberField
                        label="Durée (s)"
                        value={element.animationDuration / 1000}
                        min={0.2}
                        max={60}
                        step={0.1}
                        onChange={(v) =>
                          patchElement(element.id, {
                            animationDuration: v * 1000,
                          })
                        }
                      />
                    </div>
                  </section>
                )}
                <section className="inspector-block">
                  <h3>Ordre des animations</h3>
                  {slide.elements
                    .filter((e) => e.animation !== 'none')
                    .sort((a, b) => a.animationOrder - b.animationOrder)
                    .map((e, i) => (
                      <button
                        className="animation-row"
                        data-active={selected.includes(e.id)}
                        key={e.id}
                        onClick={() => select([e.id])}
                      >
                        <span>{i + 1}</span>
                        <div>
                          <strong>{animationLabels[e.animation]}</strong>
                          <small>
                            {e.kind === 'text'
                              ? e.text.slice(0, 38)
                              : elementLabels[e.kind]}{' '}
                            · {animationModeLabels[animationModeFor(e)]} · {animationScopeLabels[e.animationScope || 'word']} · {animationTriggerLabels[e.animationTrigger]}
                          </small>
                        </div>
                      </button>
                    ))}
                  {!slide.elements.some((e) => e.animation !== 'none') && (
                    <p className="field-help">
                      Sélectionnez un objet puis choisissez une action de Buddy.
                    </p>
                  )}
                </section>
              </TabsContent>
              <TabsContent value="layers">
                <div className="inspector-heading">
                  <strong>Objets de la diapositive</strong>
                  <Layers size={16} />
                </div>
                <div className="layer-list">
                  {[...slide.elements]
                    .sort((a, b) => b.z - a.z)
                    .map((e) => (
                      <div
                        key={e.id}
                        className="layer-row"
                        data-active={selected.includes(e.id)}
                      >
                        <button
                          onClick={(event) =>
                            selectElement(e.id, event.shiftKey)
                          }
                        >
                          <span>{elementLabels[e.kind]}</span>
                          <small>
                            {e.kind === 'text'
                              ? e.text.slice(0, 35)
                              : e.kind === 'image'
                                ? e.alt
                                : e.groupId
                                  ? 'Groupe'
                                  : `Calque ${e.z + 1}`}
                          </small>
                        </button>
                        <IconAction
                          title={
                            e.hidden ? 'Afficher l’objet' : 'Masquer l’objet'
                          }
                          onClick={() =>
                            patchElement(e.id, { hidden: !e.hidden })
                          }
                        >
                          {e.hidden ? <EyeOff /> : <Eye />}
                        </IconAction>
                        <IconAction
                          title={e.locked ? 'Déverrouiller' : 'Verrouiller'}
                          onClick={() =>
                            patchElement(e.id, { locked: !e.locked })
                          }
                        >
                          {e.locked ? <Lock /> : <Unlock />}
                        </IconAction>
                      </div>
                    ))}
                </div>
                <section className="inspector-block">
                  <Button
                    variant="outline"
                    disabled={!element}
                    onClick={() => layer(1)}
                  >
                    <ArrowUp />
                    Avancer d’un plan
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!element}
                    onClick={() => layer(-1)}
                  >
                    <ArrowDown />
                    Reculer d’un plan
                  </Button>
                </section>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
        <output className="studio-status" aria-live="polite">
          {status}
          <span>
            ⇧ clic : sélection multiple · Glissez vos images sur la diapositive
          </span>
        </output>
      </div>
      <input
        ref={imageInput}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        aria-label="Importer des images"
        onChange={(e) => {
          if (e.target.files)
            void imageFiles(e.target.files, replaceImage.current);
          e.target.value = '';
        }}
      />
      <input
        ref={importInput}
        className="sr-only"
        type="file"
        accept=".json,.buddydeck,.pptx,.odp"
        aria-label="Importer une présentation"
        onChange={importDeck}
      />
      <SharedProjectDialog open={shareOpen} onOpenChange={setShareOpen} state={shared} name={personName}
        onName={name=>{setPersonName(name);try{localStorage.setItem('buddy-collaborator-name',name);}catch{/* Preference is optional. */}}}
        onCreate={beginSharing} onRotate={async()=>{await sharedRef.current?.rotate();}}
        onLeave={()=>{void leaveShared().catch(()=>setStatus('Impossible de restaurer les projets locaux.'));}} />
      <Dialog
        open={library !== null}
        onOpenChange={(open) => !open && setLibrary(null)}
      >
        <DialogContent className="deck-library">
          <DialogTitle>Mes présentations</DialogTitle>
          <DialogDescription>
            Ces documents sont conservés dans ce navigateur. Exportez un fichier
            Buddy pour les transférer.
          </DialogDescription>
          <Button
            onClick={() => {
              void saveBeforeSwitch()
                .then(() => {
                  const next = {
                    ...copy(initialDeck),
                    id: createId('deck'),
                    title: 'Nouvelle présentation',
                  };
                  switchDocument(next);
                  activate(next.slides[0].id);
                  setLibrary(null);
                })
                .catch(() =>
                  setStatus(
                    'Exportez votre présentation avant de changer de document : le stockage local est indisponible.',
                  ),
                );
            }}
          >
            <Plus />
            Nouvelle présentation
          </Button>
          {sharedLibrary.map(item => <button className="library-item" key={item.id} onClick={() => {void saveBeforeSwitch().then(() => {openShared(item.connection);setLibrary(null);}).catch(()=>setStatus('Sauvegarde indisponible.'));}}><strong><Users size={14} className="inline mr-2"/>{item.title}</strong><span>Projet partagé{item.pending?' · modifications en attente':''}</span></button>)}
          {library?.map((item) => (
            <button
              key={item.id}
              className="library-item"
              onClick={() => {
                void saveBeforeSwitch()
                  .then(() => {
                    switchDocument(item);
                    activate(item.slides[0].id);
                    setLibrary(null);
                  })
                  .catch(() =>
                    setStatus(
                      'Exportez votre présentation avant de changer de document : le stockage local est indisponible.',
                    ),
                  );
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.slides.length} diapositives</span>
            </button>
          ))}
        </DialogContent>
      </Dialog>
      {playback && !presenter && (
        <StudioPlayer
          deck={deck}
          state={playback}
          onNext={next}
          onPrevious={previous}
          onClose={close}
          onBusy={onBusy}
        />
      )}
      {playback && presenter && (
        <PresenterConsole
          deck={deck}
          currentIndex={playback.index}
          buildStep={playback.step}
          elapsedSeconds={elapsedSeconds}
          onClose={close}
          onNext={next}
          onPrevious={previous}
          onGoTo={goTo}
          onResetTimer={() => {
            presentationStartedAt.current = Date.now();
            setElapsedSeconds(0);
          }}
        />
      )}
      {printing && (
        <div className="print-deck">
          {deck.slides
            .filter((s) => !s.hidden)
            .map((s) => (
              <div className="print-slide" key={s.id}>
                <StudioSlide slide={s} aspectRatio={deck.aspectRatio} />
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
