-- Up Migration

-- 字段命名规范化：filter_key / round_seq / words / revealed
--   fk          → filter_key
--   r / seq     → round_seq
--   round / word_list → words
--   reveals     → revealed（smallint → boolean）
--   checked     → revealed
--   last_quiz_r → last_quiz_round_seq

ALTER TABLE cascades RENAME COLUMN fk TO filter_key;
ALTER TABLE cascades RENAME COLUMN r TO round_seq;
ALTER TABLE cascades RENAME COLUMN "round" TO words;
ALTER TABLE cascades RENAME COLUMN last_quiz_r TO last_quiz_round_seq;

ALTER TABLE rounds RENAME COLUMN fk TO filter_key;
ALTER TABLE rounds RENAME COLUMN seq TO round_seq;
ALTER TABLE rounds RENAME COLUMN word_list TO words;
ALTER INDEX rounds_user_fk_idx RENAME TO rounds_user_filter_idx;

ALTER TABLE actions RENAME COLUMN reveals TO revealed;
ALTER TABLE actions ALTER COLUMN revealed DROP DEFAULT;
ALTER TABLE actions ALTER COLUMN revealed TYPE boolean USING (revealed > 0);
ALTER TABLE actions ALTER COLUMN revealed SET DEFAULT false;

ALTER TABLE user_word_stats RENAME COLUMN checked TO revealed;

-- Down Migration

ALTER TABLE user_word_stats RENAME COLUMN revealed TO checked;

ALTER TABLE actions ALTER COLUMN revealed DROP DEFAULT;
ALTER TABLE actions ALTER COLUMN revealed TYPE smallint USING (revealed::int);
ALTER TABLE actions ALTER COLUMN revealed SET DEFAULT 0;
ALTER TABLE actions RENAME COLUMN revealed TO reveals;

ALTER INDEX rounds_user_filter_idx RENAME TO rounds_user_fk_idx;
ALTER TABLE rounds RENAME COLUMN words TO word_list;
ALTER TABLE rounds RENAME COLUMN round_seq TO seq;
ALTER TABLE rounds RENAME COLUMN filter_key TO fk;

ALTER TABLE cascades RENAME COLUMN last_quiz_round_seq TO last_quiz_r;
ALTER TABLE cascades RENAME COLUMN words TO "round";
ALTER TABLE cascades RENAME COLUMN round_seq TO r;
ALTER TABLE cascades RENAME COLUMN filter_key TO fk;
