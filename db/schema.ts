import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const sharedProjects = sqliteTable('shared_projects', {
  id: text('id').primaryKey(),
  ownerHash: text('owner_hash').notNull(),
  editorHash: text('editor_hash').notNull(),
  viewerHash: text('viewer_hash').notNull(),
  snapshotKey: text('snapshot_key').notNull(),
  revision: integer('revision').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const sharedPresence = sqliteTable(
  'shared_presence',
  {
    projectId: text('project_id').notNull(),
    sessionId: text('session_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    name: text('name').notNull(),
    slideId: text('slide_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.sessionId] })],
);
