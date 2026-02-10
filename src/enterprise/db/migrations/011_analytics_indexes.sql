-- Performance indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_created ON usage_records(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_model ON usage_records(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_agent ON usage_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_user ON usage_records(user_id);
