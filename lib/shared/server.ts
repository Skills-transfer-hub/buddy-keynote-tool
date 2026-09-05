import { createHash, timingSafeEqual } from 'node:crypto';
import * as Y from 'yjs';
import {
  createDocument,
  fromBase64,
  readDocument,
  toBase64,
} from './document.ts';
import type { ProjectMetadata, SharedStore, RateScope } from './store.ts';

export type SharedBindings = {
  store?: SharedStore;
  createKey?: string;
  appOrigin?: string;
  trustedProxy?: boolean;
};
export type SharedRole = 'owner' | 'editor' | 'viewer';
export const MAX_SNAPSHOT_BYTES = 3_000_000;
const MAX_BODY_BYTES = 4_100_000;
const MAX_VECTOR_BYTES = 64_000;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    },
  });
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
function safeEqual(a: string, b: string) {
  // Hash first, so timingSafeEqual always receives equal-sized buffers.
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
function checkRequest(request: Request, env: SharedBindings) {
  if (request.method !== 'POST')
    throw new HttpError(405, 'Méthode indisponible.');
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    throw new HttpError(415, 'Le format JSON est requis.');
  const origin = request.headers.get('origin');
  const allowedOrigin = env.appOrigin
    ? new URL(env.appOrigin).origin
    : new URL(request.url).origin;
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin !== null && origin !== allowedOrigin)
  )
    throw new HttpError(403, 'Origine de la requête interdite.');
  // CLI clients may omit Origin. Browser callers still need a custom capability
  // header; cross-origin preflights receive no CORS permission.
}
const tooLarge = () =>
  new HttpError(
    413,
    'Présentation trop volumineuse pour le partage (3 Mo maximum).',
  );
async function body(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)
  )
    throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Requête vide.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(buffer),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, 'Requête JSON invalide.');
  }
}
function onlyKeys(data: Record<string, unknown>, keys: string[]) {
  if (Object.keys(data).some((key) => !keys.includes(key)))
    throw new HttpError(400, 'Champ de requête inconnu.');
}
function bytes(value: unknown, max = MAX_SNAPSHOT_BYTES) {
  if (typeof value !== 'string' || !value.length)
    throw new HttpError(400, 'Données manquantes.');
  if (value.length > 4 * Math.ceil(max / 3)) throw tooLarge();
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new HttpError(400, 'Encodage des données invalide.');
  const result = fromBase64(value);
  if (result.length > max) throw tooLarge();
  return result;
}
function apply(doc: Y.Doc, update: Uint8Array) {
  try {
    Y.applyUpdate(doc, update);
  } catch {
    throw new HttpError(400, 'Données de présentation invalides.');
  }
}
function validate(doc: Y.Doc) {
  let deck;
  try {
    deck = readDocument(doc);
  } catch {
    throw new HttpError(400, 'Données de présentation invalides.');
  }
  if (
    deck.slides.some((slide) =>
      slide.elements.some(
        (element) =>
          (element.kind === 'image' || element.kind === 'media') &&
          element.src.startsWith('blob:'),
      ),
    )
  )
    throw new HttpError(
      400,
      'Un média utilise une adresse temporaire. Importez son fichier avant de partager.',
    );
  if (Y.encodeStateAsUpdate(doc).length > MAX_SNAPSHOT_BYTES) throw tooLarge();
}
function role(project: ProjectMetadata, tokenHash: string): SharedRole {
  if (safeEqual(project.owner_hash, tokenHash)) return 'owner';
  if (safeEqual(project.editor_hash, tokenHash)) return 'editor';
  if (safeEqual(project.viewer_hash, tokenHash)) return 'viewer';
  throw new HttpError(
    403,
    'Ce lien a été révoqué ou n’est pas valide. Vos changements restent sur cet appareil.',
  );
}
function containsControls(value: string) {
  return Array.from(value).some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}
function person(data: Record<string, unknown>) {
  if (
    typeof data.session !== 'string' ||
    !UUID.test(data.session) ||
    typeof data.name !== 'string' ||
    data.name.length > 40 ||
    containsControls(data.name) ||
    typeof data.slideId !== 'string' ||
    data.slideId.length > 100 ||
    containsControls(data.slideId)
  )
    throw new HttpError(400, 'Informations de présence invalides.');
  return {
    session: data.session,
    name: data.name || 'Invité',
    slideId: data.slideId,
  };
}
async function rate(
  store: SharedStore,
  scope: RateScope,
  key: string,
  limit: number,
  seconds = 60,
) {
  const slot =
    scope === 'global' || scope === 'create'
      ? 0
      : parseInt(hash(key).slice(0, 8), 16) % 4096;
  if (!(await store.consumeRateLimit(scope, slot, limit, seconds)))
    throw new HttpError(429, 'Trop de requêtes. Réessayez dans une minute.');
}

export async function sharedRequest(
  request: Request,
  env: SharedBindings,
  id?: string,
): Promise<Response> {
  try {
    checkRequest(request, env);
    if (!env.store)
      throw new HttpError(503, 'Le serveur de partage n’est pas configuré.');
    const store = env.store;
    // Vercel's trusted proxy header is only used on Vercel; local/non-Vercel
    // deployments share a conservative IP bucket until configured for a proxy.
    const ip = env.trustedProxy
      ? request.headers
          .get('x-vercel-forwarded-for')
          ?.split(',')[0]
          .trim()
          .slice(0, 128) || 'unknown'
      : 'local';
    await rate(store, 'global', '', 3000);
    await rate(store, 'ip', ip, 600);
    if (!id) {
      if (!env.createKey || env.createKey.length < 32)
        throw new HttpError(
          503,
          'La création de partages n’est pas configurée.',
        );
      await rate(store, 'create_ip', ip, 10);
      const createKey = request.headers.get('x-buddy-create-key') || '';
      if (createKey.length > 256 || !safeEqual(createKey, env.createKey))
        throw new HttpError(403, 'Clé de création invalide.');
      await rate(store, 'create', '', 20, 3600);
      const data = await body(request);
      onlyKeys(data, ['update']);
      const update = bytes(data.update);
      const doc = createDocument();
      let snapshot: Uint8Array;
      try {
        apply(doc, update);
        validate(doc);
        snapshot = Y.encodeStateAsUpdate(doc);
      } finally {
        doc.destroy();
      }
      const projectId = crypto.randomUUID(),
        owner = secret(),
        editor = secret(),
        viewer = secret();
      if (
        !(await store.createProject({
          id: projectId,
          owner_hash: hash(owner),
          editor_hash: hash(editor),
          viewer_hash: hash(viewer),
          snapshot,
          revision: 1,
        }))
      )
        throw new HttpError(
          507,
          'La capacité des présentations partagées est atteinte.',
        );
      return json({ id: projectId, owner, editor, viewer }, 201);
    }
    if (!UUID.test(id)) throw new HttpError(404, 'Projet introuvable.');
    const token = request.headers.get('x-buddy-key');
    if (!token || !TOKEN.test(token))
      throw new HttpError(401, 'Lien d’accès requis.');
    const tokenHash = hash(token);
    await rate(store, 'token', tokenHash, 600);
    const load = async () => {
      const project = await store.loadProject(id);
      if (!project) throw new HttpError(404, 'Projet introuvable.');
      return { project, permission: role(project, tokenHash) };
    };
    let { project, permission } = await load();
    const data = await body(request);
    if (data.action === 'rotate') {
      onlyKeys(data, ['action']);
      if (permission !== 'owner')
        throw new HttpError(
          403,
          'Seul le propriétaire peut renouveler les liens.',
        );
      const editor = secret(),
        viewer = secret();
      if (!(await store.rotate(id, tokenHash, hash(editor), hash(viewer))))
        throw new HttpError(403, 'Accès propriétaire révoqué.');
      return json({ editor, viewer });
    }
    if (data.action !== 'sync') throw new HttpError(400, 'Action inconnue.');
    onlyKeys(data, [
      'action',
      'update',
      'vector',
      'revision',
      'session',
      'name',
      'slideId',
    ]);
    if (
      !Number.isSafeInteger(data.revision) ||
      (data.revision as number) < 0 ||
      (data.revision as number) > 2147483647
    )
      throw new HttpError(400, 'Révision invalide.');
    const participant = person(data);
    const update = bytes(data.update),
      vector = bytes(data.vector, MAX_VECTOR_BYTES);
    try {
      Y.decodeStateVector(vector);
    } catch {
      throw new HttpError(400, 'Vecteur de synchronisation invalide.');
    }
    const hasChanges = !(
      update.length === 2 &&
      update[0] === 0 &&
      update[1] === 0
    );
    if (permission === 'viewer' && hasChanges)
      throw new HttpError(403, 'Ce lien permet uniquement la lecture.');
    let responseUpdate: Uint8Array = new Uint8Array([0, 0]),
      serverVector: Uint8Array | undefined;
    if (hasChanges || data.revision !== project.revision) {
      let completed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const stored = await store.loadSnapshot(id);
        if (!stored) throw new HttpError(404, 'Projet introuvable.');
        project = stored;
        permission = role(stored, tokenHash);
        if (hasChanges && permission === 'viewer')
          throw new HttpError(403, 'Accès en lecture seule.');
        const doc = createDocument();
        try {
          apply(doc, stored.snapshot);
          if (hasChanges) apply(doc, update);
          validate(doc);
          const merged = Y.encodeStateAsUpdate(doc);
          if (hasChanges && !Buffer.from(stored.snapshot).equals(merged)) {
            if (
              !(await store.compareAndSwap(
                id,
                project.revision,
                tokenHash,
                merged,
              ))
            )
              continue;
            project = { ...project, revision: project.revision + 1 };
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
    await store.updatePresence(id, tokenHash, participant);
    const people = await store.readPeople(id);
    // Check again before returning bytes, including on cached/no-op requests.
    permission = (await load()).permission;
    return json({
      update: toBase64(responseUpdate),
      vector: serverVector ? toBase64(serverVector) : data.vector,
      revision: project.revision,
      role: permission,
      people,
    });
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    // Do not log SQL, URLs, tokens, request bodies, or database error details.
    console.error('Shared project request failed');
    return json(
      {
        error:
          'Sauvegarde serveur indisponible. Vos changements sont conservés sur cet appareil.',
      },
      503,
    );
  }
}
