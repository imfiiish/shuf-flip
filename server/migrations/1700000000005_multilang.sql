-- Up Migration

-- 多语言：英文（CET/Oxford）与中文（HSK）同表，用 lang 区分。
-- 现有 en 行默认 'en'，主键从 (word) 改为 (lang, word)。
--
-- 字段口径：
--   en  phonetic = IPA，senses = [[词性, [中文释义]], …]
--   zh  pinyin   = 拼音，senses = [[词性, [英文释义]], …]（词性存着但前端不显示）
-- kind 仅供生成/排查用（'char' | 'word' | 'both'）。
ALTER TABLE words ADD COLUMN lang   text NOT NULL DEFAULT 'en';
ALTER TABLE words ADD COLUMN kind   text;
ALTER TABLE words ADD COLUMN pinyin text;

ALTER TABLE words DROP CONSTRAINT words_pkey;
ALTER TABLE words ADD PRIMARY KEY (lang, word);

CREATE INDEX words_lang_idx ON words (lang);

-- Down Migration

DROP INDEX IF EXISTS words_lang_idx;
ALTER TABLE words DROP CONSTRAINT words_pkey;
ALTER TABLE words ADD PRIMARY KEY (word);
ALTER TABLE words DROP COLUMN pinyin;
ALTER TABLE words DROP COLUMN kind;
ALTER TABLE words DROP COLUMN lang;
