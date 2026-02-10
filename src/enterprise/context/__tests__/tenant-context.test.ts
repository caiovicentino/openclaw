import { describe, it, expect } from "vitest";
import {
  createTenantContext,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isDepartment,
  type TenantContextInput,
} from "../tenant-context.js";

const sampleInput: TenantContextInput = {
  tenantId: "tenant-1",
  tenantSlug: "acme",
  userId: "user-1",
  userEmail: "alice@acme.com",
  userName: "Alice",
  department: "Engineering",
  roles: ["admin"],
  permissions: ["agent:chat", "tools:exec", "admin:*"],
};

// ---------------------------------------------------------------------------
// createTenantContext
// ---------------------------------------------------------------------------

describe("createTenantContext", () => {
  it("copies all input fields to the context", () => {
    const ctx = createTenantContext(sampleInput);
    expect(ctx.tenantId).toBe(sampleInput.tenantId);
    expect(ctx.tenantSlug).toBe(sampleInput.tenantSlug);
    expect(ctx.userId).toBe(sampleInput.userId);
    expect(ctx.userEmail).toBe(sampleInput.userEmail);
    expect(ctx.userName).toBe(sampleInput.userName);
    expect(ctx.department).toBe(sampleInput.department);
    expect(ctx.roles).toEqual(sampleInput.roles);
    expect(ctx.permissions).toEqual(sampleInput.permissions);
  });

  it("generates a requestId", () => {
    const ctx = createTenantContext(sampleInput);
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.requestId.length).toBeGreaterThan(0);
  });

  it("generates unique requestIds for separate calls", () => {
    const ctx1 = createTenantContext(sampleInput);
    const ctx2 = createTenantContext(sampleInput);
    expect(ctx1.requestId).not.toBe(ctx2.requestId);
  });

  it("preserves optional ipAddress when provided", () => {
    const ctx = createTenantContext({ ...sampleInput, ipAddress: "192.168.1.1" });
    expect(ctx.ipAddress).toBe("192.168.1.1");
  });
});

// ---------------------------------------------------------------------------
// hasPermission
// ---------------------------------------------------------------------------

describe("hasPermission", () => {
  it("returns true for exact match", () => {
    const ctx = createTenantContext(sampleInput);
    expect(hasPermission(ctx, "agent:chat")).toBe(true);
  });

  it("returns false when permission is not granted", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["agent:chat"] });
    expect(hasPermission(ctx, "tools:exec")).toBe(false);
  });

  it("matches via global wildcard *", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["*"] });
    expect(hasPermission(ctx, "anything:here")).toBe(true);
  });

  it("matches via prefix wildcard (admin:* matches admin:users)", () => {
    const ctx = createTenantContext(sampleInput); // has admin:*
    expect(hasPermission(ctx, "admin:users")).toBe(true);
    expect(hasPermission(ctx, "admin:config")).toBe(true);
  });

  it("prefix wildcard does not match other categories", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["admin:*"] });
    expect(hasPermission(ctx, "tools:exec")).toBe(false);
  });

  it("nested prefix wildcard works (admin:user:* matches admin:user:create)", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["admin:user:*"] });
    expect(hasPermission(ctx, "admin:user:create")).toBe(true);
    expect(hasPermission(ctx, "admin:user:delete")).toBe(true);
    expect(hasPermission(ctx, "admin:roles")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasAnyPermission / hasAllPermissions
// ---------------------------------------------------------------------------

describe("hasAnyPermission", () => {
  it("returns true when at least one permission matches", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["agent:chat"] });
    expect(hasAnyPermission(ctx, ["tools:exec", "agent:chat"])).toBe(true);
  });

  it("returns false when none match", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["agent:chat"] });
    expect(hasAnyPermission(ctx, ["tools:exec", "admin:users"])).toBe(false);
  });
});

describe("hasAllPermissions", () => {
  it("returns true when all match", () => {
    const ctx = createTenantContext(sampleInput); // has agent:chat, tools:exec, admin:*
    expect(hasAllPermissions(ctx, ["agent:chat", "tools:exec"])).toBe(true);
  });

  it("returns false when one is missing", () => {
    const ctx = createTenantContext({ ...sampleInput, permissions: ["agent:chat"] });
    expect(hasAllPermissions(ctx, ["agent:chat", "tools:exec"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDepartment
// ---------------------------------------------------------------------------

describe("isDepartment", () => {
  it("matches same department (case-insensitive)", () => {
    const ctx = createTenantContext(sampleInput);
    expect(isDepartment(ctx, "engineering")).toBe(true);
    expect(isDepartment(ctx, "ENGINEERING")).toBe(true);
    expect(isDepartment(ctx, "Engineering")).toBe(true);
  });

  it("returns false for different department", () => {
    const ctx = createTenantContext(sampleInput);
    expect(isDepartment(ctx, "Sales")).toBe(false);
  });
});
