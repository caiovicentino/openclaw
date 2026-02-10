import type { Tenant, CreateTenantRequest, UpdateTenantRequest, TenantFilters } from "./types";
import { client } from "./client";

function buildQuery(filters?: Record<string, unknown> | object): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface TenantsListResponse {
  tenants: Tenant[];
  total: number;
}

export async function getTenants(filters?: TenantFilters): Promise<TenantsListResponse> {
  return client.get<TenantsListResponse>(`/tenants${buildQuery(filters)}`);
}

export async function getTenant(id: string): Promise<Tenant> {
  return client.get<Tenant>(`/tenants/${id}`);
}

export async function createTenant(data: CreateTenantRequest): Promise<Tenant> {
  return client.post<Tenant>("/tenants", data);
}

export async function updateTenant(id: string, data: UpdateTenantRequest): Promise<Tenant> {
  return client.patch<Tenant>(`/tenants/${id}`, data);
}

export async function deleteTenant(id: string): Promise<void> {
  return client.delete<void>(`/tenants/${id}`);
}
