import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../context/tenant-context.js";
import {
  permissionMatches,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  checkPermission,
  checkAllPermissions,
  checkAnyPermission,
  evaluatePolicy,
  checkOwnerOrPermission,
  hasRole,
  hasAnyRole,
  checkDataAccess,
  checkToolAccess,
  filterAllowedPermissions,
  type PolicyRule,
} from "../policy-engine.js";

function makeCtx(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-1",
    tenantSlug: "acme",
    userId: "user-1",
    userEmail: "alice@acme.com",
    userName: "Alice",
    department: "Engineering",
    roles: ["admin"],
    permissions: ["agent:chat", "tools:exec"],
    requestId: "req-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// permissionMatches
// ---------------------------------------------------------------------------

describe("permissionMatches", () => {
  it("matches exact permissions", () => {
    expect(permissionMatches("agent:chat", "agent:chat")).toBe(true);
  });

  it("does not match different permissions", () => {
    expect(permissionMatches("agent:chat", "tools:exec")).toBe(false);
  });

  it("wildcard * matches everything", () => {
    expect(permissionMatches("*", "agent:chat")).toBe(true);
    expect(permissionMatches("*", "tools:exec")).toBe(true);
    expect(permissionMatches("*", "admin:users")).toBe(true);
  });

  it("prefix wildcard matches sub-permissions", () => {
    expect(permissionMatches("admin:*", "admin:users")).toBe(true);
    expect(permissionMatches("admin:*", "admin:config")).toBe(true);
    expect(permissionMatches("admin:user:*", "admin:user:create")).toBe(true);
  });

  it("prefix wildcard does not match other categories", () => {
    expect(permissionMatches("admin:*", "tools:exec")).toBe(false);
  });

  it("prefix wildcard does not match partial prefix (no colon boundary)", () => {
    // "admin:*" should match "admin:foo" but not "administrator:foo"
    expect(permissionMatches("admin:*", "administrator:foo")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasPermission / hasAllPermissions / hasAnyPermission
// ---------------------------------------------------------------------------

describe("hasPermission", () => {
  it("returns true when the required permission is in the set", () => {
    expect(hasPermission(["agent:chat", "tools:exec"], "agent:chat")).toBe(true);
  });

  it("returns false when the required permission is missing", () => {
    expect(hasPermission(["agent:chat"], "tools:exec")).toBe(false);
  });

  it("matches via wildcard in the granted set", () => {
    expect(hasPermission(["*"], "anything:here")).toBe(true);
  });
});

describe("hasAllPermissions", () => {
  it("returns true when all required are present", () => {
    expect(hasAllPermissions(["agent:chat", "tools:exec"], ["agent:chat", "tools:exec"])).toBe(
      true,
    );
  });

  it("returns false when one is missing", () => {
    expect(hasAllPermissions(["agent:chat"], ["agent:chat", "tools:exec"])).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  it("returns true when at least one is present", () => {
    expect(hasAnyPermission(["agent:chat"], ["tools:exec", "agent:chat"])).toBe(true);
  });

  it("returns false when none match", () => {
    expect(hasAnyPermission(["agent:chat"], ["tools:exec", "admin:users"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Context-based checks
// ---------------------------------------------------------------------------

describe("checkPermission", () => {
  it("allows when permission exists", () => {
    const ctx = makeCtx({ permissions: ["agent:chat"] });
    const result = checkPermission(ctx, "agent:chat");
    expect(result.allowed).toBe(true);
  });

  it("denies with reason when permission is missing", () => {
    const ctx = makeCtx({ permissions: [] });
    const result = checkPermission(ctx, "agent:chat");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("agent:chat");
  });
});

describe("checkAllPermissions", () => {
  it("allows when all permissions are present", () => {
    const ctx = makeCtx({ permissions: ["agent:chat", "tools:exec"] });
    expect(checkAllPermissions(ctx, ["agent:chat", "tools:exec"]).allowed).toBe(true);
  });

  it("denies and lists missing permissions", () => {
    const ctx = makeCtx({ permissions: ["agent:chat"] });
    const result = checkAllPermissions(ctx, ["agent:chat", "tools:exec"]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("tools:exec");
  });
});

describe("checkAnyPermission", () => {
  it("allows when at least one permission matches", () => {
    const ctx = makeCtx({ permissions: ["agent:chat"] });
    expect(checkAnyPermission(ctx, ["tools:exec", "agent:chat"]).allowed).toBe(true);
  });

  it("denies when none match", () => {
    const ctx = makeCtx({ permissions: [] });
    const result = checkAnyPermission(ctx, ["tools:exec", "agent:chat"]);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluatePolicy
// ---------------------------------------------------------------------------

describe("evaluatePolicy", () => {
  it("allows when all string rules pass", () => {
    const ctx = makeCtx({ permissions: ["agent:chat", "tools:exec"] });
    const rules: PolicyRule[] = [{ check: "agent:chat" }, { check: "tools:exec" }];
    expect(evaluatePolicy(ctx, rules).allowed).toBe(true);
  });

  it("denies when a string rule fails", () => {
    const ctx = makeCtx({ permissions: ["agent:chat"] });
    const rules: PolicyRule[] = [
      { check: "agent:chat" },
      { check: "admin:users", denyMessage: "Admin required" },
    ];
    const result = evaluatePolicy(ctx, rules);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Admin required");
  });

  it("supports predicate function rules", () => {
    const ctx = makeCtx({ department: "Engineering" });
    const rules: PolicyRule[] = [{ check: (c) => c.department === "Engineering" }];
    expect(evaluatePolicy(ctx, rules).allowed).toBe(true);
  });

  it("denies when a predicate rule fails", () => {
    const ctx = makeCtx({ department: "Sales" });
    const rules: PolicyRule[] = [
      { check: (c) => c.department === "Engineering", denyMessage: "Engineering only" },
    ];
    const result = evaluatePolicy(ctx, rules);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Engineering only");
  });

  it("allows with empty rules array", () => {
    const ctx = makeCtx();
    expect(evaluatePolicy(ctx, []).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkOwnerOrPermission
// ---------------------------------------------------------------------------

describe("checkOwnerOrPermission", () => {
  it("allows when user is the resource owner", () => {
    const ctx = makeCtx({ userId: "user-1" });
    expect(checkOwnerOrPermission(ctx, "user-1", "admin:users").allowed).toBe(true);
  });

  it("allows when user has the admin permission", () => {
    const ctx = makeCtx({ userId: "user-2", permissions: ["admin:users"] });
    expect(checkOwnerOrPermission(ctx, "user-1", "admin:users").allowed).toBe(true);
  });

  it("denies when user is not owner and lacks permission", () => {
    const ctx = makeCtx({ userId: "user-2", permissions: [] });
    const result = checkOwnerOrPermission(ctx, "user-1", "admin:users");
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasRole / hasAnyRole
// ---------------------------------------------------------------------------

describe("hasRole", () => {
  it("returns true when role is present", () => {
    const ctx = makeCtx({ roles: ["admin", "viewer"] });
    expect(hasRole(ctx, "admin")).toBe(true);
  });

  it("returns false when role is absent", () => {
    const ctx = makeCtx({ roles: ["viewer"] });
    expect(hasRole(ctx, "admin")).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("returns true when at least one role matches", () => {
    const ctx = makeCtx({ roles: ["viewer"] });
    expect(hasAnyRole(ctx, ["admin", "viewer"])).toBe(true);
  });

  it("returns false when no role matches", () => {
    const ctx = makeCtx({ roles: ["viewer"] });
    expect(hasAnyRole(ctx, ["admin", "superadmin"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDataAccess
// ---------------------------------------------------------------------------

describe("checkDataAccess", () => {
  it("allows with data:all permission", () => {
    const ctx = makeCtx({ permissions: ["data:all"] });
    expect(checkDataAccess(ctx, "Marketing").allowed).toBe(true);
  });

  it("allows with data:cross_department", () => {
    const ctx = makeCtx({ permissions: ["data:cross_department"], department: "Engineering" });
    expect(checkDataAccess(ctx, "Marketing").allowed).toBe(true);
  });

  it("allows data:department for same department (case-insensitive)", () => {
    const ctx = makeCtx({ permissions: ["data:department"], department: "Engineering" });
    expect(checkDataAccess(ctx, "engineering").allowed).toBe(true);
  });

  it("denies data:department for different department", () => {
    const ctx = makeCtx({ permissions: ["data:department"], department: "Engineering" });
    const result = checkDataAccess(ctx, "Marketing");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Engineering");
  });

  it("denies data:own for department-level data", () => {
    const ctx = makeCtx({ permissions: ["data:own"] });
    const result = checkDataAccess(ctx, "Engineering");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("own data");
  });

  it("denies with no data permissions", () => {
    const ctx = makeCtx({ permissions: [] });
    const result = checkDataAccess(ctx, "Engineering");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No data access permissions");
  });
});

// ---------------------------------------------------------------------------
// checkToolAccess
// ---------------------------------------------------------------------------

describe("checkToolAccess", () => {
  it("allows when user has required tool permission", () => {
    const ctx = makeCtx({ permissions: ["tools:exec"] });
    expect(checkToolAccess(ctx, "bash").allowed).toBe(true);
  });

  it("denies for unknown tool", () => {
    const ctx = makeCtx({ permissions: ["tools:exec"] });
    const result = checkToolAccess(ctx, "nonexistent_tool");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Unknown tool");
  });

  it("denies when user lacks required permission", () => {
    const ctx = makeCtx({ permissions: ["agent:chat"] });
    const result = checkToolAccess(ctx, "bash");
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterAllowedPermissions
// ---------------------------------------------------------------------------

describe("filterAllowedPermissions", () => {
  it("returns only permissions the user holds", () => {
    const ctx = makeCtx({ permissions: ["agent:chat", "tools:exec"] });
    const filtered = filterAllowedPermissions(ctx, ["agent:chat", "admin:users", "tools:exec"]);
    expect(filtered).toEqual(["agent:chat", "tools:exec"]);
  });

  it("returns empty array when none match", () => {
    const ctx = makeCtx({ permissions: [] });
    expect(filterAllowedPermissions(ctx, ["agent:chat"])).toEqual([]);
  });
});
