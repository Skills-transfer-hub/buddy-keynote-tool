-- Dedicated Buddy Keynote storage. Apply as the database administrator.
-- Provision buddy_keynote_app's password separately; never commit it.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'buddy_keynote_app') THEN
    CREATE ROLE buddy_keynote_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 10;
  END IF;
END
$$;
ALTER ROLE buddy_keynote_app SET search_path = buddy_keynote;
ALTER ROLE buddy_keynote_app SET statement_timeout = '10s';
ALTER ROLE buddy_keynote_app SET idle_in_transaction_session_timeout = '15s';

CREATE SCHEMA IF NOT EXISTS buddy_keynote;
REVOKE ALL ON SCHEMA buddy_keynote FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA buddy_keynote TO buddy_keynote_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA buddy_keynote REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA buddy_keynote REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA buddy_keynote REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE buddy_keynote.shared_projects (
  id uuid PRIMARY KEY,
  owner_hash text NOT NULL CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  editor_hash text NOT NULL CHECK (editor_hash ~ '^[a-f0-9]{64}$'),
  viewer_hash text NOT NULL CHECK (viewer_hash ~ '^[a-f0-9]{64}$'),
  snapshot bytea NOT NULL CHECK (octet_length(snapshot) BETWEEN 1 AND 3000000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_hash <> editor_hash AND owner_hash <> viewer_hash AND editor_hash <> viewer_hash)
);
CREATE TABLE buddy_keynote.shared_presence (
  project_id uuid NOT NULL REFERENCES buddy_keynote.shared_projects(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  name text NOT NULL CHECK (char_length(name) <= 40),
  slide_id text NOT NULL CHECK (char_length(slide_id) <= 100),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, session_id)
);
CREATE TABLE buddy_keynote.rate_limits (
  scope text NOT NULL CHECK (scope IN ('global', 'ip', 'token', 'create', 'create_ip')),
  slot integer NOT NULL CHECK (slot BETWEEN 0 AND 4095),
  hits integer NOT NULL CHECK (hits BETWEEN 1 AND 10001),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, slot)
);
-- A protected singleton serializes quota accounting inside each write transaction.
-- This caps stored snapshots at 100 projects / 300 MB without count-then-insert races.
CREATE TABLE buddy_keynote.storage_quota (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  project_count integer NOT NULL,
  snapshot_bytes bigint NOT NULL,
  CONSTRAINT buddy_capacity CHECK (project_count BETWEEN 0 AND 100 AND snapshot_bytes BETWEEN 0 AND 300000000)
);
INSERT INTO buddy_keynote.storage_quota (id, project_count, snapshot_bytes) VALUES (true, 0, 0);
CREATE FUNCTION buddy_keynote.enforce_storage_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE buddy_keynote.storage_quota SET project_count = project_count + 1,
      snapshot_bytes = snapshot_bytes + octet_length(NEW.snapshot) WHERE id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE buddy_keynote.storage_quota SET project_count = project_count - 1,
      snapshot_bytes = snapshot_bytes - octet_length(OLD.snapshot) WHERE id;
  ELSE
    UPDATE buddy_keynote.storage_quota SET
      snapshot_bytes = snapshot_bytes + octet_length(NEW.snapshot) - octet_length(OLD.snapshot) WHERE id;
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION buddy_keynote.enforce_storage_quota() FROM PUBLIC, anon, authenticated, service_role, buddy_keynote_app;
CREATE TRIGGER buddy_storage_quota AFTER INSERT OR DELETE OR UPDATE OF snapshot
  ON buddy_keynote.shared_projects FOR EACH ROW EXECUTE FUNCTION buddy_keynote.enforce_storage_quota();

ALTER TABLE buddy_keynote.shared_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE buddy_keynote.shared_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE buddy_keynote.shared_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE buddy_keynote.shared_presence FORCE ROW LEVEL SECURITY;
ALTER TABLE buddy_keynote.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE buddy_keynote.rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE buddy_keynote.storage_quota ENABLE ROW LEVEL SECURITY;
-- Tokens are verified by the server; only its isolated database role can reach
-- these tables. No Supabase browser/Data API role gets a policy or table grant.
CREATE POLICY buddy_server_projects ON buddy_keynote.shared_projects TO buddy_keynote_app USING (true) WITH CHECK (true);
CREATE POLICY buddy_server_presence ON buddy_keynote.shared_presence TO buddy_keynote_app USING (true) WITH CHECK (true);
CREATE POLICY buddy_server_rates ON buddy_keynote.rate_limits TO buddy_keynote_app USING (true) WITH CHECK (true);
REVOKE ALL ON ALL TABLES IN SCHEMA buddy_keynote FROM PUBLIC, anon, authenticated, service_role, buddy_keynote_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON buddy_keynote.shared_projects, buddy_keynote.shared_presence TO buddy_keynote_app;
GRANT SELECT, INSERT, UPDATE ON buddy_keynote.rate_limits TO buddy_keynote_app;
COMMIT;
