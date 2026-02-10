/**
 * Cérebro RBAC - Central Permissions Registry
 *
 * All permissions follow the pattern: category:action[:qualifier]
 */

export const PERM_WILDCARD = "*";

export const PERMISSIONS = {
  // Agent interaction
  "agent:chat": "Can chat with AI agents",
  "agent:chat:unrestricted": "Chat without content filters",
  "agent:view_own_history": "View own session history",
  "agent:view_team_history": "View team/department session history",
  "agent:view_all_history": "View all session history across organization",
  "agent:export_history": "Export session data",
  "agent:manage_sessions": "Reset/delete any sessions",
  "agent:manage_own_sessions": "Reset/delete own sessions",

  // Tool access
  "tools:exec": "Execute shell commands via agent",
  "tools:exec:sandboxed": "Execute commands only in sandbox",
  "tools:browse": "Use browser automation tool",
  "tools:file_read": "Read files via agent",
  "tools:file_write": "Write/edit files via agent",
  "tools:memory_read": "Search and read memory",
  "tools:memory_write": "Add/update memory entries",

  // Skills access
  "skills:use": "Use available skills",
  "skills:use:coding": "Use coding-agent skill",
  "skills:use:github": "Use GitHub skill",
  "skills:manage": "Install/update/remove skills",

  // Channel access
  "channel:web": "Use web chat interface",
  "channel:whatsapp": "Use WhatsApp channel",
  "channel:telegram": "Use Telegram channel",
  "channel:slack": "Use Slack channel",
  "channel:discord": "Use Discord channel",
  "channel:email": "Use email channel",
  "channel:all": "Use all messaging channels",

  // Data access scopes (department-based)
  "data:own": "Access only own data",
  "data:department": "Access own department data",
  "data:cross_department": "Access cross-department data",
  "data:all": "Access all organizational data",
  "data:confidential": "Access confidential data",
  "data:financial": "Access financial records",
  "data:hr": "Access HR/personnel data",
  "data:legal": "Access legal documents",
  "data:engineering": "Access engineering/technical data",
  "data:marketing": "Access marketing data",
  "data:sales": "Access sales data",
  "data:customer": "Access customer data",

  // Administration
  "admin:users": "Create/edit/deactivate users",
  "admin:users:view": "View user list and details",
  "admin:roles": "Create/edit/delete roles",
  "admin:config": "Modify agent and system configuration",
  "admin:compliance": "Manage compliance policies",
  "admin:audit": "View audit logs",
  "admin:audit:export": "Export audit logs",
  "admin:billing": "Manage billing and subscription",
  "admin:agents": "Create/configure AI agents",
  "admin:channels": "Connect/disconnect messaging channels",
  "admin:dashboard": "Access management dashboard",
  "admin:reports": "Generate and view reports",
  "admin:integrations": "Manage external integrations",
  "admin:security": "Manage security settings (MFA, SSO)",
  "admin:data_retention": "Configure data retention policies",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export type PermissionCategory = "agent" | "tools" | "skills" | "channel" | "data" | "admin";

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
const CATEGORY_LIST: PermissionCategory[] = [
  "agent",
  "tools",
  "skills",
  "channel",
  "data",
  "admin",
];

/**
 * Returns all permissions belonging to a given category.
 */
export function getPermissionsByCategory(category: PermissionCategory): Permission[] {
  const prefix = `${category}:`;
  return ALL_PERMISSIONS.filter((p) => p.startsWith(prefix));
}

/**
 * Returns the human-readable description for a permission.
 */
export function getPermissionDescription(permission: Permission): string {
  return PERMISSIONS[permission];
}

/**
 * Type-guard that checks whether a string is a valid permission key.
 */
export function isValidPermission(permission: string): permission is Permission {
  return permission in PERMISSIONS;
}

/**
 * Returns the list of all permission categories.
 */
export function getCategories(): PermissionCategory[] {
  return [...CATEGORY_LIST];
}
