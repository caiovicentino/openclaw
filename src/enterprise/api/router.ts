import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "../lib/logger.js";
import { requestAuditMiddleware, authFailureAuditMiddleware } from "./middleware/audit.js";
import { jwtAuthMiddleware } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { agentCollaborationRoutes } from "./routes/agent-collaboration.js";
import { agents as agentRoutes } from "./routes/agents.js";
import { auditRoutes } from "./routes/audit.js";
import { authRoutes } from "./routes/auth.js";
import { channels as channelRoutes } from "./routes/channels.js";
import { chatRoutes } from "./routes/chat.js";
import { complianceRoutes } from "./routes/compliance.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { knowledgeBaseRoutes } from "./routes/knowledge-base.js";
import { mcpRoutes } from "./routes/mcp.js";
import { privacyRoutes } from "./routes/privacy.js";
import { rateLimitRoutes } from "./routes/rate-limits.js";
import { reportRoutes } from "./routes/reports.js";
import { roleRoutes } from "./routes/roles.js";
import { scheduledTaskRoutes } from "./routes/scheduled-tasks.js";
import { sessions as sessionRoutes } from "./routes/sessions.js";
import { settingsRoutes } from "./routes/settings.js";
import { shareRoutes } from "./routes/share.js";
import { tenantRoutes } from "./routes/tenants.js";
import { uploadRoutes } from "./routes/upload.js";
import { userRoutes } from "./routes/users.js";
import { webhookRoutes } from "./routes/webhooks.js";

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ADMIN_CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "development") {
    return ["http://localhost:5173", "http://localhost:5174"];
  }
  return [];
}

export function createEnterpriseApi(): Hono {
  const app = new Hono().basePath("/api/v1");

  const allowedOrigins = getAllowedOrigins();
  app.use(
    "*",
    cors({
      origin: allowedOrigins,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      maxAge: 86400,
    }),
  );

  // Audit middleware - log all requests and auth failures
  app.use("*", requestAuditMiddleware());
  app.use("*", authFailureAuditMiddleware());

  // Public routes (no auth required)
  app.route("/auth", authRoutes);
  app.route("/share", shareRoutes);
  app.route("/webhooks", webhookRoutes);

  // Protected routes (JWT required)
  // JWT middleware verifies the token and sets tenantContext for all
  // downstream routes. Rate limiter comes after so it can use tenantContext
  // for per-tenant limiting.
  app.use("*", jwtAuthMiddleware());
  app.use("*", rateLimit({ max: 100, windowMs: 60_000 }));

  app.route("/agents", agentRoutes);
  app.route("/sessions", sessionRoutes);
  app.route("/channels", channelRoutes);
  app.route("/compliance", complianceRoutes);
  app.route("/audit", auditRoutes);
  app.route("/dashboard", dashboardRoutes);
  app.route("/reports", reportRoutes);
  app.route("/privacy", privacyRoutes);
  app.route("/users", userRoutes);
  app.route("/roles", roleRoutes);
  app.route("/tenants", tenantRoutes);
  app.route("/settings", settingsRoutes);
  app.route("/chat", chatRoutes);
  app.route("/chat", uploadRoutes);
  app.route("/scheduled-tasks", scheduledTaskRoutes);
  app.route("/rate-limits", rateLimitRoutes);
  app.route("/mcp", mcpRoutes);
  app.route("/knowledge-base", knowledgeBaseRoutes);
  app.route("/agent-collaboration", agentCollaborationRoutes);

  // Error handler - never leak stack traces in production
  app.onError((err, c) => {
    logger.error("API Error", { error: String(err), path: c.req.path, method: c.req.method });
    const message = process.env.NODE_ENV === "development" ? err.message : "Internal server error";
    return c.json({ error: "INTERNAL_ERROR", message }, 500);
  });

  // 404 handler
  app.notFound((c) => c.json({ error: "NOT_FOUND", message: "Not Found" }, 404));

  return app;
}
