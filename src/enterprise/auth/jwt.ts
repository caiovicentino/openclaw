import * as jose from "jose";
import { randomUUID } from "node:crypto";

export type JwtConfig = {
  secret: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  issuer: string;
  audience: string;
};

export type JwtPayload = {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  name: string;
  department: string;
  roles: string[];
  permissions: string[];
  type: "access" | "refresh" | "password_reset" | "invite";
  jti?: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
};

// ---------------------------------------------------------------------------
// Refresh token family tracker for rotation & replay detection
// ---------------------------------------------------------------------------

type TokenFamilyEntry = {
  userId: string;
  tenantId: string;
  family: string;
  used: boolean;
  expiresAt: number;
};

const tokenFamilyStore = new Map<string, TokenFamilyEntry>();

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [jti, entry] of tokenFamilyStore) {
    if (entry.expiresAt <= now) {
      tokenFamilyStore.delete(jti);
    }
  }
}

const cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

function registerRefreshToken(
  jti: string,
  userId: string,
  tenantId: string,
  family: string,
  ttlSeconds: number,
): void {
  tokenFamilyStore.set(jti, {
    userId,
    tenantId,
    family,
    used: false,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function invalidateTokenFamily(family: string): void {
  for (const [jti, entry] of tokenFamilyStore) {
    if (entry.family === family) {
      tokenFamilyStore.delete(jti);
    }
  }
}

export function revokeRefreshToken(jti: string): void {
  tokenFamilyStore.delete(jti);
}

export function revokeAllUserTokens(userId: string): void {
  for (const [jti, entry] of tokenFamilyStore) {
    if (entry.userId === userId) {
      tokenFamilyStore.delete(jti);
    }
  }
}

export function getJwtConfig(): JwtConfig {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return {
    secret,
    accessTokenTtl: Number(process.env.JWT_ACCESS_TOKEN_TTL) || 1296000, // 15 days
    refreshTokenTtl: Number(process.env.JWT_REFRESH_TOKEN_TTL) || 2592000, // 30 days
    issuer: process.env.JWT_ISSUER || "cerebro",
    audience: process.env.JWT_AUDIENCE || "cerebro",
  };
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function signToken(
  payload: Omit<JwtPayload, "type">,
  type: "access" | "refresh" | "password_reset" | "invite",
  ttl: number,
  config: JwtConfig,
  jti?: string,
): Promise<string> {
  const secretKey = getSecretKey(config.secret);
  const builder = new jose.SignJWT({
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    email: payload.email,
    name: payload.name,
    department: payload.department,
    roles: payload.roles,
    permissions: payload.permissions,
    type,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(`${ttl}s`);

  if (jti) {
    builder.setJti(jti);
  }

  return builder.sign(secretKey);
}

async function verifyToken(
  token: string,
  expectedType: "access" | "refresh" | "password_reset" | "invite",
  config: JwtConfig,
): Promise<JwtPayload> {
  const secretKey = getSecretKey(config.secret);
  const { payload } = await jose.jwtVerify(token, secretKey, {
    issuer: config.issuer,
    audience: config.audience,
  });

  if (payload.type !== expectedType) {
    throw new Error(`Expected ${expectedType} token but received ${payload.type} token`);
  }

  return {
    sub: payload.sub as string,
    tenantId: payload.tenantId as string,
    tenantSlug: payload.tenantSlug as string,
    email: payload.email as string,
    name: payload.name as string,
    department: payload.department as string,
    roles: payload.roles as string[],
    permissions: payload.permissions as string[],
    type: payload.type as "access" | "refresh" | "password_reset" | "invite",
    jti: payload.jti as string | undefined,
  };
}

export async function generateAccessToken(payload: Omit<JwtPayload, "type">): Promise<string> {
  const config = getJwtConfig();
  return signToken(payload, "access", config.accessTokenTtl, config);
}

export async function generateRefreshToken(payload: Omit<JwtPayload, "type">): Promise<string> {
  const config = getJwtConfig();
  return signToken(payload, "refresh", config.refreshTokenTtl, config);
}

export async function generateTokenPair(
  payload: Omit<JwtPayload, "type">,
  family?: string,
): Promise<TokenPair> {
  const config = getJwtConfig();
  const jti = randomUUID();
  const tokenFamily = family ?? randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    signToken(payload, "access", config.accessTokenTtl, config),
    signToken(payload, "refresh", config.refreshTokenTtl, config, jti),
  ]);

  registerRefreshToken(jti, payload.sub, payload.tenantId, tokenFamily, config.refreshTokenTtl);

  return {
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTtl,
    tokenType: "Bearer",
  };
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const config = getJwtConfig();
  return verifyToken(token, "access", config);
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  const config = getJwtConfig();
  return verifyToken(token, "refresh", config);
}

export async function refreshTokenPair(refreshToken: string): Promise<TokenPair> {
  const payload = await verifyRefreshToken(refreshToken);

  const jti = payload.jti;
  if (!jti) {
    throw new Error("Refresh token missing jti claim");
  }

  const entry = tokenFamilyStore.get(jti);
  if (!entry) {
    throw new Error("Refresh token has been revoked");
  }

  // Replay detection: if the token was already used, an attacker may have
  // stolen the token. Invalidate the entire family as a precaution.
  if (entry.used) {
    invalidateTokenFamily(entry.family);
    throw new Error("Refresh token reuse detected — token family revoked");
  }

  // Mark the current token as used (not deleted, so replay is detectable)
  entry.used = true;

  const { type: _, jti: _jti, ...payloadWithoutType } = payload;
  return generateTokenPair(payloadWithoutType, entry.family);
}

// ---------------------------------------------------------------------------
// Password reset tokens (15-minute TTL, dedicated type to prevent confusion)
// ---------------------------------------------------------------------------

const PASSWORD_RESET_TTL_SECONDS = 900; // 15 minutes

export async function createPasswordResetToken(payload: {
  userId: string;
  tenantId: string;
  email: string;
}): Promise<string> {
  const config = getJwtConfig();
  const secretKey = getSecretKey(config.secret);
  const jwt = await new jose.SignJWT({
    tenantId: payload.tenantId,
    email: payload.email,
    type: "password_reset" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(`${PASSWORD_RESET_TTL_SECONDS}s`)
    .sign(secretKey);
  return jwt;
}

export async function verifyPasswordResetToken(token: string): Promise<{
  userId: string;
  tenantId: string;
  email: string;
}> {
  const config = getJwtConfig();
  const secretKey = getSecretKey(config.secret);
  const { payload } = await jose.jwtVerify(token, secretKey, {
    issuer: config.issuer,
    audience: config.audience,
  });

  if (payload.type !== "password_reset") {
    throw new Error(
      "Expected password_reset token but received " + String(payload.type) + " token",
    );
  }

  return {
    userId: payload.sub as string,
    tenantId: payload.tenantId as string,
    email: payload.email as string,
  };
}

// ---------------------------------------------------------------------------
// Invite tokens (72-hour TTL, dedicated type for invite-only registration)
// ---------------------------------------------------------------------------

const INVITE_TOKEN_TTL_SECONDS = 72 * 60 * 60; // 72 hours

export async function createInviteToken(payload: {
  tenantId: string;
  tenantSlug: string;
  email: string;
}): Promise<string> {
  const config = getJwtConfig();
  const secretKey = getSecretKey(config.secret);
  const jwt = await new jose.SignJWT({
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    email: payload.email,
    type: "invite" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(`${INVITE_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey);
  return jwt;
}

export async function verifyInviteToken(token: string): Promise<{
  tenantId: string;
  tenantSlug: string;
  email: string;
}> {
  const config = getJwtConfig();
  const secretKey = getSecretKey(config.secret);
  const { payload } = await jose.jwtVerify(token, secretKey, {
    issuer: config.issuer,
    audience: config.audience,
  });

  if (payload.type !== "invite") {
    throw new Error("Expected invite token but received " + String(payload.type) + " token");
  }

  return {
    tenantId: payload.tenantId as string,
    tenantSlug: payload.tenantSlug as string,
    email: payload.email as string,
  };
}
