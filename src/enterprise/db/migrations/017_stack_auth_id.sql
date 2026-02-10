-- Migration 017: Add Stack Auth external identity column to users
-- Maps Stack Auth user IDs to local user accounts

ALTER TABLE users ADD COLUMN stack_auth_id VARCHAR(255);

CREATE UNIQUE INDEX idx_users_stack_auth_id ON users (stack_auth_id) WHERE stack_auth_id IS NOT NULL;
