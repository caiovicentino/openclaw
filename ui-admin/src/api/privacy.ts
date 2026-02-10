import type {
  Dsar,
  CreateDsarRequest,
  ErasureResult,
  UserDataExport,
  Consent,
  UpdateConsentRequest,
} from "./types";
import { client } from "./client";

export async function createDsar(data: CreateDsarRequest): Promise<Dsar> {
  return client.post<Dsar>("/privacy/dsar", {
    userId: data.userId,
    requestType: data.type,
    details: data.details ? { description: data.details } : undefined,
  });
}

export async function getDsar(id: string): Promise<Dsar> {
  return client.get<Dsar>(`/privacy/dsar/${id}`);
}

export async function requestErasure(userId: string, confirm = true): Promise<ErasureResult> {
  const res = await client.post<{
    userId: string;
    tenantId: string;
    tablesProcessed: string[];
    errors: string[];
    completedAt: string;
  }>("/privacy/erasure", { userId, confirm });
  return {
    success: res.errors.length === 0,
    recordsDeleted: res.tablesProcessed.length,
    details:
      res.errors.length > 0
        ? `Errors: ${res.errors.join(", ")}`
        : `Processed tables: ${res.tablesProcessed.join(", ")}`,
  };
}

export async function exportUserData(userId: string): Promise<UserDataExport> {
  return client.get<UserDataExport>(`/privacy/data-export/${userId}`);
}

export async function getConsent(userId: string): Promise<Consent[]> {
  const res = await client.get<any>(`/privacy/consent/${userId}`);
  return res.consents ?? res ?? [];
}

export async function updateConsent(userId: string, data: UpdateConsentRequest): Promise<Consent> {
  return client.post<Consent>(`/privacy/consent/${userId}`, data);
}
