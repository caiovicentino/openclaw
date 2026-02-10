import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { CostBreakdownResponse } from "@/api/types";
import { Card } from "@/components/ui/card";

interface ComparisonViewProps {
  current: CostBreakdownResponse;
  previous: CostBreakdownResponse;
  currentLabel: string;
  previousLabel: string;
}

function sumCost(data: CostBreakdownResponse): number {
  return data.byModel.reduce((sum, m) => sum + Number(m.total_cost), 0);
}

function sumRequests(data: CostBreakdownResponse): number {
  return data.byModel.reduce((sum, m) => sum + Number(m.request_count), 0);
}

function sumTokens(data: CostBreakdownResponse): number {
  return data.byModel.reduce((sum, m) => sum + Number(m.total_input) + Number(m.total_output), 0);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

interface CompareCardProps {
  title: string;
  currentValue: string;
  previousValue: string;
  change: number | null;
  invertColor?: boolean;
}

function CompareCard({
  title,
  currentValue,
  previousValue,
  change,
  invertColor,
}: CompareCardProps) {
  const isPositive = change !== null && change > 0;
  const isNegative = change !== null && change < 0;
  const colorUp = invertColor ? "text-red-600" : "text-green-600";
  const colorDown = invertColor ? "text-green-600" : "text-red-600";

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{currentValue}</p>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-gray-400">vs {previousValue}</span>
        {change !== null ? (
          <span
            className={`flex items-center gap-0.5 font-medium ${isPositive ? colorUp : isNegative ? colorDown : "text-gray-400"}`}
          >
            {isPositive ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : isNegative ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : (
          <span className="text-gray-400">--</span>
        )}
      </div>
    </Card>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export default function ComparisonView({
  current,
  previous,
  currentLabel,
  previousLabel,
}: ComparisonViewProps) {
  const curCost = sumCost(current);
  const prevCost = sumCost(previous);
  const curReqs = sumRequests(current);
  const prevReqs = sumRequests(previous);
  const curTokens = sumTokens(current);
  const prevTokens = sumTokens(previous);

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        Comparing <span className="font-medium text-gray-700">{currentLabel}</span> vs{" "}
        <span className="font-medium text-gray-700">{previousLabel}</span>
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CompareCard
          title="Total Cost"
          currentValue={`$${curCost.toFixed(2)}`}
          previousValue={`$${prevCost.toFixed(2)}`}
          change={pctChange(curCost, prevCost)}
          invertColor
        />
        <CompareCard
          title="Total Requests"
          currentValue={curReqs.toLocaleString()}
          previousValue={prevReqs.toLocaleString()}
          change={pctChange(curReqs, prevReqs)}
        />
        <CompareCard
          title="Total Tokens"
          currentValue={formatCompact(curTokens)}
          previousValue={formatCompact(prevTokens)}
          change={pctChange(curTokens, prevTokens)}
        />
      </div>
    </div>
  );
}
