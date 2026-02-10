import { useQuery } from "@tanstack/react-query";
import { X, Copy, Clock, Globe, Monitor, User, Hash } from "lucide-react";
import type { AuditEvent } from "@/api/types";
import { getAuditEvent } from "@/api/audit";
import SeverityBadge, { type Severity } from "@/components/SeverityBadge";
import { Button } from "@/components/ui/button";

interface AuditEventDetailProps {
  eventId: string | null;
  onClose: () => void;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MetadataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-all text-sm">{typeof value === "string" ? value : value}</p>
      </div>
    </div>
  );
}

export default function AuditEventDetail({ eventId, onClose }: AuditEventDetailProps) {
  const { data: event, isLoading } = useQuery<AuditEvent>({
    queryKey: ["audit-event", eventId],
    queryFn: () => getAuditEvent(eventId!),
    enabled: !!eventId,
  });

  if (!eventId) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Event Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading || !event ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Summary */}
            <div className="border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={event.severity as Severity} />
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                  {event.action}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatTimestamp(event.createdAt)}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(event.id);
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy Event ID
                </Button>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{event.id}</span>
              </div>
            </div>

            {/* Metadata */}
            <div className="border-b px-6 py-4">
              <h3 className="mb-2 text-sm font-medium">Metadata</h3>
              <div className="divide-y">
                <MetadataRow icon={User} label="User" value={event.userName ?? "System"} />
                <MetadataRow icon={Hash} label="Resource" value={event.resource} />
                <MetadataRow icon={Globe} label="IP Address" value={event.ipAddress ?? "N/A"} />
                <MetadataRow icon={Monitor} label="User Agent" value={event.userAgent ?? "N/A"} />
                <MetadataRow icon={Clock} label="Resource ID" value={event.resourceId ?? "N/A"} />
              </div>
            </div>

            {/* Details */}
            {event.details && Object.keys(event.details).length > 0 && (
              <div className="border-b px-6 py-4">
                <h3 className="mb-2 text-sm font-medium">Details</h3>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              </div>
            )}

            {/* Raw JSON */}
            <div className="px-6 py-4">
              <h3 className="mb-2 text-sm font-medium">Raw Event Data</h3>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                {JSON.stringify(event, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
