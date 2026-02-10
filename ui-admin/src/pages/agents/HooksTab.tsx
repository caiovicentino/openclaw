import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Save, Webhook, Terminal } from "lucide-react";
import { useState } from "react";
import { updateAgentConfig } from "@/api/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HookDefinition {
  id: string;
  name: string;
  type: "pre_tool" | "post_tool" | "pre_message" | "post_message";
  action: "shell" | "webhook";
  command?: string;
  url?: string;
  timeout?: number;
  toolNames?: string[];
  blockOnFailure?: boolean;
  enabled?: boolean;
}

const HOOK_TYPES = [
  { value: "pre_tool", label: "Pre Tool" },
  { value: "post_tool", label: "Post Tool" },
  { value: "pre_message", label: "Pre Message" },
  { value: "post_message", label: "Post Message" },
] as const;

const TOOL_NAMES = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "UpdateMemory",
];

function emptyHook(): HookDefinition {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "pre_tool",
    action: "shell",
    command: "",
    url: "",
    timeout: 10000,
    toolNames: [],
    blockOnFailure: false,
    enabled: true,
  };
}

interface HookDialogProps {
  hook: HookDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (hook: HookDefinition) => void;
}

function HookDialog({ hook: initial, open, onOpenChange, onSave }: HookDialogProps) {
  const [hook, setHook] = useState<HookDefinition>(initial);

  // Reset state when the dialog opens with a new hook
  const [lastId, setLastId] = useState(initial.id);
  if (initial.id !== lastId) {
    setHook(initial);
    setLastId(initial.id);
  }

  function removeToolFilter(name: string) {
    setHook({
      ...hook,
      toolNames: (hook.toolNames ?? []).filter((t) => t !== name),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.name ? "Edit Hook" : "Add Hook"}</DialogTitle>
          <DialogDescription>
            Configure a hook that runs before or after tool executions or messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hook-name">Name</Label>
            <Input
              id="hook-name"
              value={hook.name}
              onChange={(e) => setHook({ ...hook, name: e.target.value })}
              placeholder="e.g. Log tool usage"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={hook.type}
                onValueChange={(val) => setHook({ ...hook, type: val as HookDefinition["type"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={hook.action}
                onValueChange={(val) => setHook({ ...hook, action: val as "shell" | "webhook" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shell">Shell Command</SelectItem>
                  <SelectItem value="webhook">Webhook URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hook.action === "shell" ? (
            <div className="space-y-2">
              <Label htmlFor="hook-command">Shell Command</Label>
              <Input
                id="hook-command"
                value={hook.command ?? ""}
                onChange={(e) => setHook({ ...hook, command: e.target.value })}
                placeholder="e.g. echo $HOOK_TOOL_NAME >> /tmp/hook.log"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Environment variables: HOOK_CONTEXT (JSON), HOOK_TYPE, HOOK_TOOL_NAME
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="hook-url">Webhook URL</Label>
              <Input
                id="hook-url"
                value={hook.url ?? ""}
                onChange={(e) => setHook({ ...hook, url: e.target.value })}
                placeholder="https://example.com/webhook"
              />
              <p className="text-xs text-muted-foreground">
                POST request with JSON body containing hookType and context.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="hook-timeout">Timeout (ms)</Label>
            <Input
              id="hook-timeout"
              type="number"
              value={hook.timeout ?? 10000}
              onChange={(e) => setHook({ ...hook, timeout: parseInt(e.target.value) || 10000 })}
              min={1000}
              max={60000}
            />
          </div>

          {(hook.type === "pre_tool" || hook.type === "post_tool") && (
            <div className="space-y-2">
              <Label>Tool Filter (empty = all tools)</Label>
              <div className="flex gap-2">
                <Select
                  value=""
                  onValueChange={(val) => {
                    if (val && !hook.toolNames?.includes(val)) {
                      setHook({
                        ...hook,
                        toolNames: [...(hook.toolNames ?? []), val],
                      });
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a tool..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOL_NAMES.filter((t) => !hook.toolNames?.includes(t)).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(hook.toolNames?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {hook.toolNames!.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeToolFilter(t)}
                    >
                      {t} x
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="hook-block">Block on Failure</Label>
              <p className="text-xs text-muted-foreground">Stop execution if this hook fails</p>
            </div>
            <Switch
              id="hook-block"
              checked={hook.blockOnFailure ?? false}
              onCheckedChange={(checked) => setHook({ ...hook, blockOnFailure: checked })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(hook);
              onOpenChange(false);
            }}
            disabled={!hook.name.trim()}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Hook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface HooksTabProps {
  agentId: string;
  hooks: HookDefinition[];
}

export default function HooksTab({ agentId, hooks: initialHooks }: HooksTabProps) {
  const queryClient = useQueryClient();
  const [hooks, setHooks] = useState<HookDefinition[]>(initialHooks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<HookDefinition | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (updatedHooks: HookDefinition[]) =>
      updateAgentConfig(agentId, { hooks: updatedHooks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      setHasChanges(false);
    },
  });

  function handleAdd() {
    setEditingHook(emptyHook());
    setDialogOpen(true);
  }

  function handleEdit(hook: HookDefinition) {
    setEditingHook({ ...hook });
    setDialogOpen(true);
  }

  function handleSaveHook(hook: HookDefinition) {
    const idx = hooks.findIndex((h) => h.id === hook.id);
    let updated: HookDefinition[];
    if (idx >= 0) {
      updated = hooks.map((h) => (h.id === hook.id ? hook : h));
    } else {
      updated = [...hooks, hook];
    }
    setHooks(updated);
    setHasChanges(true);
  }

  function handleDelete(hookId: string) {
    const updated = hooks.filter((h) => h.id !== hookId);
    setHooks(updated);
    setHasChanges(true);
  }

  function handleToggle(hookId: string, enabled: boolean) {
    const updated = hooks.map((h) => (h.id === hookId ? { ...h, enabled } : h));
    setHooks(updated);
    setHasChanges(true);
  }

  function handleSaveAll() {
    saveMutation.mutate(hooks);
  }

  const typeLabel = (type: string) => {
    const found = HOOK_TYPES.find((t) => t.value === type);
    return found?.label ?? type;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Hooks
          </CardTitle>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Hook
          </Button>
        </CardHeader>
        <CardContent>
          {hooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Webhook className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No hooks configured</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add hooks to run custom commands or webhooks before/after tool executions and
                messages.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hooks.map((hook) => (
                  <TableRow key={hook.id}>
                    <TableCell className="font-medium">{hook.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeLabel(hook.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        {hook.action === "shell" ? (
                          <Terminal className="h-3 w-3" />
                        ) : (
                          <Webhook className="h-3 w-3" />
                        )}
                        {hook.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hook.toolNames?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {hook.toolNames.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={hook.enabled !== false}
                        onCheckedChange={(checked) => handleToggle(hook.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(hook)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(hook.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSaveAll} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Hooks"}
          </Button>
        </div>
      )}

      {editingHook && (
        <HookDialog
          hook={editingHook}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSave={handleSaveHook}
        />
      )}
    </div>
  );
}
