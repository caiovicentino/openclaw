import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UserFilters,
  PaginatedResponse,
  BulkImportUser,
  BulkImportResult,
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

export async function getUsers(filters?: UserFilters): Promise<PaginatedResponse<User>> {
  // Backend expects offset-based pagination, not page-based
  const { page, limit, ...rest } = filters ?? {};
  const effectivePage = page ?? 1;
  const effectiveLimit = limit ?? 50;
  const backendFilters: Record<string, unknown> = {
    ...rest,
    limit: effectiveLimit,
    offset: (effectivePage - 1) * effectiveLimit,
  };
  const res = await client.get<any>(`/users${buildQuery(backendFilters)}`);
  return {
    data: res.users ?? res.data ?? [],
    total: res.total ?? 0,
    page: effectivePage,
    limit: effectiveLimit,
  };
}

export async function getUser(id: string): Promise<User> {
  return client.get<User>(`/users/${id}`);
}

export async function createUser(data: CreateUserRequest): Promise<User> {
  return client.post<User>("/users", data);
}

export async function updateUser(id: string, data: UpdateUserRequest): Promise<User> {
  return client.patch<User>(`/users/${id}`, data);
}

export async function deleteUser(id: string): Promise<void> {
  return client.delete<void>(`/users/${id}`);
}

export async function inviteUser(id: string): Promise<void> {
  return client.post<void>(`/users/${id}/invite`);
}

export async function bulkImportUsers(users: BulkImportUser[]): Promise<BulkImportResult> {
  // Backend returns { users, count } on success; normalize to BulkImportResult shape
  const res = await client.post<any>("/users/bulk-import", { users });
  return {
    created: res.created ?? res.count ?? 0,
    failed: res.failed ?? 0,
    errors: res.errors ?? [],
  };
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  return client.post<void>(`/users/${userId}/roles`, { roleId });
}

export async function removeRole(userId: string, roleId: string): Promise<void> {
  return client.delete<void>(`/users/${userId}/roles/${roleId}`);
}
