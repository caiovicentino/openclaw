import * as fs from "fs/promises";
import * as path from "path";
import { query } from "../../db/connection.js";
import { getEmbeddingProvider } from "../embeddings/embedding-service.js";

const CHUNK_SIZE = 1000; // chars
const CHUNK_OVERLAP = 200;

export async function processDocument(
  tenantId: string,
  agentId: string,
  fileId: string,
  filePath: string,
  mimeType: string,
): Promise<void> {
  try {
    // Update status to processing
    await query(`UPDATE memory_files SET status = 'processing', updated_at = NOW() WHERE id = $1`, [
      fileId,
    ]);

    // Extract text
    let text: string;
    if (mimeType === "application/pdf") {
      text = await extractPdfText(filePath);
    } else {
      text = await fs.readFile(filePath, "utf-8");
    }

    // Chunk the text
    const chunks = chunkText(text);

    // Generate embeddings
    const provider = getEmbeddingProvider();
    const embeddings = await provider.embed(chunks);

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(",")}]`;
      await query(
        `INSERT INTO memory_chunks (tenant_id, file_id, agent_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [tenantId, fileId, agentId, i, chunks[i], embeddingStr],
      );
    }

    // Update status to ready
    await query(`UPDATE memory_files SET status = 'ready', updated_at = NOW() WHERE id = $1`, [
      fileId,
    ]);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE memory_files SET status = 'error', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [fileId, errorMsg],
    );
  }
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.length > 0 ? chunks : [text || "(empty)"];
}

async function extractPdfText(filePath: string): Promise<string> {
  try {
    // Try using pdfjs-dist
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = await fs.readFile(filePath);
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ");
      pages.push(text);
    }
    return pages.join("\n\n");
  } catch {
    // Fallback: just read as text
    return fs.readFile(filePath, "utf-8").catch(() => "(unable to extract text)");
  }
}

export async function searchKnowledgeBase(
  tenantId: string,
  agentId: string,
  queryText: string,
  limit = 5,
): Promise<Array<{ content: string; score: number; fileName: string }>> {
  const provider = getEmbeddingProvider();
  const [queryEmbedding] = await provider.embed([queryText]);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Cosine similarity search
  const result = await query(
    `SELECT mc.content, mc.metadata,
            mf.file_name,
            1 - (mc.embedding <=> $4::vector) as score
     FROM memory_chunks mc
     JOIN memory_files mf ON mc.file_id = mf.id
     WHERE mc.tenant_id = $1 AND mc.agent_id = $2 AND mf.status = 'ready'
     ORDER BY mc.embedding <=> $4::vector
     LIMIT $3`,
    [tenantId, agentId, limit, embeddingStr],
  );

  return result.rows.map((r: any) => ({
    content: r.content,
    score: Number(r.score),
    fileName: r.file_name,
  }));
}
