-- Up Migration

-- 中文粤拼（Jyutping）。en 行留空；zh 行形如 "hang4、hong4"（多读音用「、」连）。
ALTER TABLE words ADD COLUMN jyutping text;

-- Down Migration

ALTER TABLE words DROP COLUMN jyutping;
