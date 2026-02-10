import type {
  DashboardOverview,
  DailyUsageData,
  ActiveUser,
  TopAgent,
  DashboardPeriod,
  CostBreakdownResponse,
  SessionAnalyticsPoint,
  ForecastPoint,
  AgentPerformanceRow,
} from "./types";
import { client } from "./client";

export async function getOverview(): Promise<DashboardOverview> {
  return client.get<DashboardOverview>("/dashboard/overview");
}

const periodToDays: Record<DashboardPeriod, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function getUsage(period: DashboardPeriod): Promise<DailyUsageData[]> {
  const days = periodToDays[period] ?? 30;
  const res = await client.get<{ days: number; dailyUsage: DailyUsageData[] }>(
    `/dashboard/usage?days=${days}`,
  );
  return res.dailyUsage;
}

export async function getActiveUsers(period: DashboardPeriod): Promise<ActiveUser[]> {
  const res = await client.get<{ period: string; users: ActiveUser[] }>(
    `/dashboard/active-users?period=${period}`,
  );
  return res.users;
}

export async function getTopAgents(period: DashboardPeriod, limit?: number): Promise<TopAgent[]> {
  const params = new URLSearchParams({ period });
  if (limit !== undefined) params.set("limit", String(limit));
  const res = await client.get<{ period: string; agents: TopAgent[] }>(
    `/dashboard/top-agents?${params.toString()}`,
  );
  return res.agents;
}

export async function getCostBreakdown(start: string, end: string): Promise<CostBreakdownResponse> {
  return client.get<CostBreakdownResponse>(`/dashboard/cost-breakdown?start=${start}&end=${end}`);
}

export async function getSessionAnalytics(
  start: string,
  end: string,
): Promise<SessionAnalyticsPoint[]> {
  const res = await client.get<{ data: SessionAnalyticsPoint[] }>(
    `/dashboard/session-analytics?start=${start}&end=${end}`,
  );
  return res.data;
}

export async function getUsageForecast(days: number = 30): Promise<ForecastPoint[]> {
  const res = await client.get<{ data: ForecastPoint[] }>(`/dashboard/usage-forecast?days=${days}`);
  return res.data;
}

export async function getAgentPerformance(
  start: string,
  end: string,
): Promise<AgentPerformanceRow[]> {
  const res = await client.get<{ data: AgentPerformanceRow[] }>(
    `/dashboard/agent-performance?start=${start}&end=${end}`,
  );
  return res.data;
}
