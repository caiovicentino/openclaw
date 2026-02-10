-- 007_compliance.sql
-- Compliance policies and usage tracking

CREATE TABLE compliance_policies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    type        VARCHAR(64) NOT NULL,
    rules       JSONB DEFAULT '{}',
    enabled     BOOLEAN DEFAULT TRUE,
    severity    VARCHAR(16) DEFAULT 'medium',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    created_by  UUID REFERENCES users(id)
);

CREATE INDEX idx_compliance_policies_tenant_type
    ON compliance_policies (tenant_id, type);

CREATE INDEX idx_compliance_policies_tenant_enabled
    ON compliance_policies (tenant_id, enabled);

CREATE TABLE usage_records (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    agent_id        VARCHAR(64) NOT NULL,
    session_key     VARCHAR(512),
    model_provider  VARCHAR(64),
    model_id        VARCHAR(128),
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    cost_usd        DECIMAL(10,6) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_records_tenant_created
    ON usage_records (tenant_id, created_at DESC);

CREATE INDEX idx_usage_records_tenant_user_created
    ON usage_records (tenant_id, user_id, created_at DESC);
