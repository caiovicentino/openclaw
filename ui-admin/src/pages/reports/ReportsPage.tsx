import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, DollarSign, ShieldCheck, ArrowUpDown } from "lucide-react";
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { UsageGroupBy } from "@/api/reports";
import type { DateRange, UsageReportUser, CostReportModel } from "@/api/types";
import { getUsageReport, getCostReport, getComplianceReport } from "@/api/reports";
import BarChart from "@/components/BarChart";
import PieChart from "@/components/PieChart";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ---------- types ---------- */

type Period = "7d" | "30d" | "90d" | "custom";
type Tab = "usage" | "cost" | "compliance";
type SortDir = "asc" | "desc";

/* ---------- helpers ---------- */

function periodToDateRange(period: Period, customFrom: string, customTo: string): DateRange {
  if (period === "custom") {
    return { startDate: customFrom || undefined, endDate: customTo || undefined };
  }
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/* ---------- component ---------- */

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState<Tab>("usage");
  const [groupBy, setGroupBy] = useState<UsageGroupBy>("user");
  const [sortCol, setSortCol] = useState("totalTokens");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const dateRange = useMemo(
    () => periodToDateRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  /* ----- queries ----- */
  const usage = useQuery({
    queryKey: ["reports", "usage", dateRange, groupBy],
    queryFn: () => getUsageReport(dateRange, groupBy),
    enabled: tab === "usage",
  });

  const cost = useQuery({
    queryKey: ["reports", "cost", dateRange],
    queryFn: () => getCostReport(dateRange),
    enabled: tab === "cost",
  });

  const compliance = useQuery({
    queryKey: ["reports", "compliance", dateRange],
    queryFn: () => getComplianceReport(dateRange),
    enabled: tab === "compliance",
  });

  /* ----- sorting helper ----- */
  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  function sorted<T extends Record<string, unknown>>(rows: T[] | undefined): T[] {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }

  /* ----- derive usage table rows from backend data ----- */
  const usageRows = useMemo(() => {
    const d = usage.data;
    if (!d) return [];
    if (groupBy === "department" && d.byDepartment) {
      return d.byDepartment.map((dept) => ({
        name: dept.department,
        department: dept.department,
        sessions: dept.uniqueUsers,
        tokensIn: dept.tokensInput,
        tokensOut: dept.tokensOutput,
        totalTokens: dept.tokensInput + dept.tokensOutput,
      }));
    }
    if (d.topUsers) {
      return d.topUsers.map((u) => ({
        name: u.name,
        department: u.department ?? "N/A",
        sessions: u.sessionCount,
        tokensIn: u.tokensInput,
        tokensOut: u.tokensOutput,
        totalTokens: u.tokensInput + u.tokensOutput,
      }));
    }
    return [];
  }, [usage.data, groupBy]);

  /* ----- derive usage chart data ----- */
  const usageChartData = useMemo(() => {
    return usageRows.map((r) => ({
      name: r.name,
      totalTokens: r.totalTokens,
    }));
  }, [usageRows]);

  /* ----- CSV export ----- */
  function exportCsv() {
    const rows = sorted(usageRows);
    if (!rows.length) return;
    const header = ["Name", "Department", "Sessions", "Tokens In", "Tokens Out", "Total Tokens"];
    const csv = [
      header.join(","),
      ...rows.map((r) => {
        const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
        return `${esc(r.name)},${esc(r.department)},${r.sessions},${r.tokensIn},${r.tokensOut},${r.totalTokens}`;
      }),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "usage_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ----- derive cost pie chart data ----- */
  const costPieData = useMemo(() => {
    if (!cost.data?.byModel) return [];
    return cost.data.byModel.map((m) => ({
      name: `${m.provider} / ${m.model}`,
      value: m.costUsd,
    }));
  }, [cost.data]);

  /* ----- derive compliance chart data ----- */
  const violationsByType = useMemo(() => {
    if (!compliance.data?.violations?.last30Days) return [];
    return Object.entries(compliance.data.violations.last30Days).map(([type, count]) => ({
      type,
      count,
    }));
  }, [compliance.data]);

  /* ----- period selector ----- */
  const periods: { label: string; value: Period }[] = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
    { label: "Custom", value: "custom" },
  ];

  const tabs: { label: string; value: Tab }[] = [
    { label: "Usage Report", value: "usage" },
    { label: "Cost Report", value: "cost" },
    { label: "Compliance Report", value: "compliance" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">Usage, cost, and compliance analytics</p>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {periods.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={period === p.value ? "default" : "outline"}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-36"
            />
            <span className="text-gray-400">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-36"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ====== Usage Tab ====== */}
      {tab === "usage" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Group by:</span>
              <Button
                size="sm"
                variant={groupBy === "user" ? "default" : "outline"}
                onClick={() => setGroupBy("user")}
              >
                User
              </Button>
              <Button
                size="sm"
                variant={groupBy === "department" ? "default" : "outline"}
                onClick={() => setGroupBy("department")}
              >
                Department
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Tokens Used per {groupBy === "user" ? "User" : "Department"}
            </h3>
            <BarChart
              data={usageChartData}
              bars={[{ dataKey: "totalTokens", color: "#6366f1", name: "Total Tokens" }]}
              xAxisKey="name"
              height={280}
            />
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  {[
                    { key: "name", label: "Name" },
                    { key: "department", label: "Department" },
                    { key: "sessions", label: groupBy === "department" ? "Users" : "Sessions" },
                    { key: "tokensIn", label: "Tokens In" },
                    { key: "tokensOut", label: "Tokens Out" },
                    { key: "totalTokens", label: "Total Tokens" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      className="cursor-pointer select-none px-4 py-3 font-medium hover:text-gray-900"
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="h-3 w-3" />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted(usageRows)?.map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name as string}</td>
                    <td className="px-4 py-3 text-gray-600">{row.department as string}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {(row.sessions as number).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(row.tokensIn as number).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(row.tokensOut as number).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {(row.totalTokens as number).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {usage.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ====== Cost Tab ====== */}
      {tab === "cost" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={DollarSign}
              title="Total Cost"
              value={
                cost.data?.totalCostUsd != null
                  ? `$${cost.data.totalCostUsd.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}`
                  : "--"
              }
              iconColor="text-green-600"
              iconBg="bg-green-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Cost by AI Model</h3>
              <PieChart data={costPieData} height={280} />
            </Card>

            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Daily Cost Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cost.data?.dailyCost ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="costUsd"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Model breakdown table */}
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Requests</th>
                  <th className="px-4 py-3 font-medium">Tokens</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {(cost.data?.byModel ?? []).map((row: CostReportModel, i: number) => {
                  const totalCost = cost.data?.totalCostUsd ?? 0;
                  const pctTotal = totalCost > 0 ? (row.costUsd / totalCost) * 100 : 0;
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.model}</td>
                      <td className="px-4 py-3 text-gray-600">{row.provider}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.requestCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {(row.tokensInput + row.tokensOutput).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-600">${row.costUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-600">{pctTotal.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Top 10 users by cost */}
          <Card className="overflow-x-auto">
            <div className="px-4 pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Top 10 Users by Cost</h3>
            </div>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(cost.data?.topUsersByCost ?? []).map((row: UsageReportUser, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 text-gray-600">{row.department ?? "N/A"}</td>
                    <td className="px-4 py-3 text-gray-600">${row.costUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ====== Compliance Tab ====== */}
      {tab === "compliance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={ShieldCheck}
              title="Violations (30d)"
              value={
                compliance.data?.violations != null
                  ? String(compliance.data.violations.total)
                  : "--"
              }
              iconColor="text-indigo-600"
              iconBg="bg-indigo-100"
            />
            <StatCard
              icon={BarChart3}
              title="Active Policies"
              value={
                compliance.data?.policies
                  ? `${compliance.data.policies.enabled} / ${compliance.data.policies.total}`
                  : "--"
              }
              iconColor="text-blue-600"
              iconBg="bg-blue-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Violations by Severity</h3>
              <BarChart
                data={violationsByType}
                bars={[{ dataKey: "count", color: "#ef4444", name: "Violations" }]}
                xAxisKey="type"
                height={260}
              />
            </Card>

            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">DSAR Requests by Status</h3>
              <PieChart
                data={
                  compliance.data?.dsar
                    ? Object.entries(compliance.data.dsar).map(([name, value]) => ({
                        name,
                        value,
                      }))
                    : []
                }
                height={260}
              />
            </Card>
          </div>

          {/* Policy type breakdown table */}
          <Card className="overflow-x-auto">
            <div className="px-4 pt-4">
              <h3 className="text-sm font-semibold text-gray-700">Policies by Type</h3>
            </div>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-medium">Policy Type</th>
                  <th className="px-4 py-3 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {compliance.data?.policies?.byType &&
                  Object.entries(compliance.data.policies.byType).map(([type, count], i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{type}</td>
                      <td className="px-4 py-3 text-gray-600">{count}</td>
                    </tr>
                  ))}
                {compliance.isLoading && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
