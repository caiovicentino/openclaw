import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Plus,
  Play,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  runScheduledTask,
  type ScheduledTask,
} from "@/api/scheduled-tasks";
import CronExpressionBuilder, { cronToHumanReadable } from "@/components/CronExpressionBuilder";
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

function statusIcon(status: string | null) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failure":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
  }
}

function statusBadge(status: string | null) {
  switch (status) {
    case "success":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Success</Badge>;
    case "failure":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
    case "running":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Running</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-500 border-gray-200">Never run</Badge>;
  }
}

export default function ScheduledTasksPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    name: "",
    task_type: "cleanup",
    cron_expression: "0 0 * * *",
    timezone: "UTC",
    description: "",
  });

  const tasksQuery = useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: () => getScheduledTasks({ limit: 100 }),
  });

  const createMut = useMutation({
    mutationFn: createScheduledTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      setShowCreate(false);
      setNewTask({
        name: "",
        task_type: "cleanup",
        cron_expression: "0 0 * * *",
        timezone: "UTC",
        description: "",
      });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateScheduledTask(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-tasks"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteScheduledTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      setDeleteId(null);
    },
  });

  const runMut = useMutation({
    mutationFn: runScheduledTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-tasks"] }),
  });

  const tasks = tasksQuery.data?.tasks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Tasks</h1>
          <p className="text-sm text-gray-500">Manage recurring tasks and view execution history</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New Task
        </Button>
      </div>

      {tasksQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No scheduled tasks</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a scheduled task to automate recurring operations.
          </p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create Task
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: ScheduledTask) => (
            <Card
              key={task.id}
              className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => navigate(`/scheduled-tasks/${task.id}`)}
            >
              <div className="flex items-center">{statusIcon(task.last_status)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{task.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {TASK_TYPES.find((t) => t.value === task.task_type)?.label ?? task.task_type}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                  <span>{cronToHumanReadable(task.cron_expression)}</span>
                  <span className="text-gray-300">|</span>
                  <span>TZ: {task.timezone}</span>
                  {task.last_run_at && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span>Last run: {new Date(task.last_run_at).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(task.last_status)}
                <Switch
                  checked={task.enabled}
                  onCheckedChange={(checked) => {
                    toggleMut.mutate({ id: task.id, enabled: checked });
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    runMut.mutate(task.id);
                  }}
                  disabled={runMut.isPending}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(task.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Scheduled Task</DialogTitle>
            <DialogDescription>Create a new recurring task with a cron schedule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={newTask.name}
                onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                placeholder="Task name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
            <div>
              <Label>Task Type</Label>
              <select
                value={newTask.task_type}
                onChange={(e) => setNewTask({ ...newTask, task_type: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <CronExpressionBuilder
              value={newTask.cron_expression}
              onChange={(v) => setNewTask({ ...newTask, cron_expression: v })}
            />
            <div>
              <Label>Timezone</Label>
              <select
                value={newTask.timezone}
                onChange={(e) => setNewTask({ ...newTask, timezone: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {[
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
                ].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate(newTask)}
              disabled={!newTask.name || !newTask.cron_expression || createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this scheduled task? This action cannot be undone. All
              execution history will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
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
