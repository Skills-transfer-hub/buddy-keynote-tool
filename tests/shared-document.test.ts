import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  createDocument,
  changeDocument,
  readDocument,
  documentHistory,
  REMOTE,
} from '../lib/shared/document.ts';
import { initialDeck, makeSlide, type Deck } from '../lib/studio.ts';
function pair() {
  const a = createDocument(structuredClone(initialDeck)),
    b = createDocument();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), REMOTE);
  return { a, b };
}
function edit(doc: Y.Doc, fn: (deck: Deck) => void) {
  const before = readDocument(doc),
    after = structuredClone(before);
  fn(after);
  changeDocument(doc, before, after);
}
function merge(a: Y.Doc, b: Y.Doc) {
  const ua = Y.encodeStateAsUpdate(a),
    ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub, REMOTE);
  Y.applyUpdate(b, ua, REMOTE);
  Y.applyUpdate(a, ub, REMOTE);
  assert.deepEqual(readDocument(a), readDocument(b));
}
const text = (d: Deck) => {
  const e = d.slides[0].elements.find((e) => e.kind === 'text');
  if (!e || e.kind !== 'text') throw Error();
  return e;
};
void test('shared edits preserve independent nested properties', () => {
  const { a, b } = pair();
  edit(a, (d) => {
    text(d).x = 31;
  });
  edit(b, (d) => {
    text(d).style.color = '#123456';
  });
  merge(a, b);
  assert.equal(text(readDocument(a)).x, 31);
  assert.equal(text(readDocument(a)).style.color, '#123456');
});
void test('concurrent typing and local undo preserve remote text', () => {
  const { a, b } = pair();
  edit(a, (d) => {
    text(d).text = 'AB';
  });
  merge(a, b);
  const undo = documentHistory(a);
  edit(a, (d) => {
    text(d).text = 'AXB';
  });
  edit(b, (d) => {
    text(d).text = 'AYB';
  });
  merge(a, b);
  assert.match(text(readDocument(a)).text, /^A(XY|YX)B$/);
  undo.undo();
  merge(a, b);
  assert.equal(text(readDocument(a)).text, 'AYB');
  undo.redo();
  merge(a, b);
  assert.match(text(readDocument(a)).text, /^A(XY|YX)B$/);
});
void test('concurrent moves keep each slide once', () => {
  const { a, b } = pair();
  edit(a, (d) => {
    d.slides = [makeSlide('1'), makeSlide('2'), makeSlide('3')];
  });
  merge(a, b);
  edit(a, (d) => {
    d.slides.unshift(d.slides.pop()!);
  });
  edit(b, (d) => {
    d.slides.splice(1, 0, d.slides.pop()!);
  });
  merge(a, b);
  const slides = readDocument(a).slides;
  assert.equal(slides.length, 3);
  assert.equal(new Set(slides.map((s) => s.id)).size, 3);
});
void test('deletion wins over concurrent child edits and local undo', () => {
  const { a, b } = pair();
  const id = text(readDocument(a)).id;
  const history = documentHistory(b);
  edit(a, (d) => {
    d.slides[0].elements = d.slides[0].elements.filter((e) => e.id !== id);
  });
  edit(b, (d) => {
    text(d).text = 'offline';
    text(d).x = 77;
  });
  merge(a, b);
  assert.equal(
    readDocument(b).slides[0].elements.some((e) => e.id === id),
    false,
  );
  history.undo();
  merge(a, b);
  assert.equal(
    readDocument(a).slides[0].elements.some((e) => e.id === id),
    false,
  );
});
void test('gesture undo preserves a remote style change', () => {
  const { a, b } = pair();
  const original = text(readDocument(a)).x;
  const history = documentHistory(a);
  edit(a, (d) => {
    text(d).x = 20;
  });
  edit(b, (d) => {
    text(d).style.color = '#445566';
  });
  merge(a, b);
  edit(a, (d) => {
    text(d).x = 30;
  });
  history.stopCapturing();
  history.undo();
  merge(a, b);
  assert.equal(text(readDocument(a)).x, original);
  assert.equal(text(readDocument(a)).style.color, '#445566');
});
void test('concurrent last slide deletions leave an editable deterministic placeholder', () => {
  const { a, b } = pair();
  edit(a, (d) => {
    d.slides = [makeSlide('1'), makeSlide('2')];
  });
  merge(a, b);
  edit(a, (d) => {
    d.slides.splice(0, 1);
  });
  edit(b, (d) => {
    d.slides.splice(1, 1);
  });
  merge(a, b);
  assert.equal(readDocument(a).slides[0].id, 'shared-empty');
  edit(a, (d) => {
    d.slides[0].name = 'New';
  });
  merge(a, b);
  assert.equal(readDocument(b).slides[0].name, 'New');
});
