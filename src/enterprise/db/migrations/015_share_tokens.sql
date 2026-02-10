-- Share tokens for public conversation sharing
CREATE TABLE IF NOT EXISTS share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  access_type VARCHAR(20) DEFAULT 'read_only',
  include_tool_outputs BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  view_count INTEGER DEFAULT 0,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_share_tokens_token ON share_tokens(token);
CREATE INDEX idx_share_tokens_session ON share_tokens(session_id);
CREATE INDEX idx_share_tokens_tenant ON share_tokens(tenant_id);
