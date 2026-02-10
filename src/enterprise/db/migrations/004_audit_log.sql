-- 004_audit_log.sql
-- Audit logging for tenant activity tracking

CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64),
    resource_id VARCHAR(255),
    details     JSONB DEFAULT '{}',
    ip_address  INET,
    user_agent  VARCHAR(512),
    session_key VARCHAR(512),
    severity    VARCHAR(16) DEFAULT 'info',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant_created
    ON audit_log (tenant_id, created_at DESC);

CREATE INDEX idx_audit_log_tenant_user_created
    ON audit_log (tenant_id, user_id, created_at DESC);

CREATE INDEX idx_audit_log_tenant_action_created
    ON audit_log (tenant_id, action, created_at DESC);
