-- Channels base table (if not already present)
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,  -- slack, telegram, whatsapp, webhook
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channel webhooks enhancements
ALTER TABLE channels ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agent_configs(id);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Channel messages for tracking webhook conversations
CREATE TABLE IF NOT EXISTS channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id),
  tenant_id UUID NOT NULL,
  external_id VARCHAR(255),
  direction VARCHAR(10) NOT NULL, -- inbound, outbound
  sender_id VARCHAR(255),
  sender_name VARCHAR(255),
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_tenant ON channel_messages(tenant_id);
