import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface CollaborationRule {
  id: string;
  sourceAgentId: string;
  sourceAgentName: string;
  targetAgentId: string;
  targetAgentName: string;
  ruleType: "handoff" | "invoke";
  triggerDescription: string | null;
  contextSummaryPrompt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AgentOption {
  id: string;
  name: string;
}

export function CollaborationTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [targetAgent, setTargetAgent] = useState("");
  const [ruleType, setRuleType] = useState<"handoff" | "invoke">("handoff");
  const [triggerDescription, setTriggerDescription] = useState("");
  const [contextPrompt, setContextPrompt] = useState("");

  // Fetch collaboration rules for this agent
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["agent-collaboration", agentId],
    queryFn: async () => {
      const res = await client.get<{ rules: CollaborationRule[] }>(
        `/agent-collaboration?agentId=${agentId}`,
      );
      return res.rules;
    },
  });

  // Fetch all agents for the target selector
  const { data: agents = [] } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const res = await client.get<{ agents: Array<{ id: string; name: string }> }>(
        "/agents?limit=200",
      );
      return res.agents.filter((a) => a.id !== agentId) as AgentOption[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      sourceAgentId: string;
      targetAgentId: string;
      ruleType: string;
      triggerDescription?: string;
      contextSummaryPrompt?: string;
    }) => client.post("/agent-collaboration", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent-collaboration", agentId],
      });
      setShowForm(false);
      setTargetAgent("");
      setRuleType("handoff");
      setTriggerDescription("");
      setContextPrompt("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      client.patch(`/agent-collaboration/${ruleId}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent-collaboration", agentId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => client.delete(`/agent-collaboration/${ruleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent-collaboration", agentId],
      });
    },
  });

  function handleCreate() {
    createMutation.mutate({
      sourceAgentId: agentId,
      targetAgentId: targetAgent,
      ruleType,
      triggerDescription: triggerDescription || undefined,
      contextSummaryPrompt: contextPrompt || undefined,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-4">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="mt-2 h-4 w-60 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Collaboration Rules</CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define how this agent can collaborate with other agents. Handoff rules transfer the
            conversation to another agent. Invoke rules let this agent call another agent to
            complete a sub-task.
          </p>

          {showForm && (
            <Card className="border-dashed">
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Target Agent</Label>
                  <Select value={targetAgent} onValueChange={setTargetAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Rule Type</Label>
                  <Select
                    value={ruleType}
                    onValueChange={(v) => setRuleType(v as "handoff" | "invoke")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="handoff">Handoff</SelectItem>
                      <SelectItem value="invoke">Invoke</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Trigger Description</Label>
                  <Input
                    placeholder="When should this rule be triggered?"
                    value={triggerDescription}
                    onChange={(e) => setTriggerDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Context Summary Prompt</Label>
                  <Textarea
                    placeholder="Prompt for summarizing conversation context (optional)"
                    value={contextPrompt}
                    onChange={(e) => setContextPrompt(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!targetAgent || createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create Rule"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {rules.length === 0 && !showForm && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ArrowRight className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No collaboration rules</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add rules to enable this agent to collaborate with other agents.
              </p>
            </div>
          )}

          {rules.map((rule) => {
            const isSource = rule.sourceAgentId === agentId;
            const otherName = isSource ? rule.targetAgentName : rule.sourceAgentName;
            const direction = isSource ? "outgoing" : "incoming";

            return (
              <Card key={rule.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={rule.ruleType === "handoff" ? "default" : "secondary"}>
                        {rule.ruleType}
                      </Badge>
                      <Badge variant="outline">{direction}</Badge>
                      <span className="font-medium">{otherName}</span>
                    </div>
                    {rule.triggerDescription && (
                      <p className="text-sm text-muted-foreground">{rule.triggerDescription}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({
                          ruleId: rule.id,
                          enabled: checked,
                        })
                      }
                      disabled={toggleMutation.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(rule.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
