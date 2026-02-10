-- 005_memory_indexes.sql
-- Memory file and chunk storage with vector embeddings

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memory_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id    VARCHAR(64) NOT NULL,
    path        TEXT NOT NULL,
    source      VARCHAR(16) DEFAULT 'memory',
    hash        VARCHAR(128) NOT NULL,
    mtime       BIGINT NOT NULL,
    size        BIGINT NOT NULL,
    UNIQUE (tenant_id, agent_id, path)
);

CREATE TABLE memory_chunks (
    id          VARCHAR(128) PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id    VARCHAR(64) NOT NULL,
    path        TEXT NOT NULL,
    source      VARCHAR(16) DEFAULT 'memory',
    start_line  INTEGER NOT NULL,
    end_line    INTEGER NOT NULL,
    hash        VARCHAR(128) NOT NULL,
    model       VARCHAR(128) NOT NULL,
    text        TEXT NOT NULL,
    embedding   vector(1536),
    updated_at  BIGINT NOT NULL
);

CREATE INDEX idx_chunks_tenant
    ON memory_chunks (tenant_id, agent_id);

CREATE INDEX idx_chunks_embedding
    ON memory_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
