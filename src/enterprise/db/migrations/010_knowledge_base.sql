-- Knowledge base enhancements
-- Check if memory_files table exists; if not, create it
CREATE TABLE IF NOT EXISTS memory_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_id UUID,
  file_name VARCHAR(500) NOT NULL,
  file_path TEXT,
  file_type VARCHAR(50),
  upload_name VARCHAR(500),
  file_size BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, ready, error
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  file_id UUID REFERENCES memory_files(id) ON DELETE CASCADE,
  agent_id UUID,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT, -- stores JSON array; use vector(1536) with pgvector for production
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_files_tenant ON memory_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_files_agent ON memory_files(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_tenant ON memory_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_agent ON memory_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_file ON memory_chunks(file_id);
-- Note: ivfflat index on embedding requires pgvector extension
-- CREATE INDEX IF NOT EXISTS idx_memory_chunks_embedding ON memory_chunks USING ivfflat (embedding vector_cosine_ops);
