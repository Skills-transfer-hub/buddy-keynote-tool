import * as Y from 'yjs';
import {
  createDocument,
  readDocument,
  changeDocument,
  documentHistory,
  REMOTE,
  toBase64,
  fromBase64,
} from './document.ts';
import { cacheShared, readShared, acknowledgeShared } from './cache.ts';
import type { Deck } from '../studio.ts';
export type SharedConnection = {
  id: string;
  token: string;
  editor?: string;
  viewer?: string;
  linksUpdatedAt?: number;
};
export type SharedState = {
  connection: SharedConnection;
  role: 'owner' | 'editor' | 'viewer' | 'loading';
  message: string;
  pending: boolean;
  connected: boolean;
  people: { session: string; name: string; slideId: string }[];
  error?: string;
};
export function invitation(connection: SharedConnection, token: string) {
  return `${location.origin}/#shared=${connection.id}&key=${token}`;
}
export function connectionFromUrl(): SharedConnection | null {
  const q = new URLSearchParams(location.hash.slice(1));
  const id = q.get('shared'),
    token = q.get('key');
  return id &&
    token &&
    /^[a-f0-9-]{36}$/.test(id) &&
    /^[a-f0-9]{64}$/.test(token)
    ? { id, token }
    : null;
}
async function request(
  path: string,
  token: string | null,
  data: unknown,
  createKey?: string,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Buddy-Key': token } : {}),
      ...(createKey ? { 'X-Buddy-Create-Key': createKey } : {}),
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
    credentials: 'omit',
  });
  const result = (await response.json()) as {
    error?: string;
    id: string;
    owner: string;
    editor: string;
    viewer: string;
    update: string;
    vector: string;
    revision: number;
    role: SharedState['role'];
    people: SharedState['people'];
  };
  if (!response.ok)
    throw new Error(result.error || 'Connexion au serveur indisponible.');
  return result;
}
export async function createShared(
  deck: Deck,
  createKey: string,
): Promise<SharedConnection> {
  const doc = createDocument(deck);
  try {
    const result = await request(
      '/api/shared',
      null,
      { update: toBase64(Y.encodeStateAsUpdate(doc)) },
      createKey,
    );
    const connection = {
      id: result.id,
      token: result.owner,
      editor: result.editor,
      viewer: result.viewer,
      linksUpdatedAt: Date.now(),
    };
    await cacheShared({
      id: connection.id + ':' + crypto.randomUUID(),
      connection,
      update: Y.encodeStateAsUpdate(doc),
      pending: false,
      title: deck.title,
    }).catch(() => undefined);
    return connection;
  } finally {
    doc.destroy();
  }
}
export class SharedSession {
  readonly doc = createDocument();
  readonly history = documentHistory(this.doc);
  readonly session = crypto.randomUUID();
  state: SharedState;
  name = 'Invité';
  slideId = '';
  private vector: Uint8Array = new Uint8Array([0]);
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<void> | undefined;
  private recovered: Awaited<ReturnType<typeof readShared>>;
  private disposed = false;
  private busy = false;
  private loaded = false;
  private change = 0;
  private ack = 0;
  private cacheChain: Promise<unknown> = Promise.resolve();
  connection: SharedConnection;
  private onDeck: (deck: Deck) => void;
  private onState: (state: SharedState) => void;
  constructor(
    connection: SharedConnection,
    onDeck: (deck: Deck) => void,
    onState: (state: SharedState) => void,
    onHistory: (history: { undo: number; redo: number }) => void,
  ) {
    this.connection = connection;
    this.onDeck = onDeck;
    this.onState = onState;
    this.state = {
      connection,
      role: 'loading',
      message: 'Connexion…',
      pending: false,
      connected: false,
      people: [],
    };
    this.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (!this.loaded) return;
      if (origin !== REMOTE) this.change++;
      this.onDeck(readDocument(this.doc));
      this.emit({
        pending: this.change !== this.ack,
        message:
          this.change !== this.ack
            ? 'Enregistrement partagé…'
            : this.state.message,
      });
      void this.persist().catch(() => undefined);
    });
    const count = () =>
      onHistory({
        undo: this.history.undoStack.length,
        redo: this.history.redoStack.length,
      });
    this.history.on('stack-item-added', count);
    this.history.on('stack-item-popped', count);
    this.history.on('stack-cleared', count);
  }
  private emit(patch: Partial<SharedState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.onState(this.state);
  }
  private persist() {
    if (!this.loaded) return Promise.resolve();
    const value = {
      id: this.connection.id + ':' + this.session,
      connection: { ...this.connection },
      update: Y.encodeStateAsUpdate(this.doc),
      pending: this.change !== this.ack,
      title: readDocument(this.doc).title,
    };
    this.cacheChain = this.cacheChain
      .catch(() => undefined)
      .then(() => cacheShared(value))
      .catch(() => {
        const message =
          'Copie de secours locale indisponible. Exportez un fichier Buddy avant de fermer.';
        this.emit({ error: message });
        throw new Error(message);
      });
    return this.cacheChain;
  }
  async start() {
    this.emit({});
    try {
      const cache = await readShared(this.connection.id, this.connection.token);
      this.recovered = cache;
      if (this.disposed) return;
      // Never substitute a stored owner's capability for an explicitly opened
      // viewer/editor link on the same device.
      if (cache && cache.connection.token === this.connection.token) {
        this.connection =
          (cache.connection.linksUpdatedAt ?? 0) >
          (this.connection.linksUpdatedAt ?? 0)
            ? cache.connection
            : { ...cache.connection, ...this.connection };
        this.state.connection = this.connection;
        Y.applyUpdate(this.doc, cache.update, REMOTE);
        this.loaded = true;
        if (cache.pending) this.change++;
        this.onDeck(readDocument(this.doc));
      }
    } catch {
      /* An online join can still succeed without local cache. */
    }
    if (!this.disposed) await this.sync();
  }
  commit(before: Deck, after: Deck) {
    if (this.state.role === 'viewer' || this.state.role === 'loading') return;
    changeDocument(this.doc, before, after);
  }
  sync(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.runSync().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }
  private async runSync() {
    if (this.busy || this.disposed) return;
    clearTimeout(this.timer);
    this.busy = true;
    const mayEdit = this.state.role === 'owner' || this.state.role === 'editor';
    const sentChange = mayEdit ? this.change : this.ack;
    try {
      await this.persist().catch(() => undefined);
      const result = await request(
        `/api/shared/${this.connection.id}`,
        this.connection.token,
        {
          action: 'sync',
          update: toBase64(
            mayEdit
              ? Y.encodeStateAsUpdate(this.doc, this.vector)
              : new Uint8Array([0, 0]),
          ),
          vector: toBase64(Y.encodeStateVector(this.doc)),
          revision: this.revision,
          session: this.session,
          name: this.name,
          slideId: this.slideId,
        },
      );
      if (this.disposed) return;
      Y.applyUpdate(this.doc, fromBase64(result.update), REMOTE);
      this.loaded = true;
      this.vector = fromBase64(result.vector);
      this.revision = result.revision;
      this.ack = sentChange;
      if (result.update !== 'AAA=' || this.revision === 0)
        this.onDeck(readDocument(this.doc));
      this.emit({
        role: result.role,
        connected: true,
        pending: this.change !== this.ack,
        message:
          this.change !== this.ack
            ? 'Enregistrement partagé…'
            : 'Enregistré sur le serveur',
        people: result.people,
        error: undefined,
      });
      await this.persist().catch(() => undefined);
      if (this.change === this.ack && this.recovered) {
        await acknowledgeShared(this.recovered).catch(() => undefined);
        this.recovered = undefined;
      }
    } catch (error) {
      this.emit({
        connected: false,
        pending: this.change !== this.ack,
        message: this.loaded
          ? 'Hors ligne · copie sur cet appareil'
          : 'Connexion impossible',
        error: error instanceof Error ? error.message : 'Serveur indisponible.',
      });
    } finally {
      this.busy = false;
      if (!this.disposed) this.timer = setTimeout(() => void this.sync(), 1500);
    }
  }
  async rotate() {
    const result = await request(
      `/api/shared/${this.connection.id}`,
      this.connection.token,
      { action: 'rotate' },
    );
    this.connection = {
      ...this.connection,
      editor: result.editor,
      viewer: result.viewer,
      linksUpdatedAt: Date.now(),
    };
    this.emit({ connection: this.connection });
    await this.persist();
  }
  async flush() {
    await this.sync();
    if (this.state.connected && this.change !== this.ack) await this.sync();
    try {
      await this.persist();
    } catch (error) {
      if (this.change !== this.ack) throw error;
    }
  }
  dispose() {
    if (this.disposed) return;
    void this.persist().catch(() => undefined);
    this.disposed = true;
    clearTimeout(this.timer);
    this.history.destroy();
    this.doc.destroy();
  }
}
