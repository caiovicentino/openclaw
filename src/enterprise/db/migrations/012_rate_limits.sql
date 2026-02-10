-- Rate limit configuration
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  target_type VARCHAR(20) NOT NULL, -- user, agent, tenant
  target_id VARCHAR(255), -- specific user/agent ID, or null for tenant-wide
  limit_type VARCHAR(30) NOT NULL, -- tokens_per_hour, tokens_per_day, cost_per_day, requests_per_minute
  limit_value NUMERIC NOT NULL,
  warning_threshold NUMERIC DEFAULT 0.8, -- percentage (0.8 = warn at 80%)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_tenant ON rate_limits(tenant_id);
CREATE INDEX idx_rate_limits_target ON rate_limits(target_type, target_id);
