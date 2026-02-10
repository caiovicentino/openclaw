import { client } from "./client";

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

export interface ScheduledTaskWithExecutions extends ScheduledTask {
  executions: TaskExecution[];
}

interface ListTasksResponse {
  tasks: ScheduledTask[];
  total: number;
  limit: number;
  offset: number;
}

export async function getScheduledTasks(options?: {
  limit?: number;
  offset?: number;
  enabled?: boolean;
  task_type?: string;
}): Promise<ListTasksResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.enabled !== undefined) params.set("enabled", String(options.enabled));
  if (options?.task_type) params.set("task_type", options.task_type);
  const qs = params.toString();
  return client.get<ListTasksResponse>(`/scheduled-tasks${qs ? `?${qs}` : ""}`);
}

export async function getScheduledTask(id: string): Promise<ScheduledTaskWithExecutions> {
  return client.get<ScheduledTaskWithExecutions>(`/scheduled-tasks/${id}`);
}

export async function createScheduledTask(data: {
  name: string;
  description?: string;
  task_type: string;
  cron_expression: string;
  timezone?: string;
  agent_id?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}): Promise<ScheduledTask> {
  return client.post<ScheduledTask>("/scheduled-tasks", data);
}

export async function updateScheduledTask(
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
  }>,
): Promise<ScheduledTask> {
  return client.patch<ScheduledTask>(`/scheduled-tasks/${id}`, data);
}

export async function deleteScheduledTask(id: string): Promise<void> {
  return client.delete<void>(`/scheduled-tasks/${id}`);
}

export async function runScheduledTask(id: string): Promise<TaskExecution> {
  return client.post<TaskExecution>(`/scheduled-tasks/${id}/run`);
}

export async function getTaskExecutions(
  id: string,
  limit?: number,
): Promise<{ executions: TaskExecution[] }> {
  const qs = limit ? `?limit=${limit}` : "";
  return client.get<{ executions: TaskExecution[] }>(`/scheduled-tasks/${id}/executions${qs}`);
}
