-- Up Migration

-- quiz 待考池改由服务器计算：pending = last_quiz_r 之后 met 过的词。
ALTER TABLE cascades ADD COLUMN last_quiz_r integer NOT NULL DEFAULT 0;

-- 一次 quiz（每用户 + 筛选 + 批次一条）
CREATE TABLE quizzes (
  id          bigserial   PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fk          text        NOT NULL,
  batch       integer     NOT NULL,
  word_list   text[]      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (user_id, fk, batch)
);

-- quiz 评分
CREATE TABLE quiz_ratings (
  quiz_id    bigint      NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  word       text        NOT NULL,
  rating     smallint    NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quiz_id, word)
);

-- Down Migration

DROP TABLE IF EXISTS quiz_ratings;
DROP TABLE IF EXISTS quizzes;
ALTER TABLE cascades DROP COLUMN IF EXISTS last_quiz_r;
