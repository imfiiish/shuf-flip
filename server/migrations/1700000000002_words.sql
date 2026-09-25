-- Up Migration

-- 词表：word 本身即主键（稳定、可读、可 pg_dump、可直接重建）。
-- 来源是版本控制里的 public/data/<lang>/*.json，用 npm run import:words 装载：
-- 按 word upsert，幂等，不做删除（词只增/更新，历史引用永不失效）。
CREATE TABLE words (
  word       text        PRIMARY KEY,
  tags       text[]      NOT NULL DEFAULT '{}',
  phonetic   text,
  senses     jsonb,
  audio      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 按 tag 过滤词池（include: tags && ARRAY[...]；exclude: NOT tags && ARRAY[...]）
CREATE INDEX words_tags_idx ON words USING gin (tags);

-- Down Migration

DROP TABLE IF EXISTS words;
