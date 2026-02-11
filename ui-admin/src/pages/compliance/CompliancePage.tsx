import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type PaginationState,
} from "@tanstack/react-table";
import { ShieldCheck, Plus, AlertTriangle } from "lucide-react";
import { useState } from "react";
import type { CompliancePolicyView } from "@/api/types";
import { getPolicies, getViolations } from "@/api/compliance";
import SeverityBadge, { type Severity } from "@/components/SeverityBadge";
import { Button } from "@/components/ui/button";
import PolicyEditorDialog from "@/pages/compliance/PolicyEditorDialog";

type PolicyType = "data_retention" | "rate_limit" | "content_filter" | "access_control" | "audit";

interface ComplianceViolation {
  id: string;
  timestamp: string;
  userName: string;
  policyName: string;
  severity: string;
  details: string;
  actionTaken: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeColors: Record<PolicyType, string> = {
  data_retention: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  rate_limit: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  content_filter: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  access_control: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  audit: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[type as PolicyType] ?? "bg-muted text-muted-foreground"}`}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 rounded-full ${active ? "bg-green-500" : "bg-gray-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Policies tab
// ---------------------------------------------------------------------------

const policyCol = createColumnHelper<CompliancePolicyView>();

const policyColumns = [
  policyCol.accessor("name", {
    header: "Policy Name",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  policyCol.accessor("type", {
    header: "Type",
    cell: (info) => <TypeBadge type={info.getValue()} />,
  }),
  policyCol.accessor("active", {
    header: "Status",
    cell: (info) => <StatusDot active={info.getValue()} />,
  }),
  policyCol.accessor("updatedAt", {
    header: "Last Updated",
    cell: (info) => {
      const d = new Date(info.getValue());
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    },
  }),
];

function PoliciesTab() {
  const [editorPolicy, setEditorPolicy] = useState<CompliancePolicyView | null | "new">(null);

  const { data, isLoading } = useQuery({
    queryKey: ["compliance-policies"],
    queryFn: () => getPolicies(),
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns: policyColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data?.items.length ?? 0} policies</p>
        <Button size="sm" onClick={() => setEditorPolicy("new")}>
          <Plus className="mr-1 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      <div className="rounded-md border">
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
                  colSpan={policyColumns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  Loading policies...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={policyColumns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  No policies configured yet.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b transition-colors hover:bg-muted/40"
                  onClick={() => setEditorPolicy(row.original)}
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

      {editorPolicy !== null && (
        <PolicyEditorDialog
          policy={editorPolicy === "new" ? null : editorPolicy}
          onClose={() => setEditorPolicy(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Violations tab
// ---------------------------------------------------------------------------

const violationCol = createColumnHelper<ComplianceViolation>();

const violationColumns = [
  violationCol.accessor("timestamp", {
    header: "Timestamp",
    cell: (info) => {
      const d = new Date(info.getValue());
      return (
        <span title={d.toISOString()}>
          {d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      );
    },
  }),
  violationCol.accessor("userName", {
    header: "User",
    cell: (info) => info.getValue() ?? "System",
  }),
  violationCol.accessor("policyName", {
    header: "Policy Violated",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  violationCol.accessor("severity", {
    header: "Severity",
    cell: (info) => <SeverityBadge severity={info.getValue() as Severity} />,
  }),
  violationCol.accessor("details", {
    header: "Details",
    cell: (info) => <span className="line-clamp-1 max-w-[200px]">{info.getValue()}</span>,
  }),
  violationCol.accessor("actionTaken", {
    header: "Action",
    cell: (info) => <span className="rounded bg-muted px-2 py-0.5 text-xs">{info.getValue()}</span>,
  }),
];

function ViolationsTab() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [policyTypeFilter, setPolicyTypeFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: [
      "compliance-violations",
      pagination.pageIndex,
      pagination.pageSize,
      severityFilter,
      policyTypeFilter,
    ],
    queryFn: () =>
      getViolations({
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        severity: (severityFilter || undefined) as
          | "low"
          | "medium"
          | "high"
          | "critical"
          | undefined,
        policyType: policyTypeFilter || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns: violationColumns,
    pageCount: data?.totalPages ?? -1,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
          <option value="">All Severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
        <select
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          value={policyTypeFilter}
          onChange={(e) => {
            setPolicyTypeFilter(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
          <option value="">All Policy Types</option>
          <option value="data_retention">Data Retention</option>
          <option value="rate_limit">Rate Limit</option>
          <option value="content_filter">Content Filter</option>
          <option value="access_control">Access Control</option>
          <option value="audit">Audit</option>
        </select>
      </div>

      <div className="rounded-md border">
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
                  colSpan={violationColumns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  Loading violations...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={violationColumns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  No violations found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b transition-colors hover:bg-muted/40">
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

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pagination.pageIndex + 1} of {data.totalPages} ({data.total} violations)
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
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = "policies" | "violations";

export default function CompliancePage() {
  const [tab, setTab] = useState<Tab>("policies");

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Manage policies and monitor violations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(
          [
            { key: "policies", label: "Policies", icon: ShieldCheck },
            { key: "violations", label: "Violations", icon: AlertTriangle },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "policies" && <PoliciesTab />}
      {tab === "violations" && <ViolationsTab />}
    </div>
  );
}
