import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshTokenPair,
  createPasswordResetToken,
  verifyPasswordResetToken,
  createInviteToken,
  verifyInviteToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  type JwtPayload,
} from "../jwt.js";

const TEST_SECRET = "test-secret-key-that-is-long-enough-for-hs256";

const samplePayload: Omit<JwtPayload, "type"> = {
  sub: "user-123",
  tenantId: "tenant-abc",
  tenantSlug: "acme",
  email: "alice@acme.com",
  name: "Alice",
  department: "Engineering",
  roles: ["admin"],
  permissions: ["agent:chat", "tools:exec"],
};

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", TEST_SECRET);
  vi.stubEnv("JWT_ACCESS_TOKEN_TTL", "900");
  vi.stubEnv("JWT_REFRESH_TOKEN_TTL", "604800");
  vi.stubEnv("JWT_ISSUER", "cerebro-test");
  vi.stubEnv("JWT_AUDIENCE", "cerebro");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// generateTokenPair
// ---------------------------------------------------------------------------

describe("generateTokenPair", () => {
  it("returns an access token, refresh token, expiresIn, and tokenType", async () => {
    const pair = await generateTokenPair(samplePayload);
    expect(pair).toHaveProperty("accessToken");
    expect(pair).toHaveProperty("refreshToken");
    expect(pair.expiresIn).toBe(900);
    expect(pair.tokenType).toBe("Bearer");
    expect(typeof pair.accessToken).toBe("string");
    expect(typeof pair.refreshToken).toBe("string");
  });

  it("produces distinct access and refresh tokens", async () => {
    const pair = await generateTokenPair(samplePayload);
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });
});

// ---------------------------------------------------------------------------
// verifyAccessToken
// ---------------------------------------------------------------------------

describe("verifyAccessToken", () => {
  it("verifies a valid access token and returns the payload", async () => {
    const pair = await generateTokenPair(samplePayload);
    const decoded = await verifyAccessToken(pair.accessToken);

    expect(decoded.sub).toBe(samplePayload.sub);
    expect(decoded.tenantId).toBe(samplePayload.tenantId);
    expect(decoded.email).toBe(samplePayload.email);
    expect(decoded.type).toBe("access");
    expect(decoded.roles).toEqual(samplePayload.roles);
    expect(decoded.permissions).toEqual(samplePayload.permissions);
  });

  it("rejects an invalid token string", async () => {
    await expect(verifyAccessToken("invalid.token.here")).rejects.toThrow();
  });

  it("rejects a refresh token when verifying as access", async () => {
    const pair = await generateTokenPair(samplePayload);
    await expect(verifyAccessToken(pair.refreshToken)).rejects.toThrow(
      /Expected access token but received refresh token/,
    );
  });
});

// ---------------------------------------------------------------------------
// verifyRefreshToken
// ---------------------------------------------------------------------------

describe("verifyRefreshToken", () => {
  it("verifies a valid refresh token and returns type=refresh", async () => {
    const pair = await generateTokenPair(samplePayload);
    const decoded = await verifyRefreshToken(pair.refreshToken);
    expect(decoded.type).toBe("refresh");
    expect(decoded.sub).toBe(samplePayload.sub);
  });

  it("rejects an access token when verifying as refresh", async () => {
    const pair = await generateTokenPair(samplePayload);
    await expect(verifyRefreshToken(pair.accessToken)).rejects.toThrow(
      /Expected refresh token but received access token/,
    );
  });
});

// ---------------------------------------------------------------------------
// refreshTokenPair (rotation & replay detection)
// ---------------------------------------------------------------------------

describe("refreshTokenPair", () => {
  it("issues a new token pair from a valid refresh token", async () => {
    const original = await generateTokenPair(samplePayload);
    const rotated = await refreshTokenPair(original.refreshToken);

    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.tokenType).toBe("Bearer");
    expect(rotated.expiresIn).toBe(900);
    // The rotated refresh token must differ (new jti)
    expect(rotated.refreshToken).not.toBe(original.refreshToken);

    // Verify the new access token is valid
    const decoded = await verifyAccessToken(rotated.accessToken);
    expect(decoded.sub).toBe(samplePayload.sub);
    expect(decoded.type).toBe("access");
  });

  it("detects replay: reusing an already-used refresh token revokes the family", async () => {
    const original = await generateTokenPair(samplePayload);
    // First rotation succeeds
    await refreshTokenPair(original.refreshToken);
    // Second use of the same refresh token is replay
    await expect(refreshTokenPair(original.refreshToken)).rejects.toThrow(
      /Refresh token reuse detected/,
    );
  });
});

// ---------------------------------------------------------------------------
// createPasswordResetToken / verifyPasswordResetToken
// ---------------------------------------------------------------------------

describe("password reset tokens", () => {
  it("creates and verifies a password reset token", async () => {
    const token = await createPasswordResetToken({
      userId: "user-123",
      tenantId: "tenant-abc",
      email: "alice@acme.com",
    });
    expect(typeof token).toBe("string");

    const decoded = await verifyPasswordResetToken(token);
    expect(decoded.userId).toBe("user-123");
    expect(decoded.tenantId).toBe("tenant-abc");
    expect(decoded.email).toBe("alice@acme.com");
  });

  it("rejects a non-password_reset token", async () => {
    const pair = await generateTokenPair(samplePayload);
    await expect(verifyPasswordResetToken(pair.accessToken)).rejects.toThrow(
      /Expected password_reset token/,
    );
  });
});

// ---------------------------------------------------------------------------
// createInviteToken / verifyInviteToken
// ---------------------------------------------------------------------------

describe("invite tokens", () => {
  it("creates and verifies an invite token", async () => {
    const token = await createInviteToken({
      tenantId: "tenant-abc",
      tenantSlug: "acme",
      email: "bob@acme.com",
    });
    expect(typeof token).toBe("string");

    const decoded = await verifyInviteToken(token);
    expect(decoded.tenantId).toBe("tenant-abc");
    expect(decoded.tenantSlug).toBe("acme");
    expect(decoded.email).toBe("bob@acme.com");
  });

  it("rejects a non-invite token", async () => {
    const pair = await generateTokenPair(samplePayload);
    await expect(verifyInviteToken(pair.accessToken)).rejects.toThrow(/Expected invite token/);
  });
});

// ---------------------------------------------------------------------------
// revokeRefreshToken / revokeAllUserTokens
// ---------------------------------------------------------------------------

describe("token revocation", () => {
  it("revokeRefreshToken prevents the token from being used for rotation", async () => {
    const pair = await generateTokenPair(samplePayload);
    // Decode to get the jti
    const decoded = await verifyRefreshToken(pair.refreshToken);
    expect(decoded.jti).toBeTruthy();

    revokeRefreshToken(decoded.jti!);
    await expect(refreshTokenPair(pair.refreshToken)).rejects.toThrow(
      /Refresh token has been revoked/,
    );
  });

  it("revokeAllUserTokens prevents all tokens for a user from being refreshed", async () => {
    const pair1 = await generateTokenPair(samplePayload);
    const pair2 = await generateTokenPair(samplePayload);

    revokeAllUserTokens(samplePayload.sub);

    await expect(refreshTokenPair(pair1.refreshToken)).rejects.toThrow(
      /Refresh token has been revoked/,
    );
    await expect(refreshTokenPair(pair2.refreshToken)).rejects.toThrow(
      /Refresh token has been revoked/,
    );
  });
});
