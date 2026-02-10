import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { client } from "@/api/client";
import { createDsar } from "@/api/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Map frontend DSAR status names to backend equivalents */
function toBackendStatus(s: string): string {
  if (s === "processing") return "in_progress";
  if (s === "rejected") return "denied";
  return s;
}

const createDSAR = createDsar;
async function updateDSARStatus(id: string, status: string): Promise<any> {
  return client.patch(`/privacy/dsar/${id}`, { status: toBackendStatus(status) });
}

/* ---------- types ---------- */

interface StatusEvent {
  status: string;
  timestamp: string;
  note?: string;
}

export interface DSARRecord {
  id: string;
  userId: string;
  userName: string;
  type: "access" | "erasure" | "portability";
  status: "pending" | "processing" | "completed" | "rejected";
  description?: string;
  createdAt: string;
  deadline: string;
  timeline: StatusEvent[];
}

/* ---------- schemas ---------- */

const createSchema = z.object({
  userId: z.string().min(1, "User is required"),
  type: z.enum(["access", "erasure", "portability"]),
  description: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

/* ---------- helpers ---------- */

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-amber-500" />,
  processing: <Loader2 className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  rejected: <XCircle className="h-4 w-4 text-red-500" />,
};

/* ---------- component ---------- */

interface DSARDialogProps {
  open: boolean;
  onClose: () => void;
  record?: DSARRecord | null;
}

export default function DSARDialog({ open, onClose, record }: DSARDialogProps) {
  const qc = useQueryClient();
  const isCreate = !record;

  /* create mode */
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { type: "access" },
  });

  const createMut = useMutation({
    mutationFn: createDSAR,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dsar"] });
      reset();
      onClose();
    },
  });

  /* detail mode */
  const [actionLoading, setActionLoading] = useState(false);
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateDSARStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dsar"] });
      setActionLoading(false);
    },
  });

  function handleStatusChange(newStatus: string) {
    if (!record) return;
    setActionLoading(true);
    statusMut.mutate({ id: record.id, status: newStatus });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        {isCreate ? (
          /* ---- Create Mode ---- */
          <>
            <h2 className="text-lg font-semibold text-gray-900">New Data Subject Request</h2>
            <form
              onSubmit={handleSubmit((v) =>
                createMut.mutate({ userId: v.userId, type: v.type, details: v.description }),
              )}
              className="mt-4 space-y-4"
            >
              <div>
                <Label htmlFor="userId">User ID</Label>
                <Input id="userId" placeholder="Enter user ID" {...register("userId")} />
                {errors.userId && (
                  <p className="mt-1 text-xs text-red-500">{errors.userId.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="type">Request Type</Label>
                <select
                  id="type"
                  {...register("type")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="access">Access</option>
                  <option value="erasure">Erasure</option>
                  <option value="portability">Portability</option>
                </select>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Optional description"
                  {...register("description")}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating..." : "Create Request"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          /* ---- Detail Mode ---- */
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Request {record.id}</h2>
                <p className="text-sm text-gray-500">
                  {record.userName} &mdash; <span className="capitalize">{record.type}</span>
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  record.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : record.status === "rejected"
                      ? "bg-red-100 text-red-700"
                      : record.status === "processing"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                }`}
              >
                {statusIcon[record.status]}
                {record.status}
              </span>
            </div>

            {record.description && (
              <p className="mt-3 text-sm text-gray-600">{record.description}</p>
            )}

            <div className="mt-2 text-xs text-gray-400">
              Created: {new Date(record.createdAt).toLocaleDateString()} | Deadline:{" "}
              {new Date(record.deadline).toLocaleDateString()}
            </div>

            {/* Timeline */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700">Timeline</h3>
              <ol className="mt-2 space-y-3 border-l-2 border-gray-200 pl-4">
                {record.timeline.map((evt, idx) => (
                  <li key={idx} className="relative">
                    <span className="absolute -left-[1.35rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white">
                      {statusIcon[evt.status] ?? (
                        <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </span>
                    <p className="text-sm font-medium capitalize text-gray-800">{evt.status}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(evt.timestamp).toLocaleString()}
                    </p>
                    {evt.note && <p className="text-xs text-gray-500">{evt.note}</p>}
                  </li>
                ))}
              </ol>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {record.status === "pending" && (
                <>
                  <Button
                    variant="destructive"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange("rejected")}
                  >
                    Reject
                  </Button>
                  <Button disabled={actionLoading} onClick={() => handleStatusChange("processing")}>
                    Approve
                  </Button>
                </>
              )}
              {record.status === "processing" && (
                <Button disabled={actionLoading} onClick={() => handleStatusChange("completed")}>
                  Mark Completed
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
