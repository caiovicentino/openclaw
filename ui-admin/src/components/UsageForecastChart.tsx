import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ForecastPoint } from "@/api/types";

interface UsageForecastChartProps {
  data: ForecastPoint[];
}

export default function UsageForecastChart({ data }: UsageForecastChartProps) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-400">No forecast data</p>;
  }

  const actual = data.map((d) => ({
    date: d.date,
    cost: Number(Number(d.daily_cost).toFixed(4)),
  }));

  // Simple linear projection: use last 7 days average to project 7 more days
  const recentDays = actual.slice(-7);
  const avgDailyCost =
    recentDays.length > 0 ? recentDays.reduce((sum, d) => sum + d.cost, 0) / recentDays.length : 0;

  const lastDate = actual[actual.length - 1];
  const projected: Array<{ date: string; cost: number; projected: number }> = [];

  if (lastDate) {
    projected.push({ date: lastDate.date, cost: lastDate.cost, projected: lastDate.cost });
    for (let i = 1; i <= 7; i++) {
      const d = new Date(lastDate.date);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0] ?? "";
      projected.push({ date: dateStr, cost: 0, projected: Number(avgDailyCost.toFixed(4)) });
    }
  }

  const combined = [
    ...actual.map((d) => ({ ...d, projected: null as number | null })),
    ...projected
      .slice(1)
      .map((d) => ({ date: d.date, cost: null as number | null, projected: d.projected })),
  ];

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={combined} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          formatter={(value, name) => {
            const num = Number(value);
            if (value == null || isNaN(num)) return ["-", String(name)];
            return [`$${num.toFixed(4)}`, name === "cost" ? "Actual" : "Projected"];
          }}
        />
        <ReferenceLine x={todayStr} stroke="#9ca3af" strokeDasharray="3 3" label="Today" />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          name="Actual"
        />
        <Line
          type="monotone"
          dataKey="projected"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          connectNulls={false}
          name="Projected"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
