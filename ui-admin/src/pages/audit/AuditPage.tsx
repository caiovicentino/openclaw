import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type PaginationState,
} from "@tanstack/react-table";
import {
  ScrollText,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  User,
  Shield,
  Bot,
  Settings,
  ShieldCheck,
  Activity,
  X,
  Radio,
  Clock,
  Bell,
  Table2,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import type { AuditEvent, AuditFilters } from "@/api/types";
import { getAuditLogs, getAuditStats, exportAuditLogs } from "@/api/audit";
import AuditAlertRules from "@/components/AuditAlertRules";
import AuditAlerts from "@/components/AuditAlerts";
import AuditEventDetail from "@/components/AuditEventDetail";
import AuditTimeline from "@/components/AuditTimeline";
import SeverityBadge, { type Severity } from "@/components/SeverityBadge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const actionCategoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  auth: Shield,
  user: User,
  agent: Bot,
  config: Settings,
  compliance: ShieldCheck,
};

function getActionIcon(action: string) {
  const category = action.split(".")[0] ?? "";
  return actionCategoryIcons[category] ?? Activity;
}

function ActionBadge({ action }: { action: string }) {
  const Icon = getActionIcon(action);
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono">
      <Icon className="h-3 w-3" />
      {action}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action type options for filter
// ---------------------------------------------------------------------------

const actionCategories = [
  { value: "auth.*", label: "Authentication (auth.*)" },
  { value: "user.*", label: "User (user.*)" },
  { value: "agent.*", label: "Agent (agent.*)" },
  { value: "config.*", label: "Config (config.*)" },
  { value: "compliance.*", label: "Compliance (compliance.*)" },
];

const severityOptions: Severity[] = ["info", "warning", "error", "critical"];

// ---------------------------------------------------------------------------
// Stats cards
// ---------------------------------------------------------------------------

function StatsCards() {
  const { data } = useQuery({
    queryKey: ["audit-stats"],
    queryFn: () => getAuditStats(),
    refetchInterval: 30_000,
  });

  const cards = [
    { label: "Total Events", value: data?.totalEvents ?? "--", icon: ScrollText },
    {
      label: "Top Actions",
      value: data?.eventsByAction ? Object.keys(data.eventsByAction).length : "--",
      icon: Activity,
    },
    {
      label: "Resources",
      value: data?.eventsByResource ? Object.keys(data.eventsByResource).length : "--",
      icon: Shield,
    },
    { label: "Top Users", value: data?.topUsers?.length ?? "--", icon: ShieldCheck },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <card.icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-2xl font-semibold leading-none">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export dialog
// ---------------------------------------------------------------------------

function ExportDialog({ onClose, filters }: { onClose: () => void; filters: Filters }) {
  const [format, setFormat] = useState<"csv" | "json" | "ndjson">("csv");
  const [scope, setScope] = useState<"filtered" | "all">("filtered");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportFilters: AuditFilters =
        scope === "filtered"
          ? {
              search: filters.search || undefined,
              userId: filters.user || undefined,
              action: filters.actions.length > 0 ? filters.actions.join(",") : undefined,
              severity: filters.severities.length > 0 ? filters.severities.join(",") : undefined,
              startDate: filters.dateFrom || undefined,
              endDate: filters.dateTo || undefined,
            }
          : {};
      const blob = await exportAuditLogs(exportFilters, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log.${format === "ndjson" ? "ndjson" : format}`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Export Audit Log</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Format</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "json" | "ndjson")}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="ndjson">NDJSON</option>
            </select>
          </label>

          <fieldset className="text-sm">
            <legend className="mb-1 block font-medium">Scope</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "filtered"}
                  onChange={() => setScope("filtered")}
                />
                Filtered only
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All events
              </label>
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Download"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

interface Filters {
  search: string;
  user: string;
  actions: string[];
  severities: string[];
  dateFrom: string;
  dateTo: string;
}

const emptyFilters: Filters = {
  search: "",
  user: "",
  actions: [],
  severities: [],
  dateFrom: "",
  dateTo: "",
};

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [expanded, setExpanded] = useState(false);

  const toggleArray = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const hasActiveFilters =
    filters.search ||
    filters.user ||
    filters.actions.length > 0 ||
    filters.severities.length > 0 ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      {/* Search + toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
          <Filter className="mr-1 h-4 w-4" />
          Advanced Filters
          {expanded ? (
            <ChevronUp className="ml-1 h-3 w-3" />
          ) : (
            <ChevronDown className="ml-1 h-3 w-3" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* User filter */}
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">User</span>
            <input
              type="text"
              placeholder="Filter by user"
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              value={filters.user}
              onChange={(e) => onChange({ ...filters, user: e.target.value })}
            />
          </label>

          {/* Action type */}
          <fieldset className="text-sm">
            <legend className="mb-1 text-muted-foreground">Action Type</legend>
            <div className="flex flex-wrap gap-2">
              {actionCategories.map((cat) => (
                <label key={cat.value} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="rounded border"
                    checked={filters.actions.includes(cat.value)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        actions: toggleArray(filters.actions, cat.value),
                      })
                    }
                  />
                  {cat.label.split(" (")[0]}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Severity */}
          <fieldset className="text-sm">
            <legend className="mb-1 text-muted-foreground">Severity</legend>
            <div className="flex flex-wrap gap-2">
              {severityOptions.map((sev) => (
                <label key={sev} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="rounded border"
                    checked={filters.severities.includes(sev)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        severities: toggleArray(filters.severities, sev),
                      })
                    }
                  />
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Date range */}
          <div className="space-y-2 text-sm">
            <label className="block">
              <span className="mb-1 block text-muted-foreground">From</span>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                value={filters.dateFrom}
                onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">To</span>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                value={filters.dateTo}
                onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
              />
            </label>
          </div>

          {/* Actions */}
          <div className="col-span-full flex gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit table
// ---------------------------------------------------------------------------

const auditCol = createColumnHelper<AuditEvent>();

const auditColumns = [
  auditCol.accessor("createdAt", {
    header: "Timestamp",
    cell: (info) => {
      const ts = info.getValue();
      return (
        <span title={new Date(ts).toISOString()} className="whitespace-nowrap text-xs">
          {relativeTime(ts)}
        </span>
      );
    },
    size: 100,
  }),
  auditCol.accessor("userName", {
    header: "User",
    cell: (info) => {
      const name = info.getValue();
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {name ? name.charAt(0).toUpperCase() : "S"}
          </span>
          {name ?? "System"}
        </span>
      );
    },
    size: 140,
  }),
  auditCol.accessor("action", {
    header: "Action",
    cell: (info) => <ActionBadge action={info.getValue()} />,
    size: 180,
  }),
  auditCol.accessor("resource", {
    header: "Resource",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
    size: 160,
  }),
  auditCol.accessor("severity", {
    header: "Severity",
    cell: (info) => <SeverityBadge severity={info.getValue() as Severity} />,
    size: 100,
  }),
  auditCol.accessor("ipAddress", {
    header: "IP Address",
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground">{info.getValue() ?? "N/A"}</span>
    ),
    size: 120,
  }),
  auditCol.accessor("details", {
    header: "Details",
    cell: (info) => {
      const val = info.getValue();
      const text = val && Object.keys(val).length > 0 ? JSON.stringify(val) : "--";
      return (
        <span className="line-clamp-1 max-w-[180px] text-xs text-muted-foreground">{text}</span>
      );
    },
    size: 200,
  }),
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ViewTab = "table" | "timeline" | "alerts";

export default function AuditPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("table");
  const [liveMode, setLiveMode] = useState(false);
  const [liveEvents, setLiveEvents] = useState<AuditEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE live stream
  useEffect(() => {
    if (!liveMode) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const token = localStorage.getItem("access_token");
    const url = `/api/v1/audit/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "ping") return;
        setLiveEvents((prev) => [parsed, ...prev].slice(0, 100));
        // Refresh the main query to keep table in sync
        queryClient.invalidateQueries({ queryKey: ["audit-events"] });
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [liveMode, queryClient]);

  const handleFilterChange = useCallback((f: Filters) => {
    setFilters(f);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-events", pagination.pageIndex, pagination.pageSize, filters],
    queryFn: () =>
      getAuditLogs({
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
        search: filters.search || undefined,
        userId: filters.user || undefined,
        action: filters.actions.length > 0 ? filters.actions.join(",") : undefined,
        severity: filters.severities.length > 0 ? filters.severities.join(",") : undefined,
        startDate: filters.dateFrom || undefined,
        endDate: filters.dateTo || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const pageCount = data ? Math.ceil(data.total / pagination.pageSize) : -1;

  const table = useReactTable({
    data: data?.data ?? [],
    columns: auditColumns,
    pageCount,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  const showingFrom = pagination.pageIndex * pagination.pageSize + 1;
  const showingTo = Math.min((pagination.pageIndex + 1) * pagination.pageSize, data?.total ?? 0);

  const tabItems: {
    key: ViewTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { key: "table", label: "Table", icon: Table2 },
    { key: "timeline", label: "Timeline", icon: Clock },
    { key: "alerts", label: "Alerts", icon: Bell },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Complete activity trail</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={liveMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setLiveMode(!liveMode);
              if (!liveMode) setLiveEvents([]);
            }}
          >
            <Radio className={`mr-1 h-4 w-4 ${liveMode ? "animate-pulse" : ""}`} />
            {liveMode ? "Live" : "Go Live"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Live events banner */}
      {liveMode && liveEvents.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-950/20">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <Radio className="h-3 w-3 animate-pulse" />
            {liveEvents.length} live event{liveEvents.length !== 1 ? "s" : ""} received
          </div>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {liveEvents.slice(0, 5).map((ev, i) => (
              <div
                key={`live-${i}`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span className="font-mono">{ev.action}</span>
                <span>--</span>
                <span>{ev.actorId ?? "system"}</span>
              </div>
            ))}
            {liveEvents.length > 5 && (
              <div className="text-xs text-muted-foreground">
                ...and {liveEvents.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <StatsCards />

      {/* View tabs */}
      <div className="flex items-center gap-1 border-b">
        {tabItems.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setViewTab(tab.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              viewTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters (shown for table and timeline) */}
      {viewTab !== "alerts" && <FilterBar filters={filters} onChange={handleFilterChange} />}

      {/* Table view */}
      {viewTab === "table" && (
        <>
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b bg-muted/50">
                      {hg.headers.map((h) => (
                        <th
                          key={h.id}
                          className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={auditColumns.length}
                        className="py-16 text-center text-muted-foreground"
                      >
                        <div className="inline-flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          Loading events...
                        </div>
                      </td>
                    </tr>
                  ) : table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={auditColumns.length}
                        className="py-16 text-center text-muted-foreground"
                      >
                        No audit events found.
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b transition-colors hover:bg-muted/40"
                        onClick={() => setSelectedEventId(row.original.id)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data && data.total > 0
                ? `Showing ${showingFrom}-${showingTo} of ${data.total} events`
                : "No events"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Timeline view */}
      {viewTab === "timeline" && <AuditTimeline events={data?.data ?? []} />}

      {/* Alerts view */}
      {viewTab === "alerts" && (
        <div className="space-y-6">
          <AuditAlerts />
          <AuditAlertRules />
        </div>
      )}

      {/* Event detail drawer */}
      <AuditEventDetail eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />

      {/* Export dialog */}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} filters={filters} />}
    </div>
  );
}
