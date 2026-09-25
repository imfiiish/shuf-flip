-- Up Migration

-- Model B 后 events 与功能表重复（rounds/actions/quizzes/quiz_ratings），
-- 且不再需要行为时序分析，移除。
DROP TABLE IF EXISTS events;

-- Down Migration

CREATE TABLE events (
  id      bigserial   PRIMARY KEY,
  user_id bigint      REFERENCES users(id) ON DELETE CASCADE,
  ts      timestamptz NOT NULL,
  type    text        NOT NULL,
  data    jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX events_user_ts_idx ON events (user_id, ts);
CREATE INDEX events_ts_idx ON events (ts);
