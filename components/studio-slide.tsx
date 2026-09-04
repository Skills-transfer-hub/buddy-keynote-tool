'use client';

import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import go from 'highlight.js/lib/languages/go';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import plaintext from 'highlight.js/lib/languages/plaintext';
import { StudioChart } from '@/components/studio-chart';

import { Buddy } from '@/components/buddy';
import type {
  AspectRatio,
  BuddyElement,
  CodeElement,
  ImageElement,
  MediaElement,
  ShapeElement,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
} from '@/lib/studio';

export type StudioSlideProps = {
  slide: Slide;
  aspectRatio: AspectRatio;
  editable?: boolean;
  presenting?: boolean;
  selectedId?: string;
  selectedIds?: string[];
  buildStep?: number;
  progress?: Record<string, number>;
  activeElementId?: string;
  onSelect?: (id: string, additive?: boolean) => void;
  onTransformStart?: () => void;
  onTransform?: (id: string, patch: Partial<SlideElement>) => void;
  onTransformEnd?: () => void;
  onTextChange?: (id: string, text: string) => void;
};

for (const [name, language] of Object.entries({
  typescript,
  javascript,
  python,
  bash,
  json,
  go,
  sql,
  html: xml,
  css,
  plaintext,
}))
  hljs.registerLanguage(name, language);

type ActiveTransform = {
  id: string;
  pointerId: number;
  mode: 'move' | 'resize';
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  slideWidth: number;
  slideHeight: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function focusTextEditor(node: HTMLTextAreaElement | null) {
  node?.focus();
}

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function additive(event: {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}) {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

function motionStyle(
  element: SlideElement,
  presenting: boolean,
  progress: number,
): CSSProperties {
  const rotation = `rotate(${element.rotation}deg)`;
  const result: CSSProperties = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.w}%`,
    height: `${element.h}%`,
    zIndex: element.z,
    opacity: element.opacity,
    transform: rotation,
  };

  // The editor always shows the final authored state. Presentation motion is
  // driven exclusively by the parent's RAF timeline.
  if (
    !presenting ||
    element.animation === 'none' ||
    (element.animation === 'type' &&
      (element.kind === 'text' || element.kind === 'code'))
  ) {
    return result;
  }
  if (element.animation === 'reveal' || element.animation === 'type') {
    result.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
  } else if (element.animation === 'rise') {
    result.opacity = element.opacity * progress;
    result.transform = `${rotation} translateY(${((1 - progress) * 800) / element.h}%)`;
  } else if (element.animation === 'emphasis' && element.kind !== 'buddy') {
    result.transform = `${rotation} scale(${1 + Math.sin(Math.PI * progress) * 0.05})`;
  } else if (element.animation === 'exit') {
    result.clipPath = `inset(0 ${progress * 100}% 0 0)`;
  }
  return result;
}

function TextContent({
  element,
  presenting,
  progress,
}: {
  element: TextElement;
  presenting: boolean;
  progress: number;
}) {
  const characters = useMemo(() => Array.from(element.text), [element.text]);
  const typing = presenting && element.animation === 'type';
  const visibleCount = typing
    ? Math.floor(progress * characters.length)
    : characters.length;
  const style: CSSProperties = {
    color: element.style.color,
    backgroundColor: element.style.background,
    fontFamily: element.style.fontFamily,
    fontSize: `${element.style.fontSize / 12}cqw`,
    fontWeight: element.style.fontWeight,
    fontStyle: element.style.fontStyle,
    textDecoration: element.style.textDecoration,
    textAlign: element.style.align,
    lineHeight: element.style.lineHeight,
    letterSpacing: `${element.style.letterSpacing}em`,
  };

  return (
    <p
      className={classes(
        'studio-text-content',
        typing && 'studio-text-content-type',
      )}
      style={style}
      aria-label={typing ? element.text : undefined}
    >
      {typing
        ? characters.map((character, index) => {
            const visible = index < visibleCount;
            return (
              <span
                key={`${index}-${character}`}
                className="studio-type-character"
                data-char-index={index}
                data-visible={visible ? 'true' : 'false'}
                aria-hidden="true"
                style={{ visibility: visible ? 'visible' : 'hidden' }}
              >
                {character}
              </span>
            );
          })
        : element.text}
    </p>
  );
}

function ShapeContent({ element }: { element: ShapeElement }) {
  const paint = {
    fill: element.fill,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
    style: { strokeWidth: `${element.strokeWidth / 12}cqw` },
    vectorEffect: 'non-scaling-stroke' as const,
  };
  return (
    <svg
      className={classes('studio-shape-svg', `studio-shape-${element.shape}`)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {element.shape === 'ellipse' ? (
        <ellipse cx="50" cy="50" rx="48" ry="48" {...paint} />
      ) : element.shape === 'triangle' ? (
        <path d="M 50 2 L 98 98 L 2 98 Z" {...paint} />
      ) : element.shape === 'star' ? (
        <path
          d="M50 2 61 36 97 36 68 57 79 92 50 71 21 92 32 57 3 36 39 36Z"
          {...paint}
        />
      ) : element.shape === 'line' ? (
        <line x1="2" y1="50" x2="98" y2="50" {...paint} fill="none" />
      ) : element.shape === 'arrow' ? (
        <>
          <line x1="2" y1="50" x2="86" y2="50" {...paint} fill="none" />
          <path d="M 78 34 L 98 50 L 78 66 Z" {...paint} />
        </>
      ) : (
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          rx={element.radius}
          ry={element.radius}
          {...paint}
        />
      )}
    </svg>
  );
}

function ImageContent({ element }: { element: ImageElement }) {
  if (!element.src) {
    return (
      <figure
        className="studio-media-placeholder"
        aria-label="Emplacement image vide"
      >
        <span aria-hidden="true">▧</span>
        <span>Ajoutez une image</span>
      </figure>
    );
  }
  return (
    // The studio must render user-selected object URLs and data URLs directly.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="studio-image"
      src={element.src}
      alt={element.alt || 'Image de la présentation'}
      draggable={false}
      data-fit={element.fit}
      style={{
        objectFit: element.fit,
        borderRadius: `${element.borderRadius / 12}cqw`,
      }}
    />
  );
}

function TableContent({ element }: { element: TableElement }) {
  if (element.cells.length === 0) {
    return <div className="studio-empty-content">Tableau vide</div>;
  }
  return (
    <div className="studio-table-scroll">
      <table
        className="studio-table"
        style={{ backgroundColor: element.fill, color: element.textColor }}
      >
        <tbody>
          {element.cells.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => {
                const Cell = element.headerRow && rowIndex === 0 ? 'th' : 'td';
                return (
                  <Cell
                    key={`cell-${rowIndex}-${cellIndex}`}
                    scope={Cell === 'th' ? 'col' : undefined}
                    style={{ borderColor: element.stroke }}
                  >
                    {cell}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeContent({
  element,
  presenting,
  progress,
}: {
  element: CodeElement;
  presenting: boolean;
  progress: number;
}) {
  const lines = useMemo(
    () =>
      element.code.split('\n').map((line) => {
        if (!line) return ' ';
        if (element.language && hljs.getLanguage(element.language)) {
          return hljs.highlight(line, {
            language: element.language,
            ignoreIllegals: true,
          }).value;
        }
        return hljs.highlightAuto(line).value;
      }),
    [element.code, element.language],
  );
  return (
    <figure
      className={classes('studio-code-block', `studio-code-${element.theme}`)}
      data-theme={element.theme}
    >
      <figcaption className="studio-code-language">
        {element.language || 'code'}
      </figcaption>
      <pre>
        <code>
          {lines.map((line, index) => (
            <span className="studio-code-line" key={`line-${index}`}>
              {element.showLines ? (
                <span className="studio-code-line-number" aria-hidden="true">
                  {index + 1}
                </span>
              ) : null}
              {presenting && element.animation === 'type' ? (
                <span>
                  {Array.from(element.code.split('\n')[index] || ' ').map(
                    (character, ci) => {
                      const offset =
                        element.code
                          .split('\n')
                          .slice(0, index)
                          .reduce(
                            (total, text) =>
                              total + Array.from(text).length + 1,
                            0,
                          ) + ci;
                      return (
                        <span
                          key={ci}
                          data-char-index={offset}
                          style={{
                            visibility:
                              offset <
                              Math.floor(
                                progress * Array.from(element.code).length,
                              )
                                ? 'visible'
                                : 'hidden',
                          }}
                        >
                          {character}
                        </span>
                      );
                    },
                  )}
                </span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: line }} />
              )}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

function BuddyContent({ element }: { element: BuddyElement }) {
  return (
    <div
      className="studio-buddy-content"
      style={{ fontSize: `${Math.min(element.w / 4.9, element.h * 0.15)}cqw` }}
    >
      <Buddy
        className="studio-buddy"
        state={element.state}
        caption={element.caption || undefined}
        ariaLabel={
          element.caption ? `Buddy : ${element.caption}` : 'Buddy, mascotte STH'
        }
      />
    </div>
  );
}

function MediaContent({
  element,
  editable,
  presenting,
}: {
  element: MediaElement;
  editable: boolean;
  presenting: boolean;
}) {
  if (!element.src || (element.mediaType === 'audio' && !presenting)) {
    return (
      <figure
        className="studio-media-placeholder"
        aria-label={`${element.title} sans source`}
      >
        <span aria-hidden="true">
          {element.mediaType === 'audio' ? '♪' : '▶'}
        </span>
        <span>
          {editable ? `Ajoutez une source ${element.mediaType}` : element.title}
        </span>
      </figure>
    );
  }
  if (element.mediaType === 'audio') {
    return (
      <div className="studio-audio-frame">
        <span className="studio-media-title">{element.title}</span>
        {/* The data model does not expose a captions-track URL. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          src={element.src}
          controls={element.controls}
          autoPlay={presenting && element.autoplay}
          loop={element.loop}
          preload="metadata"
        />
      </div>
    );
  }
  return (
    // The data model does not expose a captions-track URL.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      className="studio-video"
      src={element.src}
      title={element.title}
      controls={presenting && element.controls}
      autoPlay={presenting && element.autoplay}
      loop={element.loop}
      muted={element.autoplay}
      playsInline
      preload="metadata"
      style={{ objectFit: 'contain' }}
    />
  );
}

function ElementContent({
  element,
  editable,
  presenting,
  progress,
}: {
  element: SlideElement;
  editable: boolean;
  presenting: boolean;
  progress: number;
}) {
  switch (element.kind) {
    case 'text':
      return (
        <TextContent
          element={element}
          presenting={presenting}
          progress={progress}
        />
      );
    case 'shape':
      return <ShapeContent element={element} />;
    case 'image':
      return <ImageContent element={element} />;
    case 'table':
      return <TableContent element={element} />;
    case 'chart':
      return <StudioChart element={element} />;
    case 'code':
      return (
        <CodeContent
          element={element}
          presenting={presenting}
          progress={progress}
        />
      );
    case 'buddy':
      return <BuddyContent element={element} />;
    case 'media':
      return (
        <MediaContent
          element={element}
          editable={editable}
          presenting={
            presenting && (element.animation === 'none' || progress > 0)
          }
        />
      );
  }
}

function elementLabel(element: SlideElement) {
  if (element.kind === 'text') return `Texte : ${element.text}`;
  if (element.kind === 'image') return element.alt || 'Image';
  if (element.kind === 'media') return element.title;
  if (element.kind === 'buddy') return `Buddy : ${element.caption}`;
  return `Sélectionner l’élément ${element.kind}`;
}

export function StudioSlide({
  slide,
  aspectRatio,
  editable = false,
  presenting = false,
  selectedId,
  selectedIds,
  buildStep,
  progress,
  activeElementId,
  onSelect,
  onTransformStart,
  onTransform,
  onTransformEnd,
  onTextChange,
}: StudioSlideProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ActiveTransform | null>(null);
  const selection = useMemo(
    () => Array.from(new Set(selectedIds ?? (selectedId ? [selectedId] : []))),
    [selectedId, selectedIds],
  );
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const primarySelection = selection.at(-1);
  const currentBuildStep = presenting
    ? (buildStep ?? 0)
    : Number.POSITIVE_INFINITY;
  const timelineOwnsVisibility = presenting && progress !== undefined;
  const interactive = editable && !presenting;

  const beginTransform = (
    event: PointerEvent<HTMLElement>,
    element: SlideElement,
    mode: ActiveTransform['mode'],
  ) => {
    if (!interactive) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(element.id, additive(event));
    if (element.locked) return;
    const bounds = slideRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;
    slideRef.current?.setPointerCapture(event.pointerId);
    transformRef.current = {
      id: element.id,
      pointerId: event.pointerId,
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      rotation: element.rotation,
      slideWidth: bounds.width,
      slideHeight: bounds.height,
    };
    onTransformStart?.();
  };

  const moveTransform = (event: PointerEvent<HTMLDivElement>) => {
    const transform = transformRef.current;
    if (!transform || transform.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx =
      ((event.clientX - transform.clientX) / transform.slideWidth) * 100;
    const dy =
      ((event.clientY - transform.clientY) / transform.slideHeight) * 100;
    if (transform.mode === 'move') {
      onTransform?.(transform.id, {
        x: clamp(transform.x + dx, 0, 100 - transform.w),
        y: clamp(transform.y + dy, 0, 100 - transform.h),
      });
    } else {
      const angle = (transform.rotation * Math.PI) / 180;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      const px = event.clientX - transform.clientX,
        py = event.clientY - transform.clientY;
      const w = clamp(
        transform.w + ((px * cos + py * sin) / transform.slideWidth) * 100,
        2,
        100,
      );
      const h = clamp(
        transform.h + ((-px * sin + py * cos) / transform.slideHeight) * 100,
        2,
        100,
      );
      const dw = ((w - transform.w) / 100) * transform.slideWidth;
      const dh = ((h - transform.h) / 100) * transform.slideHeight;
      onTransform?.(transform.id, {
        x: clamp(
          transform.x +
            ((cos * dw - sin * dh - dw) / 2 / transform.slideWidth) * 100,
          0,
          100 - w,
        ),
        y: clamp(
          transform.y +
            ((sin * dw + cos * dh - dh) / 2 / transform.slideHeight) * 100,
          0,
          100 - h,
        ),
        w,
        h,
      });
    }
  };

  const endTransform = (event: PointerEvent<HTMLDivElement>) => {
    const transform = transformRef.current;
    if (!transform || transform.pointerId !== event.pointerId) return;
    transformRef.current = null;
    if (slideRef.current?.hasPointerCapture(event.pointerId)) {
      slideRef.current.releasePointerCapture(event.pointerId);
    }
    onTransformEnd?.();
  };

  const selectFromKeyboard = (
    event: MouseEvent<HTMLButtonElement>,
    element: SlideElement,
  ) => {
    if (event.detail === 0) onSelect?.(element.id, additive(event));
  };

  return (
    <div
      ref={slideRef}
      className={classes(
        'studio-slide',
        `studio-slide-tone-${slide.tone}`,
        interactive && 'studio-slide-editable',
        presenting && 'studio-slide-presenting',
      )}
      style={{ aspectRatio: aspectRatio === '4:3' ? '4 / 3' : '16 / 9' }}
      data-aspect-ratio={aspectRatio}
      data-tone={slide.tone}
      aria-label={slide.name}
      onPointerMove={moveTransform}
      onPointerUp={endTransform}
      onPointerCancel={endTransform}
    >
      {slide.elements
        .filter((element) => !element.hidden)
        .map((element) => {
          const orderVisible =
            element.animationOrder === 0 ||
            element.animationOrder <= currentBuildStep;
          const visible = timelineOwnsVisibility || orderVisible;
          const elementProgress = clamp(
            progress?.[element.id] ?? (presenting ? 0 : 1),
            0,
            1,
          );
          const selected = interactive && selectedSet.has(element.id);
          const active = activeElementId === element.id;
          return (
            <div
              key={element.id}
              className={classes(
                'studio-element',
                `studio-element-${element.kind}`,
                selected && 'studio-element-selected',
                element.locked && 'studio-element-locked',
                active && 'studio-element-active',
              )}
              style={motionStyle(element, presenting, elementProgress)}
              data-element-id={element.id}
              data-kind={element.kind}
              data-animation={element.animation}
              data-visible={visible ? 'true' : 'false'}
              data-active={active ? 'true' : 'false'}
              aria-hidden={presenting && !visible ? true : undefined}
            >
              <ElementContent
                element={element}
                editable={interactive}
                presenting={presenting}
                progress={elementProgress}
              />
              {interactive &&
              editingId === element.id &&
              element.kind === 'text' ? (
                <textarea
                  className="studio-inline-text"
                  aria-label="Modifier le texte sur la diapositive"
                  ref={focusTextEditor}
                  value={element.text}
                  maxLength={10000}
                  style={{
                    fontFamily: element.style.fontFamily,
                    fontSize: `${element.style.fontSize / 12}cqw`,
                    fontWeight: element.style.fontWeight,
                    fontStyle: element.style.fontStyle,
                    textDecoration: element.style.textDecoration,
                    textAlign: element.style.align,
                    lineHeight: element.style.lineHeight,
                    color: element.style.color,
                    letterSpacing: `${element.style.letterSpacing}em`,
                  }}
                  onFocus={onTransformStart}
                  onChange={(event) =>
                    onTextChange?.(element.id, event.target.value)
                  }
                  onBlur={() => {
                    setEditingId(null);
                    onTransformEnd?.();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') event.currentTarget.blur();
                  }}
                />
              ) : interactive ? (
                <button
                  type="button"
                  className="studio-element-select-control"
                  aria-label={elementLabel(element)}
                  aria-pressed={selected}
                  onClick={(event) => selectFromKeyboard(event, element)}
                  onDoubleClick={() => {
                    if (element.kind === 'text' && !element.locked)
                      setEditingId(element.id);
                  }}
                  onPointerDown={(event) =>
                    beginTransform(event, element, 'move')
                  }
                />
              ) : null}
              {selected &&
              primarySelection === element.id &&
              !element.locked ? (
                <button
                  type="button"
                  className="studio-resize-handle studio-resize-handle-southeast"
                  aria-label={`Redimensionner ${elementLabel(element)}`}
                  onPointerDown={(event) =>
                    beginTransform(event, element, 'resize')
                  }
                />
              ) : null}
            </div>
          );
        })}
    </div>
  );
}
