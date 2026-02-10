import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Shield,
  Database,
  Bot,
  Bell,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { client } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RateLimitsTab from "./RateLimitsTab";

/* ---------- schemas ---------- */

const orgSchema = z.object({
  companyName: z.string().min(1, "Required"),
  slug: z.string().min(1, "Required"),
  dataRegion: z.string(),
  plan: z.string(),
});

const securitySchema = z.object({
  requireMfa: z.boolean(),
  sessionTimeoutMinutes: z.coerce.number().min(1),
  passwordMinLength: z.coerce.number().min(6),
  passwordRequireSpecial: z.boolean(),
  ipAllowlist: z.string(),
});

const retentionSchema = z.object({
  transcriptRetentionDays: z.coerce.number().min(1),
  auditLogRetentionDays: z.coerce.number().min(1),
  sessionRetentionDays: z.coerce.number().min(1),
  memoryRetentionDays: z.coerce.number().min(1),
});

const AI_PROVIDERS = ["Anthropic", "OpenAI", "Google", "Cohere", "Mistral"] as const;

const ANTHROPIC_MODELS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-haiku-3-5-20241022", label: "Claude 3.5 Haiku" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
];

const modelsSchema = z.object({
  anthropicApiKey: z.string().optional(),
  allowedProviders: z.array(z.string()),
  allowedModels: z.record(z.array(z.string())),
  defaultModel: z.string(),
});

const notificationsSchema = z.object({
  violationAlerts: z.boolean(),
  dsarAlerts: z.boolean(),
  systemAlerts: z.boolean(),
  notificationEmail: z.string().email("Must be a valid email"),
});

type OrgValues = z.infer<typeof orgSchema>;
type SecurityValues = z.infer<typeof securitySchema>;
type RetentionValues = z.infer<typeof retentionSchema>;
type ModelsValues = z.infer<typeof modelsSchema>;
type NotificationsValues = z.infer<typeof notificationsSchema>;

/* ---------- section wrapper ---------- */

function Section({
  icon: Icon,
  title,
  description,
  children,
  onSave,
  saving,
  dirty,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <Icon className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
      {dirty && (
        <p className="mb-3 text-xs font-medium text-amber-600">You have unsaved changes.</p>
      )}
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/* ---------- helpers ---------- */

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/* ---------- page ---------- */

export default function SettingsPage() {
  const qc = useQueryClient();

  // Test connection state
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      try {
        return await client.get<Record<string, unknown>>("/settings");
      } catch {
        return {};
      }
    },
  });

  /* ---- Organization ---- */
  const orgForm = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { companyName: "", slug: "", dataRegion: "us-east-1", plan: "" },
  });
  const orgMut = useMutation({
    mutationFn: (v: OrgValues) => client.patch("/settings/organization", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  /* ---- Security ---- */
  const secForm = useForm<SecurityValues>({
    resolver: zodResolver(securitySchema),
    defaultValues: {
      requireMfa: false,
      sessionTimeoutMinutes: 30,
      passwordMinLength: 8,
      passwordRequireSpecial: false,
      ipAllowlist: "",
    },
  });
  const secMut = useMutation({
    mutationFn: (v: SecurityValues) => client.patch("/settings/security", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  /* ---- Data Retention ---- */
  const retForm = useForm<RetentionValues>({
    resolver: zodResolver(retentionSchema),
    defaultValues: {
      transcriptRetentionDays: 90,
      auditLogRetentionDays: 365,
      sessionRetentionDays: 90,
      memoryRetentionDays: 30,
    },
  });
  const retMut = useMutation({
    mutationFn: (v: RetentionValues) => client.patch("/settings/retention", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  /* ---- AI Models ---- */
  const modForm = useForm<ModelsValues>({
    resolver: zodResolver(modelsSchema),
    defaultValues: {
      anthropicApiKey: "",
      allowedProviders: [],
      allowedModels: {},
      defaultModel: "",
    },
  });
  const modMut = useMutation({
    mutationFn: (v: ModelsValues) => client.patch("/settings/models", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  /* ---- Notifications ---- */
  const notifForm = useForm<NotificationsValues>({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      violationAlerts: true,
      dsarAlerts: true,
      systemAlerts: true,
      notificationEmail: "",
    },
  });
  const notifMut = useMutation({
    mutationFn: (v: NotificationsValues) => client.patch("/settings/notifications", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  /* hydrate from server */
  useEffect(() => {
    if (!settings.data) return;
    const d = settings.data;
    orgForm.reset({
      companyName: (d.companyName as string) ?? "",
      slug: (d.slug as string) ?? "",
      dataRegion: (d.dataRegion as string) ?? "us-east-1",
      plan: (d.plan as string) ?? "",
    });
    secForm.reset({
      requireMfa: (d.requireMfa as boolean) ?? false,
      sessionTimeoutMinutes: (d.sessionTimeoutMinutes as number) ?? 30,
      passwordMinLength: (d.passwordMinLength as number) ?? 8,
      passwordRequireSpecial: (d.passwordRequireSpecial as boolean) ?? false,
      ipAllowlist: (d.ipAllowlist as string) ?? "",
    });
    retForm.reset({
      transcriptRetentionDays: (d.transcriptRetentionDays as number) ?? 90,
      auditLogRetentionDays: (d.auditLogRetentionDays as number) ?? 365,
      sessionRetentionDays: (d.sessionRetentionDays as number) ?? 90,
      memoryRetentionDays: (d.memoryRetentionDays as number) ?? 30,
    });
    modForm.reset({
      anthropicApiKey: (d.anthropicApiKey as string) ?? "",
      allowedProviders: (d.allowedProviders as string[]) ?? [],
      allowedModels: (d.allowedModels as Record<string, string[]>) ?? {},
      defaultModel: (d.defaultModel as string) ?? "",
    });
    notifForm.reset({
      violationAlerts: (d.violationAlerts as boolean) ?? true,
      dsarAlerts: (d.dsarAlerts as boolean) ?? true,
      systemAlerts: (d.systemAlerts as boolean) ?? true,
      notificationEmail: (d.notificationEmail as string) ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  const REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "sa-east-1"];

  const watchedApiKey = modForm.watch("anthropicApiKey") ?? "";
  const watchedAllowedModels = modForm.watch("allowedModels") ?? {};
  const anthropicModels = watchedAllowedModels.Anthropic ?? [];

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestError("");
    try {
      const result = await client.post<{ success: boolean; error?: string }>(
        "/settings/test-connection",
        { apiKey: watchedApiKey },
      );
      if (result.success) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setTestError(result.error ?? "Connection failed");
      }
    } catch (err: unknown) {
      setTestStatus("error");
      const apiErr = err as { body?: { error?: string }; message?: string } | undefined;
      setTestError(apiErr?.body?.error ?? apiErr?.message ?? "Request failed");
    }
  }

  function toggleAnthropicModel(modelValue: string, checked: boolean) {
    const current = modForm.getValues("allowedModels") ?? {};
    const currentAnthropic = current.Anthropic ?? [];
    const next = checked
      ? [...currentAnthropic, modelValue]
      : currentAnthropic.filter((m) => m !== modelValue);
    modForm.setValue("allowedModels", { ...current, Anthropic: next }, { shouldDirty: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your organization settings</p>
      </div>

      {/* Organization */}
      <Section
        icon={Building2}
        title="Organization"
        description="Company information and plan details"
        onSave={orgForm.handleSubmit((v) => orgMut.mutate(v))}
        saving={orgMut.isPending}
        dirty={orgForm.formState.isDirty}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Company Name</Label>
            <Input {...orgForm.register("companyName")} />
            {orgForm.formState.errors.companyName && (
              <p className="mt-1 text-xs text-red-500">
                {orgForm.formState.errors.companyName.message}
              </p>
            )}
          </div>
          <div>
            <Label>Slug</Label>
            <Input {...orgForm.register("slug")} readOnly className="bg-gray-50" />
          </div>
          <div>
            <Label>Data Region</Label>
            <select
              {...orgForm.register("dataRegion")}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Plan</Label>
            <div className="mt-1">
              <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium capitalize text-indigo-700">
                {orgForm.watch("plan") || "free"}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* Security */}
      <Section
        icon={Shield}
        title="Security"
        description="Authentication and access controls"
        onSave={secForm.handleSubmit((v) => secMut.mutate(v))}
        saving={secMut.isPending}
        dirty={secForm.formState.isDirty}
      >
        <Controller
          control={secForm.control}
          name="requireMfa"
          render={({ field }) => (
            <SwitchField
              label="Require MFA for all admins"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Session Timeout (minutes)</Label>
            <Input type="number" {...secForm.register("sessionTimeoutMinutes")} />
          </div>
          <div>
            <Label>Password Minimum Length</Label>
            <Input type="number" {...secForm.register("passwordMinLength")} />
          </div>
        </div>
        <Controller
          control={secForm.control}
          name="passwordRequireSpecial"
          render={({ field }) => (
            <SwitchField
              label="Require special characters in passwords"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div>
          <Label>IP Allowlist (one per line)</Label>
          <textarea
            {...secForm.register("ipAllowlist")}
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="e.g. 192.168.1.0/24"
          />
        </div>
      </Section>

      {/* Data Retention */}
      <Section
        icon={Database}
        title="Data Retention"
        description="Configure how long data is retained"
        onSave={retForm.handleSubmit((v) => retMut.mutate(v))}
        saving={retMut.isPending}
        dirty={retForm.formState.isDirty}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Transcript Retention (days)</Label>
            <Input type="number" {...retForm.register("transcriptRetentionDays")} />
          </div>
          <div>
            <Label>Audit Log Retention (days)</Label>
            <Input type="number" {...retForm.register("auditLogRetentionDays")} />
          </div>
          <div>
            <Label>Session Retention (days)</Label>
            <Input type="number" {...retForm.register("sessionRetentionDays")} />
          </div>
          <div>
            <Label>Memory Retention (days)</Label>
            <Input type="number" {...retForm.register("memoryRetentionDays")} />
          </div>
        </div>
      </Section>

      {/* AI Models */}
      <Section
        icon={Bot}
        title="AI Models"
        description="API key, provider and model access configuration"
        onSave={modForm.handleSubmit((v) => modMut.mutate(v))}
        saving={modMut.isPending}
        dirty={modForm.formState.isDirty}
      >
        {/* API Key */}
        <div>
          <Label className="mb-1 block">Anthropic API Key</Label>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              placeholder="sk-ant-..."
              {...modForm.register("anthropicApiKey")}
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testStatus === "testing" || !watchedApiKey}
            >
              {testStatus === "testing" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Test
            </Button>
          </div>
          {testStatus === "success" && (
            <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connection successful
            </p>
          )}
          {testStatus === "error" && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
              <XCircle className="h-3.5 w-3.5" />
              {testError || "Connection failed"}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            If not set, the server environment variable will be used as fallback.
          </p>
        </div>

        {/* Allowed Providers */}
        <div>
          <Label className="mb-2 block">Allowed Providers</Label>
          <Controller
            control={modForm.control}
            name="allowedProviders"
            render={({ field }) => (
              <div className="flex flex-wrap gap-3">
                {AI_PROVIDERS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={field.value.includes(p)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...field.value, p]
                          : field.value.filter((v) => v !== p);
                        field.onChange(next);
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {p}
                  </label>
                ))}
              </div>
            )}
          />
        </div>

        {/* Anthropic Models */}
        <div>
          <Label className="mb-2 block">Allowed Anthropic Models</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ANTHROPIC_MODELS.map((m) => (
              <label key={m.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={anthropicModels.includes(m.value)}
                  onChange={(e) => toggleAnthropicModel(m.value, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {m.label}
                <span className="text-xs text-gray-400">({m.value})</span>
              </label>
            ))}
          </div>
        </div>

        {/* Default Model */}
        <div>
          <Label>Default Model</Label>
          <Controller
            control={modForm.control}
            name="defaultModel"
            render={({ field }) => (
              <select
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">-- Select default model --</option>
                {(anthropicModels.length > 0
                  ? ANTHROPIC_MODELS.filter((m) => anthropicModels.includes(m.value))
                  : ANTHROPIC_MODELS
                ).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          />
        </div>
      </Section>

      {/* Notifications */}
      <Section
        icon={Bell}
        title="Notifications"
        description="Alert and email preferences"
        onSave={notifForm.handleSubmit((v) => notifMut.mutate(v))}
        saving={notifMut.isPending}
        dirty={notifForm.formState.isDirty}
      >
        <Controller
          control={notifForm.control}
          name="violationAlerts"
          render={({ field }) => (
            <SwitchField
              label="Email on policy violations"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={notifForm.control}
          name="dsarAlerts"
          render={({ field }) => (
            <SwitchField
              label="Email on DSAR requests"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={notifForm.control}
          name="systemAlerts"
          render={({ field }) => (
            <SwitchField
              label="Email on system alerts"
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div>
          <Label>Notification Email</Label>
          <Input
            type="email"
            {...notifForm.register("notificationEmail")}
            placeholder="admin@company.com"
          />
          {notifForm.formState.errors.notificationEmail && (
            <p className="mt-1 text-xs text-red-500">
              {notifForm.formState.errors.notificationEmail.message}
            </p>
          )}
        </div>
      </Section>

      {/* Rate Limits */}
      <RateLimitsTab />
    </div>
  );
}
