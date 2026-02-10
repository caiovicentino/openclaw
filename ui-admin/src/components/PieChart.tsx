import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const DEFAULT_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

interface PieChartDatum {
  name: string;
  value: number;
}

interface PieChartProps {
  data: PieChartDatum[];
  colors?: string[];
  height?: number;
  showLabels?: boolean;
}

function renderLabel({ name, percent }: { name: string; percent: number }) {
  return `${name} ${(percent * 100).toFixed(0)}%`;
}

export default function PieChart({
  data,
  colors = DEFAULT_COLORS,
  height = 300,
  showLabels = true,
}: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={90}
          dataKey="value"
          nameKey="name"
          label={showLabels ? renderLabel : false}
          labelLine={showLabels}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={colors[idx % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => {
            const total = data.reduce((sum, d) => sum + d.value, 0);
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
            return [`${value.toLocaleString()} (${pct}%)`, name];
          }}
        />
        <Legend />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
