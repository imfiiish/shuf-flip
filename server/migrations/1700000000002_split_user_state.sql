-- Up Migration

-- 状态拆成两块、各自一个版本号：
--   progress  进度（在哪本书/哪一轮/哪张卡），推得勤但很小
--   data      统计（每词 met/checked/lastAt/rating 等），每轮推一次
-- 原来只有 data + rev；把 rev 归到 data 侧，另加 progress 侧。
ALTER TABLE user_state RENAME COLUMN rev TO data_rev;
ALTER TABLE user_state ADD COLUMN progress     jsonb  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_state ADD COLUMN progress_rev bigint NOT NULL DEFAULT 0;

-- Down Migration

ALTER TABLE user_state DROP COLUMN IF EXISTS progress;
ALTER TABLE user_state DROP COLUMN IF EXISTS progress_rev;
ALTER TABLE user_state RENAME COLUMN data_rev TO rev;
