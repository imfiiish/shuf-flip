-- Up Migration

-- 游客模式：一键创建的一次性账号，无密码、可被定期清理。
-- 正常注册用户 is_guest = false。
ALTER TABLE users ADD COLUMN is_guest boolean NOT NULL DEFAULT false;

-- 按游客 + 创建时间清理（如保留 30 天）
CREATE INDEX users_guest_idx ON users (is_guest, created_at);

-- Down Migration

DROP INDEX IF EXISTS users_guest_idx;
ALTER TABLE users DROP COLUMN IF EXISTS is_guest;
