import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Brain,
  Cpu,
  Database,
  FileText,
  GitMerge,
  Save,
  Server,
  Settings,
  Zap,
  BarChart3,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useParams, useNavigate } from "react-router-dom";
import { z } from "zod";
import type { Agent as ApiAgent, UpdateAgentRequest } from "@/api/types";
import { getAgent, updateAgentConfig, getAgentSkills, updateAgentSkills } from "@/api/agents";
import { client } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CollaborationTab } from "./CollaborationTab";
import HooksTab from "./HooksTab";
import KnowledgeBaseTab from "./KnowledgeBaseTab";
import { McpServersTab } from "./McpServersTab";

async function updateAgent(id: string, data: Partial<UpdateAgentRequest>): Promise<ApiAgent> {
  return updateAgentConfig(id, data);
}
async function getAgentUsage(agentId: string): Promise<AgentUsage> {
  return client.get<AgentUsage>(`/agents/${agentId}/usage`);
}
async function getAgentLimits(agentId: string): Promise<AgentLimits> {
  return client.get<AgentLimits>(`/agents/${agentId}/limits`);
}
async function updateAgentLimits(agentId: string, data: LimitsFormValues): Promise<AgentLimits> {
  return client.patch<AgentLimits>(`/agents/${agentId}/limits`, data);
}

// --- Types ---

interface Agent {
  id: string;
  name: string;
  model: string;
  status: string;
  systemPrompt: string | null;
  memory: string | null;
  projectInstructions: string | null;
  parameters: Record<string, unknown>;
  tools: unknown[];
  description: string | null;
  tenantId: string;
  isDefault: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  skipToolApproval: boolean;
  hooks?: unknown[];
  temperature: number;
  maxTokens: number;
  responseLanguage: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface AgentUsage {
  totalSessions: number;
  totalTokens: number;
  totalCost: number;
  data: { date: string; tokens: number; sessions: number; cost: number }[];
}

interface AgentLimits {
  maxTokensPerRequest: number;
  maxTokensPerDay: number;
  allowedChannels: string[];
}

// --- Schemas ---

const configSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().min(1, "Model is required"),
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(1),
  maxTokens: z.coerce.number().int().positive(),
  responseLanguage: z.string().min(1),
  skipToolApproval: z.boolean(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

const limitsSchema = z.object({
  maxTokensPerRequest: z.coerce.number().int().positive(),
  maxTokensPerDay: z.coerce.number().int().positive(),
  allowedChannels: z.array(z.string()),
});

type LimitsFormValues = z.infer<typeof limitsSchema>;

// --- Constants ---

const FALLBACK_MODELS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-haiku-3-5-20241022", label: "Claude 3.5 Haiku" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "auto", label: "Auto-detect" },
];

const CHANNEL_OPTIONS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "web", label: "Web Chat" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
];

// --- Sub-components ---

function ConfigurationTab({ agent }: { agent: Agent }) {
  const queryClient = useQueryClient();

  // Fetch tenant settings to derive allowed models
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => client.get<Record<string, unknown>>("/settings"),
    staleTime: 60_000,
  });

  const aiModels = (() => {
    const allowedModels = settingsData?.allowedModels as Record<string, string[]> | undefined;
    const anthropicAllowed = allowedModels?.Anthropic;
    if (anthropicAllowed && anthropicAllowed.length > 0) {
      return FALLBACK_MODELS.filter((m) => anthropicAllowed.includes(m.value));
    }
    return FALLBACK_MODELS;
  })();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt ?? "",
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      responseLanguage: agent.responseLanguage,
      skipToolApproval: agent.skipToolApproval,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ConfigFormValues) => {
      const { temperature, maxTokens, responseLanguage, skipToolApproval, ...rest } = data;
      return updateAgent(agent.id, {
        ...rest,
        skipToolApproval,
        parameters: { temperature, maxTokens, responseLanguage },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    },
  });

  const temperature = form.watch("temperature");

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">AI Model</Label>
            <Select
              value={form.watch("model")}
              onValueChange={(val) => form.setValue("model", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {aiModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="responseLanguage">Response Language</Label>
            <Select
              value={form.watch("responseLanguage")}
              onValueChange={(val) => form.setValue("responseLanguage", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[200px] font-mono text-sm"
            placeholder="You are a helpful assistant..."
            {...form.register("systemPrompt")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[temperature]}
              onValueChange={([val]) => form.setValue("temperature", val ?? 0)}
            />
            <p className="text-xs text-muted-foreground">
              Lower values produce more focused outputs; higher values increase creativity.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input id="maxTokens" type="number" min={1} {...form.register("maxTokens")} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Skip Tool Approval</Label>
              <p className="text-xs text-muted-foreground">
                Auto-approve all tool executions without user confirmation (like
                --dangerously-skip-approval)
              </p>
            </div>
            <Switch
              checked={form.watch("skipToolApproval")}
              onCheckedChange={(checked) => form.setValue("skipToolApproval", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {mutation.isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </form>
  );
}

function SkillsTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["agent", agentId, "skills"],
    queryFn: async () => {
      const res = await getAgentSkills(agentId);
      return (res.skills ?? []) as Skill[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ skillId, enabled }: { skillId: string; enabled: boolean }) => {
      const updated = skills.map((s) => (s.id === skillId ? { ...s, enabled } : s));
      return updateAgentSkills(agentId, updated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "skills"],
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="ml-auto h-5 w-10 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-12">
        <Zap className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">No skills available</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Skills will appear here once configured in your organization.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {skills.map((skill) => (
        <Card key={skill.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium">{skill.name}</p>
              <p className="text-sm text-muted-foreground">{skill.description}</p>
            </div>
            <Switch
              checked={skill.enabled}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({
                  skillId: skill.id,
                  enabled: checked,
                })
              }
              disabled={toggleMutation.isPending}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsageTab({ agentId }: { agentId: string }) {
  const {
    data: usage,
    isLoading,
    error,
  } = useQuery<AgentUsage>({
    queryKey: ["agent", agentId, "usage"],
    queryFn: () => getAgentUsage(agentId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="mt-2 h-6 w-28 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <Card className="flex flex-col items-center justify-center py-12">
        <BarChart3 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Usage data unavailable</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Usage analytics are not available for this agent yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total Sessions</p>
            <p className="text-2xl font-bold">{usage.totalSessions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total Tokens</p>
            <p className="text-2xl font-bold">{usage.totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total Cost</p>
            <p className="text-2xl font-bold">${usage.totalCost.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No usage data available yet.
            </p>
          ) : (
            <div className="h-[300px] w-full">
              <p className="text-sm text-muted-foreground">
                Chart data available ({usage.data.length} data points). Integrate with UsageChart
                component for visualization.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LimitsTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();

  const {
    data: limits,
    isLoading,
    error,
  } = useQuery<AgentLimits>({
    queryKey: ["agent", agentId, "limits"],
    queryFn: () => getAgentLimits(agentId),
    retry: false,
  });

  const form = useForm<LimitsFormValues>({
    resolver: zodResolver(limitsSchema),
    values: limits
      ? {
          maxTokensPerRequest: limits.maxTokensPerRequest,
          maxTokensPerDay: limits.maxTokensPerDay,
          allowedChannels: limits.allowedChannels,
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (data: LimitsFormValues) => updateAgentLimits(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "limits"],
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="space-y-4 py-6">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted" />
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (error || !limits) {
    return (
      <Card className="flex flex-col items-center justify-center py-12">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Limits unavailable</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Rate limits are not available for this agent yet.
        </p>
      </Card>
    );
  }

  const watchedChannels = form.watch("allowedChannels") ?? [];

  function handleChannelToggle(channelId: string, checked: boolean) {
    const current = form.getValues("allowedChannels") ?? [];
    if (checked) {
      form.setValue("allowedChannels", [...current, channelId]);
    } else {
      form.setValue(
        "allowedChannels",
        current.filter((c) => c !== channelId),
      );
    }
  }

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Token Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxTokensPerRequest">Max Tokens per Request</Label>
            <Input
              id="maxTokensPerRequest"
              type="number"
              min={1}
              {...form.register("maxTokensPerRequest")}
            />
            {form.formState.errors.maxTokensPerRequest && (
              <p className="text-sm text-destructive">
                {form.formState.errors.maxTokensPerRequest.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxTokensPerDay">Max Tokens per Day</Label>
            <Input
              id="maxTokensPerDay"
              type="number"
              min={1}
              {...form.register("maxTokensPerDay")}
            />
            {form.formState.errors.maxTokensPerDay && (
              <p className="text-sm text-destructive">
                {form.formState.errors.maxTokensPerDay.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNEL_OPTIONS.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between">
              <Label htmlFor={`ch-${ch.id}`} className="cursor-pointer">
                {ch.label}
              </Label>
              <Switch
                id={`ch-${ch.id}`}
                checked={watchedChannels.includes(ch.id)}
                onCheckedChange={(checked) => handleChannelToggle(ch.id, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {mutation.isPending ? "Saving..." : "Save Limits"}
        </Button>
      </div>
    </form>
  );
}

function MemoryTab({ agent }: { agent: Agent }) {
  const queryClient = useQueryClient();
  const [memoryContent, setMemoryContent] = useState(agent.memory ?? "");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (memory: string) => updateAgent(agent.id, { memory }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Persistent Memory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This memory is included in every conversation with this agent. The agent can also update
            its own memory during chats using the UpdateMemory tool. Use markdown format for best
            results.
          </p>
          <Textarea
            className="min-h-[400px] font-mono text-sm"
            placeholder={
              "# Agent Memory\n\n## User Preferences\n- ...\n\n## Project Context\n- ...\n\n## Important Facts\n- ..."
            }
            value={memoryContent}
            onChange={(e) => {
              setMemoryContent(e.target.value);
              setSaved(false);
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {memoryContent.length.toLocaleString()} / 50,000 chars
            </span>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-green-600">Saved!</span>}
              <Button onClick={() => mutation.mutate(memoryContent)} disabled={mutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {mutation.isPending ? "Saving..." : "Save Memory"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectInstructionsTab({ agent }: { agent: Agent }) {
  const queryClient = useQueryClient();
  const [instructions, setInstructions] = useState(agent.projectInstructions ?? "");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (projectInstructions: string) => updateAgent(agent.id, { projectInstructions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Project Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Custom instructions included in the system prompt for every conversation. These
            instructions support variable interpolation. The agent will also automatically load a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">CLAUDE.md</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">instructions.md</code> file from
            the session workspace if present.
          </p>
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Available variables:</p>
            <div className="grid grid-cols-2 gap-1 text-xs font-mono text-muted-foreground">
              <span>{"{{agent_name}}"} - Agent name</span>
              <span>{"{{user_name}}"} - Current user</span>
              <span>{"{{date}}"} - Current date</span>
              <span>{"{{tenant_id}}"} - Tenant ID</span>
            </div>
          </div>
          <Textarea
            className="min-h-[300px] font-mono text-sm"
            placeholder={
              "# Instructions\n\nYou are {{agent_name}}.\nToday is {{date}}.\n\n## Guidelines\n- Always respond in a professional tone\n- ..."
            }
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              setSaved(false);
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {instructions.length.toLocaleString()} / 50,000 chars
            </span>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-green-600">Saved!</span>}
              <Button onClick={() => mutation.mutate(instructions)} disabled={mutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {mutation.isPending ? "Saving..." : "Save Instructions"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Page ---

function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("configuration");

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["agent", id],
    queryFn: async () => {
      const raw = await getAgent(id!);
      const params = (raw.parameters ?? {}) as Record<string, unknown>;
      return {
        ...raw,
        memory: raw.memory ?? null,
        projectInstructions: raw.projectInstructions ?? null,
        skipToolApproval: raw.skipToolApproval === true,
        temperature: Number(params.temperature ?? 0.7),
        maxTokens: Number(params.maxTokens ?? 4096),
        responseLanguage: String(params.responseLanguage ?? "auto"),
      };
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/agents")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Agents
        </Button>
        <p className="text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/agents")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Agents
      </Button>

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              <Cpu className="mr-1 h-3 w-3" />
              {agent.model}
            </Badge>
            <Badge variant={agent.status === "active" ? "default" : "secondary"}>
              {agent.status}
            </Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="configuration">
            <Settings className="mr-2 h-4 w-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="memory">
            <Brain className="mr-2 h-4 w-4" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="instructions">
            <FileText className="mr-2 h-4 w-4" />
            Instructions
          </TabsTrigger>
          <TabsTrigger value="mcp">
            <Server className="mr-2 h-4 w-4" />
            MCP Servers
          </TabsTrigger>
          <TabsTrigger value="knowledge-base">
            <Database className="mr-2 h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="collaboration">
            <GitMerge className="mr-2 h-4 w-4" />
            Collaboration
          </TabsTrigger>
          <TabsTrigger value="hooks">
            <Webhook className="mr-2 h-4 w-4" />
            Hooks
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Zap className="mr-2 h-4 w-4" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="usage">
            <BarChart3 className="mr-2 h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="limits">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Limits
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-6">
          <ConfigurationTab agent={agent} />
        </TabsContent>

        <TabsContent value="memory" className="mt-6">
          <MemoryTab agent={agent} />
        </TabsContent>

        <TabsContent value="instructions" className="mt-6">
          <ProjectInstructionsTab agent={agent} />
        </TabsContent>

        <TabsContent value="mcp" className="mt-6">
          <McpServersTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="knowledge-base" className="mt-6">
          <KnowledgeBaseTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="collaboration" className="mt-6">
          <CollaborationTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="hooks" className="mt-6">
          <HooksTab agentId={agent.id} hooks={agent.hooks ?? []} />
        </TabsContent>

        <TabsContent value="skills" className="mt-6">
          <SkillsTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="usage" className="mt-6">
          <UsageTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="limits" className="mt-6">
          <LimitsTab agentId={agent.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AgentDetailPage;
