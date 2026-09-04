'use client';

import type { CSSProperties } from 'react';

export type BuddyState = 'ok' | 'update' | 'work' | 'done' | 'error' | 'noConfig';

const BUDDY_STATES: Record<
  BuddyState,
  { emoji: string; face: string; caption: string }
> = {
  ok: { emoji: '💧', face: '>/<', caption: 'Tout est à jour.' },
  update: { emoji: '⚠️', face: 'o.O', caption: 'Mise à jour disponible.' },
  work: { emoji: '⏳', face: '>_<', caption: 'Installation en cours…' },
  done: { emoji: '✅', face: '^.^', caption: 'Opération terminée.' },
  error: { emoji: '❌', face: 'x x', caption: 'Une erreur est survenue.' },
  noConfig: {
    emoji: '😶',
    face: '._.',
    caption: 'Pas de configuration projet trouvée.',
  },
};

function renderBuddyBox(face: string, innerWidth: number) {
  const padding = Math.max(0, innerWidth - face.length);
  const left = Math.floor(padding / 2);
  const centeredFace = `${' '.repeat(left)}${face}${' '.repeat(padding - left)}`;
  const horizontal = '─'.repeat(innerWidth);
  return `╭${horizontal}╮\n│${centeredFace}│\n╰${horizontal}╯`;
}

export function BuddyLogo({ className = '' }: { className?: string }) {
  return (
    <pre aria-hidden="true" className={`buddy-logo ${className}`.trim()}>
      {renderBuddyBox('^.^', 3)}
    </pre>
  );
}

export function Buddy({
  state = 'done',
  caption,
  ariaLabel,
  className = '',
  style,
  showEmoji = false,
}: {
  state?: BuddyState;
  caption?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  showEmoji?: boolean;
}) {
  const buddy = BUDDY_STATES[state];

  return (
    <figure
      className={`buddy ${className}`.trim()}
      style={style}
      aria-label={ariaLabel ?? `Buddy : ${caption ?? buddy.caption}`}
    >
      {showEmoji ? <span className="buddy-emoji">{buddy.emoji}</span> : null}
      <pre aria-hidden="true">{renderBuddyBox(buddy.face, 5)}</pre>
      {caption ? <span className="buddy-caption">{caption}</span> : null}
    </figure>
  );
}
