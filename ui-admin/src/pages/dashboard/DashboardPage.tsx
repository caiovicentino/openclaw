import { useQuery } from "@tanstack/react-query";
import { Users, MessageSquare, Zap, DollarSign, AlertTriangle, GitCompare } from "lucide-react";
import { useState, useMemo } from "react";
import type { DashboardOverview } from "@/api/types";
import {
  getOverview,
  getUsage,
  getActiveUsers,
  getCostBreakdown,
  getSessionAnalytics,
  getUsageForecast,
  getAgentPerformance,
} from "@/api/dashboard";
import AgentPerformanceTable from "@/components/AgentPerformanceTable";
import ComparisonView from "@/components/ComparisonView";
import CostBreakdownChart from "@/components/CostBreakdownChart";
import DateRangePicker from "@/components/DateRangePicker";
import SessionAnalyticsChart from "@/components/SessionAnalyticsChart";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import UsageChart from "@/components/UsageChart";
import UsageForecastChart from "@/components/UsageForecastChart";

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

function StatCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-20" />
          <Skeleton className="mt-2 h-4 w-16" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-[320px] w-full" />
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card className="p-6">
      <Skeleton className="mb-4 h-6 w-40" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [usagePeriod, setUsagePeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [showComparison, setShowComparison] = useState(false);

  const defaultEnd = toDateStr(new Date());
  const defaultStart = toDateStr(new Date(Date.now() - 30 * 86400000));
  const [dateRange, setDateRange] = useState({ from: defaultStart, to: defaultEnd });

  const previousRange = useMemo(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const diffMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 86400000);
    const prevFrom = new Date(prevTo.getTime() - diffMs);
    return { from: toDateStr(prevFrom), to: toDateStr(prevTo) };
  }, [dateRange.from, dateRange.to]);

  const overviewQuery = useQuery<DashboardOverview>({
    queryKey: ["dashboard", "overview"],
    queryFn: getOverview,
    refetchInterval: 30_000,
  });

  const usageQuery = useQuery({
    queryKey: ["dashboard", "usage", usagePeriod],
    queryFn: () => getUsage(usagePeriod),
    refetchInterval: 30_000,
  });

  const activeUsersQuery = useQuery({
    queryKey: ["dashboard", "active-users"],
    queryFn: () => getActiveUsers("30d"),
    refetchInterval: 30_000,
  });

  const costBreakdownQuery = useQuery({
    queryKey: ["dashboard", "cost-breakdown", dateRange.from, dateRange.to],
    queryFn: () => getCostBreakdown(dateRange.from, dateRange.to),
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const previousCostQuery = useQuery({
    queryKey: ["dashboard", "cost-breakdown", previousRange.from, previousRange.to],
    queryFn: () => getCostBreakdown(previousRange.from, previousRange.to),
    enabled: showComparison && !!previousRange.from && !!previousRange.to,
  });

  const sessionAnalyticsQuery = useQuery({
    queryKey: ["dashboard", "session-analytics", dateRange.from, dateRange.to],
    queryFn: () => getSessionAnalytics(dateRange.from, dateRange.to),
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const forecastQuery = useQuery({
    queryKey: ["dashboard", "usage-forecast"],
    queryFn: () => getUsageForecast(30),
  });

  const agentPerfQuery = useQuery({
    queryKey: ["dashboard", "agent-performance", dateRange.from, dateRange.to],
    queryFn: () => getAgentPerformance(dateRange.from, dateRange.to),
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const overview = overviewQuery.data ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of your organization</p>
      </div>

      {/* Stat Cards */}
      {overviewQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : overviewQuery.isError ? (
        <Card className="p-6 text-center text-sm text-red-600">
          Failed to load overview data. Please try again later.
        </Card>
      ) : overview ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={Users}
            title="Active Users (24h)"
            value={overview.activeUsers24h.toLocaleString()}
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
          />
          <StatCard
            icon={MessageSquare}
            title="Total Sessions"
            value={overview.totalSessions.toLocaleString()}
            iconColor="text-green-600"
            iconBg="bg-green-100"
          />
          <StatCard
            icon={Zap}
            title="Tokens Used Today"
            value={formatCompact(overview.tokensUsedToday)}
            iconColor="text-purple-600"
            iconBg="bg-purple-100"
          />
          <StatCard
            icon={DollarSign}
            title="Cost Today"
            value={`$${overview.costToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            iconColor="text-orange-600"
            iconBg="bg-orange-100"
          />
          <StatCard
            icon={AlertTriangle}
            title="Violations (30d)"
            value={overview.complianceViolations.toLocaleString()}
            iconColor="text-red-600"
            iconBg="bg-red-100"
          />
        </div>
      ) : null}

      {/* Usage Chart */}
      {usageQuery.isLoading ? (
        <ChartSkeleton />
      ) : usageQuery.isError ? (
        <Card className="p-6 text-center text-sm text-red-600">Failed to load usage data.</Card>
      ) : usageQuery.data ? (
        <Card className="p-6">
          <UsageChart data={usageQuery.data} onPeriodChange={setUsagePeriod} />
        </Card>
      ) : null}

      {/* Bottom Row: Top Users + Activity Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Users Table */}
        {activeUsersQuery.isLoading ? (
          <TableSkeleton />
        ) : activeUsersQuery.isError ? (
          <Card className="p-6 text-center text-sm text-red-600">Failed to load active users.</Card>
        ) : activeUsersQuery.data ? (
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Top Users by Usage</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Department</th>
                    <th className="pb-3 text-right font-medium">Sessions</th>
                    <th className="pb-3 text-right font-medium">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeUsersQuery.data.length > 0 ? (
                    activeUsersQuery.data.map((user) => (
                      <tr key={user.userId}>
                        <td className="py-3 font-medium text-gray-900">{user.name}</td>
                        <td className="py-3 text-gray-500">{user.department ?? "-"}</td>
                        <td className="py-3 text-right text-gray-700">{user.sessionCount}</td>
                        <td className="py-3 text-right text-gray-700">
                          {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-gray-400">
                        No active users
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {/* Recent Activity */}
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">System Info</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Total Users</span>
              <span className="font-medium text-gray-900">{overview?.totalUsers ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Active Sessions</span>
              <span className="font-medium text-gray-900">{overview?.totalSessions ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Compliance Status</span>
              <span
                className={
                  (overview?.complianceViolations ?? 0) === 0
                    ? "font-medium text-emerald-600"
                    : "font-medium text-red-600"
                }
              >
                {(overview?.complianceViolations ?? 0) === 0
                  ? "Clean"
                  : `${overview?.complianceViolations} violation(s)`}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Analytics Section Header */}
      <div className="flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-500">Detailed breakdowns and forecasts</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={showComparison ? "default" : "outline"}
            size="sm"
            onClick={() => setShowComparison(!showComparison)}
            className="gap-2"
          >
            <GitCompare className="h-4 w-4" />
            Compare
          </Button>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Comparison View */}
      {showComparison && costBreakdownQuery.data && previousCostQuery.data && (
        <ComparisonView
          current={costBreakdownQuery.data}
          previous={previousCostQuery.data}
          currentLabel={`${dateRange.from} - ${dateRange.to}`}
          previousLabel={`${previousRange.from} - ${previousRange.to}`}
        />
      )}

      {/* Cost Breakdown */}
      {costBreakdownQuery.isLoading ? (
        <ChartSkeleton />
      ) : costBreakdownQuery.isError ? (
        <Card className="p-6 text-center text-sm text-red-600">Failed to load cost breakdown.</Card>
      ) : costBreakdownQuery.data ? (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-gray-900">Cost Breakdown</h3>
          <CostBreakdownChart data={costBreakdownQuery.data} />
        </div>
      ) : null}

      {/* Session Analytics */}
      {sessionAnalyticsQuery.isLoading ? (
        <ChartSkeleton />
      ) : sessionAnalyticsQuery.isError ? (
        <Card className="p-6 text-center text-sm text-red-600">
          Failed to load session analytics.
        </Card>
      ) : sessionAnalyticsQuery.data ? (
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Session Analytics</h3>
          <SessionAnalyticsChart data={sessionAnalyticsQuery.data} />
        </Card>
      ) : null}

      {/* Usage Forecast */}
      {forecastQuery.isLoading ? (
        <ChartSkeleton />
      ) : forecastQuery.isError ? (
        <Card className="p-6 text-center text-sm text-red-600">Failed to load usage forecast.</Card>
      ) : forecastQuery.data ? (
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Usage Forecast</h3>
          <p className="mb-4 text-sm text-gray-500">
            Actual daily cost with 7-day projection based on recent average
          </p>
          <UsageForecastChart data={forecastQuery.data} />
        </Card>
      ) : null}

      {/* Agent Performance */}
      {agentPerfQuery.isLoading ? (
        <TableSkeleton />
      ) : agentPerfQuery.isError ? (
        <Card className="p-6 text-center text-sm text-red-600">
          Failed to load agent performance.
        </Card>
      ) : agentPerfQuery.data ? (
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Agent Performance</h3>
          <AgentPerformanceTable data={agentPerfQuery.data} />
        </Card>
      ) : null}
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
