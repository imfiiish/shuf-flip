-- Up Migration

-- 账号 / 会话 / 登录限速
CREATE TABLE users (
  id            bigserial   PRIMARY KEY,
  username      text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  consent_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 只存 token 的 sha256，不存明文
CREATE TABLE sessions (
  token_hash text        PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE login_fail (
  id       bigserial   PRIMARY KEY,
  username text,
  ip       text,
  ts       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_fail_user_idx ON login_fail (username, ts);
CREATE INDEX login_fail_ip_idx ON login_fail (ip, ts);

-- Down Migration

DROP TABLE IF EXISTS login_fail;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
