import type { CostBreakdownResponse } from "@/api/types";
import BarChart from "@/components/BarChart";
import PieChart from "@/components/PieChart";
import { Card } from "@/components/ui/card";

interface CostBreakdownChartProps {
  data: CostBreakdownResponse;
}

export default function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  const modelPieData = data.byModel.map((m) => ({
    name: m.model_id ?? "unknown",
    value: Number(m.total_cost),
  }));

  const agentBarData = data.byAgent
    .filter((a) => Number(a.total_cost) > 0)
    .slice(0, 10)
    .map((a) => ({
      name: a.agent_name ?? a.agent_id ?? "unknown",
      cost: Number(Number(a.total_cost).toFixed(4)),
      requests: Number(a.request_count),
    }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Cost by Model</h3>
        {modelPieData.length > 0 ? (
          <PieChart data={modelPieData} height={280} />
        ) : (
          <p className="py-12 text-center text-sm text-gray-400">No data</p>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Cost by Agent</h3>
        {agentBarData.length > 0 ? (
          <BarChart
            data={agentBarData}
            bars={[{ dataKey: "cost", color: "#6366f1", name: "Cost (USD)" }]}
            xAxisKey="name"
            height={280}
          />
        ) : (
          <p className="py-12 text-center text-sm text-gray-400">No data</p>
        )}
      </Card>
    </div>
  );
}
