-- Up Migration

-- 用户词书（筛选配置）。数量很少、整体替换，存成一行的 jsonb 即可。
CREATE TABLE user_books (
  user_id    bigint      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  books      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS user_books;
