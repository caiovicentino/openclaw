-- Seed data for OpenClaw Enterprise testing
-- Password for all users: "Admin@123" (bcrypt hash below)

-- 1. Create tenant
INSERT INTO tenants (id, slug, name, plan, status, settings, data_region)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'demo-corp',
  'Demo Corporation',
  'enterprise',
  'active',
  '{"maxUsers": 100, "maxAgents": 5}',
  'us-east-1'
);

-- 2. Create super admin user
-- Password: Admin@123 (bcrypt hash)
INSERT INTO users (id, tenant_id, email, name, employee_id, department, password_hash, status, mfa_enabled)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'admin@demo-corp.com',
  'Admin User',
  'EMP001',
  'Engineering',
  '$2b$10$8K1p/a0dR1xqM0O5q0UqYOHXGEfU9z0vS1V3J0f5KzW5Q5v5R5v5e',
  'active',
  false
);

-- 3. Create roles
INSERT INTO roles (id, tenant_id, name, department, permissions)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Super Admin', NULL,
   '["*"]'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Manager', 'Engineering',
   '["agent:chat","agent:view_own_history","agent:view_team_history","admin:dashboard","admin:reports","data:department"]'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Employee', NULL,
   '["agent:chat","agent:view_own_history","data:own"]'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Viewer', NULL,
   '["agent:view_own_history"]');

-- 4. Assign super admin role
INSERT INTO user_roles (user_id, role_id, granted_by)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001'
);

-- 5. Create additional test users
INSERT INTO users (id, tenant_id, email, name, employee_id, department, password_hash, status, mfa_enabled)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'maria@demo-corp.com', 'Maria Santos', 'EMP002', 'Engineering',
   '$2b$10$8K1p/a0dR1xqM0O5q0UqYOHXGEfU9z0vS1V3J0f5KzW5Q5v5R5v5e', 'active', false),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   'joao@demo-corp.com', 'Joao Silva', 'EMP003', 'Finance',
   '$2b$10$8K1p/a0dR1xqM0O5q0UqYOHXGEfU9z0vS1V3J0f5KzW5Q5v5R5v5e', 'active', false),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
   'ana@demo-corp.com', 'Ana Oliveira', 'EMP004', 'HR',
   '$2b$10$8K1p/a0dR1xqM0O5q0UqYOHXGEfU9z0vS1V3J0f5KzW5Q5v5R5v5e', 'invited', false);

-- Assign roles to test users
INSERT INTO user_roles (user_id, role_id, granted_by) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001');

-- 6. Create agent config
INSERT INTO agent_configs (id, tenant_id, agent_id, config)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'main-agent',
  '{
    "name": "Demo Corp AI Assistant",
    "model": "claude-sonnet-4-5-20250929",
    "systemPrompt": "You are the AI assistant for Demo Corporation. Help employees with their questions.",
    "tools": ["web_search", "file_read", "calculator"],
    "parameters": {"temperature": 0.7, "maxTokens": 4096},
    "isDefault": true
  }'
);

-- 7. Create compliance policies
INSERT INTO compliance_policies (id, tenant_id, name, description, type, rules, enabled, severity, created_by)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Data Retention - 90 Days', 'Auto-delete conversation data after 90 days',
   'data_retention', '{"retentionDays": 90, "tables": ["session_transcripts", "sessions"]}',
   true, 'medium', 'b0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Business Hours Only', 'Restrict AI usage to business hours',
   'time_restriction', '{"allowedHoursStart": 8, "allowedHoursEnd": 18, "timezone": "America/Sao_Paulo", "allowedDays": [1,2,3,4,5]}',
   false, 'low', 'b0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   'Model Allowlist', 'Only allow approved AI models',
   'model_allowlist', '{"allowedProviders": ["anthropic", "openai"], "allowedModels": ["claude-sonnet-4-5-20250929", "gpt-4o"]}',
   true, 'high', 'b0000000-0000-0000-0000-000000000001');

-- 8. Seed audit log entries
INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, severity)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'auth.login', 'user', 'b0000000-0000-0000-0000-000000000001',
   '{"method": "password"}', '192.168.1.100', 'info'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'user.created', 'user', 'b0000000-0000-0000-0000-000000000002',
   '{"email": "maria@demo-corp.com", "role": "Manager"}', '192.168.1.100', 'info'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'compliance.policy_created', 'compliance_policy', 'e0000000-0000-0000-0000-000000000001',
   '{"policyName": "Data Retention - 90 Days"}', '192.168.1.100', 'info');
