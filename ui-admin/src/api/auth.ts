import type { User } from "./types";
import { client } from "./client";

export async function getMe(): Promise<User> {
  const raw = await client.get<any>("/auth/me");
  // Backend returns roles as objects { id, name, displayName }; normalize to string[]
  const roles: string[] = Array.isArray(raw.roles)
    ? raw.roles.map((r: any) => (typeof r === "string" ? r : r.name))
    : [];
  return { ...raw, roles, role: roles[0] ?? "" };
}
