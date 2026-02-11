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

function mapRole(raw: Record<string, unknown>): Role {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: ((raw.displayName ?? raw.description) as string) || "",
    permissions: (raw.permissions as string[]) ?? [],
    isSystemRole: (raw.isSystemRole as boolean) ?? false,
    memberCount: (raw.memberCount as number) ?? 0,
    createdAt: (raw.createdAt as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? "",
  };
}

function mapRoleWithMembers(raw: Record<string, unknown>): RoleWithMembers {
  return {
    ...mapRole(raw),
    members: (raw.members as RoleWithMembers["members"]) ?? [],
  };
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
  const rawRoles: Record<string, unknown>[] = res.roles ?? res.data ?? [];
  return {
    data: rawRoles.map(mapRole),
    total: res.total ?? 0,
    page: effectivePage,
    limit: effectiveLimit,
  };
}

export async function getRole(id: string): Promise<RoleWithMembers> {
  const raw = await client.get<any>(`/roles/${id}`);
  return mapRoleWithMembers(raw);
}

export async function createRole(data: CreateRoleRequest): Promise<Role> {
  const raw = await client.post<any>("/roles", {
    name: data.name,
    displayName: data.description,
    permissions: data.permissions,
  });
  return mapRole(raw);
}

export async function updateRole(id: string, data: UpdateRoleRequest): Promise<Role> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.displayName = data.description;
  if (data.permissions !== undefined) payload.permissions = data.permissions;
  const raw = await client.patch<any>(`/roles/${id}`, payload);
  return mapRole(raw);
}

export async function deleteRole(id: string): Promise<void> {
  return client.delete<void>(`/roles/${id}`);
}
