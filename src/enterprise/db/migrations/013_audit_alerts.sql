-- Audit alert rules
CREATE TABLE IF NOT EXISTS audit_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '{}',
  notification_channels JSONB DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggered audit alerts
CREATE TABLE IF NOT EXISTS audit_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  rule_id UUID NOT NULL REFERENCES audit_alert_rules(id) ON DELETE CASCADE,
  event_id UUID,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  details JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_audit_alerts_tenant ON audit_alerts(tenant_id);
CREATE INDEX idx_audit_alerts_rule ON audit_alerts(rule_id);
CREATE INDEX idx_audit_alert_rules_tenant ON audit_alert_rules(tenant_id);
