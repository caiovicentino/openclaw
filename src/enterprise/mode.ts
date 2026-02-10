// Enterprise deployment mode detection
export type DeploymentMode = "standalone" | "enterprise";

export function resolveDeploymentMode(env = process.env): DeploymentMode {
  return env.OPENCLAW_MODE === "enterprise" ? "enterprise" : "standalone";
}

export function isEnterpriseMode(): boolean {
  return resolveDeploymentMode() === "enterprise";
}

export function requireEnterprise(feature: string): void {
  if (!isEnterpriseMode()) {
    throw new Error(`Feature "${feature}" requires OPENCLAW_MODE=enterprise`);
  }
}
