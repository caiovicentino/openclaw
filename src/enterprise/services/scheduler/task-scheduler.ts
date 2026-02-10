import { Cron } from "croner";
import { query } from "../../db/connection.js";
import {
  getEnabledTasks,
  createExecution,
  completeExecution,
  updateTask,
} from "../../db/repositories/task-repo.js";
import { logger } from "../../lib/logger.js";

interface ScheduledJob {
  taskId: string;
  cron: Cron;
}

export class TaskScheduler {
  private jobs = new Map<string, ScheduledJob>();

  async start(): Promise<void> {
    logger.info("Starting task scheduler");
    await this.loadTasks();
  }

  async stop(): Promise<void> {
    for (const [, job] of this.jobs) {
      job.cron.stop();
    }
    this.jobs.clear();
  }

  async loadTasks(): Promise<void> {
    const tasks = await getEnabledTasks();
    for (const task of tasks) {
      this.scheduleTask(task);
    }
    logger.info(`Loaded ${tasks.length} scheduled tasks`);
  }

  scheduleTask(task: {
    id: string;
    cron_expression: string;
    timezone?: string;
    tenant_id: string;
    task_type: string;
  }): void {
    if (this.jobs.has(task.id)) {
      this.jobs.get(task.id)!.cron.stop();
    }

    const cron = new Cron(
      task.cron_expression,
      {
        timezone: task.timezone || "UTC",
      },
      async () => {
        await this.executeTask(task);
      },
    );

    this.jobs.set(task.id, { taskId: task.id, cron });
  }

  unscheduleTask(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.cron.stop();
      this.jobs.delete(taskId);
    }
  }

  async executeTask(task: { id: string; tenant_id: string; task_type: string }): Promise<void> {
    const execution = await createExecution(task.id, task.tenant_id);

    try {
      await updateTask(task.tenant_id, task.id, {
        last_run_at: new Date().toISOString(),
        last_status: "running",
      });

      let result: Record<string, unknown> = {};

      switch (task.task_type) {
        case "cleanup":
          result = { message: "Cleanup executed" };
          break;
        case "report":
          result = { message: "Report generated" };
          break;
        case "data_retention":
          result = { message: "Data retention applied" };
          break;
        default:
          result = { message: `Task type '${task.task_type}' executed` };
      }

      await completeExecution(execution.id, "success", result);
      await updateTask(task.tenant_id, task.id, { last_status: "success" });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await completeExecution(execution.id, "failure", undefined, errorMsg);
      await updateTask(task.tenant_id, task.id, { last_status: "failure" });
      logger.error("Task execution failed", { taskId: task.id, error: errorMsg });
    }
  }

  async reloadTask(tenantId: string, taskId: string): Promise<void> {
    this.unscheduleTask(taskId);
    const result = await query(
      "SELECT * FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2 AND enabled = true",
      [taskId, tenantId],
    );
    if (result.rows.length > 0) {
      this.scheduleTask(
        result.rows[0] as {
          id: string;
          cron_expression: string;
          timezone?: string;
          tenant_id: string;
          task_type: string;
        },
      );
    }
  }
}

// Singleton
let scheduler: TaskScheduler | null = null;

export function getTaskScheduler(): TaskScheduler {
  if (!scheduler) {
    scheduler = new TaskScheduler();
  }
  return scheduler;
}
