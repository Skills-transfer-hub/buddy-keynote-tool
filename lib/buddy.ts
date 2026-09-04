export type BuddyState =
  | 'ok'
  | 'update'
  | 'work'
  | 'done'
  | 'error'
  | 'noConfig';

export const BUDDY_STATES: Record<
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

export function renderBuddyBox(face: string, innerWidth: number) {
  const padding = Math.max(0, innerWidth - face.length);
  const left = Math.floor(padding / 2);
  const centeredFace = `${' '.repeat(left)}${face}${' '.repeat(padding - left)}`;
  const horizontal = '─'.repeat(innerWidth);
  return `╭${horizontal}╮\n│${centeredFace}│\n╰${horizontal}╯`;
}

export function buddyText(state: BuddyState = 'work') {
  return renderBuddyBox(BUDDY_STATES[state].face, 5);
}
