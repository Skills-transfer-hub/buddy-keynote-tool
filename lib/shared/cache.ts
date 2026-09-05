import * as Y from 'yjs';
import { createDocument } from './document.ts';
import type { SharedConnection } from './client.ts';
export type CachedShared = {
  id: string;
  connection: SharedConnection;
  update: Uint8Array;
  pending: boolean;
  title: string;
  sources?: { id: string; update: Uint8Array }[];
};
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('buddy-shared-drafts', 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore('projects', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      dbPromise = undefined;
      reject(r.error);
    };
  }));
}
export async function cacheShared(value: CachedShared) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function readShared(
  id: string,
  token: string,
): Promise<CachedShared | undefined> {
  const records = (await allShared()).filter(
    (c) => c.connection.id === id && c.connection.token === token,
  );
  if (!records.length) return undefined;
  const doc = createDocument();
  try {
    for (const record of records) Y.applyUpdate(doc, record.update);
    return {
      ...records[records.length - 1],
      connection: records
        .map((r) => r.connection)
        .sort((a, b) => (b.linksUpdatedAt ?? 0) - (a.linksUpdatedAt ?? 0))[0],
      update: Y.encodeStateAsUpdate(doc),
      pending: records.some((r) => r.pending),
      sources: records
        .filter((r) => r.pending)
        .map((r) => ({ id: r.id, update: r.update })),
    };
  } finally {
    doc.destroy();
  }
}
async function allShared(): Promise<CachedShared[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction('projects').objectStore('projects').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function listShared(): Promise<CachedShared[]> {
  const grouped = new Map<string, CachedShared>();
  for (const record of await allShared()) {
    const key = record.connection.id + ':' + record.connection.token;
    const previous = grouped.get(key);
    grouped.set(key, {
      ...record,
      connection:
        (previous?.connection.linksUpdatedAt ?? 0) >
        (record.connection.linksUpdatedAt ?? 0)
          ? previous!.connection
          : record.connection,
      id: key,
      pending: record.pending || !!previous?.pending,
    });
  }
  return [...grouped.values()];
}

export async function acknowledgeShared(recovered: CachedShared) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite'),
      store = tx.objectStore('projects');
    for (const source of recovered.sources ?? []) {
      const request = store.get(source.id);
      request.onsuccess = () => {
        const current = request.result as CachedShared | undefined;
        if (
          current &&
          current.update.length === source.update.length &&
          current.update.every((v, i) => v === source.update[i])
        )
          store.put({ ...current, pending: false });
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
