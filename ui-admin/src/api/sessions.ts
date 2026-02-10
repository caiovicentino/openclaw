import type {
  Session,
  SessionMessage,
  SessionFilters,
  PaginatedResponse,
  ExportFormat,
} from "./types";
import { client } from "./client";

/** Backend response shape for list sessions (uses offset, not page). */
interface ListSessionsResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

/** Backend response shape for transcript endpoint. */
interface TranscriptResponse {
  sessionId: string;
  entries: SessionMessage[];
  limit: number;
  offset: number;
}

function buildQuery(filters?: SessionFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();

  // Convert page-based pagination to offset-based for the backend
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  params.set("limit", String(limit));
  params.set("offset", String((page - 1) * limit));

  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.agentId) params.set("agentId", filters.agentId);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getSessions(filters?: SessionFilters): Promise<PaginatedResponse<Session>> {
  const raw = await client.get<ListSessionsResponse>(`/sessions${buildQuery(filters)}`);
  const page = filters?.page ?? 1;

  // Normalise backend shape to the PaginatedResponse<T> the UI expects
  return {
    data: raw.sessions,
    total: raw.total,
    page,
    limit: raw.limit,
  };
}

export async function getSession(id: string): Promise<Session> {
  return client.get<Session>(`/sessions/${id}`);
}

export async function getTranscript(id: string): Promise<SessionMessage[]> {
  const raw = await client.get<TranscriptResponse>(`/sessions/${id}/transcript`);
  return raw.entries;
}

export async function exportSession(id: string, format: ExportFormat): Promise<Blob> {
  const res = await client.raw("POST", `/sessions/${id}/export`, { format });
  return res.blob();
}

export async function deleteSession(id: string): Promise<void> {
  return client.delete<void>(`/sessions/${id}`);
}
