import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import {
  cacheShared,
  readShared,
  acknowledgeShared,
} from '../lib/shared/cache.ts';
import {
  createDocument,
  changeDocument,
  readDocument,
} from '../lib/shared/document.ts';
import { initialDeck } from '../lib/studio.ts';

void test('viewer caches never overwrite owner offline drafts or invitations', async () => {
  const doc = createDocument(initialDeck),
    id = crypto.randomUUID();
  await cacheShared({
    id: id + ':owner',
    connection: { id, token: 'owner', editor: 'edit', viewer: 'read' },
    update: Y.encodeStateAsUpdate(doc),
    pending: true,
    title: initialDeck.title,
  });
  await cacheShared({
    id: id + ':viewer',
    connection: { id, token: 'read' },
    update: Y.encodeStateAsUpdate(doc),
    pending: false,
    title: initialDeck.title,
  });
  const owner = await readShared(id, 'owner'),
    viewer = await readShared(id, 'read');
  assert.equal(owner?.pending, true);
  assert.equal(owner?.connection.editor, 'edit');
  assert.equal(viewer?.connection.editor, undefined);
  assert.equal(viewer?.pending, false);
  doc.destroy();
});
void test('recovery acknowledgements clear only the exact recovered draft', async () => {
  const doc = createDocument(initialDeck),
    id = crypto.randomUUID();
  const original = {
    id: id + ':session',
    connection: { id, token: 'edit' },
    update: Y.encodeStateAsUpdate(doc),
    pending: true,
    title: initialDeck.title,
  };
  await cacheShared(original);
  const recovered = await readShared(id, 'edit');
  assert.ok(recovered);
  const before = readDocument(doc),
    after = structuredClone(before);
  after.title += ' newer';
  changeDocument(doc, before, after);
  await cacheShared({ ...original, update: Y.encodeStateAsUpdate(doc) });
  await acknowledgeShared(recovered);
  assert.equal((await readShared(id, 'edit'))?.pending, true);
  await acknowledgeShared((await readShared(id, 'edit'))!);
  assert.equal((await readShared(id, 'edit'))?.pending, false);
  doc.destroy();
});
void test('rotated invitation metadata survives reopening older sessions', async () => {
  const doc = createDocument(initialDeck),
    id = crypto.randomUUID(),
    update = Y.encodeStateAsUpdate(doc);
  for (const [suffix, date, editor] of [
    ['z', 1, 'old'],
    ['a', 2, 'new'],
  ] as const)
    await cacheShared({
      id: id + suffix,
      connection: { id, token: 'owner', editor, linksUpdatedAt: date },
      update,
      pending: false,
      title: initialDeck.title,
    });
  assert.equal((await readShared(id, 'owner'))?.connection.editor, 'new');
  doc.destroy();
});
