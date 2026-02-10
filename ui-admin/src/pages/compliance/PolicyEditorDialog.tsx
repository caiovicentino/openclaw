import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { createPolicy, updatePolicy, deletePolicy } from "@/api/compliance";
import { Button } from "@/components/ui/button";

type PolicyType = "data_retention" | "rate_limit" | "content_filter" | "access_control" | "audit";

interface CompliancePolicy {
  id: string;
  name: string;
  type: PolicyType;
  active: boolean;
  updatedAt: string;
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const policySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["data_retention", "rate_limit", "content_filter", "access_control", "audit"]),
  active: z.boolean(),
  config: z.record(z.unknown()),
});

type PolicyFormValues = z.infer<typeof policySchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PolicyEditorDialogProps {
  policy: CompliancePolicy | null; // null = create new
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Sub-forms per policy type
// ---------------------------------------------------------------------------

function DataRetentionFields({
  control,
}: {
  control: ReturnType<typeof useForm<PolicyFormValues>>["control"];
}) {
  const fields = [
    { key: "transcriptDays", label: "Transcripts (days)" },
    { key: "auditLogDays", label: "Audit logs (days)" },
    { key: "sessionDays", label: "Sessions (days)" },
    { key: "memoryDays", label: "Memory (days)" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((f) => (
        <Controller
          key={f.key}
          control={control}
          name={`config.${f.key}` as `config.${string}`}
          render={({ field }) => (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{f.label}</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={(field.value as number) ?? ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </label>
          )}
        />
      ))}
    </div>
  );
}

function RateLimitFields({
  control,
}: {
  control: ReturnType<typeof useForm<PolicyFormValues>>["control"];
}) {
  const fields = [
    { key: "maxRequestsPerMinute", label: "Max requests/min" },
    { key: "maxTokensPerDayUser", label: "Max tokens/day (user)" },
    { key: "maxTokensPerDayTenant", label: "Max tokens/day (tenant)" },
    { key: "maxCostPerMonth", label: "Max cost/month ($)" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((f) => (
        <Controller
          key={f.key}
          control={control}
          name={`config.${f.key}` as `config.${string}`}
          render={({ field }) => (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{f.label}</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={(field.value as number) ?? ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
            </label>
          )}
        />
      ))}
    </div>
  );
}

function ContentFilterFields({
  control,
}: {
  control: ReturnType<typeof useForm<PolicyFormValues>>["control"];
}) {
  const patterns = ["PII", "Financial", "Health"] as const;
  const actions = ["block", "redact", "warn"] as const;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Patterns to Detect</legend>
        <div className="flex gap-4">
          {patterns.map((p) => (
            <Controller
              key={p}
              control={control}
              name={`config.patterns` as `config.${string}`}
              render={({ field }) => {
                const vals = (field.value as string[]) ?? [];
                return (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border"
                      checked={vals.includes(p)}
                      onChange={(e) => {
                        field.onChange(
                          e.target.checked ? [...vals, p] : vals.filter((v: string) => v !== p),
                        );
                      }}
                    />
                    {p}
                  </label>
                );
              }}
            />
          ))}
        </div>
      </fieldset>

      <Controller
        control={control}
        name={`config.action` as `config.${string}`}
        render={({ field }) => (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Action</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={(field.value as string) ?? "warn"}
              onChange={(e) => field.onChange(e.target.value)}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </option>
              ))}
            </select>
          </label>
        )}
      />

      <Controller
        control={control}
        name={`config.customPatterns` as `config.${string}`}
        render={({ field }) => (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Custom Patterns (one per line)</span>
            <textarea
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={(field.value as string) ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
            />
          </label>
        )}
      />
    </div>
  );
}

function AccessControlFields({
  control,
}: {
  control: ReturnType<typeof useForm<PolicyFormValues>>["control"];
}) {
  const fields = [
    { key: "allowedRoles", label: "Allowed Roles (comma-separated)" },
    { key: "allowedIpRanges", label: "Allowed IP Ranges (comma-separated)" },
    { key: "requireMfa", label: "Require MFA", type: "checkbox" as const },
  ];

  return (
    <div className="space-y-4">
      {fields.map((f) =>
        f.type === "checkbox" ? (
          <Controller
            key={f.key}
            control={control}
            name={`config.${f.key}` as `config.${string}`}
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={(field.value as boolean) ?? false}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                {f.label}
              </label>
            )}
          />
        ) : (
          <Controller
            key={f.key}
            control={control}
            name={`config.${f.key}` as `config.${string}`}
            render={({ field }) => (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{f.label}</span>
                <input
                  type="text"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={(field.value as string) ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </label>
            )}
          />
        ),
      )}
    </div>
  );
}

function AuditFields({
  control,
}: {
  control: ReturnType<typeof useForm<PolicyFormValues>>["control"];
}) {
  const fields = [
    { key: "retentionDays", label: "Retention (days)", type: "number" as const },
    { key: "logLevel", label: "Log Level" },
    { key: "includePayloads", label: "Include Payloads", type: "checkbox" as const },
  ];

  return (
    <div className="space-y-4">
      {fields.map((f) =>
        f.type === "checkbox" ? (
          <Controller
            key={f.key}
            control={control}
            name={`config.${f.key}` as `config.${string}`}
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={(field.value as boolean) ?? false}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                {f.label}
              </label>
            )}
          />
        ) : (
          <Controller
            key={f.key}
            control={control}
            name={`config.${f.key}` as `config.${string}`}
            render={({ field }) => (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{f.label}</span>
                <input
                  type={f.type ?? "text"}
                  min={f.type === "number" ? 0 : undefined}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={(field.value as string | number) ?? ""}
                  onChange={(e) =>
                    field.onChange(f.type === "number" ? Number(e.target.value) : e.target.value)
                  }
                />
              </label>
            )}
          />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

const typeLabels: Record<PolicyType, string> = {
  data_retention: "Data Retention",
  rate_limit: "Rate Limit",
  content_filter: "Content Filter",
  access_control: "Access Control",
  audit: "Audit",
};

export default function PolicyEditorDialog({ policy, onClose }: PolicyEditorDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!policy;

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      name: policy?.name ?? "",
      type: policy?.type ?? "data_retention",
      active: policy?.active ?? true,
      config: policy?.config ?? {},
    },
  });

  const { control, handleSubmit, watch, reset, formState } = form;
  const selectedType = watch("type");

  useEffect(() => {
    reset({
      name: policy?.name ?? "",
      type: policy?.type ?? "data_retention",
      active: policy?.active ?? true,
      config: policy?.config ?? {},
    });
  }, [policy, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: PolicyFormValues) => {
      const payload = { ...values, rules: [values.config] };
      return isEditing ? updatePolicy(policy!.id, payload) : createPolicy(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-policies"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePolicy(policy!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-policies"] });
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => saveMutation.mutate(values));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-xl sm:left-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{isEditing ? "Edit Policy" : "Create Policy"}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
            {/* Name */}
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Policy Name</span>
              <input
                {...form.register("name")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {formState.errors.name && (
                <p className="mt-1 text-xs text-destructive">{formState.errors.name.message}</p>
              )}
            </label>

            {/* Type */}
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Policy Type</span>
              <select
                {...form.register("type")}
                disabled={isEditing}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              >
                {(Object.keys(typeLabels) as PolicyType[]).map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </label>

            {/* Active toggle */}
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <label className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={field.value}
                    onClick={() => field.onChange(!field.value)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                      field.value ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform ${
                        field.value ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="font-medium">{field.value ? "Active" : "Inactive"}</span>
                </label>
              )}
            />

            {/* Dynamic type-specific fields */}
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-medium">Configuration</h3>
              {selectedType === "data_retention" && <DataRetentionFields control={control} />}
              {selectedType === "rate_limit" && <RateLimitFields control={control} />}
              {selectedType === "content_filter" && <ContentFilterFields control={control} />}
              {selectedType === "access_control" && <AccessControlFields control={control} />}
              {selectedType === "audit" && <AuditFields control={control} />}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t px-6 py-4">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Delete this policy? This cannot be undone.")) {
                    deleteMutation.mutate();
                  }
                }}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Policy"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
