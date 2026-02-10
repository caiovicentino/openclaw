import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import { Hono } from "hono";
import * as path from "path";
import type { TenantContext } from "../../context/tenant-context.js";
import { requirePermission } from "../../rbac/middleware.js";
import { badRequest } from "../errors.js";

const upload = new Hono();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
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

upload.post("/upload", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const sessionId = formData.get("sessionId") as string | null;

  if (!file) return badRequest(c, "No file provided");
  if (file.size > MAX_FILE_SIZE) return badRequest(c, "File too large (max 10MB)");

  // Determine MIME type
  let mimeType = file.type || "application/octet-stream";
  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") mimeType = "text/typescript";
  else if (ext === ".js" || ext === ".jsx") mimeType = "text/javascript";
  else if (ext === ".py") mimeType = "text/x-python";
  else if (ext === ".md") mimeType = "text/markdown";
  else if (ext === ".csv") mimeType = "text/csv";

  const uploadDir = `/tmp/cerebro-workspaces/${sessionId ?? "uploads"}/uploads`;
  await fs.mkdir(uploadDir, { recursive: true });

  const fileId = randomUUID();
  const fileName = file.name;
  const filePath = path.join(uploadDir, `${fileId}${ext}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return c.json(
    {
      fileId,
      fileName,
      mimeType,
      size: file.size,
      path: filePath,
    },
    201,
  );
});

export { upload };
export const uploadRoutes = upload;
