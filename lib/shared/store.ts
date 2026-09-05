import 'server-only';
import postgres from 'postgres';

export type Project = {
  id: string;
  owner_hash: string;
  editor_hash: string;
  viewer_hash: string;
  snapshot: Uint8Array;
  revision: number;
};
export type ProjectMetadata = Omit<Project, 'snapshot'>;
export type Presence = { session: string; name: string; slideId: string };
export type RateScope = 'global' | 'ip' | 'token' | 'create' | 'create_ip';
export interface SharedStore {
  consumeRateLimit(
    scope: RateScope,
    slot: number,
    limit: number,
    seconds: number,
  ): Promise<boolean>;
  createProject(project: Project): Promise<boolean>;
  loadProject(id: string): Promise<ProjectMetadata | undefined>;
  loadSnapshot(id: string): Promise<Project | undefined>;
  compareAndSwap(
    id: string,
    revision: number,
    tokenHash: string,
    snapshot: Uint8Array,
  ): Promise<boolean>;
  rotate(
    id: string,
    ownerHash: string,
    editorHash: string,
    viewerHash: string,
  ): Promise<boolean>;
  updatePresence(
    id: string,
    tokenHash: string,
    person: Presence,
  ): Promise<void>;
  readPeople(id: string): Promise<Presence[]>;
}

export function createPostgresStore(sql: postgres.Sql): SharedStore {
  return {
    async consumeRateLimit(scope, slot, limit, seconds) {
      // Fixed hash slots bound this table even when an attacker rotates IPs/keys.
      // Collisions only make the limit more conservative.
      const rows = await sql`
        INSERT INTO buddy_keynote.rate_limits (scope, slot, hits, expires_at)
        VALUES (${scope}, ${slot}, 1, now() + ${seconds} * interval '1 second')
        ON CONFLICT (scope, slot) DO UPDATE SET
          hits = CASE WHEN buddy_keynote.rate_limits.expires_at <= now() THEN 1
            ELSE LEAST(buddy_keynote.rate_limits.hits + 1, ${limit + 1}) END,
          expires_at = CASE WHEN buddy_keynote.rate_limits.expires_at <= now()
            THEN now() + ${seconds} * interval '1 second'
            ELSE buddy_keynote.rate_limits.expires_at END
        RETURNING hits <= ${limit} AS allowed
      `;
      return rows[0]?.allowed === true;
    },
    async createProject(project) {
      try {
        await sql`
          INSERT INTO buddy_keynote.shared_projects
            (id, owner_hash, editor_hash, viewer_hash, snapshot, revision)
          VALUES (${project.id}, ${project.owner_hash}, ${project.editor_hash},
            ${project.viewer_hash}, ${Buffer.from(project.snapshot)}, 1)
        `;
        return true;
      } catch (error) {
        if (
          error instanceof postgres.PostgresError &&
          error.constraint_name === 'buddy_capacity'
        )
          return false;
        throw error;
      }
    },
    async loadProject(id) {
      const rows = await sql`
        SELECT id, owner_hash, editor_hash, viewer_hash, revision
        FROM buddy_keynote.shared_projects WHERE id = ${id}
      `;
      return rows[0] as ProjectMetadata | undefined;
    },
    async loadSnapshot(id) {
      const rows = await sql`
        SELECT id, owner_hash, editor_hash, viewer_hash, snapshot, revision
        FROM buddy_keynote.shared_projects WHERE id = ${id}
      `;
      const row = rows[0];
      return row
        ? ({ ...row, snapshot: new Uint8Array(row.snapshot) } as Project)
        : undefined;
    },
    async compareAndSwap(id, revision, tokenHash, snapshot) {
      // Snapshot and revision change in a single row update. A rotated capability
      // can never commit, even if it was authorized before rotation completed.
      const rows = await sql`
        UPDATE buddy_keynote.shared_projects
        SET snapshot = ${Buffer.from(snapshot)}, revision = revision + 1, updated_at = now()
        WHERE id = ${id} AND revision = ${revision}
          AND (owner_hash = ${tokenHash} OR editor_hash = ${tokenHash})
        RETURNING id
      `;
      return rows.length === 1;
    },
    async rotate(id, ownerHash, editorHash, viewerHash) {
      return sql.begin(async (tx) => {
        const rows = await tx`
          UPDATE buddy_keynote.shared_projects
          SET editor_hash = ${editorHash}, viewer_hash = ${viewerHash}, updated_at = now()
          WHERE id = ${id} AND owner_hash = ${ownerHash} RETURNING id
        `;
        if (!rows.length) return false;
        await tx`
          DELETE FROM buddy_keynote.shared_presence
          WHERE project_id = ${id} AND token_hash <> ${ownerHash}
        `;
        return true;
      });
    },
    async updatePresence(id, tokenHash, person) {
      // Serialize per-project presence to bound rows and avoid participant races.
      await sql.begin(async (tx) => {
        const granted = await tx`
          SELECT id FROM buddy_keynote.shared_projects WHERE id = ${id}
            AND (owner_hash = ${tokenHash} OR editor_hash = ${tokenHash} OR viewer_hash = ${tokenHash})
          FOR UPDATE
        `;
        if (!granted.length) return;
        await tx`DELETE FROM buddy_keynote.shared_presence WHERE project_id = ${id} AND expires_at <= now()`;
        await tx`
          INSERT INTO buddy_keynote.shared_presence (project_id, session_id, token_hash, name, slide_id, expires_at)
          SELECT ${id}, ${person.session}, ${tokenHash}, ${person.name}, ${person.slideId}, now() + interval '20 seconds'
          WHERE (SELECT count(*) FROM buddy_keynote.shared_presence WHERE project_id = ${id}) < 30
            OR EXISTS (SELECT 1 FROM buddy_keynote.shared_presence WHERE project_id = ${id} AND session_id = ${person.session})
          ON CONFLICT (project_id, session_id) DO UPDATE
          SET name = excluded.name, slide_id = excluded.slide_id, expires_at = excluded.expires_at
          WHERE buddy_keynote.shared_presence.token_hash = excluded.token_hash
        `;
      });
    },
    async readPeople(id) {
      const rows = await sql`
        SELECT p.session_id AS session, p.name, p.slide_id AS "slideId"
        FROM buddy_keynote.shared_presence p JOIN buddy_keynote.shared_projects d ON d.id = p.project_id
        WHERE p.project_id = ${id} AND p.expires_at > now()
          AND p.token_hash IN (d.owner_hash, d.editor_hash, d.viewer_hash)
        ORDER BY p.session_id LIMIT 30
      `;
      return rows.map((row) => ({
        session: row.session,
        name: row.name,
        slideId: row.slideId,
      }));
    },
  };
}

let store: SharedStore | undefined;
export function getSharedBindings() {
  const databaseUrl = process.env.BUDDY_DATABASE_URL;
  if (!store && databaseUrl) {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
      throw new Error('Invalid database protocol');
    // A narrow dedicated role is required: never connect as postgres/service_role.
    if (decodeURIComponent(url.username).split('.')[0] !== 'buddy_keynote_app')
      throw new Error('Dedicated Buddy database role required');
    store = createPostgresStore(
      postgres(databaseUrl, {
        ssl: process.env.BUDDY_DATABASE_CA
          ? { ca: process.env.BUDDY_DATABASE_CA, rejectUnauthorized: true }
          : true,
        max: 2,
        prepare: false, // Supabase transaction pooler compatibility.
        idle_timeout: 20,
        connect_timeout: 10,
        max_lifetime: 60 * 30,
        connection: {
          application_name: 'buddy-keynote',
          statement_timeout: 10000,
        },
      }),
    );
  }
  return {
    store,
    createKey: process.env.BUDDY_CREATE_KEY,
    appOrigin: process.env.BUDDY_APP_ORIGIN,
    additionalOrigins: process.env.BUDDY_ADDITIONAL_ORIGINS,
    trustedProxy: process.env.VERCEL === '1',
  };
}
