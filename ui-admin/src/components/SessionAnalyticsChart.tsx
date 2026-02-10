import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SessionAnalyticsPoint } from "@/api/types";

interface SessionAnalyticsChartProps {
  data: SessionAnalyticsPoint[];
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export default function SessionAnalyticsChart({ data }: SessionAnalyticsChartProps) {
  const chartData = data.map((d) => ({
    date: d.date,
    sessions: Number(d.session_count),
    avgTokens: Math.round(Number(d.avg_tokens_per_request)),
    requests: Number(d.total_requests),
  }));

  if (chartData.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-400">No session data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sessionsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={formatNumber}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatNumber}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value: number, name: string) => [
            formatNumber(value),
            name === "sessions" ? "Sessions" : name === "requests" ? "Requests" : "Avg Tokens",
          ]}
        />
        <Legend />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="sessions"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#sessionsGradient)"
          name="Sessions"
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="requests"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#requestsGradient)"
          name="Requests"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
