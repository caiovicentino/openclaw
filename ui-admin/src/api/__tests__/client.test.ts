import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the stack-client module before importing client
vi.mock("@/auth/stack-client", () => ({
  stackApp: {
    getUser: vi.fn(),
  },
}));

describe("API client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function importClient() {
    vi.resetModules();
    const mod = await import("@/api/client");
    return mod.client;
  }

  async function mockStackUser(accessToken: string | null) {
    const { stackApp } = await import("@/auth/stack-client");
    if (accessToken) {
      (stackApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        getAuthJson: () => Promise.resolve({ accessToken }),
      });
    } else {
      (stackApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    }
  }

  it("includes Authorization header when Stack Auth user exists", async () => {
    const client = await importClient();
    await mockStackUser("test-token-123");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });

    await client.get("/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
        }),
      }),
    );
  });

  it("does not include Authorization header when no Stack Auth user", async () => {
    const client = await importClient();
    await mockStackUser(null);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });

    await client.get("/test");

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("throws ApiError on error responses", async () => {
    const client = await importClient();
    await mockStackUser(null);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () => Promise.resolve({ message: "Access denied" }),
    });

    const { ApiError } = await import("@/api/client");
    await expect(client.get("/admin")).rejects.toThrow(ApiError);
  });

  it("sends JSON body with Content-Type for POST requests", async () => {
    const client = await importClient();
    await mockStackUser(null);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1 }),
    });

    await client.post("/items", { name: "test" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/items",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "test" }),
      }),
    );
  });

  it("returns undefined for 204 No Content responses", async () => {
    const client = await importClient();
    await mockStackUser(null);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("No body")),
    });

    const result = await client.delete("/items/1");
    expect(result).toBeUndefined();
  });
});
