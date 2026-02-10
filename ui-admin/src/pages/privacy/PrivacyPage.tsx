import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { client } from "@/api/client";
import DSARDialog, { type DSARRecord } from "@/components/DSARDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ---------- types ---------- */

type Tab = "dsar" | "consent" | "breaches";

interface ConsentRow {
  userId: string;
  userName: string;
  purpose: string;
  granted: boolean;
  grantedAt: string | null;
  updatedAt: string;
}

interface BreachRow {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  usersAffected: number;
  discoveredAt: string;
  notified: boolean;
  reportedToAuthority: boolean;
  reportDeadline: string;
}

/* ---------- data fetchers ---------- */

async function fetchDSARRequests(): Promise<DSARRecord[]> {
  try {
    const res = await client.get<any>("/privacy/dsar");
    const list: any[] = res?.requests ?? res?.data ?? (Array.isArray(res) ? res : []);
    return list.map((r: any) => ({
      id: r.id,
      userId: r.userId ?? r.user_id ?? "",
      userName: r.userName ?? r.user_name ?? r.userId ?? r.user_id ?? "",
      type: r.type ?? r.requestType ?? r.request_type ?? "access",
      status: mapDsarStatus(r.status),
      description: r.description ?? r.details?.description ?? "",
      createdAt: r.createdAt ?? r.requestedAt ?? r.requested_at ?? "",
      deadline: r.deadline ?? computeDeadline(r.requestedAt ?? r.requested_at ?? r.createdAt, 15),
      timeline: r.timeline ?? buildTimeline(r),
    }));
  } catch {
    return [];
  }
}

/** Map backend DSAR status names to frontend names */
function mapDsarStatus(s: string): DSARRecord["status"] {
  if (s === "in_progress") return "processing";
  if (s === "denied") return "rejected";
  if (s === "completed") return "completed";
  return "pending";
}

/** Compute a deadline date string from a start date + days offset */
function computeDeadline(startDate: string | undefined, days: number): string {
  if (!startDate) return new Date().toISOString();
  const d = new Date(startDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Build a minimal timeline from backend fields when no explicit timeline exists */
function buildTimeline(r: any): DSARRecord["timeline"] {
  const events: DSARRecord["timeline"] = [];
  const created = r.requestedAt ?? r.requested_at ?? r.createdAt;
  if (created) {
    events.push({ status: "pending", timestamp: created });
  }
  if (r.status === "in_progress" || r.status === "completed" || r.status === "denied") {
    events.push({ status: "processing", timestamp: created });
  }
  if (r.status === "completed" || r.status === "denied") {
    const completedAt = r.completedAt ?? r.completed_at ?? created;
    events.push({ status: mapDsarStatus(r.status), timestamp: completedAt });
  }
  return events;
}
async function fetchConsents(params?: { search?: string }): Promise<ConsentRow[]> {
  try {
    const q = params?.search ? `?search=${encodeURIComponent(params.search)}` : "";
    const res = await client.get<any>(`/privacy/consent${q}`);
    const list: any[] = res?.consents ?? res?.data ?? (Array.isArray(res) ? res : []);
    return list.map((r: any) => ({
      userId: r.userId ?? r.user_id ?? "",
      userName: r.userName ?? r.user_name ?? r.userId ?? r.user_id ?? "",
      purpose: r.purpose ?? "",
      granted: r.granted ?? false,
      grantedAt: r.grantedAt ?? r.granted_at ?? null,
      updatedAt: r.updatedAt ?? r.revokedAt ?? r.revoked_at ?? r.grantedAt ?? r.granted_at ?? "",
    }));
  } catch {
    return [];
  }
}
async function fetchBreaches(): Promise<BreachRow[]> {
  try {
    const res = await client.get<any>("/privacy/breaches");
    const list: any[] = res?.breaches ?? res?.data ?? (Array.isArray(res) ? res : []);
    return list.map((r: any) => ({
      id: r.id,
      description: r.description ?? r.title ?? "",
      severity: r.severity ?? "medium",
      usersAffected: r.usersAffected ?? r.affectedUsers ?? r.affected_users ?? 0,
      discoveredAt: r.discoveredAt ?? r.detectedAt ?? r.detected_at ?? "",
      notified: r.notified ?? r.notifiedAt != null,
      reportedToAuthority: r.reportedToAuthority ?? r.notifiedAt != null,
      reportDeadline:
        r.reportDeadline ?? computeDeadline(r.detectedAt ?? r.detected_at ?? r.discoveredAt, 3),
    }));
  } catch {
    return [];
  }
}

/* ---------- helpers ---------- */

const statusColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const severityColor: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-800",
};

function isOverdue(deadline: string, status: string): boolean {
  if (status === "completed" || status === "rejected") return false;
  return new Date(deadline) < new Date();
}

function hoursUntil(dateStr: string): number {
  return Math.max(0, Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60)));
}

/* ---------- page ---------- */

export default function PrivacyPage() {
  const [tab, setTab] = useState<Tab>("dsar");
  const [dsarOpen, setDsarOpen] = useState(false);
  const [selectedDsar, setSelectedDsar] = useState<DSARRecord | null>(null);
  const [consentSearch, setConsentSearch] = useState("");

  /* ---- queries ---- */
  const dsar = useQuery({
    queryKey: ["dsar"],
    queryFn: fetchDSARRequests,
    enabled: tab === "dsar",
  });

  const consents = useQuery({
    queryKey: ["consents", consentSearch],
    queryFn: () => fetchConsents({ search: consentSearch }),
    enabled: tab === "consent",
  });

  const breaches = useQuery({
    queryKey: ["breaches"],
    queryFn: fetchBreaches,
    enabled: tab === "breaches",
  });

  const tabs: { label: string; value: Tab }[] = [
    { label: "Data Requests (DSAR)", value: "dsar" },
    { label: "Consent Management", value: "consent" },
    { label: "Data Breaches", value: "breaches" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Privacy & LGPD</h1>
        <p className="text-sm text-gray-500">Data subject rights and consent management</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ====== DSAR Tab ====== */}
      {tab === "dsar" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedDsar(null);
                setDsarOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> New Request
            </Button>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-medium">Request ID</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(dsar.data ?? []).map((row: DSARRecord) => {
                  const overdue = isOverdue(row.deadline, row.status);
                  return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-b last:border-0 hover:bg-gray-50 ${
                        overdue ? "bg-red-50" : ""
                      }`}
                      onClick={() => {
                        setSelectedDsar(row);
                        setDsarOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.userName}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{row.type}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            statusColor[row.status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {row.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                          {row.status === "rejected" && <XCircle className="h-3 w-3" />}
                          {row.status === "pending" && <Clock className="h-3 w-3" />}
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={overdue ? "font-medium text-red-600" : "text-gray-500"}>
                          {new Date(row.deadline).toLocaleDateString()}
                          {overdue && <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDsar(row);
                            setDsarOpen(true);
                          }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {dsar.isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <DSARDialog open={dsarOpen} onClose={() => setDsarOpen(false)} record={selectedDsar} />
        </div>
      )}

      {/* ====== Consent Tab ====== */}
      {tab === "consent" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={consentSearch}
                onChange={(e) => setConsentSearch(e.target.value)}
                placeholder="Search by user..."
                className="pl-9"
              />
            </div>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Purpose</th>
                  <th className="px-4 py-3 font-medium">Granted</th>
                  <th className="px-4 py-3 font-medium">Granted At</th>
                  <th className="px-4 py-3 font-medium">Updated At</th>
                </tr>
              </thead>
              <tbody>
                {(consents.data ?? []).map((row: ConsentRow, i: number) => (
                  <tr
                    key={`${row.userId}-${row.purpose}-${i}`}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{row.userName}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {row.purpose.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.granted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          <XCircle className="h-3 w-3" /> No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.grantedAt ? new Date(row.grantedAt).toLocaleDateString() : "--"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(row.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {consents.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ====== Breaches Tab ====== */}
      {tab === "breaches" && (
        <div className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-medium">Breach ID</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Users Affected</th>
                  <th className="px-4 py-3 font-medium">Discovered</th>
                  <th className="px-4 py-3 font-medium">Notified</th>
                  <th className="px-4 py-3 font-medium">Reported to Authority</th>
                </tr>
              </thead>
              <tbody>
                {(breaches.data ?? []).map((row: BreachRow) => {
                  const hrsLeft = hoursUntil(row.reportDeadline);
                  const deadlineUrgent = !row.reportedToAuthority && hrsLeft <= 72;

                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.id}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-gray-900">
                        {row.description}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            severityColor[row.severity] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.usersAffected.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(row.discoveredAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {row.notified ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500">
                            <XCircle className="h-3.5 w-3.5" /> No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.reportedToAuthority ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                            <span className="text-red-500">No</span>
                            {deadlineUrgent && (
                              <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                                {hrsLeft}h left
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {breaches.isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
