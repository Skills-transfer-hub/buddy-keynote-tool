import * as Y from 'yjs';
import {
  createDocument,
  fromBase64,
  readDocument,
  toBase64,
} from './document.ts';

type Bindings = { DB: D1Database; BUCKET: R2Bucket };
type Project = {
  id: string;
  owner_hash: string;
  editor_hash: string;
  viewer_hash: string;
  snapshot_key: string;
  revision: number;
};
export type SharedRole = 'owner' | 'editor' | 'viewer';
const MAX_BYTES = 16_000_000,
  MAX_BODY = 23_000_000;
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > MAX_BODY)
    throw new HttpError(
      413,
      'Présentation trop volumineuse pour le partage (16 Mo maximum).',
    );
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Requête vide.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY) {
      await reader.cancel();
      throw new HttpError(
        413,
        'Présentation trop volumineuse pour le partage (16 Mo maximum).',
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new HttpError(400, 'Requête invalide.');
  return parsed;
}
function bytes(value: unknown) {
  if (typeof value !== 'string')
    throw new HttpError(400, 'Données manquantes.');
  const result = fromBase64(value);
  if (result.length > MAX_BYTES)
    throw new HttpError(
      413,
      'Présentation trop volumineuse pour le partage (16 Mo maximum).',
    );
  return result;
}
function validate(doc: Y.Doc) {
  const deck = readDocument(doc);
  if (
    deck.slides.some((s) =>
      s.elements.some(
        (e) =>
          (e.kind === 'image' || e.kind === 'media') &&
          e.src.startsWith('blob:'),
      ),
    )
  )
    throw new HttpError(
      400,
      'Un média utilise une adresse temporaire. Importez son fichier avant de partager.',
    );
  if (Y.encodeStateAsUpdate(doc).length > MAX_BYTES)
    throw new HttpError(
      413,
      'Présentation trop volumineuse pour le partage (16 Mo maximum).',
    );
}
function role(project: Project, tokenHash: string): SharedRole {
  if (project.owner_hash === tokenHash) return 'owner';
  if (project.editor_hash === tokenHash) return 'editor';
  if (project.viewer_hash === tokenHash) return 'viewer';
  throw new HttpError(
    403,
    'Ce lien a été révoqué ou n’est pas valide. Vos changements restent sur cet appareil.',
  );
}
export async function sharedRequest(
  request: Request,
  env: Bindings,
  id?: string,
): Promise<Response> {
  try {
    if (!env.DB || !env.BUCKET)
      throw new HttpError(503, 'Le serveur de partage n’est pas configuré.');
    const db = env.DB.withSession('first-primary');
    if (!id) {
      if (request.method !== 'POST')
        throw new HttpError(405, 'Méthode indisponible.');
      const data = await body(request);
      const update = bytes(data.update);
      const doc = createDocument();
      try {
        Y.applyUpdate(doc, update);
        validate(doc);
      } finally {
        doc.destroy();
      }
      const projectId = crypto.randomUUID(),
        owner = secret(),
        editor = secret(),
        viewer = secret();
      const snapshotKey = `shared/${projectId}/${crypto.randomUUID()}`;
      await env.BUCKET.put(snapshotKey, update);
      try {
        await db
          .prepare(
            'INSERT INTO shared_projects (id,owner_hash,editor_hash,viewer_hash,snapshot_key,revision,updated_at) VALUES (?,?,?,?,?,1,?)',
          )
          .bind(
            projectId,
            await hash(owner),
            await hash(editor),
            await hash(viewer),
            snapshotKey,
            Date.now(),
          )
          .run();
      } catch (error) {
        await env.BUCKET.delete(snapshotKey);
        throw error;
      }
      return json({ id: projectId, owner, editor, viewer }, 201);
    }
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new HttpError(404, 'Projet introuvable.');
    const token = request.headers.get('x-buddy-key');
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new HttpError(401, 'Lien d’accès requis.');
    const tokenHash = await hash(token);
    const load = async () => {
      const p = await db
        .prepare('SELECT * FROM shared_projects WHERE id=?')
        .bind(id)
        .first<Project>();
      if (!p) throw new HttpError(404, 'Projet introuvable.');
      return { project: p, permission: role(p, tokenHash) };
    };
    let { project, permission } = await load();
    const data = await body(request);
    if (data.action === 'rotate') {
      if (permission !== 'owner')
        throw new HttpError(
          403,
          'Seul le propriétaire peut renouveler les liens.',
        );
      const editor = secret(),
        viewer = secret();
      await db
        .prepare(
          'UPDATE shared_projects SET editor_hash=?,viewer_hash=? WHERE id=? AND owner_hash=?',
        )
        .bind(await hash(editor), await hash(viewer), id, tokenHash)
        .run();
      await db
        .prepare(
          'DELETE FROM shared_presence WHERE project_id=? AND token_hash<>?',
        )
        .bind(id, tokenHash)
        .run();
      return json({ editor, viewer });
    }
    if (data.action !== 'sync') throw new HttpError(400, 'Action inconnue.');
    const update = bytes(data.update),
      vector = bytes(data.vector);
    const hasChanges = update.length > 2;
    if (permission === 'viewer' && hasChanges)
      throw new HttpError(403, 'Ce lien permet uniquement la lecture.');
    let responseUpdate: Uint8Array = new Uint8Array([0, 0]),
      serverVector: Uint8Array | undefined;
    // Immutable R2 snapshots + a D1 compare-and-swap. Concurrent writers merge
    // again from the winning snapshot; no last-writer full-deck overwrite.
    if (hasChanges || data.revision !== project.revision) {
      let completed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        ({ project, permission } = await load());
        if (hasChanges && permission === 'viewer')
          throw new HttpError(403, 'Accès en lecture seule.');
        const stored = await env.BUCKET.get(project.snapshot_key);
        if (!stored) continue; // A preceding snapshot was retired during this read.
        const doc = createDocument();
        try {
          const old = new Uint8Array(await stored.arrayBuffer());
          Y.applyUpdate(doc, old);
          if (hasChanges) Y.applyUpdate(doc, update);
          validate(doc);
          const merged = Y.encodeStateAsUpdate(doc);
          if (
            hasChanges &&
            (await hash(toBase64(old))) !== (await hash(toBase64(merged)))
          ) {
            const key = `shared/${id}/${crypto.randomUUID()}`;
            await env.BUCKET.put(key, merged);
            const result = await db
              .prepare(
                'UPDATE shared_projects SET snapshot_key=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (owner_hash=? OR editor_hash=?)',
              )
              .bind(key, Date.now(), id, project.revision, tokenHash, tokenHash)
              .run();
            if (!result.meta.changes) {
              await env.BUCKET.delete(key);
              continue;
            }
            // Readers retry if they observed the retired key before the CAS.
            await env.BUCKET.delete(project.snapshot_key).catch(
              () => undefined,
            );
            project = {
              ...project,
              snapshot_key: key,
              revision: project.revision + 1,
            };
          }
          responseUpdate = Y.encodeStateAsUpdate(doc, vector);
          serverVector = Y.encodeStateVector(doc);
          completed = true;
          break;
        } finally {
          doc.destroy();
        }
      }
      if (!completed)
        throw new HttpError(
          409,
          'Modifications simultanées en cours. Nouvelle tentative automatique.',
        );
    }
    // The presence key is scoped to the grant; knowing a session ID cannot
    // impersonate a participant holding a different invitation.
    const session = typeof data.session === 'string' ? data.session : '';
    if (/^[a-f0-9-]{36}$/.test(session)) {
      await db
        .prepare(
          'INSERT INTO shared_presence (project_id,session_id,token_hash,name,slide_id,expires_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM shared_projects WHERE id=? AND (owner_hash=? OR editor_hash=? OR viewer_hash=?)) ON CONFLICT(project_id,session_id) DO UPDATE SET name=excluded.name,slide_id=excluded.slide_id,expires_at=excluded.expires_at WHERE shared_presence.token_hash=excluded.token_hash',
        )
        .bind(
          id,
          session,
          tokenHash,
          (typeof data.name === 'string' ? data.name : 'Invité').slice(0, 40),
          (typeof data.slideId === 'string' ? data.slideId : '').slice(0, 100),
          Date.now() + 20_000,
          id,
          tokenHash,
          tokenHash,
          tokenHash,
        )
        .run();
    }
    await db
      .prepare(
        'DELETE FROM shared_presence WHERE project_id=? AND expires_at<?',
      )
      .bind(id, Date.now())
      .run();
    const people = await db
      .prepare(
        'SELECT p.session_id AS session,p.name,p.slide_id AS slideId FROM shared_presence p JOIN shared_projects d ON d.id=p.project_id WHERE p.project_id=? AND p.expires_at>? AND p.token_hash IN (d.owner_hash,d.editor_hash,d.viewer_hash) LIMIT 30',
      )
      .bind(id, Date.now())
      .all();
    // Recheck authorization even on no-op requests and before returning bytes.
    await load();
    return json({
      update: toBase64(responseUpdate),
      vector: serverVector ? toBase64(serverVector) : data.vector,
      revision: project.revision,
      role: permission,
      people: people.results,
    });
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (
      error instanceof SyntaxError ||
      error instanceof RangeError ||
      error instanceof TypeError ||
      (error instanceof Error &&
        error.message === 'Présentation partagée invalide.')
    )
      return json({ error: 'Données de présentation invalides.' }, 400);
    console.error(
      'Shared project request failed',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return json(
      {
        error:
          'Sauvegarde serveur indisponible. Vos changements sont conservés sur cet appareil.',
      },
      503,
    );
  }
}
