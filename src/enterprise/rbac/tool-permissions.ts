/**
 * Canonical mapping from tool names to the RBAC permissions required to use
 * them.  Both the RBAC policy engine and the agent tool filter import from
 * here so there is a single source of truth.
 *
 * If multiple permissions are listed for a tool, the user needs ANY ONE of them.
 */

import type { Permission } from "./permissions.js";

export const TOOL_PERMISSION_MAP: Record<string, readonly Permission[]> = {
  // Shell execution
  bash: ["tools:exec", "tools:exec:sandboxed"],
  exec: ["tools:exec", "tools:exec:sandboxed"],

  // File tools
  read: ["tools:file_read"],
  glob: ["tools:file_read"],
  grep: ["tools:file_read"],
  find: ["tools:file_read"],
  ls: ["tools:file_read"],
  write: ["tools:file_write"],
  edit: ["tools:file_write"],
  apply_patch: ["tools:file_write"],

  // Process tools
  process: ["tools:exec"],

  // Browser
  browser: ["tools:browse"],
  canvas: ["tools:browse"],

  // Web tools
  web_search: ["tools:browse"],
  web_fetch: ["tools:browse"],

  // Memory tools
  memory_search: ["tools:memory_read"],
  memory_get: ["tools:memory_read"],
  memory_write: ["tools:memory_write"],

  // Session tools
  sessions_list: ["agent:view_own_history", "agent:view_team_history", "agent:view_all_history"],
  sessions_history: ["agent:view_own_history", "agent:view_team_history", "agent:view_all_history"],
  sessions_send: ["agent:chat"],
  sessions_spawn: ["agent:chat"],
  session_status: ["agent:chat"],

  // Messaging (channel send)
  message: ["channel:web", "channel:all"],

  // Image generation
  image: ["agent:chat"],

  // Agents list
  agents_list: ["agent:chat"],

  // Node / device tools
  nodes: ["tools:exec"],

  // Automation
  cron: ["admin:config"],
  gateway: ["admin:config"],
};
