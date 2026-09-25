-- Up Migration

-- Model B 同步底座：服务器发牌、客户端只报动作。
-- 与旧的 user_state（progress/data 两个大 jsonb）并存，等客户端迁移完再拆。

-- 每用户 + 筛选的级联（抽样）状态。服务器侧保存，不再上传。
-- round 就是「当前这一轮」，r 是轮序。
CREATE TABLE cascades (
  user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fk         text        NOT NULL,
  r          integer     NOT NULL DEFAULT 0,
  levels     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  round      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fk)
);

-- 发过的每一轮：word 即 id，物化下来（词库会变，历史不能靠重算）。
CREATE TABLE rounds (
  id         bigserial   PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fk         text        NOT NULL,
  r          integer     NOT NULL,
  word_list  text[]      NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fk, r)
);
CREATE INDEX rounds_user_fk_idx ON rounds (user_id, fk);

-- 一轮里每个槽位的动作。PK 保证重传幂等。
CREATE TABLE actions (
  round_id   bigint      NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  slot       smallint    NOT NULL,
  met        boolean     NOT NULL DEFAULT false,
  checked    boolean     NOT NULL DEFAULT false,
  reveals    smallint    NOT NULL DEFAULT 0,
  rating     smallint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, slot)
);

-- 词级统计（由 actions 增量派生，客户端不再上传）。
CREATE TABLE user_word_stats (
  user_id  bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word     text        NOT NULL,
  met      integer     NOT NULL DEFAULT 0,
  checked  integer     NOT NULL DEFAULT 0,
  rating   smallint,
  last_at  timestamptz,
  PRIMARY KEY (user_id, word)
);

-- 每用户 + 筛选的当前位置（当前卡片下标）；轮序在 cascades.r。
CREATE TABLE user_progress (
  user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fk         text        NOT NULL,
  center     integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fk)
);

-- Down Migration

DROP TABLE IF EXISTS user_progress;
DROP TABLE IF EXISTS user_word_stats;
DROP TABLE IF EXISTS actions;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS cascades;
