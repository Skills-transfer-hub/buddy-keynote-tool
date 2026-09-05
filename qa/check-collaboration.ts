import assert from 'node:assert/strict';
import * as Y from 'yjs';
import 'fake-indexeddb/auto';
import { SharedSession, createShared } from '../lib/shared/client.ts';
import {
  createDocument,
  readDocument,
  changeDocument,
  fromBase64,
  toBase64,
} from '../lib/shared/document.ts';
import { initialDeck, type Deck } from '../lib/studio.ts';
const base = 'http://localhost:3001';
const nativeFetch = globalThis.fetch;
let offlineToken = '';
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (
    new Headers(init?.headers).get('X-Buddy-Key') === offlineToken
  )
    throw Error('Coupure simulée');
  return nativeFetch(new URL(String(input), base), init);
}) as typeof fetch;
const deck = structuredClone(initialDeck);
deck.title = 'QA collaboration';
const connection = await createShared(deck);
let aDeck = deck,
  bDeck = deck,
  vDeck = deck;
const a = new SharedSession(
  connection,
  (d) => {
    aDeck = d;
  },
  () => {},
  () => {},
);
const b = new SharedSession(
  { id: connection.id, token: connection.editor! },
  (d) => {
    bDeck = d;
  },
  () => {},
  () => {},
);
const viewer = new SharedSession(
  { id: connection.id, token: connection.viewer! },
  (d) => {
    vDeck = d;
  },
  () => {},
  () => {},
);
function edit(session: SharedSession, before: Deck, fn: (d: Deck) => void) {
  const after = structuredClone(before);
  fn(after);
  session.commit(before, after);
}
const text = (d: Deck) => {
  const e = d.slides[0].elements.find((e) => e.kind === 'text');
  if (!e || e.kind !== 'text') throw Error();
  return e;
};
const sync = async () => {
  await Promise.all([a.sync(), b.sync(), viewer.sync()]);
  await Promise.all([a.sync(), b.sync(), viewer.sync()]);
};
try {
  await Promise.all([a.start(), b.start(), viewer.start()]);
  assert.equal(a.state.role, 'owner');
  assert.equal(b.state.role, 'editor');
  assert.equal(viewer.state.role, 'viewer');
  edit(a, aDeck, (d) => {
    text(d).text = 'AB';
  });
  await sync();
  a.history.stopCapturing();
  edit(a, aDeck, (d) => {
    text(d).text = 'AXB';
    text(d).x = 19;
  });
  edit(b, bDeck, (d) => {
    text(d).text = 'AYB';
    text(d).style.color = '#123456';
  });
  await sync();
  assert.deepEqual(aDeck, bDeck);
  assert.deepEqual(aDeck, vDeck);
  assert.match(text(aDeck).text, /^A(XY|YX)B$/);
  assert.equal(text(aDeck).x, 19);
  assert.equal(text(aDeck).style.color, '#123456');
  a.history.undo();
  await sync();
  assert.equal(text(bDeck).text, 'AYB');
  console.log(
    'PASS simultaneous editing, presence, selective undo, viewer updates',
  );
  const modified = structuredClone(vDeck);
  modified.title = 'forbidden';
  const vdoc = createDocument();
  Y.applyUpdate(vdoc, Y.encodeStateAsUpdate(viewer.doc));
  changeDocument(vdoc, vDeck, modified);
  const denied = await fetch(`/api/shared/${connection.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Buddy-Key': connection.viewer!,
    },
    body: JSON.stringify({
      action: 'sync',
      update: toBase64(
        Y.encodeStateAsUpdate(vdoc, Y.encodeStateVector(viewer.doc)),
      ),
      vector: toBase64(Y.encodeStateVector(vdoc)),
      revision: 0,
    }),
  });
  assert.equal(denied.status, 403);
  vdoc.destroy();
  offlineToken = connection.editor!;
  edit(b, bDeck, (d) => {
    text(d).text += ' offline';
  });
  await b.sync();
  assert.equal(b.state.pending, true);
  edit(a, aDeck, (d) => {
    text(d).y = 27;
  });
  await a.sync();
  await b.flush();
  b.dispose();
  let restored = deck;
  const reconnected = new SharedSession(
    { id: connection.id, token: connection.editor! },
    (d) => {
      restored = d;
    },
    () => {},
    () => {},
  );
  offlineToken = '';
  await reconnected.start();
  await reconnected.sync();
  await a.sync();
  assert.match(text(restored).text, /offline/);
  assert.equal(text(restored).y, 27);
  assert.deepEqual(aDeck, restored);
  assert.equal(reconnected.state.pending, false);
  console.log(
    'PASS persisted offline edits, fresh session reconnect, cross-client merge',
  );
  edit(a, aDeck, (d) => {
    d.title = 'Comprendre les URL blob: dans JavaScript';
  });
  await a.flush();
  await reconnected.sync();
  assert.equal(restored.title, 'Comprendre les URL blob: dans JavaScript');
  console.log('PASS final server flush before leaving, ordinary blob: text');
  await a.rotate();
  await reconnected.sync();
  assert.equal(reconnected.state.connected, false);
  assert.match(reconnected.state.error!, /révoqué/);
  await viewer.sync();
  assert.equal(viewer.state.connected, false);
  reconnected.dispose();
  const fresh = new SharedSession(
    { id: connection.id, token: a.connection.viewer! },
    () => {},
    () => {},
    () => {},
  );
  await fresh.start();
  assert.equal(fresh.state.role, 'viewer');
  fresh.dispose();
  console.log(
    'PASS server-enforced viewer rights, revoked tokens, replacement invitation',
  );
  // A snapshot larger than a D1 row must survive using R2.
  const large = structuredClone(deck);
  const img = {
    ...large.slides[0].elements[0],
    id: 'qa-image',
    kind: 'image',
    src: 'data:image/png;base64,' + 'A'.repeat(3_000_000),
    alt: 'QA',
    fit: 'contain',
    borderRadius: 0,
  };
  large.slides[0].elements.push(img as never);
  const largeConn = await createShared(large);
  let received: Deck | undefined;
  const largeSession = new SharedSession(
    { id: largeConn.id, token: largeConn.viewer! },
    (d) => {
      received = d;
    },
    () => {},
    () => {},
  );
  await largeSession.start();
  assert.equal(received?.slides[0].elements.at(-1)?.kind, 'image');
  assert.ok(largeSession.state.connected);
  const receivedImage = received?.slides[0].elements.at(-1);
  assert.equal(
    receivedImage?.kind === 'image' ? receivedImage.src.length : 0,
    3_000_022,
  );
  largeSession.dispose();
  console.log('PASS R2 snapshot over 3 MB');
} finally {
  a.dispose();
  b.dispose();
  viewer.dispose();
}
