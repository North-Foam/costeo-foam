export const statements = [
`CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','captura','consulta')),
 active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
`CREATE TABLE IF NOT EXISTS workspace (
 id integer PRIMARY KEY CHECK(id=1), state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id))`,
`CREATE TABLE IF NOT EXISTS audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id),
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS rate_limits (
 bucket text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL)`
];
