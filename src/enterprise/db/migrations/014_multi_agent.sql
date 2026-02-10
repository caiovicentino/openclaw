-- Multi-agent collaboration
CREATE TABLE IF NOT EXISTS agent_collaboration_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_agent_id UUID NOT NULL REFERENCES agent_configs(id),
  target_agent_id UUID NOT NULL REFERENCES agent_configs(id),
  rule_type VARCHAR(20) NOT NULL, -- handoff, invoke
  trigger_description TEXT,
  context_summary_prompt TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_agent_id UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_chain JSONB DEFAULT '[]';
ALTER TABLE session_transcripts ADD COLUMN IF NOT EXISTS agent_id UUID;

CREATE INDEX IF NOT EXISTS idx_collab_rules_tenant ON agent_collaboration_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_collab_rules_source ON agent_collaboration_rules(source_agent_id);
