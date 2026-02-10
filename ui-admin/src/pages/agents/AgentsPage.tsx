import { useQuery } from "@tanstack/react-query";
import { Bot, Plus, Cpu, MessageSquare, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAgents } from "@/api/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Agent {
  id: string;
  name: string;
  model: string;
  status: string;
  sessionsCount?: number;
  tokensUsed?: number;
}

function AgentsPage() {
  const navigate = useNavigate();
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: getAgents,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
          <p className="text-muted-foreground">Configure your organization's AI agents</p>
        </div>
        <Button onClick={() => navigate("/agents/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Bot className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No agents configured</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first AI agent to get started.
          </p>
          <Button className="mt-4" onClick={() => navigate("/agents/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    <Cpu className="mr-1 h-3 w-3" />
                    {agent.model}
                  </Badge>
                </div>
                <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                  {agent.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{(agent.sessionsCount ?? 0).toLocaleString()} sessions</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5" />
                    <span>{(agent.tokensUsed ?? 0).toLocaleString()} tokens</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentsPage;
