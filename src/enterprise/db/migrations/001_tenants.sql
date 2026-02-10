-- Migration 001: Tenants table
-- Multi-tenant foundation for OpenClaw Enterprise

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(32) DEFAULT 'starter',
    status VARCHAR(16) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    data_region VARCHAR(16),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    suspended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_tenants_slug ON tenants (slug);
