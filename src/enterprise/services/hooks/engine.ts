import { exec } from "child_process";
import { promisify } from "util";
import type { HookDefinition, HookContext, HookResult } from "./types.js";

const execAsync = promisify(exec);

export class HookEngine {
  private hooks: HookDefinition[];

  constructor(hooks: HookDefinition[]) {
    this.hooks = hooks.filter((h) => h.enabled !== false);
  }

  async runHooks(type: HookDefinition["type"], context: HookContext): Promise<HookResult[]> {
    const applicable = this.hooks.filter((h) => {
      if (h.type !== type) return false;
      if (h.toolNames?.length && context.toolName) {
        return h.toolNames.includes(context.toolName);
      }
      return true;
    });

    const results: HookResult[] = [];
    for (const hook of applicable) {
      const result = await this.executeHook(hook, context);
      results.push(result);
      if (!result.success && hook.blockOnFailure) {
        break; // Stop processing further hooks
      }
    }
    return results;
  }

  private async executeHook(hook: HookDefinition, context: HookContext): Promise<HookResult> {
    const start = Date.now();
    const timeout = hook.timeout ?? 10000;

    try {
      if (hook.action === "shell" && hook.command) {
        return await this.executeShellHook(hook, context, timeout);
      } else if (hook.action === "webhook" && hook.url) {
        return await this.executeWebhookHook(hook, context, timeout);
      }
      return {
        hookId: hook.id,
        hookName: hook.name,
        success: false,
        error: "Invalid hook configuration",
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        hookId: hook.id,
        hookName: hook.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  private async executeShellHook(
    hook: HookDefinition,
    context: HookContext,
    timeout: number,
  ): Promise<HookResult> {
    const start = Date.now();
    const env = {
      ...process.env,
      HOOK_CONTEXT: JSON.stringify(context),
      HOOK_TYPE: hook.type,
      HOOK_TOOL_NAME: context.toolName ?? "",
    };

    try {
      const { stdout, stderr } = await execAsync(hook.command!, { timeout, env });
      return {
        hookId: hook.id,
        hookName: hook.name,
        success: true,
        output: (stdout + (stderr ? `\n[stderr] ${stderr}` : "")).trim(),
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        hookId: hook.id,
        hookName: hook.name,
        success: false,
        error: err.message ?? "Shell hook failed",
        output: err.stdout ?? "",
        durationMs: Date.now() - start,
      };
    }
  }

  private async executeWebhookHook(
    hook: HookDefinition,
    context: HookContext,
    timeout: number,
  ): Promise<HookResult> {
    const start = Date.now();
    try {
      const res = await fetch(hook.url!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hookType: hook.type, context }),
        signal: AbortSignal.timeout(timeout),
      });
      const text = await res.text();
      return {
        hookId: hook.id,
        hookName: hook.name,
        success: res.ok,
        output: text.slice(0, 5000),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        hookId: hook.id,
        hookName: hook.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  hasHooksOfType(type: HookDefinition["type"]): boolean {
    return this.hooks.some((h) => h.type === type);
  }
}
