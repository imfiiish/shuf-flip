-- Up Migration

-- Model B 学习数据。设计：一次 quiz 就是「另一种轮」（rounds.kind），
-- quiz 评分就是「带 rating 的动作」（actions.rating）。

-- 每用户 + 筛选的抽样状态 + 当前位置（center）
CREATE TABLE cascades (
  user_id     bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fk          text        NOT NULL,
  r           integer     NOT NULL DEFAULT 0,          -- 当前轮序
  levels      jsonb       NOT NULL DEFAULT '[]'::jsonb, -- 级联各级窗口
  round       jsonb       NOT NULL DEFAULT '[]'::jsonb, -- 当前这一轮（16 词）
  last_quiz_r integer     NOT NULL DEFAULT 0,          -- 上次 quiz 的轮序
  center      integer     NOT NULL DEFAULT 0,          -- 当前卡片下标
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fk)
);

-- 发过的每一轮：kind=study 为学习轮（seq=r），kind=quiz 为自测轮（seq=batch）
CREATE TABLE rounds (
  id          bigserial   PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fk          text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('study', 'quiz')),
  seq         integer     NOT NULL,
  word_list   text[]      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,                              -- 仅 quiz 用
  UNIQUE (user_id, fk, kind, seq)
);
CREATE INDEX rounds_user_fk_idx ON rounds (user_id, fk);

-- 一轮里每张卡的动作。PK 保证重传幂等。
-- rating 仅 quiz 轮写入；met 仅 study 轮写入。
CREATE TABLE actions (
  round_id   bigint      NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  slot       smallint    NOT NULL,
  met        boolean     NOT NULL DEFAULT false,
  reveals    smallint    NOT NULL DEFAULT 0,
  rating     smallint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, slot)
);

-- 词级统计（由 actions 增量派生）
CREATE TABLE user_word_stats (
  user_id  bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word     text        NOT NULL,
  met      integer     NOT NULL DEFAULT 0,
  checked  integer     NOT NULL DEFAULT 0,
  rating   smallint,
  last_at  timestamptz,
  PRIMARY KEY (user_id, word)
);

-- 用户词书（筛选配置）。数量少、整体替换，存一行 jsonb。
CREATE TABLE user_books (
  user_id    bigint      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  books      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS user_books;
DROP TABLE IF EXISTS user_word_stats;
DROP TABLE IF EXISTS actions;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS cascades;
