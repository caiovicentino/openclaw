import type { AgentPerformanceRow } from "@/api/types";

interface AgentPerformanceTableProps {
  data: AgentPerformanceRow[];
}

function formatTokens(value: number): string {
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AgentPerformanceTable({ data }: AgentPerformanceTableProps) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No agent data</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="pb-3 font-medium">Agent</th>
            <th className="pb-3 text-right font-medium">Requests</th>
            <th className="pb-3 text-right font-medium">Input Tokens</th>
            <th className="pb-3 text-right font-medium">Output Tokens</th>
            <th className="pb-3 text-right font-medium">Total Cost</th>
            <th className="pb-3 text-right font-medium">Avg Cost/Req</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => {
            const cost = Number(row.total_cost);
            const requests = Number(row.request_count);
            const avgCost = requests > 0 ? cost / requests : 0;

            return (
              <tr key={row.agent_id}>
                <td className="py-3 font-medium text-gray-900">
                  {row.agent_name ?? row.agent_id ?? "unknown"}
                </td>
                <td className="py-3 text-right text-gray-700">{requests.toLocaleString()}</td>
                <td className="py-3 text-right text-gray-700">
                  {formatTokens(Number(row.total_input))}
                </td>
                <td className="py-3 text-right text-gray-700">
                  {formatTokens(Number(row.total_output))}
                </td>
                <td className="py-3 text-right text-gray-700">${cost.toFixed(4)}</td>
                <td className="py-3 text-right text-gray-700">${avgCost.toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
