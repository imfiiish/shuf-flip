-- Up Migration

-- Model B 已替代旧的「progress/data 两包 jsonb」全量同步，移除该表。
DROP TABLE IF EXISTS user_state;

-- Down Migration

CREATE TABLE user_state (
  user_id      bigint      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  progress     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  progress_rev bigint      NOT NULL DEFAULT 0,
  data         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  data_rev     bigint      NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
