import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  Play,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  runScheduledTask,
  type TaskExecution,
} from "@/api/scheduled-tasks";
import CronExpressionBuilder from "@/components/CronExpressionBuilder";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";

const TASK_TYPES = [
  { value: "cleanup", label: "Cleanup" },
  { value: "report", label: "Report" },
  { value: "data_retention", label: "Data Retention" },
  { value: "agent_conversation", label: "Agent Conversation" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

export default function ScheduledTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    task_type: "cleanup",
    cron_expression: "0 0 * * *",
    timezone: "UTC",
    enabled: true,
  });

  const taskQuery = useQuery({
    queryKey: ["scheduled-task", id],
    queryFn: () => getScheduledTask(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (taskQuery.data) {
      setForm({
        name: taskQuery.data.name,
        description: taskQuery.data.description ?? "",
        task_type: taskQuery.data.task_type,
        cron_expression: taskQuery.data.cron_expression,
        timezone: taskQuery.data.timezone,
        enabled: taskQuery.data.enabled,
      });
      setDirty(false);
    }
  }, [taskQuery.data]);

  const updateMut = useMutation({
    mutationFn: (data: typeof form) => updateScheduledTask(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-task", id] });
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      setDirty(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteScheduledTask(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      navigate("/scheduled-tasks");
    },
  });

  const runMut = useMutation({
    mutationFn: () => runScheduledTask(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-task", id] });
    },
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  if (taskQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!taskQuery.data) {
    return <div className="py-12 text-center text-gray-500">Task not found.</div>;
  }

  const executions = taskQuery.data.executions ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/scheduled-tasks")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{taskQuery.data.name}</h1>
          <p className="text-sm text-gray-500">
            Created {new Date(taskQuery.data.created_at).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
          {runMut.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1 h-4 w-4" />
          )}
          Run Now
        </Button>
        <Button
          variant="outline"
          className="text-red-500 hover:text-red-700"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
      </div>

      {/* Edit Form */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Task Configuration</h2>
          <Button
            size="sm"
            onClick={() => updateMut.mutate(form)}
            disabled={!dirty || updateMut.isPending}
          >
            {updateMut.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
        {dirty && (
          <p className="mb-3 text-xs font-medium text-amber-600">You have unsaved changes.</p>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} />
            </div>
            <div>
              <Label>Task Type</Label>
              <select
                value={form.task_type}
                onChange={(e) => updateField("task_type", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Optional description"
            />
          </div>
          <CronExpressionBuilder
            value={form.cron_expression}
            onChange={(v) => updateField("cron_expression", v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Timezone</Label>
              <select
                value={form.timezone}
                onChange={(e) => updateField("timezone", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={(v) => updateField("enabled", v)} />
                <span className="text-sm text-gray-700">
                  {form.enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Execution History */}
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Execution History</h2>
        {executions.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            <Clock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            No executions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Completed</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {executions.map((exec: TaskExecution) => {
                  const start = new Date(exec.started_at);
                  const end = exec.completed_at ? new Date(exec.completed_at) : null;
                  const duration = end
                    ? `${((end.getTime() - start.getTime()) / 1000).toFixed(1)}s`
                    : "-";

                  return (
                    <tr key={exec.id} className="text-gray-700">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          {exec.status === "success" && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {exec.status === "failure" && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          {exec.status === "running" && (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          )}
                          {exec.status !== "success" &&
                            exec.status !== "failure" &&
                            exec.status !== "running" && (
                              <AlertCircle className="h-4 w-4 text-gray-400" />
                            )}
                          <Badge
                            className={
                              exec.status === "success"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : exec.status === "failure"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-blue-100 text-blue-700 border-blue-200"
                            }
                          >
                            {exec.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-xs">{start.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-xs">{end ? end.toLocaleString() : "-"}</td>
                      <td className="py-2 pr-4 text-xs">{duration}</td>
                      <td className="py-2 text-xs">
                        {exec.error_message ? (
                          <span className="text-red-600">{exec.error_message}</span>
                        ) : exec.result && Object.keys(exec.result).length > 0 ? (
                          <span className="text-gray-500">
                            {((exec.result as Record<string, unknown>).message as string) ??
                              JSON.stringify(exec.result)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{taskQuery.data.name}"? This action cannot be undone
              and all execution history will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
