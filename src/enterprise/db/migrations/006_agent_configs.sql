-- 006_agent_configs.sql
-- Per-tenant agent configuration storage

CREATE TABLE agent_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id    VARCHAR(64) DEFAULT 'main',
    config      JSONB DEFAULT '{}',
    version     INTEGER DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  UUID REFERENCES users(id),
    UNIQUE (tenant_id, agent_id)
);
