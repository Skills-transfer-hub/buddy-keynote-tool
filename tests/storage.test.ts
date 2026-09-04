import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { initialDeck } from '../lib/studio.ts';
import {
  listLocalDecks,
  restoreLocalDeck,
  saveLocalDeck,
} from '../lib/local-decks.ts';

const window = new JSDOM('', { url: 'https://buddy.test' }).window;
Object.defineProperty(globalThis, 'localStorage', {
  value: window.localStorage,
  configurable: true,
});
Object.defineProperty(globalThis, 'indexedDB', {
  value: indexedDB,
  configurable: true,
});

void test('la bibliothèque restaure le dernier document et protège une révision plus récente', async () => {
  const first = {
    ...structuredClone(initialDeck),
    id: 'first',
    title: 'Document A',
    updatedAt: '2026-09-04T10:00:00.000Z',
  };
  const second = {
    ...structuredClone(initialDeck),
    id: 'second',
    title: 'Document B',
    updatedAt: '2026-09-04T11:00:00.000Z',
  };
  await saveLocalDeck(first);
  await saveLocalDeck(second);
  assert.equal((await listLocalDecks()).length, 2);
  assert.equal((await restoreLocalDeck())?.id, 'second');
  const recovered = {
    ...second,
    title: 'Dernière frappe',
    updatedAt: '2026-09-04T11:00:01.000Z',
  };
  const write = saveLocalDeck(recovered);
  assert.equal(
    JSON.parse(localStorage.getItem('buddy-keynote-recovery') || '{}').title,
    'Dernière frappe',
  );
  await write;
  assert.equal((await restoreLocalDeck())?.title, 'Dernière frappe');
  assert.equal(localStorage.getItem('buddy-keynote-recovery'), null);
  localStorage.setItem(
    'buddy-keynote-recovery',
    JSON.stringify({
      ...recovered,
      title: 'Fermeture interrompue',
      updatedAt: '2026-09-04T11:00:02.000Z',
    }),
  );
  assert.equal((await restoreLocalDeck())?.title, 'Fermeture interrompue');
  await saveLocalDeck(first);
  assert.equal((await restoreLocalDeck())?.id, 'first');
});
