-- Up Migration

-- 用户：登录名 username 唯一（前端限定小写字母/数字，故即显示名）；可改名
CREATE TABLE users (
  id            bigserial   PRIMARY KEY,
  username      text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  consent_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 会话：只存 token 的 sha256，不存明文 token
CREATE TABLE sessions (
  token_hash text        PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- 登录失败记录（服务端限速用）
CREATE TABLE login_fail (
  id       bigserial   PRIMARY KEY,
  username text,
  ip       text,
  ts       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_fail_user_idx ON login_fail (username, ts);
CREATE INDEX login_fail_ip_idx ON login_fail (ip, ts);

-- 每用户一份当前状态（同步用）：整包 JSON + 版本号（乐观并发）
CREATE TABLE user_state (
  user_id    bigint      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rev        bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 事件流（校准/分析用）：只追加
CREATE TABLE events (
  id      bigserial   PRIMARY KEY,
  user_id bigint      REFERENCES users(id) ON DELETE CASCADE,
  ts      timestamptz NOT NULL,
  type    text        NOT NULL,
  data    jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX events_user_ts_idx ON events (user_id, ts);
CREATE INDEX events_ts_idx ON events (ts);

-- Down Migration

DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS user_state;
DROP TABLE IF EXISTS login_fail;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
