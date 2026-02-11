-- Migration 019: Data integrity improvements
-- Backfill NULL user names, enforce NOT NULL, and add missing foreign key constraints.

-- 1. Make users.name NOT NULL (safe backfill for existing nulls)
UPDATE users SET name = email WHERE name IS NULL;
ALTER TABLE users ALTER COLUMN name SET NOT NULL;
ALTER TABLE users ALTER COLUMN name SET DEFAULT '';

-- 2. Add channel_messages FK to channels
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_channel_messages_channel_id') THEN
    ALTER TABLE channel_messages ADD CONSTRAINT fk_channel_messages_channel_id FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Add task_executions FK to scheduled_tasks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_task_executions_task_id') THEN
    ALTER TABLE task_executions ADD CONSTRAINT fk_task_executions_task_id FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Add audit_alerts FK to audit_alert_rules
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_audit_alerts_rule_id') THEN
    ALTER TABLE audit_alerts ADD CONSTRAINT fk_audit_alerts_rule_id FOREIGN KEY (rule_id) REFERENCES audit_alert_rules(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Add share_tokens FK to sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_share_tokens_session_id') THEN
    ALTER TABLE share_tokens ADD CONSTRAINT fk_share_tokens_session_id FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
  END IF;
END $$;
