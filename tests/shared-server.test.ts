import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as Y from 'yjs';
import {
  sharedRequest,
  MAX_SNAPSHOT_BYTES,
  type SharedBindings,
} from '../lib/shared/server.ts';
import type {
  Presence,
  Project,
  RateScope,
  SharedStore,
} from '../lib/shared/store.ts';
import {
  createDocument,
  changeDocument,
  readDocument,
  toBase64,
  fromBase64,
} from '../lib/shared/document.ts';
import { initialDeck, type Deck } from '../lib/studio.ts';

const CREATE_KEY = 'test-only-creation-key-32-characters-long';
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
class MemoryStore implements SharedStore {
  projects = new Map<string, Project>();
  presence = new Map<string, Presence & { token: string; project: string }>();
  rates = new Map<string, number>();
  blockedScope?: RateScope;
  full = false;
  beforeCAS?: () => void;
  beforePeople?: () => void;
  snapshotReads = 0;
  async consumeRateLimit(scope: RateScope, slot: number, limit: number) {
    const key = `${scope}:${slot}`;
    const hits = (this.rates.get(key) || 0) + 1;
    this.rates.set(key, hits);
    return scope !== this.blockedScope && hits <= limit;
  }
  async createProject(project: Project) {
    if (this.full || this.projects.size >= 100) return false;
    this.projects.set(project.id, structuredClone(project));
    return true;
  }
  async loadProject(id: string) {
    const project = this.projects.get(id);
    if (!project) return undefined;
    const { snapshot: _snapshot, ...metadata } = project;
    return structuredClone(metadata);
  }
  async loadSnapshot(id: string) {
    this.snapshotReads++;
    const project = this.projects.get(id);
    return project ? structuredClone(project) : undefined;
  }
  async compareAndSwap(
    id: string,
    revision: number,
    token: string,
    snapshot: Uint8Array,
  ) {
    this.beforeCAS?.();
    this.beforeCAS = undefined;
    const project = this.projects.get(id);
    if (
      !project ||
      project.revision !== revision ||
      ![project.owner_hash, project.editor_hash].includes(token)
    )
      return false;
    project.snapshot = snapshot.slice();
    project.revision++;
    return true;
  }
  async rotate(id: string, owner: string, editor: string, viewer: string) {
    const project = this.projects.get(id);
    if (!project || project.owner_hash !== owner) return false;
    project.editor_hash = editor;
    project.viewer_hash = viewer;
    for (const [key, value] of this.presence)
      if (value.project === id && value.token !== owner)
        this.presence.delete(key);
    return true;
  }
  async updatePresence(id: string, token: string, person: Presence) {
    const project = this.projects.get(id);
    if (
      !project ||
      ![project.owner_hash, project.editor_hash, project.viewer_hash].includes(
        token,
      )
    )
      return;
    const key = id + ':' + person.session;
    const existing = this.presence.get(key);
    if (existing && existing.token !== token) return;
    this.presence.set(key, { ...person, token, project: id });
  }
  async readPeople(id: string) {
    this.beforePeople?.();
    this.beforePeople = undefined;
    return [...this.presence.values()]
      .filter((value) => value.project === id)
      .map(({ session, name, slideId }) => ({ session, name, slideId }));
  }
}
const request = (
  data: unknown,
  token?: string,
  headers: Record<string, string> = {},
) =>
  new Request('https://buddy.example/api/shared', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://buddy.example',
      ...(token ? { 'x-buddy-key': token } : {}),
      ...headers,
    },
    body: JSON.stringify(data),
  });
const syncData = (extra: Record<string, unknown> = {}) => ({
  action: 'sync',
  update: 'AAA=',
  vector: 'AA==',
  revision: 0,
  session: crypto.randomUUID(),
  name: 'Invité',
  slideId: '',
  ...extra,
});
async function setup() {
  const store = new MemoryStore();
  const env: SharedBindings = { store, createKey: CREATE_KEY };
  const doc = createDocument(structuredClone(initialDeck));
  const update = toBase64(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const response = await sharedRequest(
    request({ update }, undefined, { 'x-buddy-create-key': CREATE_KEY }),
    env,
  );
  assert.equal(response.status, 201);
  const connection = (await response.json()) as {
    id: string;
    owner: string;
    editor: string;
    viewer: string;
  };
  return { store, env, connection, update };
}
function edit(snapshot: Uint8Array, change: (deck: Deck) => void) {
  const doc = createDocument();
  Y.applyUpdate(doc, snapshot);
  const vector = Y.encodeStateVector(doc);
  const before = readDocument(doc),
    after = structuredClone(before);
  change(after);
  changeDocument(doc, before, after);
  const update = toBase64(Y.encodeStateAsUpdate(doc, vector));
  doc.destroy();
  return update;
}

void test('creation fails closed and stores only hashed, separate capabilities', async () => {
  const store = new MemoryStore();
  for (const createKey of [undefined, '', 'short']) {
    const response = await sharedRequest(request({ update: 'AAA=' }), {
      store,
      createKey,
    });
    assert.equal(response.status, 503);
  }
  assert.equal(
    (
      await sharedRequest(request({ update: 'AAA=' }), {
        store,
        createKey: CREATE_KEY,
      })
    ).status,
    403,
  );
  assert.equal(store.projects.size, 0);
  const { store: created, connection } = await setup();
  const project = created.projects.get(connection.id)!;
  assert.equal(project.owner_hash, digest(connection.owner));
  assert.equal(project.editor_hash, digest(connection.editor));
  assert.equal(project.viewer_hash, digest(connection.viewer));
  assert.equal(
    new Set([connection.owner, connection.editor, connection.viewer]).size,
    3,
  );
  assert.ok(!JSON.stringify(project).includes(connection.owner));
});

void test('owner/editor/viewer permissions and rotation invalidate old links and presence', async () => {
  const { store, env, connection } = await setup();
  for (const [token, expectedRole] of [
    [connection.owner, 'owner'],
    [connection.editor, 'editor'],
    [connection.viewer, 'viewer'],
  ]) {
    const response = await sharedRequest(
      request(syncData(), token),
      env,
      connection.id,
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).role, expectedRole);
  }
  assert.equal(
    (
      await sharedRequest(
        request(syncData(), 'f'.repeat(64)),
        env,
        connection.id,
      )
    ).status,
    403,
  );
  assert.equal(
    (await sharedRequest(request(syncData()), env, connection.id)).status,
    401,
  );
  const update = edit(store.projects.get(connection.id)!.snapshot, (deck) => {
    deck.title = 'Editor saved';
  });
  assert.equal(
    (
      await sharedRequest(
        request(syncData({ update }), connection.viewer),
        env,
        connection.id,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await sharedRequest(
        request(syncData({ update }), connection.editor),
        env,
        connection.id,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await sharedRequest(
        request({ action: 'rotate' }, connection.editor),
        env,
        connection.id,
      )
    ).status,
    403,
  );
  const rotation = await sharedRequest(
    request({ action: 'rotate' }, connection.owner),
    env,
    connection.id,
  );
  assert.equal(rotation.status, 200);
  const renewed = await rotation.json();
  for (const token of [connection.editor, connection.viewer])
    assert.equal(
      (await sharedRequest(request(syncData(), token), env, connection.id))
        .status,
      403,
    );
  assert.equal(
    (
      await sharedRequest(
        request(syncData(), renewed.editor),
        env,
        connection.id,
      )
    ).status,
    200,
  );
  assert.ok(
    [...store.presence.values()].every(
      (person) =>
        person.token !== digest(connection.viewer) &&
        person.token !== digest(connection.editor),
    ),
  );
});

void test('simultaneous writers merge again after CAS conflict instead of overwriting', async () => {
  const { store, env, connection } = await setup();
  const snapshot = store.projects.get(connection.id)!.snapshot;
  const a = edit(snapshot, (deck) => {
    deck.title = 'Writer A';
  });
  const b = edit(snapshot, (deck) => {
    deck.slides[0].notes = 'Writer B';
  });
  const responses = await Promise.all([
    sharedRequest(
      request(syncData({ update: a }), connection.owner),
      env,
      connection.id,
    ),
    sharedRequest(
      request(syncData({ update: b }), connection.editor),
      env,
      connection.id,
    ),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  );
  const doc = createDocument();
  Y.applyUpdate(doc, store.projects.get(connection.id)!.snapshot);
  assert.equal(readDocument(doc).title, 'Writer A');
  assert.equal(readDocument(doc).slides[0].notes, 'Writer B');
  assert.equal(store.projects.get(connection.id)!.revision, 3);
  doc.destroy();
});

void test('rotation during an in-flight editor write prevents commit', async () => {
  const { store, env, connection } = await setup();
  const snapshot = store.projects.get(connection.id)!.snapshot.slice();
  const update = edit(snapshot, (deck) => {
    deck.title = 'Revoked write';
  });
  store.beforeCAS = () => {
    store.projects.get(connection.id)!.editor_hash = digest('new-editor');
  };
  const response = await sharedRequest(
    request(syncData({ update }), connection.editor),
    env,
    connection.id,
  );
  assert.equal(response.status, 403);
  assert.deepEqual(store.projects.get(connection.id)!.snapshot, snapshot);
});

void test('a no-op sync rechecks authorization before returning and avoids fetching snapshots', async () => {
  const { store, env, connection } = await setup();
  store.beforePeople = () => {
    store.projects.get(connection.id)!.viewer_hash = digest('new-viewer');
  };
  const response = await sharedRequest(
    request(syncData({ revision: 1 }), connection.viewer),
    env,
    connection.id,
  );
  assert.equal(response.status, 403);
  assert.equal(store.snapshotReads, 0);
  assert.equal((await response.json()).update, undefined);
});

void test('presence cannot be overwritten by a different invitation with the same session UUID', async () => {
  const { env, connection } = await setup();
  const session = crypto.randomUUID();
  assert.equal(
    (
      await sharedRequest(
        request(syncData({ session, name: 'Owner' }), connection.owner),
        env,
        connection.id,
      )
    ).status,
    200,
  );
  const response = await sharedRequest(
    request(syncData({ session, name: 'Imposter' }), connection.viewer),
    env,
    connection.id,
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).people, [
    { session, name: 'Owner', slideId: '' },
  ]);
});

void test('strict request validation rejects cross-origin, malformed and oversized payloads', async () => {
  const { env, connection } = await setup();
  assert.equal(
    (
      await sharedRequest(
        request(syncData(), connection.owner, {
          origin: 'https://attacker.example',
        }),
        env,
        connection.id,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await sharedRequest(
        request(syncData(), connection.owner, {
          'sec-fetch-site': 'cross-site',
        }),
        env,
        connection.id,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await sharedRequest(
        request(syncData(), connection.owner, { 'content-type': 'text/plain' }),
        env,
        connection.id,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await sharedRequest(
        request(syncData(), connection.owner),
        env,
        '-'.repeat(36),
      )
    ).status,
    404,
  );
  for (const extra of [
    { update: '%%%%' },
    { update: toBase64(new Uint8Array([1])) },
    { vector: '////' },
    { revision: -1 },
    { revision: '1' },
    { session: '-'.repeat(36) },
    { name: 'a\u0000b' },
    { surprise: true },
  ])
    assert.equal(
      (
        await sharedRequest(
          request(syncData(extra), connection.owner),
          env,
          connection.id,
        )
      ).status,
      400,
      JSON.stringify(extra),
    );
  const oversize = toBase64(new Uint8Array(MAX_SNAPSHOT_BYTES + 1));
  assert.equal(
    (
      await sharedRequest(
        request(syncData({ update: oversize }), connection.owner),
        env,
        connection.id,
      )
    ).status,
    413,
  );
  const tooLong = request(syncData(), connection.owner, {
    'content-length': '4100001',
  });
  assert.equal((await sharedRequest(tooLong, env, connection.id)).status, 413);
  const broken = new Request('https://buddy.example/api/shared', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-buddy-key': connection.owner,
    },
    body: '{',
  });
  assert.equal((await sharedRequest(broken, env, connection.id)).status, 400);
});

void test('server-side rate limits and storage capacity fail closed', async () => {
  const { env, store, connection, update } = await setup();
  store.blockedScope = 'token';
  const limited = await sharedRequest(
    request(syncData(), connection.owner),
    env,
    connection.id,
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  store.blockedScope = undefined;
  store.full = true;
  const full = await sharedRequest(
    request({ update }, undefined, { 'x-buddy-create-key': CREATE_KEY }),
    env,
  );
  assert.equal(full.status, 507);
  assert.equal(store.projects.size, 1);
});

void test('response snapshots round trip into a fresh collaborative document', async () => {
  const { env, connection } = await setup();
  const response = await sharedRequest(
    request(syncData(), connection.viewer),
    env,
    connection.id,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const doc = createDocument();
  Y.applyUpdate(doc, fromBase64((await response.json()).update));
  assert.equal(readDocument(doc).title, initialDeck.title);
  doc.destroy();
});

void test('migration isolates storage, caps allocation, and grants no browser database role access', () => {
  const sql = readFileSync(
    new URL(
      '../supabase/migrations/202609050001_buddy_keynote.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.ok(!/\bpublic\./i.test(sql));
  assert.match(
    sql,
    /CREATE ROLE buddy_keynote_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS/,
  );
  assert.ok(!/\bPASSWORD\s*'/i.test(sql));
  for (const table of ['shared_projects', 'shared_presence', 'rate_limits']) {
    assert.ok(
      sql.includes(
        `ALTER TABLE buddy_keynote.${table} FORCE ROW LEVEL SECURITY`,
      ),
    );
    assert.ok(
      sql.includes(
        `ON buddy_keynote.${table} TO buddy_keynote_app USING (true) WITH CHECK (true)`,
      ),
    );
  }
  assert.match(sql, /project_count BETWEEN 0 AND 100/);
  assert.match(sql, /octet_length\(snapshot\) BETWEEN 1 AND 3000000/);
  assert.match(sql, /slot BETWEEN 0 AND 4095/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION buddy_keynote.enforce_storage_quota\(\) FROM PUBLIC, anon, authenticated, service_role, buddy_keynote_app/,
  );
  assert.ok(
    !/^GRANT .+ TO (PUBLIC|anon|authenticated|service_role);/im.test(sql),
  );
});
