import { randomUUID } from "crypto";

export type RiskLevel = "safe" | "moderate" | "dangerous";

export const TOOL_RISK_LEVELS: Record<string, RiskLevel> = {
  Read: "safe",
  Glob: "safe",
  Grep: "safe",
  WebSearch: "safe",
  WebFetch: "safe",
  UpdateMemory: "safe",
  Write: "moderate",
  Edit: "moderate",
  Bash: "dangerous",
};

export function getToolRiskLevel(toolName: string): RiskLevel {
  return TOOL_RISK_LEVELS[toolName] ?? "dangerous";
}

interface PendingApproval {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel: RiskLevel;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

export class SessionApprovalPolicy {
  private autoApproved = new Set<string>();
  private pendingApprovals = new Map<string, PendingApproval>();
  private skipAll = false;

  /** When true, all tools are auto-approved without user confirmation */
  setSkipAll(skip: boolean): void {
    this.skipAll = skip;
  }

  autoApproveForSession(toolName: string): void {
    this.autoApproved.add(toolName);
  }

  isAutoApproved(toolName: string): boolean {
    return this.skipAll || this.autoApproved.has(toolName);
  }

  needsApproval(toolName: string): boolean {
    if (this.skipAll) return false;
    const risk = getToolRiskLevel(toolName);
    if (risk === "safe") return false;
    if (this.autoApproved.has(toolName)) return false;
    return true;
  }

  createApprovalRequest(
    toolName: string,
    toolInput: Record<string, unknown>,
    timeoutMs = 120000,
  ): { id: string; promise: Promise<boolean> } {
    const id = randomUUID();
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(id);
        resolve(false); // Timeout = deny
      }, timeoutMs);

      this.pendingApprovals.set(id, {
        id,
        toolName,
        toolInput,
        riskLevel: getToolRiskLevel(toolName),
        resolve,
        timer,
      });
    });

    return { id, promise };
  }

  resolveApproval(id: string, approved: boolean, alwaysAllow = false): boolean {
    const pending = this.pendingApprovals.get(id);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(id);

    if (approved && alwaysAllow) {
      this.autoApproveForSession(pending.toolName);
    }

    pending.resolve(approved);
    return true;
  }

  cleanup(): void {
    for (const [, pending] of this.pendingApprovals) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pendingApprovals.clear();
  }
}
