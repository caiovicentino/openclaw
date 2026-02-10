// OpenID Connect SSO Integration

import * as jose from "jose";
import { createHash } from "node:crypto";

export type OidcConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  redirectUri: string;
  scopes: string[];
};

export type OidcProfile = {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

export type OidcDiscovery = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  issuer: string;
};

/**
 * Fetch the OpenID Provider configuration from .well-known/openid-configuration.
 */
export async function discoverOidcEndpoints(issuerUrl: string): Promise<OidcDiscovery> {
  const url = issuerUrl.replace(/\/+$/, "") + "/.well-known/openid-configuration";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${response.status} ${response.statusText}`);
  }

  const config = (await response.json()) as Record<string, unknown>;

  const issuer = config["issuer"];
  const authorizationEndpoint = config["authorization_endpoint"];
  const tokenEndpoint = config["token_endpoint"];
  const userinfoEndpoint = config["userinfo_endpoint"];
  const jwksUri = config["jwks_uri"];

  if (
    typeof issuer !== "string" ||
    typeof authorizationEndpoint !== "string" ||
    typeof tokenEndpoint !== "string" ||
    typeof userinfoEndpoint !== "string" ||
    typeof jwksUri !== "string"
  ) {
    throw new Error("OIDC discovery response missing required endpoints");
  }

  return { issuer, authorizationEndpoint, tokenEndpoint, userinfoEndpoint, jwksUri };
}

/**
 * Build the authorization URL for the OIDC login redirect.
 * Uses the authorization_endpoint from the discovery document.
 * Includes PKCE code_challenge derived from the provided code verifier.
 */
export async function buildOidcLoginUrl(
  config: OidcConfig,
  state: string,
  nonce: string,
  codeVerifier: string,
): Promise<string> {
  const discovery = await discoverOidcEndpoints(config.issuerUrl);
  const scopes = config.scopes.length > 0 ? config.scopes : ["openid", "email", "profile"];

  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(" "),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${discovery.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens, verify the ID token, and
 * extract the user profile.
 */
export async function exchangeOidcCode(
  config: OidcConfig,
  code: string,
  codeVerifier: string,
  expectedNonce: string,
): Promise<{ accessToken: string; idToken: string; profile: OidcProfile }> {
  const discovery = await discoverOidcEndpoints(config.issuerUrl);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OIDC token exchange failed: ${response.status} - ${text}`);
  }

  const tokenData = (await response.json()) as Record<string, unknown>;
  const accessToken = tokenData["access_token"] as string;
  const idToken = tokenData["id_token"] as string;

  if (!accessToken || !idToken) {
    throw new Error("OIDC token response missing access_token or id_token");
  }

  const profile = await verifyOidcIdToken(config, discovery, idToken, expectedNonce);

  return { accessToken, idToken, profile };
}

/**
 * Verify an ID token's signature using the IdP's JWKS, validate standard
 * claims (iss, aud, exp, nonce), and extract the user profile.
 */
export async function verifyOidcIdToken(
  config: OidcConfig,
  discovery: OidcDiscovery,
  idToken: string,
  expectedNonce: string,
): Promise<OidcProfile> {
  const jwks = jose.createRemoteJWKSet(new URL(discovery.jwksUri));

  const expectedIssuer = discovery.issuer;

  const { payload } = await jose.jwtVerify(idToken, jwks, {
    issuer: expectedIssuer,
    audience: config.clientId,
    maxTokenAge: "5m",
  });

  // Require exp claim
  if (payload.exp === undefined) {
    throw new Error("OIDC: ID token missing exp claim");
  }

  // Validate nonce to prevent replay attacks
  if (payload["nonce"] !== expectedNonce) {
    throw new Error(`OIDC: Nonce mismatch - expected ${expectedNonce}, got ${payload["nonce"]}`);
  }

  const sub = payload.sub;
  if (!sub) {
    throw new Error("OIDC: ID token missing sub claim");
  }

  return {
    sub,
    email: (payload["email"] as string) ?? "",
    emailVerified: payload["email_verified"] as boolean | undefined,
    name: payload["name"] as string | undefined,
    givenName: payload["given_name"] as string | undefined,
    familyName: payload["family_name"] as string | undefined,
    picture: payload["picture"] as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a S256 code challenge from a code verifier using SHA-256.
 */
function generateCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
