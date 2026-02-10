import type { AuditEvent } from "@/api/types";
import type { Severity } from "@/components/SeverityBadge";

const severityColors: Record<string, string> = {
  critical: "bg-red-500 border-red-600",
  error: "bg-red-400 border-red-500",
  warning: "bg-amber-400 border-amber-500",
  info: "bg-blue-400 border-blue-500",
};

const severityLineColors: Record<string, string> = {
  critical: "bg-red-200 dark:bg-red-900/40",
  error: "bg-red-200 dark:bg-red-900/40",
  warning: "bg-amber-200 dark:bg-amber-900/40",
  info: "bg-blue-200 dark:bg-blue-900/40",
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

interface AuditTimelineProps {
  events: AuditEvent[];
}

export default function AuditTimeline({ events }: AuditTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No events to display in timeline.
      </div>
    );
  }

  let lastDate = "";

  return (
    <div className="relative pl-8">
      {/* Vertical line */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

      {events.map((event) => {
        const date = formatDate(event.createdAt);
        const showDate = date !== lastDate;
        lastDate = date;
        const sev = (event.severity ?? "info") as Severity;
        const dotColor = severityColors[sev] ?? severityColors.info;
        const lineColor = severityLineColors[sev] ?? severityLineColors.info;

        return (
          <div key={event.id}>
            {showDate && (
              <div className="relative mb-2 mt-4 first:mt-0">
                <div className="absolute -left-5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                  {date.split(" ")[1]}
                </div>
                <span className="text-xs font-medium text-muted-foreground">{date}</span>
              </div>
            )}
            <div className="relative mb-3 flex items-start gap-3">
              {/* Dot */}
              <div
                className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full border-2 ${dotColor}`}
              />
              {/* Content */}
              <div className={`flex-1 rounded-lg border p-3 ${lineColor}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-xs font-mono">
                    {event.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(event.createdAt)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{event.userName ?? "System"}</span>
                  {event.resource && <span>{event.resource}</span>}
                  {event.ipAddress && <span className="font-mono">{event.ipAddress}</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
