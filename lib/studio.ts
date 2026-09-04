/**
 * Data model for Buddy Keynote Studio.
 *
 * Element geometry is expressed as percentages of the slide (0..100).
 * Durations and auto-advance delays are expressed in milliseconds.
 */

export const STUDIO_SCHEMA_VERSION = 2 as const;

export type DeckTheme = 'studio' | 'editorial' | 'terminal';
export type AspectRatio = '16:9' | '4:3';
export type SlideTone = 'paper' | 'mist' | 'ink';
export type Transition = 'cut' | 'push' | 'wipe' | 'lift' | 'dissolve' | 'zoom';
export type ElementAnimation =
  | 'none'
  | 'type'
  | 'reveal'
  | 'rise'
  | 'emphasis'
  | 'exit';
export type AnimationTrigger = 'click' | 'with' | 'after';
export type SlideElementKind =
  | 'text'
  | 'shape'
  | 'image'
  | 'table'
  | 'chart'
  | 'code'
  | 'buddy'
  | 'media';

export type TextAlign = 'left' | 'center' | 'right';
export type FontStyle = 'normal' | 'italic';
export type TextDecoration = 'none' | 'underline' | 'line-through';
export type ShapeType =
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'star';
export type ImageFit = 'cover' | 'contain' | 'fill';
export type ChartType = 'bar' | 'line' | 'pie';
export type CodeTheme = 'light' | 'dark';
export type BuddyState =
  | 'ok'
  | 'update'
  | 'work'
  | 'done'
  | 'error'
  | 'noConfig';
export type MediaType = 'video' | 'audio';

export interface BaseSlideElement {
  id: string;
  kind: SlideElementKind;
  /** Optional identifier shared by elements that move as a group. */
  groupId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  animation: ElementAnimation;
  animationOrder: number;
  animationTrigger: AnimationTrigger;
  animationDuration: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  align: TextAlign;
  color: string;
  background: string;
  lineHeight: number;
  letterSpacing: number;
}

export interface TextElement extends BaseSlideElement {
  kind: 'text';
  text: string;
  style: TextStyle;
}

export interface ShapeElement extends BaseSlideElement {
  kind: 'shape';
  shape: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface ImageElement extends BaseSlideElement {
  kind: 'image';
  src: string;
  alt: string;
  fit: ImageFit;
  borderRadius: number;
}

export interface TableElement extends BaseSlideElement {
  kind: 'table';
  cells: string[][];
  headerRow: boolean;
  fill: string;
  stroke: string;
  textColor: string;
}

export interface ChartDataset {
  label: string;
  values: number[];
  color: string;
}

export interface ChartElement extends BaseSlideElement {
  kind: 'chart';
  chartType: ChartType;
  labels: string[];
  datasets: ChartDataset[];
  showLegend: boolean;
}

export interface CodeElement extends BaseSlideElement {
  kind: 'code';
  code: string;
  language: string;
  showLines: boolean;
  theme: CodeTheme;
}

export interface BuddyElement extends BaseSlideElement {
  kind: 'buddy';
  state: BuddyState;
  caption: string;
}

export interface MediaElement extends BaseSlideElement {
  kind: 'media';
  mediaType: MediaType;
  src: string;
  title: string;
  autoplay: boolean;
  loop: boolean;
  controls: boolean;
}

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | TableElement
  | ChartElement
  | CodeElement
  | BuddyElement
  | MediaElement;

export interface Slide {
  id: string;
  name: string;
  tone: SlideTone;
  transition: Transition;
  transitionDuration: number;
  autoAdvance: number | null;
  hidden: boolean;
  notes: string;
  elements: SlideElement[];
}

export interface Deck {
  schemaVersion: 2;
  id: string;
  title: string;
  theme: DeckTheme;
  aspectRatio: AspectRatio;
  slides: Slide[];
  updatedAt: string;
}

export const themeLabels: Record<DeckTheme, string> = {
  studio: 'Studio STH',
  editorial: 'Éditorial',
  terminal: 'Terminal',
};

export const aspectRatioLabels: Record<AspectRatio, string> = {
  '16:9': 'Écran large · 16:9',
  '4:3': 'Standard · 4:3',
};

export const toneLabels: Record<SlideTone, string> = {
  paper: 'Papier',
  mist: 'Brume',
  ink: 'Encre',
};

export const transitionLabels: Record<Transition, string> = {
  cut: 'Buddy coupe',
  push: 'Buddy pousse',
  wipe: 'Buddy balaie',
  lift: 'Buddy soulève',
  dissolve: 'Buddy dissout',
  zoom: 'Buddy zoome',
};

export const animationLabels: Record<ElementAnimation, string> = {
  none: 'Aucune',
  type: 'Buddy écrit',
  reveal: 'Buddy dévoile',
  rise: 'Buddy fait monter',
  emphasis: 'Buddy souligne',
  exit: 'Buddy fait sortir',
};

export const animationTriggerLabels: Record<AnimationTrigger, string> = {
  click: 'Au clic',
  with: 'Avec la précédente',
  after: 'Après la précédente',
};

export const elementLabels: Record<SlideElementKind, string> = {
  text: 'Texte',
  shape: 'Forme',
  image: 'Image',
  table: 'Tableau',
  chart: 'Graphique',
  code: 'Code',
  buddy: 'Buddy',
  media: 'Audio / vidéo',
};

export const shapeLabels: Record<ShapeType, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  line: 'Ligne',
  arrow: 'Flèche',
  star: 'Étoile',
};

export const chartLabels: Record<ChartType, string> = {
  bar: 'Barres',
  line: 'Courbe',
  pie: 'Secteurs',
};

export const labels = {
  themes: themeLabels,
  aspectRatios: aspectRatioLabels,
  tones: toneLabels,
  transitions: transitionLabels,
  animations: animationLabels,
  animationTriggers: animationTriggerLabels,
  elements: elementLabels,
  shapes: shapeLabels,
  charts: chartLabels,
} as const;

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 42,
  fontWeight: 700,
  fontStyle: 'normal',
  textDecoration: 'none',
  align: 'left',
  color: '#111111',
  background: 'transparent',
  lineHeight: 1.08,
  letterSpacing: -0.02,
};

function baseElement<K extends SlideElementKind>(kind: K) {
  return {
    id: createId(kind),
    kind,
    x: 10,
    y: 20,
    w: 44,
    h: 20,
    z: 1,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    animation: 'none' as ElementAnimation,
    animationOrder: 0,
    animationTrigger: 'click' as AnimationTrigger,
    animationDuration: 1200,
  };
}

export function createId(prefix = 'item'): string {
  const safePrefix =
    prefix
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .slice(0, 32) || 'item';
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${safePrefix}-${crypto.randomUUID()}`;
  }
  return `${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ElementByKind<K extends SlideElementKind> = Extract<
  SlideElement,
  { kind: K }
>;

export function makeElement<K extends SlideElementKind>(
  kind: K,
): ElementByKind<K> {
  const base = baseElement(kind);
  let element: SlideElement;

  switch (kind) {
    case 'text':
      element = {
        ...base,
        kind,
        text: 'Votre texte',
        style: { ...DEFAULT_TEXT_STYLE },
      };
      break;
    case 'shape':
      element = {
        ...base,
        kind,
        shape: 'rectangle',
        fill: '#F0F0EC',
        stroke: '#111111',
        strokeWidth: 1,
        radius: 4,
      };
      break;
    case 'image':
      element = {
        ...base,
        kind,
        src: '',
        alt: '',
        fit: 'cover',
        borderRadius: 4,
      };
      break;
    case 'table':
      element = {
        ...base,
        kind,
        w: 62,
        h: 30,
        cells: [
          ['Colonne A', 'Colonne B', 'Colonne C'],
          ['Valeur 1', 'Valeur 2', 'Valeur 3'],
        ],
        headerRow: true,
        fill: '#FFFFFF',
        stroke: '#D6D6D0',
        textColor: '#111111',
      };
      break;
    case 'chart':
      element = {
        ...base,
        kind,
        w: 58,
        h: 40,
        chartType: 'bar',
        labels: ['T1', 'T2', 'T3'],
        datasets: [
          { label: 'Adoption', values: [34, 58, 81], color: '#111111' },
        ],
        showLegend: true,
      };
      break;
    case 'code':
      element = {
        ...base,
        kind,
        w: 58,
        h: 36,
        code: 'const savoir = partager();',
        language: 'typescript',
        showLines: true,
        theme: 'dark',
      };
      break;
    case 'buddy':
      element = {
        ...base,
        kind,
        x: 72,
        y: 40,
        w: 18,
        h: 28,
        state: 'done',
        caption: 'Je m’en occupe.',
      };
      break;
    case 'media':
      element = {
        ...base,
        kind,
        w: 58,
        h: 36,
        mediaType: 'video',
        src: '',
        title: 'Nouveau média',
        autoplay: false,
        loop: false,
        controls: true,
      };
      break;
    default:
      return assertNever(kind);
  }

  return element as ElementByKind<K>;
}

export function makeSlide(
  title = 'Donnez du relief à votre message.',
  body = 'Écrivez ici le point que votre audience doit retenir.',
): Slide {
  const titleElement = makeElement('text');
  titleElement.text = title.trim() || 'Donnez du relief à votre message.';
  titleElement.x = 8;
  titleElement.y = 20;
  titleElement.w = 72;
  titleElement.h = 26;
  titleElement.style.fontSize = 64;
  titleElement.animation = 'reveal';
  titleElement.animationTrigger = 'after';

  const bodyElement = makeElement('text');
  bodyElement.text =
    body.trim() || 'Écrivez ici le point que votre audience doit retenir.';
  bodyElement.x = 8;
  bodyElement.y = 58;
  bodyElement.w = 62;
  bodyElement.h = 18;
  bodyElement.z = 2;
  bodyElement.style.fontSize = 30;
  bodyElement.style.fontWeight = 400;
  bodyElement.style.lineHeight = 1.4;
  bodyElement.animation = 'rise';
  bodyElement.animationOrder = 1;
  bodyElement.animationTrigger = 'after';

  return {
    id: createId('slide'),
    name:
      title.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Nouvelle diapositive',
    tone: 'paper',
    transition: 'push',
    transitionDuration: 1400,
    autoAdvance: null,
    hidden: false,
    notes: '',
    elements: [titleElement, bodyElement],
  };
}

const initialSlideOne: Slide = {
  id: 'opening',
  name: 'Ouverture',
  tone: 'paper',
  transition: 'push',
  transitionDuration: 1400,
  autoAdvance: null,
  hidden: false,
  notes: 'Marquer une pause après la première phrase. Puis introduire Buddy.',
  elements: [
    textElement(
      'opening-eyebrow',
      'STH KEYNOTE · 2026',
      8,
      10,
      45,
      6,
      16,
      700,
      '#5C5C57',
    ),
    textElement(
      'opening-title',
      'Le savoir circule.\nLes équipes avancent.',
      8,
      24,
      72,
      30,
      58,
      750,
      '#111111',
      'reveal',
    ),
    textElement(
      'opening-body',
      'Une seule source de vérité pour transmettre les pratiques qui font gagner du temps.',
      8,
      66,
      62,
      17,
      28,
      400,
      '#3A3A37',
      'rise',
      1,
      'after',
    ),
    buddyElement(
      'opening-buddy',
      79,
      58,
      'work',
      'Je mets le savoir en mouvement.',
      3,
    ),
  ],
};

const initialSlideTwo: Slide = {
  id: 'problem',
  name: 'Le constat',
  tone: 'mist',
  transition: 'wipe',
  transitionDuration: 1500,
  autoAdvance: null,
  hidden: false,
  notes: 'Donner un exemple concret vécu par une équipe produit.',
  elements: [
    textElement(
      'problem-eyebrow',
      'LE CONSTAT',
      8,
      10,
      35,
      6,
      16,
      700,
      '#5C5C57',
    ),
    textElement(
      'problem-title',
      'Le contexte se perd\nentre les outils.',
      16,
      27,
      68,
      28,
      56,
      750,
      '#111111',
      'reveal',
    ),
    textElement(
      'problem-body',
      'Les décisions, les méthodes et les automatismes restent dispersés. STH les rend transmissibles.',
      20,
      66,
      60,
      18,
      28,
      400,
      '#3A3A37',
      'rise',
      1,
      'click',
    ),
  ],
};

const initialSlideThree: Slide = {
  id: 'buddy',
  name: 'Buddy entre en scène',
  tone: 'ink',
  transition: 'lift',
  transitionDuration: 1500,
  autoAdvance: null,
  hidden: false,
  notes: 'Laisser Buddy terminer son mouvement avant de reprendre.',
  elements: [
    textElement(
      'buddy-eyebrow',
      'BUDDY ENTRE EN SCÈNE',
      8,
      10,
      44,
      6,
      16,
      700,
      '#B8B8B0',
    ),
    textElement(
      'buddy-title',
      'Chaque mouvement\na une intention.',
      8,
      25,
      58,
      30,
      56,
      750,
      '#FFFFFF',
      'type',
    ),
    textElement(
      'buddy-body',
      'Buddy orchestre les transitions et révèle le texte au rythme de votre discours.',
      8,
      66,
      55,
      18,
      28,
      400,
      '#D6D6D0',
      'rise',
      1,
      'after',
    ),
    buddyElement('buddy-director', 72, 34, 'done', 'À nous de jouer.', 4),
  ],
};

export const initialDeck: Deck = {
  schemaVersion: STUDIO_SCHEMA_VERSION,
  id: 'sth-keynote-demo',
  title: 'Le savoir en mouvement',
  theme: 'studio',
  aspectRatio: '16:9',
  slides: [initialSlideOne, initialSlideTwo, initialSlideThree],
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const MAX_SLIDES = 250;
const MAX_ELEMENTS_PER_SLIDE = 300;
const MAX_ID_LENGTH = 160;
const MAX_ASSET_LENGTH = 8_000_000;

type JsonRecord = Record<string, unknown>;

function assertNever(value: never): never {
  throw new Error(`Unsupported element kind: ${String(value)}`);
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function string(
  value: unknown,
  max: number,
  allowEmpty = true,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    (allowEmpty || value.trim().length > 0)
  );
}

function id(value: unknown): value is string {
  return string(value, MAX_ID_LENGTH, false);
}

function finiteNumber(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && finiteNumber(value, min, max);
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

const THEMES = ['studio', 'editorial', 'terminal'] as const;
const ASPECT_RATIOS = ['16:9', '4:3'] as const;
const TONES = ['paper', 'mist', 'ink'] as const;
const TRANSITIONS = [
  'cut',
  'push',
  'wipe',
  'lift',
  'dissolve',
  'zoom',
] as const;
const ANIMATIONS = [
  'none',
  'type',
  'reveal',
  'rise',
  'emphasis',
  'exit',
] as const;
const TRIGGERS = ['click', 'with', 'after'] as const;
const FONT_STYLES = ['normal', 'italic'] as const;
const TEXT_DECORATIONS = ['none', 'underline', 'line-through'] as const;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const SHAPES = [
  'rectangle',
  'ellipse',
  'triangle',
  'line',
  'arrow',
  'star',
] as const;
const IMAGE_FITS = ['cover', 'contain', 'fill'] as const;
const CHART_TYPES = ['bar', 'line', 'pie'] as const;
const CODE_THEMES = ['light', 'dark'] as const;
const BUDDY_STATES = [
  'ok',
  'update',
  'work',
  'done',
  'error',
  'noConfig',
] as const;
const MEDIA_TYPES = ['video', 'audio'] as const;

function validTimestamp(value: unknown): value is string {
  return string(value, 64, false) && Number.isFinite(Date.parse(value));
}

function validColor(value: unknown): value is string {
  if (!string(value, 40, false)) return false;
  return (
    value === 'transparent' ||
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^rgba?\([0-9.,%\s]+\)$/i.test(value) ||
    /^hsla?\([0-9.,%\s]+\)$/i.test(value)
  );
}

function validAssetSource(
  value: unknown,
  kind: 'image' | 'media',
): value is string {
  if (!string(value, MAX_ASSET_LENGTH)) return false;
  if (value === '') return true;
  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith('/') ||
    value.startsWith('blob:')
  )
    return true;
  return kind === 'image'
    ? /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)
    : /^data:(audio|video)\/[a-z0-9.+-]+;base64,/i.test(value);
}

function readBase(
  value: JsonRecord,
  expectedKind: SlideElementKind,
): BaseSlideElement | null {
  if (
    value.kind !== expectedKind ||
    !id(value.id) ||
    (value.groupId !== undefined && !id(value.groupId)) ||
    !finiteNumber(value.x, 0, 100) ||
    !finiteNumber(value.y, 0, 100) ||
    !finiteNumber(value.w, 0.25, 100) ||
    !finiteNumber(value.h, 0.25, 100) ||
    !integer(value.z, 0, 10_000) ||
    !finiteNumber(value.rotation, -360, 360) ||
    !finiteNumber(value.opacity, 0, 1) ||
    typeof value.locked !== 'boolean' ||
    typeof value.hidden !== 'boolean' ||
    !oneOf(value.animation, ANIMATIONS) ||
    !integer(value.animationOrder, 0, 10_000) ||
    !oneOf(value.animationTrigger, TRIGGERS) ||
    !finiteNumber(value.animationDuration, 0, 60_000)
  ) {
    return null;
  }

  return {
    id: value.id,
    kind: expectedKind,
    ...(value.groupId === undefined ? {} : { groupId: value.groupId }),
    x: value.x,
    y: value.y,
    w: value.w,
    h: value.h,
    z: value.z,
    rotation: value.rotation,
    opacity: value.opacity,
    locked: value.locked,
    hidden: value.hidden,
    animation: value.animation,
    animationOrder: value.animationOrder,
    animationTrigger: value.animationTrigger,
    animationDuration: value.animationDuration,
  };
}

function readTextStyle(value: unknown): TextStyle | null {
  const style = record(value);
  if (
    !style ||
    !string(style.fontFamily, 100, false) ||
    !finiteNumber(style.fontSize, 6, 400) ||
    !integer(style.fontWeight, 100, 1000) ||
    !oneOf(style.fontStyle, FONT_STYLES) ||
    !oneOf(style.textDecoration, TEXT_DECORATIONS) ||
    !oneOf(style.align, TEXT_ALIGNS) ||
    !validColor(style.color) ||
    !validColor(style.background) ||
    !finiteNumber(style.lineHeight, 0.5, 4) ||
    !finiteNumber(style.letterSpacing, -20, 50)
  ) {
    return null;
  }

  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textDecoration: style.textDecoration,
    align: style.align,
    color: style.color,
    background: style.background,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
}

function readElement(value: unknown): SlideElement | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.kind !== 'string') return null;

  switch (candidate.kind) {
    case 'text': {
      const base = readBase(candidate, 'text');
      const style = readTextStyle(candidate.style);
      if (!base || !style || !string(candidate.text, 20_000)) return null;
      return { ...base, kind: 'text', text: candidate.text, style };
    }
    case 'shape': {
      const base = readBase(candidate, 'shape');
      if (
        !base ||
        !oneOf(candidate.shape, SHAPES) ||
        !validColor(candidate.fill) ||
        !validColor(candidate.stroke) ||
        !finiteNumber(candidate.strokeWidth, 0, 50) ||
        !finiteNumber(candidate.radius, 0, 100)
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'shape',
        shape: candidate.shape,
        fill: candidate.fill,
        stroke: candidate.stroke,
        strokeWidth: candidate.strokeWidth,
        radius: candidate.radius,
      };
    }
    case 'image': {
      const base = readBase(candidate, 'image');
      if (
        !base ||
        !validAssetSource(candidate.src, 'image') ||
        !string(candidate.alt, 500) ||
        !oneOf(candidate.fit, IMAGE_FITS) ||
        !finiteNumber(candidate.borderRadius, 0, 100)
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'image',
        src: candidate.src,
        alt: candidate.alt,
        fit: candidate.fit,
        borderRadius: candidate.borderRadius,
      };
    }
    case 'table': {
      const base = readBase(candidate, 'table');
      const cells = readCells(candidate.cells);
      if (
        !base ||
        !cells ||
        typeof candidate.headerRow !== 'boolean' ||
        !validColor(candidate.fill) ||
        !validColor(candidate.stroke) ||
        !validColor(candidate.textColor)
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'table',
        cells,
        headerRow: candidate.headerRow,
        fill: candidate.fill,
        stroke: candidate.stroke,
        textColor: candidate.textColor,
      };
    }
    case 'chart': {
      const base = readBase(candidate, 'chart');
      const chart = readChart(candidate);
      if (!base || !chart) return null;
      return { ...base, kind: 'chart', ...chart };
    }
    case 'code': {
      const base = readBase(candidate, 'code');
      if (
        !base ||
        !string(candidate.code, 100_000) ||
        !string(candidate.language, 80, false) ||
        typeof candidate.showLines !== 'boolean' ||
        !oneOf(candidate.theme, CODE_THEMES)
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'code',
        code: candidate.code,
        language: candidate.language,
        showLines: candidate.showLines,
        theme: candidate.theme,
      };
    }
    case 'buddy': {
      const base = readBase(candidate, 'buddy');
      if (
        !base ||
        !oneOf(candidate.state, BUDDY_STATES) ||
        !string(candidate.caption, 500)
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'buddy',
        state: candidate.state,
        caption: candidate.caption,
      };
    }
    case 'media': {
      const base = readBase(candidate, 'media');
      if (
        !base ||
        !oneOf(candidate.mediaType, MEDIA_TYPES) ||
        !validAssetSource(candidate.src, 'media') ||
        !string(candidate.title, 300) ||
        typeof candidate.autoplay !== 'boolean' ||
        typeof candidate.loop !== 'boolean' ||
        typeof candidate.controls !== 'boolean'
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'media',
        mediaType: candidate.mediaType,
        src: candidate.src,
        title: candidate.title,
        autoplay: candidate.autoplay,
        loop: candidate.loop,
        controls: candidate.controls,
      };
    }
    default:
      return null;
  }
}

function readCells(value: unknown): string[][] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50)
    return null;
  let width: number | null = null;
  const cells: string[][] = [];

  for (const row of value) {
    if (!Array.isArray(row) || row.length === 0 || row.length > 30) return null;
    if (width === null) width = row.length;
    if (row.length !== width) return null;
    const nextRow: string[] = [];
    for (const cell of row) {
      if (!string(cell, 2_000)) return null;
      nextRow.push(cell);
    }
    cells.push(nextRow);
  }
  return cells;
}

function readChart(
  value: JsonRecord,
): Pick<
  ChartElement,
  'chartType' | 'labels' | 'datasets' | 'showLegend'
> | null {
  if (
    !oneOf(value.chartType, CHART_TYPES) ||
    !Array.isArray(value.labels) ||
    value.labels.length === 0 ||
    value.labels.length > 100 ||
    typeof value.showLegend !== 'boolean' ||
    !Array.isArray(value.datasets) ||
    value.datasets.length === 0 ||
    value.datasets.length > 20
  ) {
    return null;
  }

  const chartLabels: string[] = [];
  for (const label of value.labels) {
    if (!string(label, 200)) return null;
    chartLabels.push(label);
  }

  const datasets: ChartDataset[] = [];
  for (const rawDataset of value.datasets) {
    const dataset = record(rawDataset);
    if (
      !dataset ||
      !string(dataset.label, 200) ||
      !validColor(dataset.color) ||
      !Array.isArray(dataset.values) ||
      dataset.values.length !== chartLabels.length
    ) {
      return null;
    }
    const values: number[] = [];
    for (const item of dataset.values) {
      if (!finiteNumber(item, -1_000_000_000, 1_000_000_000)) return null;
      values.push(item);
    }
    datasets.push({ label: dataset.label, values, color: dataset.color });
  }

  return {
    chartType: value.chartType,
    labels: chartLabels,
    datasets,
    showLegend: value.showLegend,
  };
}

function readSlide(value: unknown, seenIds: Set<string>): Slide | null {
  const candidate = record(value);
  if (
    !candidate ||
    !id(candidate.id) ||
    seenIds.has(candidate.id) ||
    !string(candidate.name, 200, false) ||
    !oneOf(candidate.tone, TONES) ||
    !oneOf(candidate.transition, TRANSITIONS) ||
    !finiteNumber(candidate.transitionDuration, 0, 30_000) ||
    (candidate.autoAdvance !== null &&
      !finiteNumber(candidate.autoAdvance, 250, 3_600_000)) ||
    typeof candidate.hidden !== 'boolean' ||
    !string(candidate.notes, 50_000) ||
    !Array.isArray(candidate.elements) ||
    candidate.elements.length > MAX_ELEMENTS_PER_SLIDE
  ) {
    return null;
  }

  seenIds.add(candidate.id);
  const elements: SlideElement[] = [];
  for (const rawElement of candidate.elements) {
    const element = readElement(rawElement);
    if (!element || seenIds.has(element.id)) return null;
    seenIds.add(element.id);
    elements.push(element);
  }

  return {
    id: candidate.id,
    name: candidate.name,
    tone: candidate.tone,
    transition: candidate.transition,
    transitionDuration: candidate.transitionDuration,
    autoAdvance: candidate.autoAdvance,
    hidden: candidate.hidden,
    notes: candidate.notes,
    elements,
  };
}

function readV2(value: JsonRecord): Deck | null {
  if (
    value.schemaVersion !== STUDIO_SCHEMA_VERSION ||
    !id(value.id) ||
    !string(value.title, 300, false) ||
    !oneOf(value.theme, THEMES) ||
    !oneOf(value.aspectRatio, ASPECT_RATIOS) ||
    !validTimestamp(value.updatedAt) ||
    !Array.isArray(value.slides) ||
    value.slides.length === 0 ||
    value.slides.length > MAX_SLIDES
  ) {
    return null;
  }

  const seenIds = new Set<string>([value.id]);
  const slides: Slide[] = [];
  for (const rawSlide of value.slides) {
    const slide = readSlide(rawSlide, seenIds);
    if (!slide) return null;
    slides.push(slide);
  }

  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    id: value.id,
    title: value.title,
    theme: value.theme,
    aspectRatio: value.aspectRatio,
    slides,
    updatedAt: value.updatedAt,
  };
}

type LegacyTransition = 'cut' | 'push' | 'wipe' | 'lift';
type LegacyAnimation = 'instant' | 'type' | 'reveal' | 'steps';
type LegacyLayout = 'headline' | 'statement' | 'split';

interface LegacySlide {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  transition: LegacyTransition;
  textAnimation: LegacyAnimation;
  tone: SlideTone;
  layout: LegacyLayout;
  notes: string;
}

function readLegacySlide(
  value: unknown,
  seenIds: Set<string>,
): LegacySlide | null {
  const candidate = record(value);
  if (
    !candidate ||
    !id(candidate.id) ||
    seenIds.has(candidate.id) ||
    !string(candidate.eyebrow, 48) ||
    !string(candidate.title, 120, false) ||
    !string(candidate.body, 320) ||
    !oneOf(candidate.transition, ['cut', 'push', 'wipe', 'lift'] as const) ||
    !oneOf(candidate.textAnimation, [
      'instant',
      'type',
      'reveal',
      'steps',
    ] as const) ||
    !oneOf(candidate.tone, TONES) ||
    !oneOf(candidate.layout, ['headline', 'statement', 'split'] as const) ||
    !string(candidate.notes, 2_000)
  ) {
    return null;
  }
  seenIds.add(candidate.id);
  return {
    id: candidate.id,
    eyebrow: candidate.eyebrow,
    title: candidate.title,
    body: candidate.body,
    transition: candidate.transition,
    textAnimation: candidate.textAnimation,
    tone: candidate.tone,
    layout: candidate.layout,
    notes: candidate.notes,
  };
}

function readV1(value: JsonRecord): Deck | null {
  if (
    value.schemaVersion !== 1 ||
    !id(value.id) ||
    !string(value.title, 300, false) ||
    !validTimestamp(value.updatedAt) ||
    !Array.isArray(value.slides) ||
    value.slides.length === 0 ||
    value.slides.length > MAX_SLIDES
  ) {
    return null;
  }

  const seenIds = new Set<string>([value.id]);
  const legacySlides: LegacySlide[] = [];
  for (const rawSlide of value.slides) {
    const legacy = readLegacySlide(rawSlide, seenIds);
    if (!legacy) return null;
    legacySlides.push(legacy);
  }

  const outputIds = new Set<string>(seenIds);
  const slides = legacySlides.map((slide) =>
    migrateLegacySlide(slide, outputIds),
  );
  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    id: value.id,
    title: value.title,
    theme: 'studio',
    aspectRatio: '16:9',
    slides,
    updatedAt: value.updatedAt,
  };
}

function migrateLegacySlide(slide: LegacySlide, ids: Set<string>): Slide {
  const layout = legacyGeometry(slide.layout);
  const animation = legacyAnimation(slide.textAnimation);
  const titleId = uniqueDerivedId(`${slide.id}-title`, ids);
  const bodyId = uniqueDerivedId(`${slide.id}-body`, ids);
  const eyebrowId = uniqueDerivedId(`${slide.id}-eyebrow`, ids);

  const elements: SlideElement[] = [
    textElement(
      eyebrowId,
      slide.eyebrow,
      layout.eyebrow.x,
      layout.eyebrow.y,
      layout.eyebrow.w,
      layout.eyebrow.h,
      16,
      700,
      slide.tone === 'ink' ? '#B8B8B0' : '#5C5C57',
    ),
    textElement(
      titleId,
      slide.title,
      layout.title.x,
      layout.title.y,
      layout.title.w,
      layout.title.h,
      slide.layout === 'statement' ? 52 : 56,
      750,
      slide.tone === 'ink' ? '#FFFFFF' : '#111111',
      animation,
    ),
    textElement(
      bodyId,
      slide.body,
      layout.body.x,
      layout.body.y,
      layout.body.w,
      layout.body.h,
      22,
      400,
      slide.tone === 'ink' ? '#D6D6D0' : '#3A3A37',
      slide.textAnimation === 'steps' ? 'rise' : animation,
      1,
      slide.textAnimation === 'steps' ? 'click' : 'after',
    ),
  ];

  if (slide.layout === 'split') {
    const buddyId = uniqueDerivedId(`${slide.id}-buddy`, ids);
    elements.push(
      buddyElement(buddyId, 72, 35, 'done', 'Je dirige la scène.', 4),
    );
  }

  return {
    id: slide.id,
    name:
      slide.eyebrow.trim() ||
      slide.title.replace(/\s+/g, ' ').trim().slice(0, 60),
    tone: slide.tone,
    transition: slide.transition,
    transitionDuration: transitionDuration(slide.transition),
    autoAdvance: null,
    hidden: false,
    notes: slide.notes,
    elements,
  };
}

function legacyAnimation(value: LegacyAnimation): ElementAnimation {
  switch (value) {
    case 'instant':
      return 'none';
    case 'type':
      return 'type';
    case 'reveal':
      return 'reveal';
    case 'steps':
      return 'rise';
  }
}

function transitionDuration(value: LegacyTransition): number {
  switch (value) {
    case 'cut':
      return 1100;
    case 'push':
      return 1400;
    case 'wipe':
      return 1500;
    case 'lift':
      return 1400;
  }
}

function uniqueDerivedId(preferred: string, ids: Set<string>): string {
  let candidate = preferred.slice(0, MAX_ID_LENGTH);
  let suffix = 2;
  while (ids.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${preferred.slice(0, MAX_ID_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  ids.add(candidate);
  return candidate;
}

function legacyGeometry(layout: LegacyLayout) {
  if (layout === 'statement') {
    return {
      eyebrow: { x: 8, y: 10, w: 40, h: 6 },
      title: { x: 15, y: 27, w: 70, h: 29 },
      body: { x: 20, y: 66, w: 60, h: 18 },
    };
  }
  if (layout === 'split') {
    return {
      eyebrow: { x: 8, y: 10, w: 45, h: 6 },
      title: { x: 8, y: 25, w: 57, h: 30 },
      body: { x: 8, y: 66, w: 55, h: 18 },
    };
  }
  return {
    eyebrow: { x: 8, y: 10, w: 45, h: 6 },
    title: { x: 8, y: 24, w: 72, h: 30 },
    body: { x: 8, y: 66, w: 62, h: 18 },
  };
}

function textElement(
  elementId: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  fontWeight: number,
  color: string,
  animation: ElementAnimation = 'none',
  animationOrder = 0,
  animationTrigger: AnimationTrigger = 'click',
): TextElement {
  return {
    id: elementId,
    kind: 'text',
    x,
    y,
    w,
    h,
    z: 1 + animationOrder,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    animation,
    animationOrder,
    animationTrigger,
    animationDuration: animation === 'type' ? 2_200 : 1200,
    text,
    style: { ...DEFAULT_TEXT_STYLE, fontSize, fontWeight, color },
  };
}

function buddyElement(
  elementId: string,
  x: number,
  y: number,
  state: BuddyState,
  caption: string,
  z: number,
): BuddyElement {
  return {
    id: elementId,
    kind: 'buddy',
    x,
    y,
    w: 18,
    h: 28,
    z,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    animation: 'rise',
    animationOrder: 0,
    animationTrigger: 'with',
    animationDuration: 720,
    state,
    caption,
  };
}

/**
 * Validates and sanitizes a Studio deck. Legacy schemaVersion 1 decks are
 * converted to schemaVersion 2 without mutating the supplied value.
 */
export function migrateDeck(value: unknown): Deck | null {
  const candidate = record(value);
  if (!candidate) return null;
  if (candidate.schemaVersion === STUDIO_SCHEMA_VERSION)
    return readV2(candidate);
  if (candidate.schemaVersion === 1) return readV1(candidate);
  return null;
}
