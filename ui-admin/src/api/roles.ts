import type {
  Role,
  RoleWithMembers,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleFilters,
  PaginatedResponse,
} from "./types";
import { client } from "./client";

function buildQuery(filters?: Record<string, unknown>): string {
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

export async function getRoles(filters?: RoleFilters): Promise<PaginatedResponse<Role>> {
  const { page, limit, ...rest } = filters ?? {};
  const effectivePage = page ?? 1;
  const effectiveLimit = limit ?? 50;
  const backendFilters: Record<string, unknown> = {
    ...rest,
    limit: effectiveLimit,
    offset: (effectivePage - 1) * effectiveLimit,
  };
  const res = await client.get<any>(`/roles${buildQuery(backendFilters)}`);
  return {
    data: res.roles ?? res.data ?? [],
    total: res.total ?? 0,
    page: effectivePage,
    limit: effectiveLimit,
  };
}

export async function getRole(id: string): Promise<RoleWithMembers> {
  return client.get<RoleWithMembers>(`/roles/${id}`);
}

export async function createRole(data: CreateRoleRequest): Promise<Role> {
  // Backend uses displayName instead of description
  return client.post<Role>("/roles", {
    name: data.name,
    displayName: data.description,
    permissions: data.permissions,
  });
}

export async function updateRole(id: string, data: UpdateRoleRequest): Promise<Role> {
  // Backend uses displayName instead of description
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.displayName = data.description;
  if (data.permissions !== undefined) {
    payload.permissions = data.permissions;
  }
  return client.patch<Role>(`/roles/${id}`, payload);
}

export async function deleteRole(id: string): Promise<void> {
  return client.delete<void>(`/roles/${id}`);
}
