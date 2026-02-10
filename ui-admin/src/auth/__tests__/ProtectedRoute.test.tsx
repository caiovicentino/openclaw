import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@/api/types";
import { AuthContext, type AuthContextValue } from "../AuthProvider";

// Mock react-router-dom hooks and components
const mockNavigate = vi.fn();
let mockNavigateToPath: string | undefined;

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/current", search: "", hash: "", state: null, key: "default" }),
  useNavigate: () => mockNavigate,
  Navigate: ({ to }: { to: string }) => {
    mockNavigateToPath = to;
    return null;
  },
}));

// Import ProtectedRoute after mock setup
const { ProtectedRoute } = await import("../ProtectedRoute");

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

function renderWithAuth(ui: React.ReactElement, authValue: AuthContextValue) {
  return render(createElement(AuthContext.Provider, { value: authValue }, ui));
}

function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    logout: vi.fn(),
    refreshUser: vi.fn(),
    ...overrides,
  };
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockNavigateToPath = undefined;
    mockNavigate.mockReset();
  });

  it("renders children when user is authenticated and has permission", () => {
    const user = createMockUser(["dashboard:read"]);
    const authValue = makeAuthValue({ user, isAuthenticated: true });

    renderWithAuth(
      createElement(
        ProtectedRoute,
        { requiredPermission: "dashboard:read" },
        createElement("div", null, "Protected Content"),
      ),
      authValue,
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("renders children when no permission is required and user is authenticated", () => {
    const user = createMockUser([]);
    const authValue = makeAuthValue({ user, isAuthenticated: true });

    renderWithAuth(
      createElement(ProtectedRoute, {}, createElement("div", null, "Open Content")),
      authValue,
    );

    expect(screen.getByText("Open Content")).toBeInTheDocument();
  });

  it("renders 403 when user lacks required permission", () => {
    const user = createMockUser(["users:read"]);
    const authValue = makeAuthValue({ user, isAuthenticated: true });

    renderWithAuth(
      createElement(
        ProtectedRoute,
        { requiredPermission: "admin:super" },
        createElement("div", null, "Should Not Appear"),
      ),
      authValue,
    );

    expect(screen.getByText("403 - Access Denied")).toBeInTheDocument();
    expect(screen.queryByText("Should Not Appear")).not.toBeInTheDocument();
  });

  it("renders 403 when user lacks any of requiredAnyPermission", () => {
    const user = createMockUser(["users:read"]);
    const authValue = makeAuthValue({ user, isAuthenticated: true });

    renderWithAuth(
      createElement(
        ProtectedRoute,
        { requiredAnyPermission: ["admin:super", "admin:write"] },
        createElement("div", null, "Should Not Appear"),
      ),
      authValue,
    );

    expect(screen.getByText("403 - Access Denied")).toBeInTheDocument();
  });

  it("renders children when user has one of requiredAnyPermission", () => {
    const user = createMockUser(["admin:write", "users:read"]);
    const authValue = makeAuthValue({ user, isAuthenticated: true });

    renderWithAuth(
      createElement(
        ProtectedRoute,
        { requiredAnyPermission: ["admin:super", "admin:write"] },
        createElement("div", null, "Has Some Permission"),
      ),
      authValue,
    );

    expect(screen.getByText("Has Some Permission")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    const authValue = makeAuthValue({ isAuthenticated: false });

    renderWithAuth(
      createElement(ProtectedRoute, {}, createElement("div", null, "Should Not Appear")),
      authValue,
    );

    expect(screen.queryByText("Should Not Appear")).not.toBeInTheDocument();
    expect(mockNavigateToPath).toBe("/login");
  });

  it("renders loading spinner while auth is loading", () => {
    const authValue = makeAuthValue({ isLoading: true });

    const { container } = renderWithAuth(
      createElement(ProtectedRoute, {}, createElement("div", null, "Should Not Appear")),
      authValue,
    );

    expect(screen.queryByText("Should Not Appear")).not.toBeInTheDocument();
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});
