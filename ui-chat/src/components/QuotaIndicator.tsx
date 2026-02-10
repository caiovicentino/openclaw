import { useQuery } from "@tanstack/react-query";
import { client } from "@/api/client";

interface QuotaEntry {
  limitType: string;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  warning: boolean;
}

interface QuotaStatus {
  allowed: boolean;
  quotas: QuotaEntry[];
}

const LIMIT_LABELS: Record<string, string> = {
  tokens_per_hour: "Tokens/hr",
  tokens_per_day: "Tokens/day",
  cost_per_day: "Cost/day",
  requests_per_minute: "Req/min",
};

function formatValue(limitType: string, value: number): string {
  if (limitType === "cost_per_day") {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

export function QuotaIndicator() {
  const { data } = useQuery<QuotaStatus>({
    queryKey: ["quota-status"],
    queryFn: () => client.get<QuotaStatus>("/rate-limits/quota"),
    refetchInterval: 30_000,
    retry: false,
  });

  if (!data || data.quotas.length === 0) return null;

  // Show the most critical quota (highest usage percentage)
  const sorted = [...data.quotas].sort((a, b) => b.percentage - a.percentage);
  const top = sorted[0];
  if (!top) return null;

  const pct = Math.min(top.percentage * 100, 100);
  const label = LIMIT_LABELS[top.limitType] ?? top.limitType;

  let colorClass: string;
  if (pct >= 100) {
    colorClass = "bg-red-500";
  } else if (top.warning) {
    colorClass = "bg-amber-500";
  } else {
    colorClass = "bg-emerald-500";
  }

  let textColor: string;
  if (pct >= 100) {
    textColor = "text-red-600";
  } else if (top.warning) {
    textColor = "text-amber-600";
  } else {
    textColor = "text-muted-foreground";
  }

  return (
    <div
      className="flex items-center gap-2 text-xs"
      title={`${label}: ${formatValue(top.limitType, top.used)} / ${formatValue(top.limitType, top.limit)}`}
    >
      <span className={textColor}>
        {label}: {formatValue(top.limitType, top.remaining)} left
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
