import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UsageDataPoint {
  date: string;
  tokens: number;
  cost: number;
}

interface UsageChartProps {
  data: UsageDataPoint[];
  onPeriodChange?: (period: "7d" | "30d" | "90d") => void;
}

const periods = [
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function UsageChart({ data, onPeriodChange }: UsageChartProps) {
  const [activePeriod, setActivePeriod] = useState<"7d" | "30d" | "90d">("30d");

  function handlePeriodChange(period: "7d" | "30d" | "90d") {
    setActivePeriod(period);
    onPeriodChange?.(period);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Token Usage</h3>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={
                activePeriod === p.value
                  ? "rounded-md bg-white px-3 py-1 text-sm font-medium text-gray-900 shadow-sm"
                  : "rounded-md px-3 py-1 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
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
            tickFormatter={formatTokens}
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
              name === "tokens" ? formatTokens(value) : `$${value.toFixed(2)}`,
              name === "tokens" ? "Tokens" : "Cost",
            ]}
            labelFormatter={(label: string) => `Date: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="tokens"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#tokenGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
