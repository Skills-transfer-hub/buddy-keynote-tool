import * as Y from 'yjs';
import { initialDeck, migrateDeck, type Deck } from '../studio.ts';

export const LOCAL = Symbol('buddy-local');
export const REMOTE = Symbol('buddy-remote');
const textFields = new Set([
  'text',
  'code',
  'notes',
  'title',
  'name',
  'caption',
  'alt',
  'label',
  '',
]);
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const identified = (v: unknown[]) =>
  v.length > 0 && v.every((x) => object(x) && typeof x.id === 'string');

function encode(value: unknown, key = ''): unknown {
  if (typeof value === 'string' && textFields.has(key))
    return new Y.Text(value);
  if (Array.isArray(value)) {
    if (identified(value) || key === 'slides' || key === 'elements') {
      const result = new Y.Map();
      result.set('$kind', 'collection');
      result.set(
        'items',
        new Y.Map(value.map((v) => [(v as Obj).id as string, encode(v)])),
      );
      const order = new Y.Array<string>();
      order.push(value.map((v) => (v as Obj).id as string));
      result.set('order', order);
      return result;
    }
    const result = new Y.Array();
    result.push(value.map((v) => encode(v)));
    return result;
  }
  if (object(value))
    return new Y.Map(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, encode(v, k)]),
    );
  return value;
}
function decode(value: unknown): unknown {
  if (value instanceof Y.Text) return value.toJSON();
  if (value instanceof Y.Array) return value.toArray().map(decode);
  if (value instanceof Y.Map) {
    if (value.get('$kind') === 'collection') {
      const items = value.get('items') as Y.Map<unknown>;
      const order = value.get('order') as Y.Array<string>;
      const ids = [
        ...new Set([...order.toArray(), ...Array.from(items.keys()).sort()]),
      ];
      return ids
        .filter((id) => items.has(id))
        .map((id) => decode(items.get(id)));
    }
    return Object.fromEntries(
      Array.from(value.entries(), ([k, v]) => [k, decode(v)]),
    );
  }
  return value;
}
function patchText(target: Y.Text, before: string, after: string) {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  if (before.length - start - end)
    target.delete(start, before.length - start - end);
  if (after.length - start - end)
    target.insert(start, after.slice(start, after.length - end));
}
function patch(
  target: unknown,
  before: unknown,
  after: unknown,
  replace: (v: unknown) => void,
  key = '',
) {
  if (same(before, after)) return;
  if (
    target instanceof Y.Text &&
    typeof before === 'string' &&
    typeof after === 'string'
  ) {
    patchText(target, before, after);
    return;
  }
  if (
    target instanceof Y.Map &&
    Array.isArray(before) &&
    Array.isArray(after) &&
    target.get('$kind') === 'collection'
  ) {
    const items = target.get('items') as Y.Map<unknown>;
    const order = target.get('order') as Y.Array<string>;
    const oldItems = new Map(before.map((v) => [(v as Obj).id as string, v]));
    const newItems = new Map(after.map((v) => [(v as Obj).id as string, v]));
    for (const id of oldItems.keys()) if (!newItems.has(id)) items.delete(id);
    for (const [id, v] of newItems) {
      if (!oldItems.has(id)) items.set(id, encode(v));
      else if (items.has(id))
        patch(items.get(id), oldItems.get(id), v, (x) => items.set(id, x));
    }
    const oldOrder = [...oldItems.keys()],
      newOrder = [...newItems.keys()];
    if (!same(oldOrder, newOrder)) {
      // Retain unchanged order items, so concurrent insertions stay anchored.
      const current = order.toArray();
      for (let i = current.length - 1; i >= 0; i--)
        if (oldItems.has(current[i]) && !newItems.has(current[i]))
          order.delete(i, 1);
      for (let i = 0; i < newOrder.length; i++) {
        const values = order.toArray(),
          id = newOrder[i];
        const previous = i ? values.indexOf(newOrder[i - 1]) : -1;
        const at = values.indexOf(id);
        if (at === -1) order.insert(previous + 1, [id]);
        else if (
          (i > 0 && at < previous) ||
          (i === 0 && at > 0 && oldOrder[0] !== id)
        ) {
          order.delete(at, 1);
          order.insert(i ? order.toArray().indexOf(newOrder[i - 1]) + 1 : 0, [
            id,
          ]);
        }
      }
    }
    return;
  }
  if (target instanceof Y.Map && object(before) && object(after)) {
    for (const k of Object.keys(before))
      if (!(k in after) || after[k] === undefined) target.delete(k);
    for (const [k, v] of Object.entries(after))
      if (v !== undefined) {
        if (!(k in before)) target.set(k, encode(v, k));
        else if (target.has(k))
          patch(target.get(k), before[k], v, (x) => target.set(k, x), k);
      }
    return;
  }
  if (
    target instanceof Y.Array &&
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length &&
    target.length === before.length
  ) {
    after.forEach((v, i) =>
      patch(target.get(i), before[i], v, (x) => {
        target.delete(i, 1);
        target.insert(i, [x]);
      }),
    );
    return;
  }
  replace(encode(after, key));
}
export function createDocument(deck?: Deck) {
  const doc = new Y.Doc();
  if (deck)
    doc.transact(() => {
      const root = doc.getMap('deck');
      for (const [k, v] of Object.entries(deck)) root.set(k, encode(v, k));
    });
  return doc;
}
export function readDocument(doc: Y.Doc): Deck {
  const raw = decode(doc.getMap('deck')) as Obj;
  // Concurrent deletion of different last slides can empty a collection. Keep a
  // deterministic editable placeholder in the projection, without random IDs.
  if (Array.isArray(raw.slides) && raw.slides.length === 0)
    raw.slides = [
      {
        ...initialDeck.slides[0],
        id: 'shared-empty',
        name: 'Diapositive vide',
        elements: [],
        notes: '',
      },
    ];
  const deck = migrateDeck(raw);
  if (!deck) throw new Error('Présentation partagée invalide.');
  return deck;
}
export function changeDocument(doc: Y.Doc, before: Deck, after: Deck) {
  doc.transact(() => {
    const root = doc.getMap('deck');
    const slides = root.get('slides') as Y.Map<unknown>;
    // Materialize the empty-document placeholder only when it is edited.
    if (
      before.slides[0]?.id === 'shared-empty' &&
      after.slides.some((s) => s.id === 'shared-empty') &&
      slides instanceof Y.Map
    ) {
      const items = slides.get('items') as Y.Map<unknown>;
      if (!items.has('shared-empty'))
        items.set('shared-empty', encode(before.slides[0]));
    }
    patch(root, before, after, () => {
      throw new Error('Le document ne peut pas être remplacé.');
    });
  }, LOCAL);
}
export function documentHistory(doc: Y.Doc) {
  return new Y.UndoManager(doc.getMap('deck'), {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 500,
  });
}
export function toBase64(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
