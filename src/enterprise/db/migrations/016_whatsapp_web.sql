-- 016_whatsapp_web.sql
-- Ensure channels table has status, capabilities, and last_active_at columns
-- (may already exist from route usage; ADD IF NOT EXISTS is safe).

ALTER TABLE channels ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'inactive';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_channels_type_status ON channels(type, status);
