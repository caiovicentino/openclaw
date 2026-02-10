import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import type { User } from "@/api/types";
import { AuthContext, type AuthContextValue } from "../AuthProvider";
import { usePermissions } from "../usePermissions";

function createMockUser(permissions: string[]): User {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    role: "admin",
    roles: ["admin"],
    permissions,
    tenantId: "tenant-1",
    mfaEnabled: false,
    status: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

function createAuthWrapper(user: User | null) {
  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading: false,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(AuthContext.Provider, { value }, children);
  };
}

describe("usePermissions", () => {
  it("hasPermission returns true for an exact match", () => {
    const user = createMockUser(["users:read", "users:write", "reports:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasPermission("users:read")).toBe(true);
    expect(result.current.hasPermission("users:write")).toBe(true);
  });

  it("hasPermission returns false for a missing permission", () => {
    const user = createMockUser(["users:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasPermission("users:delete")).toBe(false);
    expect(result.current.hasPermission("admin:all")).toBe(false);
  });

  it("hasAnyPermission returns true if at least one matches", () => {
    const user = createMockUser(["users:read", "reports:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasAnyPermission(["users:delete", "users:read"])).toBe(true);
  });

  it("hasAnyPermission returns false if none match", () => {
    const user = createMockUser(["users:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasAnyPermission(["users:delete", "admin:all"])).toBe(false);
  });

  it("hasAllPermissions returns true only when all match", () => {
    const user = createMockUser(["users:read", "users:write", "reports:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasAllPermissions(["users:read", "users:write"])).toBe(true);
  });

  it("hasAllPermissions returns false when some are missing", () => {
    const user = createMockUser(["users:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasAllPermissions(["users:read", "users:write"])).toBe(false);
  });

  it("canAccess combines resource and action", () => {
    const user = createMockUser(["users:read", "reports:export"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.canAccess("users", "read")).toBe(true);
    expect(result.current.canAccess("reports", "export")).toBe(true);
    expect(result.current.canAccess("users", "delete")).toBe(false);
  });

  it("returns all false when user is null", () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(null),
    });

    expect(result.current.hasPermission("users:read")).toBe(false);
    expect(result.current.hasAnyPermission(["users:read"])).toBe(false);
    expect(result.current.hasAllPermissions(["users:read"])).toBe(false);
    expect(result.current.canAccess("users", "read")).toBe(false);
  });

  it("hasAllPermissions returns true for empty array", () => {
    const user = createMockUser(["users:read"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasAllPermissions([])).toBe(true);
  });

  it("wildcard * permission grants access to everything", () => {
    const user = createMockUser(["*"]);
    const { result } = renderHook(() => usePermissions(), {
      wrapper: createAuthWrapper(user),
    });

    expect(result.current.hasPermission("users:read")).toBe(true);
    expect(result.current.hasPermission("admin:super")).toBe(true);
    expect(result.current.hasAnyPermission(["users:delete"])).toBe(true);
    expect(result.current.hasAllPermissions(["users:read", "users:write"])).toBe(true);
    expect(result.current.canAccess("anything", "everything")).toBe(true);
  });
});
