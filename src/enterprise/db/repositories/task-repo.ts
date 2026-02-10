import { query } from "../connection.js";

export interface ScheduledTask {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  task_type: string;
  cron_expression: string;
  timezone: string;
  agent_id: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskExecution {
  id: string;
  task_id: string;
  tenant_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  result: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export async function createTask(
  tenantId: string,
  data: {
    name: string;
    description?: string;
    task_type: string;
    cron_expression: string;
    timezone?: string;
    agent_id?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<ScheduledTask> {
  const result = await query<ScheduledTask>(
    `INSERT INTO scheduled_tasks (tenant_id, name, description, task_type, cron_expression, timezone, agent_id, config, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      tenantId,
      data.name,
      data.description ?? null,
      data.task_type,
      data.cron_expression,
      data.timezone ?? "UTC",
      data.agent_id ?? null,
      JSON.stringify(data.config ?? {}),
      data.enabled ?? true,
    ],
  );
  return result.rows[0];
}

export async function getTaskById(tenantId: string, id: string): Promise<ScheduledTask | null> {
  const result = await query<ScheduledTask>(
    `SELECT * FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return result.rows[0] ?? null;
}

export async function listTasks(
  tenantId: string,
  options?: { limit?: number; offset?: number; enabled?: boolean; task_type?: string },
): Promise<{ tasks: ScheduledTask[]; total: number }> {
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (options?.enabled !== undefined) {
    conditions.push(`enabled = $${idx++}`);
    params.push(options.enabled);
  }
  if (options?.task_type) {
    conditions.push(`task_type = $${idx++}`);
    params.push(options.task_type);
  }

  const where = conditions.join(" AND ");
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const [dataResult, countResult] = await Promise.all([
    query<ScheduledTask>(
      `SELECT * FROM scheduled_tasks WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM scheduled_tasks WHERE ${where}`,
      params,
    ),
  ]);

  return {
    tasks: dataResult.rows,
    total: parseInt(countResult.rows[0]?.count ?? "0", 10),
  };
}

export async function updateTask(
  tenantId: string,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    task_type: string;
    cron_expression: string;
    timezone: string;
    agent_id: string | null;
    config: Record<string, unknown>;
    enabled: boolean;
    last_run_at: string;
    next_run_at: string;
    last_status: string;
  }>,
): Promise<ScheduledTask | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const dbKey = key; // keys already match DB columns
    if (dbKey === "config") {
      sets.push(`${dbKey} = $${idx++}::jsonb`);
      params.push(JSON.stringify(value));
    } else {
      sets.push(`${dbKey} = $${idx++}`);
      params.push(value);
    }
  }

  if (sets.length === 0) return getTaskById(tenantId, id);

  sets.push(`updated_at = NOW()`);
  params.push(id, tenantId);

  const result = await query<ScheduledTask>(
    `UPDATE scheduled_tasks SET ${sets.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteTask(tenantId: string, id: string): Promise<boolean> {
  const result = await query(`DELETE FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2`, [
    id,
    tenantId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function getEnabledTasks(): Promise<ScheduledTask[]> {
  const result = await query<ScheduledTask>(`SELECT * FROM scheduled_tasks WHERE enabled = true`);
  return result.rows;
}

export async function createExecution(taskId: string, tenantId: string): Promise<TaskExecution> {
  const result = await query<TaskExecution>(
    `INSERT INTO task_executions (task_id, tenant_id) VALUES ($1, $2) RETURNING *`,
    [taskId, tenantId],
  );
  return result.rows[0];
}

export async function completeExecution(
  executionId: string,
  status: string,
  result?: Record<string, unknown>,
  error?: string,
): Promise<TaskExecution> {
  const res = await query<TaskExecution>(
    `UPDATE task_executions
     SET status = $1, completed_at = NOW(), result = $2::jsonb, error_message = $3
     WHERE id = $4
     RETURNING *`,
    [status, JSON.stringify(result ?? {}), error ?? null, executionId],
  );
  return res.rows[0];
}

export async function getExecutionHistory(taskId: string, limit = 20): Promise<TaskExecution[]> {
  const result = await query<TaskExecution>(
    `SELECT * FROM task_executions WHERE task_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [taskId, limit],
  );
  return result.rows;
}
