import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Loader2, Gauge } from "lucide-react";
import { useState } from "react";
import { client } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface RateLimit {
  id: string;
  tenantId: string;
  targetType: string;
  targetId: string | null;
  limitType: string;
  limitValue: number;
  warningThreshold: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  targetType: string;
  targetId: string;
  limitType: string;
  limitValue: string;
  warningThreshold: string;
  enabled: boolean;
}

const EMPTY_FORM: FormData = {
  targetType: "tenant",
  targetId: "",
  limitType: "tokens_per_day",
  limitValue: "",
  warningThreshold: "0.8",
  enabled: true,
};

const TARGET_TYPES = [
  { value: "tenant", label: "Tenant-wide" },
  { value: "user", label: "User" },
  { value: "agent", label: "Agent" },
];

const LIMIT_TYPES = [
  { value: "tokens_per_hour", label: "Tokens per Hour" },
  { value: "tokens_per_day", label: "Tokens per Day" },
  { value: "cost_per_day", label: "Cost per Day (USD)" },
  { value: "requests_per_minute", label: "Requests per Minute" },
];

const LIMIT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LIMIT_TYPES.map((t) => [t.value, t.label]),
);

function formatValue(limitType: string, value: number): string {
  if (limitType === "cost_per_day") return `$${value.toFixed(2)}`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function RateLimitsTab() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const { data: rateLimits = [], isLoading } = useQuery<RateLimit[]>({
    queryKey: ["rate-limits"],
    queryFn: async () => {
      const res = await client.get<{ rateLimits: RateLimit[] }>("/rate-limits");
      return res.rateLimits;
    },
  });

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => client.post("/rate-limits", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-limits"] });
      closeDialog();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      client.patch(`/rate-limits/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-limits"] });
      closeDialog();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => client.delete(`/rate-limits/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-limits"] });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(rl: RateLimit) {
    setEditingId(rl.id);
    setForm({
      targetType: rl.targetType,
      targetId: rl.targetId ?? "",
      limitType: rl.limitType,
      limitValue: String(rl.limitValue),
      warningThreshold: String(rl.warningThreshold),
      enabled: rl.enabled,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit() {
    const payload: Record<string, unknown> = {
      targetType: form.targetType,
      targetId: form.targetId || null,
      limitType: form.limitType,
      limitValue: Number(form.limitValue),
      warningThreshold: Number(form.warningThreshold),
      enabled: form.enabled,
    };

    if (editingId) {
      updateMut.mutate({ id: editingId, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <Gauge className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Rate Limits</h2>
            <p className="text-sm text-gray-500">
              Configure token and cost quotas per user, agent, or tenant
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Add Limit
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : rateLimits.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No rate limits configured. Click "Add Limit" to create one.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead>Limit Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Warning At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rateLimits.map((rl) => (
              <TableRow key={rl.id}>
                <TableCell>
                  <span className="font-medium capitalize">{rl.targetType}</span>
                  {rl.targetId && (
                    <span className="ml-1 text-xs text-gray-500">
                      ({rl.targetId.slice(0, 8)}...)
                    </span>
                  )}
                </TableCell>
                <TableCell>{LIMIT_TYPE_LABELS[rl.limitType] ?? rl.limitType}</TableCell>
                <TableCell>{formatValue(rl.limitType, rl.limitValue)}</TableCell>
                <TableCell>{Math.round(rl.warningThreshold * 100)}%</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      rl.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {rl.enabled ? "Active" : "Disabled"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(rl)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMut.mutate(rl.id)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Rate Limit" : "Create Rate Limit"}</DialogTitle>
            <DialogDescription>Set token or cost quotas to control usage.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Target Type</Label>
              <select
                value={form.targetType}
                onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {form.targetType !== "tenant" && (
              <div>
                <Label>{form.targetType === "user" ? "User ID" : "Agent ID"}</Label>
                <Input
                  value={form.targetId}
                  onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                  placeholder="UUID of the target"
                />
              </div>
            )}

            <div>
              <Label>Limit Type</Label>
              <select
                value={form.limitType}
                onChange={(e) => setForm((f) => ({ ...f, limitType: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {LIMIT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Limit Value</Label>
              <Input
                type="number"
                value={form.limitValue}
                onChange={(e) => setForm((f) => ({ ...f, limitValue: e.target.value }))}
                placeholder={form.limitType === "cost_per_day" ? "e.g. 10.00" : "e.g. 100000"}
              />
            </div>

            <div>
              <Label>Warning Threshold (0-1)</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={form.warningThreshold}
                onChange={(e) => setForm((f) => ({ ...f, warningThreshold: e.target.value }))}
              />
              <p className="mt-1 text-xs text-gray-400">
                Users see a warning when usage exceeds this percentage (e.g. 0.8 = 80%)
              </p>
            </div>

            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Enabled</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.enabled}
                onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                  form.enabled ? "bg-indigo-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                    form.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving || !form.limitValue}>
              {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
