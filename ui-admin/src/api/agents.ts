import type { Agent, CreateAgentRequest, UpdateAgentRequest } from "./types";
import { client } from "./client";

interface AgentsListResponse {
  agents: Agent[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAgents(): Promise<Agent[]> {
  const res = await client.get<AgentsListResponse>("/agents");
  return res.agents ?? [];
}

export async function getAgent(id: string): Promise<Agent> {
  return client.get<Agent>(`/agents/${id}`);
}

export async function createAgent(data: CreateAgentRequest): Promise<Agent> {
  return client.post<Agent>("/agents", data);
}

export async function updateAgentConfig(
  id: string,
  config: Partial<UpdateAgentRequest>,
): Promise<Agent> {
  return client.patch<Agent>(`/agents/${id}/config`, config);
}

export async function deleteAgent(id: string): Promise<void> {
  return client.delete<void>(`/agents/${id}`);
}

export async function getAgentSkills(id: string): Promise<{ agentId: string; skills: unknown[] }> {
  return client.get<{ agentId: string; skills: unknown[] }>(`/agents/${id}/skills`);
}

export async function updateAgentSkills(
  id: string,
  skills: unknown[],
): Promise<{ agentId: string; skills: unknown[] }> {
  return client.patch<{ agentId: string; skills: unknown[] }>(`/agents/${id}/skills`, { skills });
}
