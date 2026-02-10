import { useQuery } from "@tanstack/react-query";
import type { ChatAgent } from "@/api/types";
import { fetchAgents } from "@/api/chat";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface AgentSelectorProps {
  value: string;
  onChange: (agentId: string) => void;
}

export function AgentSelector({ value, onChange }: AgentSelectorProps) {
  const { data: agents = [], isLoading } = useQuery<ChatAgent[]>({
    queryKey: ["chat-agents"],
    queryFn: fetchAgents,
  });

  if (isLoading) {
    return <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />;
  }

  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground">No agents available</p>;
  }

  return (
    <div className="w-64">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an agent" />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
