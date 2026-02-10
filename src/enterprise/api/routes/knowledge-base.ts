import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import { Hono } from "hono";
import * as path from "path";
import type { TenantContext } from "../../context/tenant-context.js";
import { query } from "../../db/connection.js";
import { requirePermission } from "../../rbac/middleware.js";
import {
  processDocument,
  searchKnowledgeBase,
} from "../../services/knowledge-base/document-processor.js";
import { badRequest, notFound } from "../errors.js";

const knowledgeBase = new Hono();

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "text/javascript",
  "text/typescript",
  "text/x-python",
  "application/javascript",
  "application/typescript",
]);

/** POST /knowledge-base/agents/:agentId/upload - Upload a document */
knowledgeBase.post("/agents/:agentId/upload", requirePermission("agent:manage"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return badRequest(c, "No file provided");
  if (file.size > MAX_FILE_SIZE) return badRequest(c, "File too large (max 20MB)");

  // Determine MIME type
  let mimeType = file.type || "application/octet-stream";
  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") mimeType = "text/typescript";
  else if (ext === ".js" || ext === ".jsx") mimeType = "text/javascript";
  else if (ext === ".py") mimeType = "text/x-python";
  else if (ext === ".md") mimeType = "text/markdown";
  else if (ext === ".csv") mimeType = "text/csv";
  else if (ext === ".txt") mimeType = "text/plain";
  else if (ext === ".pdf") mimeType = "application/pdf";
  else if (ext === ".json") mimeType = "application/json";

  // Save file to disk
  const uploadDir = `/tmp/cerebro-knowledge-base/${ctx.tenantId}/${agentId}`;
  await fs.mkdir(uploadDir, { recursive: true });

  const fileId = randomUUID();
  const filePath = path.join(uploadDir, `${fileId}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  // Insert DB record
  await query(
    `INSERT INTO memory_files (id, tenant_id, agent_id, file_name, file_path, file_type, upload_name, file_size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
    [fileId, ctx.tenantId, agentId, file.name, filePath, mimeType, file.name, file.size],
  );

  // Process document asynchronously (don't await)
  processDocument(ctx.tenantId, agentId, fileId, filePath, mimeType).catch((err) => {
    console.error(`Document processing error for ${fileId}:`, err);
  });

  return c.json(
    {
      id: fileId,
      fileName: file.name,
      fileType: mimeType,
      fileSize: file.size,
      status: "pending",
    },
    201,
  );
});

/** GET /knowledge-base/agents/:agentId/files - List uploaded files */
knowledgeBase.get("/agents/:agentId/files", requirePermission("agent:manage"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");

  const result = await query(
    `SELECT id, file_name, file_type, file_size, status, error_message, created_at, updated_at
       FROM memory_files
       WHERE tenant_id = $1 AND agent_id = $2
       ORDER BY created_at DESC`,
    [ctx.tenantId, agentId],
  );

  return c.json({
    files: result.rows.map((r: any) => ({
      id: r.id,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: Number(r.file_size),
      status: r.status,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

/** DELETE /knowledge-base/agents/:agentId/files/:fileId - Delete a file and its chunks */
knowledgeBase.delete(
  "/agents/:agentId/files/:fileId",
  requirePermission("agent:manage"),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("agentId");
    const fileId = c.req.param("fileId");

    const result = await query(
      `SELECT id, file_path FROM memory_files WHERE id = $1 AND tenant_id = $2 AND agent_id = $3`,
      [fileId, ctx.tenantId, agentId],
    );

    if (result.rows.length === 0) {
      return notFound(c, "File");
    }

    const filePath = result.rows[0].file_path;

    // Delete from DB (cascades to chunks)
    await query(`DELETE FROM memory_files WHERE id = $1`, [fileId]);

    // Delete file from disk (best effort)
    if (filePath) {
      await fs.unlink(filePath).catch(() => {});
    }

    return c.json({ ok: true });
  },
);

/** POST /knowledge-base/agents/:agentId/search - Search knowledge base */
knowledgeBase.post("/agents/:agentId/search", requirePermission("agent:manage"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");
  const body = await c.req.json();
  const queryText = body.query as string;
  const limit = body.limit as number | undefined;

  if (!queryText) return badRequest(c, "Query is required");

  try {
    const results = await searchKnowledgeBase(ctx.tenantId, agentId, queryText, limit ?? 5);
    return c.json({ results });
  } catch (err) {
    return c.json(
      {
        error: "SEARCH_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

/** GET /knowledge-base/agents/:agentId/stats - Get knowledge base stats */
knowledgeBase.get("/agents/:agentId/stats", requirePermission("agent:manage"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");

  const fileStats = await query(
    `SELECT
         COUNT(*) as total_files,
         COUNT(*) FILTER (WHERE status = 'ready') as ready_files,
         COUNT(*) FILTER (WHERE status = 'processing') as processing_files,
         COUNT(*) FILTER (WHERE status = 'error') as error_files,
         COALESCE(SUM(file_size), 0) as total_size
       FROM memory_files
       WHERE tenant_id = $1 AND agent_id = $2`,
    [ctx.tenantId, agentId],
  );

  const chunkStats = await query(
    `SELECT COUNT(*) as total_chunks
       FROM memory_chunks
       WHERE tenant_id = $1 AND agent_id = $2`,
    [ctx.tenantId, agentId],
  );

  const row = fileStats.rows[0] as any;
  return c.json({
    totalFiles: Number(row.total_files),
    readyFiles: Number(row.ready_files),
    processingFiles: Number(row.processing_files),
    errorFiles: Number(row.error_files),
    totalSize: Number(row.total_size),
    totalChunks: Number((chunkStats.rows[0] as any).total_chunks),
  });
});

export { knowledgeBase };
export const knowledgeBaseRoutes = knowledgeBase;
