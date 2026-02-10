-- Migration 003: Sessions and Session Transcripts
-- Conversation tracking for OpenClaw Enterprise

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id VARCHAR(64) DEFAULT 'main',
    session_key VARCHAR(512) NOT NULL,
    session_data JSONB DEFAULT '{}',
    transcript_path VARCHAR(512),
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE (tenant_id, agent_id, session_key)
);

CREATE TABLE session_transcripts (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    seq_num INTEGER NOT NULL,
    entry_type VARCHAR(32) NOT NULL,
    role VARCHAR(16),
    content TEXT,
    metadata JSONB DEFAULT '{}',
    tokens_in INTEGER,
    tokens_out INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_tenant_id ON sessions (tenant_id);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_session_transcripts_session_seq ON session_transcripts (session_id, seq_num);
CREATE INDEX idx_session_transcripts_tenant_created ON session_transcripts (tenant_id, created_at);
