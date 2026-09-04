'use client';

import type { CSSProperties } from 'react';

import { BUDDY_STATES, renderBuddyBox, type BuddyState } from '@/lib/buddy';
export type { BuddyState } from '@/lib/buddy';

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
