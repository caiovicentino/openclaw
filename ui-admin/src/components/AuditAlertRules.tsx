import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { AuditAlertRule } from "@/api/types";
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule } from "@/api/audit";
import { Button } from "@/components/ui/button";

function RuleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: AuditAlertRule;
  onSubmit: (data: {
    name: string;
    description: string;
    conditions: Record<string, unknown>;
    enabled: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [actionPattern, setActionPattern] = useState(
    (initial?.conditions?.action_pattern as string) ?? "",
  );
  const [severity, setSeverity] = useState((initial?.conditions?.severity as string) ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const conditions: Record<string, unknown> = {};
    if (actionPattern) conditions.action_pattern = actionPattern;
    if (severity) conditions.severity = severity;
    onSubmit({ name, description, conditions, enabled });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{initial ? "Edit Rule" : "New Alert Rule"}</h4>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Name</span>
          <input
            type="text"
            required
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Description</span>
          <input
            type="text"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Action Pattern</span>
          <input
            type="text"
            placeholder="e.g. auth.login_failed"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={actionPattern}
            onChange={(e) => setActionPattern(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Severity</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">Any</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <div className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          {initial ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export default function AuditAlertRules() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AuditAlertRule | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["audit-alert-rules"],
    queryFn: getAlertRules,
  });

  const createMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alert-rules"] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAlertRule>[1] }) =>
      updateAlertRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alert-rules"] });
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alert-rules"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAlertRule(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alert-rules"] });
    },
  });

  function conditionsSummary(conditions: Record<string, unknown>): string {
    const parts: string[] = [];
    if (conditions.action_pattern) parts.push(`action: ${conditions.action_pattern}`);
    if (conditions.severity) parts.push(`severity: ${conditions.severity}`);
    return parts.length > 0 ? parts.join(", ") : "No conditions";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Alert Rules</h3>
        {!showForm && !editingRule && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Rule
          </Button>
        )}
      </div>

      {showForm && (
        <RuleForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingRule && (
        <RuleForm
          initial={editingRule}
          onSubmit={(data) => updateMutation.mutate({ id: editingRule.id, data })}
          onCancel={() => setEditingRule(null)}
        />
      )}

      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No alert rules configured.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Conditions
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Enabled
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b">
                  <td className="px-4 py-2">
                    <div className="font-medium">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground">{rule.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {conditionsSummary(rule.conditions)}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        rule.enabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          rule.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditingRule(rule)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMutation.mutate(rule.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
