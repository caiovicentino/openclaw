import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { getAlerts, acknowledgeAlert } from "@/api/audit";
import { Button } from "@/components/ui/button";

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AuditAlerts() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-alerts"],
    queryFn: () => getAlerts({ limit: 50 }),
    refetchInterval: 15_000,
  });

  const ackMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alerts"] });
    },
  });

  const alerts = data?.entries ?? [];
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Triggered Alerts</h3>
        {unacknowledgedCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {unacknowledgedCount} unacknowledged
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No triggered alerts.</div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                alert.acknowledged
                  ? "bg-card opacity-60"
                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40"
              }`}
            >
              <Bell
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                  alert.acknowledged ? "text-muted-foreground" : "text-red-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{alert.ruleName ?? "Alert"}</span>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(alert.triggeredAt)}
                  </span>
                </div>
                {alert.details && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {(alert.details as Record<string, unknown>).action ? (
                      <span className="font-mono">
                        {String((alert.details as Record<string, unknown>).action)}
                      </span>
                    ) : null}
                  </div>
                )}
                {alert.acknowledged && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Acknowledged {alert.acknowledgedAt ? relativeTime(alert.acknowledgedAt) : ""}
                  </div>
                )}
              </div>
              {!alert.acknowledged && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => ackMutation.mutate(alert.id)}
                  disabled={ackMutation.isPending}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Ack
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
