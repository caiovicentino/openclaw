/**
 * Stack Auth token verification.
 *
 * Uses the Stack Auth JWKS endpoint to verify RS256 JWTs issued by
 * the Stack Auth project configured via STACK_AUTH_PROJECT_ID.
 */

import * as jose from "jose";

export type StackAuthPayload = {
  sub: string;
  email: string;
  name: string;
};

let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof jose.createRemoteJWKSet> {
  if (!jwks) {
    const projectId = process.env.STACK_AUTH_PROJECT_ID;
    if (!projectId) {
      throw new Error("STACK_AUTH_PROJECT_ID environment variable is required");
    }
    const url = new URL(
      `https://api.stack-auth.com/api/v1/projects/${projectId}/.well-known/jwks.json`,
    );
    jwks = jose.createRemoteJWKSet(url);
  }
  return jwks;
}

export async function verifyStackAuthToken(token: string): Promise<StackAuthPayload> {
  const keySet = getJWKS();
  const { payload } = await jose.jwtVerify(token, keySet);

  return {
    sub: payload.sub as string,
    email: (payload.email as string) ?? "",
    name: (payload.name as string) ?? "",
  };
}
