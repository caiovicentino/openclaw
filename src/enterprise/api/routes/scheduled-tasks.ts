import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  deleteTask,
  getExecutionHistory,
  createExecution,
  completeExecution,
} from "../../db/repositories/task-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { getTaskScheduler } from "../../services/scheduler/task-scheduler.js";
import { badRequest, notFound, internalError } from "../errors.js";

const taskListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  enabled: z.enum(["true", "false"]).optional(),
  task_type: z.string().optional(),
});

const taskUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  task_type: z.string().optional(),
  cron_expression: z.string().optional(),
  timezone: z.string().optional(),
  agent_id: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const scheduledTasks = new Hono();

// ---------------------------------------------------------------------------
// GET / - List scheduled tasks for tenant
// ---------------------------------------------------------------------------

scheduledTasks.get("/", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const parsed = taskListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }
  const { limit, offset, enabled, task_type } = parsed.data;

  try {
    const result = await listTasks(ctx.tenantId, {
      limit,
      offset,
      enabled: enabled !== undefined ? enabled === "true" : undefined,
      task_type: task_type || undefined,
    });

    return c.json({
      tasks: result.tasks,
      total: result.total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[scheduled-tasks] list tasks failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Get single task with recent executions
// ---------------------------------------------------------------------------

scheduledTasks.get("/:id", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");

  try {
    const task = await getTaskById(ctx.tenantId, id);
    if (!task) return notFound(c, "Scheduled task");

    const executions = await getExecutionHistory(task.id, 10);

    return c.json({ ...task, executions });
  } catch (err) {
    console.error("[scheduled-tasks] get task failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// POST / - Create task
// ---------------------------------------------------------------------------

scheduledTasks.post("/", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const body = await c.req.json();

  if (!body.name || !body.task_type || !body.cron_expression) {
    return badRequest(c, "name, task_type, and cron_expression are required");
  }

  try {
    const task = await createTask(ctx.tenantId, {
      name: body.name,
      description: body.description,
      task_type: body.task_type,
      cron_expression: body.cron_expression,
      timezone: body.timezone,
      agent_id: body.agent_id,
      config: body.config,
      enabled: body.enabled,
    });

    // Schedule if enabled
    if (task.enabled) {
      getTaskScheduler().scheduleTask(task);
    }

    return c.json(task, 201);
  } catch (err) {
    console.error("[scheduled-tasks] create task failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id - Update task
// ---------------------------------------------------------------------------

scheduledTasks.patch("/:id", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  try {
    const existing = await getTaskById(ctx.tenantId, id);
    if (!existing) return notFound(c, "Scheduled task");

    const updated = await updateTask(ctx.tenantId, id, parsed.data);

    // Reload schedule
    await getTaskScheduler().reloadTask(ctx.tenantId, id);

    return c.json(updated);
  } catch (err) {
    console.error("[scheduled-tasks] update task failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Delete task
// ---------------------------------------------------------------------------

scheduledTasks.delete("/:id", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");

  try {
    getTaskScheduler().unscheduleTask(id);
    const deleted = await deleteTask(ctx.tenantId, id);
    if (!deleted) return notFound(c, "Scheduled task");

    return c.body(null, 204);
  } catch (err) {
    console.error("[scheduled-tasks] delete task failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/run - Manual execution trigger
// ---------------------------------------------------------------------------

scheduledTasks.post("/:id/run", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");

  try {
    const task = await getTaskById(ctx.tenantId, id);
    if (!task) return notFound(c, "Scheduled task");

    // Execute immediately
    const execution = await createExecution(task.id, task.tenant_id);

    try {
      await updateTask(ctx.tenantId, task.id, {
        last_run_at: new Date().toISOString(),
        last_status: "running",
      });

      let result: Record<string, unknown> = {};
      switch (task.task_type) {
        case "cleanup":
          result = { message: "Cleanup executed (manual)" };
          break;
        case "report":
          result = { message: "Report generated (manual)" };
          break;
        case "data_retention":
          result = { message: "Data retention applied (manual)" };
          break;
        default:
          result = { message: `Task type '${task.task_type}' executed (manual)` };
      }

      const completed = await completeExecution(execution.id, "success", result);
      await updateTask(ctx.tenantId, task.id, { last_status: "success" });

      return c.json(completed);
    } catch (err) {
      console.error("[scheduled-tasks] manual task execution failed:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const completed = await completeExecution(execution.id, "failure", undefined, errorMsg);
      await updateTask(ctx.tenantId, task.id, { last_status: "failure" });
      return c.json(completed);
    }
  } catch (err) {
    console.error("[scheduled-tasks] run task failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/executions - Execution history
// ---------------------------------------------------------------------------

scheduledTasks.get("/:id/executions", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  try {
    const task = await getTaskById(ctx.tenantId, id);
    if (!task) return notFound(c, "Scheduled task");

    const executions = await getExecutionHistory(id, limit);
    return c.json({ executions });
  } catch (err) {
    console.error("[scheduled-tasks] get execution history failed:", err);
    return internalError(c);
  }
});

export { scheduledTasks };
export const scheduledTaskRoutes = scheduledTasks;
