import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { type TokenPair, generateTokenPair } from "./jwt";

export type OAuth2Client = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  name: string;
  redirectUris: string[];
  grantTypes: ("authorization_code" | "client_credentials" | "refresh_token")[];
  scopes: string[];
  createdAt: Date;
};

export type AuthorizationCode = {
  code: string;
  clientId: string;
  tenantId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  expiresAt: Date;
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
  state?: string;
};

const AUTHORIZATION_CODE_TTL_MS = 60 * 1000; // 60 seconds

// In-memory store for authorization codes (replace with persistent store in production)
const authorizationCodes = new Map<string, AuthorizationCode>();

// In-memory store for registered clients (replace with persistent store in production)
const registeredClients = new Map<string, OAuth2Client>();

export function registerClient(client: OAuth2Client): void {
  registeredClients.set(client.clientId, client);
}

export function getClient(clientId: string): OAuth2Client | undefined {
  return registeredClients.get(clientId);
}

export function generateClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = `oc_client_${randomBytes(16).toString("hex")}`;
  const clientSecret = `oc_secret_${randomBytes(32).toString("hex")}`;
  return { clientId, clientSecret };
}

export function generateAuthorizationCode(
  client: OAuth2Client,
  userId: string,
  scopes: string[],
  redirectUri: string,
  options?: {
    codeChallenge?: string;
    codeChallengeMethod?: "S256";
    state?: string;
  },
): AuthorizationCode {
  if (!client.redirectUris.includes(redirectUri)) {
    throw new Error("Invalid redirect URI");
  }

  if (!client.grantTypes.includes("authorization_code")) {
    throw new Error("Client is not authorized for authorization_code grant");
  }

  const invalidScopes = scopes.filter((s) => !client.scopes.includes(s));
  if (invalidScopes.length > 0) {
    throw new Error(`Invalid scopes: ${invalidScopes.join(", ")}`);
  }

  const code: AuthorizationCode = {
    code: randomBytes(32).toString("hex"),
    clientId: client.clientId,
    tenantId: client.tenantId,
    userId,
    redirectUri,
    scopes,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    codeChallenge: options?.codeChallenge,
    codeChallengeMethod: options?.codeChallengeMethod,
    state: options?.state,
  };

  authorizationCodes.set(code.code, code);
  return code;
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
  options?: {
    codeVerifier?: string;
    redirectUri?: string;
  },
): Promise<TokenPair> {
  const authCode = authorizationCodes.get(code);
  if (!authCode) {
    throw new Error("Invalid authorization code");
  }

  // Codes are single-use
  authorizationCodes.delete(code);

  if (authCode.expiresAt < new Date()) {
    throw new Error("Authorization code has expired");
  }

  if (authCode.clientId !== clientId) {
    throw new Error("Client ID mismatch");
  }

  const client = registeredClients.get(clientId);
  if (!client) {
    throw new Error("Client not found");
  }

  if (!timingSafeCompare(client.clientSecret, clientSecret)) {
    throw new Error("Invalid client secret");
  }

  // Validate redirect_uri matches the one used during authorization
  if (options?.redirectUri && options.redirectUri !== authCode.redirectUri) {
    throw new Error("Redirect URI mismatch");
  }

  // PKCE verification
  if (authCode.codeChallenge) {
    if (!options?.codeVerifier) {
      throw new Error("Code verifier is required for PKCE");
    }

    const computedChallenge = createHash("sha256").update(options.codeVerifier).digest("base64url");

    if (!timingSafeCompare(computedChallenge, authCode.codeChallenge)) {
      throw new Error("Invalid code verifier");
    }
  }

  return generateTokenPair({
    sub: authCode.userId,
    tenantId: authCode.tenantId,
    tenantSlug: "",
    email: "",
    name: "",
    department: "",
    roles: [],
    permissions: authCode.scopes,
  });
}

export async function clientCredentialsGrant(
  clientId: string,
  clientSecret: string,
  scopes: string[],
): Promise<TokenPair> {
  const client = registeredClients.get(clientId);
  if (!client) {
    throw new Error("Client not found");
  }

  if (!timingSafeCompare(client.clientSecret, clientSecret)) {
    throw new Error("Invalid client secret");
  }

  if (!client.grantTypes.includes("client_credentials")) {
    throw new Error("Client is not authorized for client_credentials grant");
  }

  const invalidScopes = scopes.filter((s) => !client.scopes.includes(s));
  if (invalidScopes.length > 0) {
    throw new Error(`Invalid scopes: ${invalidScopes.join(", ")}`);
  }

  return generateTokenPair({
    sub: `client:${clientId}`,
    tenantId: client.tenantId,
    tenantSlug: "",
    email: "",
    name: client.name,
    department: "",
    roles: [],
    permissions: scopes,
  });
}
