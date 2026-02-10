import { ChevronDown, ChevronRight, Check, Minus } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface PermissionDefinition {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionCategory {
  name: string;
  label: string;
  permissions: PermissionDefinition[];
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    name: "Agent",
    label: "Agent",
    permissions: [
      { key: "agent:chat", label: "Chat", description: "Can chat with AI agents" },
      {
        key: "agent:chat:unrestricted",
        label: "Unrestricted Chat",
        description: "Chat without content filters",
      },
      {
        key: "agent:view_own_history",
        label: "View Own History",
        description: "View own session history",
      },
      {
        key: "agent:view_team_history",
        label: "View Team History",
        description: "View team/department session history",
      },
      {
        key: "agent:view_all_history",
        label: "View All History",
        description: "View all session history across organization",
      },
      {
        key: "agent:export_history",
        label: "Export History",
        description: "Export session data",
      },
      {
        key: "agent:manage_sessions",
        label: "Manage Sessions",
        description: "Reset/delete any sessions",
      },
      {
        key: "agent:manage_own_sessions",
        label: "Manage Own Sessions",
        description: "Reset/delete own sessions",
      },
    ],
  },
  {
    name: "Tools",
    label: "Tools",
    permissions: [
      {
        key: "tools:exec",
        label: "Execute",
        description: "Execute shell commands via agent",
      },
      {
        key: "tools:exec:sandboxed",
        label: "Execute (Sandboxed)",
        description: "Execute commands only in sandbox",
      },
      {
        key: "tools:browse",
        label: "Browse",
        description: "Use browser automation tool",
      },
      {
        key: "tools:file_read",
        label: "File Read",
        description: "Read files via agent",
      },
      {
        key: "tools:file_write",
        label: "File Write",
        description: "Write/edit files via agent",
      },
      {
        key: "tools:memory_read",
        label: "Memory Read",
        description: "Search and read memory",
      },
      {
        key: "tools:memory_write",
        label: "Memory Write",
        description: "Add/update memory entries",
      },
    ],
  },
  {
    name: "Skills",
    label: "Skills",
    permissions: [
      {
        key: "skills:use",
        label: "Use Skills",
        description: "Use available skills",
      },
      {
        key: "skills:use:coding",
        label: "Coding Skill",
        description: "Use coding-agent skill",
      },
      {
        key: "skills:use:github",
        label: "GitHub Skill",
        description: "Use GitHub skill",
      },
      {
        key: "skills:manage",
        label: "Manage Skills",
        description: "Install/update/remove skills",
      },
    ],
  },
  {
    name: "Channels",
    label: "Channels",
    permissions: [
      {
        key: "channel:web",
        label: "Web",
        description: "Use web chat interface",
      },
      {
        key: "channel:whatsapp",
        label: "WhatsApp",
        description: "Use WhatsApp channel",
      },
      {
        key: "channel:telegram",
        label: "Telegram",
        description: "Use Telegram channel",
      },
      {
        key: "channel:slack",
        label: "Slack",
        description: "Use Slack channel",
      },
      {
        key: "channel:discord",
        label: "Discord",
        description: "Use Discord channel",
      },
      {
        key: "channel:email",
        label: "Email",
        description: "Use email channel",
      },
      {
        key: "channel:all",
        label: "All Channels",
        description: "Use all messaging channels",
      },
    ],
  },
  {
    name: "Data",
    label: "Data",
    permissions: [
      {
        key: "data:own",
        label: "Own Data",
        description: "Access only own data",
      },
      {
        key: "data:department",
        label: "Department",
        description: "Access own department data",
      },
      {
        key: "data:cross_department",
        label: "Cross-Department",
        description: "Access cross-department data",
      },
      {
        key: "data:all",
        label: "All Data",
        description: "Access all organizational data",
      },
      {
        key: "data:confidential",
        label: "Confidential",
        description: "Access confidential data",
      },
      {
        key: "data:financial",
        label: "Financial",
        description: "Access financial records",
      },
      { key: "data:hr", label: "HR", description: "Access HR/personnel data" },
      {
        key: "data:legal",
        label: "Legal",
        description: "Access legal documents",
      },
      {
        key: "data:engineering",
        label: "Engineering",
        description: "Access engineering/technical data",
      },
      {
        key: "data:marketing",
        label: "Marketing",
        description: "Access marketing data",
      },
      {
        key: "data:sales",
        label: "Sales",
        description: "Access sales data",
      },
      {
        key: "data:customer",
        label: "Customer",
        description: "Access customer data",
      },
    ],
  },
  {
    name: "Admin",
    label: "Admin",
    permissions: [
      {
        key: "admin:users",
        label: "Manage Users",
        description: "Create/edit/deactivate users",
      },
      {
        key: "admin:users:view",
        label: "View Users",
        description: "View user list and details",
      },
      {
        key: "admin:roles",
        label: "Roles",
        description: "Create/edit/delete roles",
      },
      {
        key: "admin:config",
        label: "Configuration",
        description: "Modify agent and system configuration",
      },
      {
        key: "admin:compliance",
        label: "Compliance",
        description: "Manage compliance policies",
      },
      {
        key: "admin:audit",
        label: "Audit",
        description: "View audit logs",
      },
      {
        key: "admin:audit:export",
        label: "Export Audit",
        description: "Export audit logs",
      },
      {
        key: "admin:billing",
        label: "Billing",
        description: "Manage billing and subscription",
      },
      {
        key: "admin:agents",
        label: "Agents",
        description: "Create/configure AI agents",
      },
      {
        key: "admin:channels",
        label: "Channels",
        description: "Connect/disconnect messaging channels",
      },
      {
        key: "admin:dashboard",
        label: "Dashboard",
        description: "Access management dashboard",
      },
      {
        key: "admin:reports",
        label: "Reports",
        description: "Generate and view reports",
      },
      {
        key: "admin:integrations",
        label: "Integrations",
        description: "Manage external integrations",
      },
      {
        key: "admin:security",
        label: "Security",
        description: "Manage security settings (MFA, SSO)",
      },
      {
        key: "admin:data_retention",
        label: "Data Retention",
        description: "Configure data retention policies",
      },
    ],
  },
];

interface PermissionMatrixProps {
  selected: string[];
  onChange: (permissions: string[]) => void;
  readOnly?: boolean;
}

export { PERMISSION_CATEGORIES };

export default function PermissionMatrix({
  selected,
  onChange,
  readOnly = false,
}: PermissionMatrixProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    PERMISSION_CATEGORIES.forEach((cat) => {
      initial[cat.name] = true;
    });
    return initial;
  });

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleExpand = useCallback((category: string) => {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const togglePermission = useCallback(
    (key: string) => {
      if (readOnly) return;
      const next = selectedSet.has(key) ? selected.filter((p) => p !== key) : [...selected, key];
      onChange(next);
    },
    [selected, selectedSet, onChange, readOnly],
  );

  const toggleCategory = useCallback(
    (category: PermissionCategory) => {
      if (readOnly) return;
      const categoryKeys = category.permissions.map((p) => p.key);
      const allSelected = categoryKeys.every((k) => selectedSet.has(k));
      let next: string[];
      if (allSelected) {
        next = selected.filter((p) => !categoryKeys.includes(p));
      } else {
        const toAdd = categoryKeys.filter((k) => !selectedSet.has(k));
        next = [...selected, ...toAdd];
      }
      onChange(next);
    },
    [selected, selectedSet, onChange, readOnly],
  );

  const getCategoryState = useCallback(
    (category: PermissionCategory): "all" | "some" | "none" => {
      const keys = category.permissions.map((p) => p.key);
      const count = keys.filter((k) => selectedSet.has(k)).length;
      if (count === 0) return "none";
      if (count === keys.length) return "all";
      return "some";
    },
    [selectedSet],
  );

  return (
    <div className="rounded-lg border border-border">
      {PERMISSION_CATEGORIES.map((category) => {
        const state = getCategoryState(category);
        const isExpanded = expanded[category.name];

        return (
          <div key={category.name} className="border-b border-border last:border-b-0">
            <div
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
              onClick={() => toggleExpand(category.name)}
            >
              <button
                type="button"
                className="text-muted-foreground"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCategory(category);
                }}
                disabled={readOnly}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  state === "all"
                    ? "border-primary bg-primary text-primary-foreground"
                    : state === "some"
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-input",
                  readOnly && "opacity-60 cursor-not-allowed",
                )}
              >
                {state === "all" && <Check className="h-3 w-3" />}
                {state === "some" && <Minus className="h-3 w-3" />}
              </button>
              <span className="font-medium text-sm">{category.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {category.permissions.filter((p) => selectedSet.has(p.key)).length}/
                {category.permissions.length}
              </span>
            </div>

            {isExpanded && (
              <div className="px-4 pb-3">
                <div className="ml-7 space-y-1">
                  {category.permissions.map((perm) => {
                    const checked = selectedSet.has(perm.key);
                    return (
                      <div
                        key={perm.key}
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={perm.label}
                        onClick={() => togglePermission(perm.key)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50 select-none",
                          readOnly && "cursor-default",
                          !readOnly && "cursor-pointer",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                            readOnly && "opacity-60",
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-medium">{perm.label}</span>
                          {perm.description && (
                            <span className="text-xs text-muted-foreground">
                              {perm.description}
                            </span>
                          )}
                        </span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          {perm.key}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
