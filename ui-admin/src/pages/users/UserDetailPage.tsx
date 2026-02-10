import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useParams, useNavigate } from "react-router-dom";
import { z } from "zod";
import type { UpdateUserRequest } from "@/api/types";
import { getRoles } from "@/api/roles";
import { getUser, updateUser } from "@/api/users";
import { Button } from "@/components/ui/button";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.string().optional(),
  status: z.enum(["active", "inactive", "invited", "suspended"]),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const TABS = ["Profile", "Activity"] as const;
type Tab = (typeof TABS)[number];

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Profile");
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id!),
    enabled: !!id,
  });

  const { data: allRolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => getRoles(),
  });
  const allRoles = allRolesData?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateUserRequest) => updateUser(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => updateUser(id!, { status: "inactive" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      setShowDeactivateConfirm(false);
    },
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: user
      ? {
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        }
      : undefined,
  });

  const onSaveProfile = (values: ProfileFormValues) => {
    updateMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading user...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-sm font-medium">User not found</p>
        <Button variant="outline" onClick={() => navigate("/users")}>
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" className="gap-2" onClick={() => navigate("/users")}>
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Button>

      {/* User header */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-semibold">
          {user.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground">{user.email}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {user.role}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                user.status === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : user.status === "suspended"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
            </span>
            <span className="text-xs text-muted-foreground">
              MFA: {user.mfaEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "Profile" && (
        <form onSubmit={form.handleSubmit(onSaveProfile)} className="max-w-lg space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              {...form.register("name")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <input
              {...form.register("email")}
              type="email"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <select
              {...form.register("role")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select role...</option>
              {allRoles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select
              {...form.register("status")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>

          {updateMutation.isSuccess && (
            <p className="text-sm text-green-600">Changes saved successfully.</p>
          )}
        </form>
      )}

      {activeTab === "Activity" && (
        <div className="rounded-lg border border-border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Activity log for this user will be available from the audit events page.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/audit")}>
            View Audit Logs
          </Button>
        </div>
      )}

      {/* Danger Zone */}
      {user.status === "active" && (
        <div className="mt-8 rounded-lg border border-destructive/50 p-4">
          <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Deactivating this user will revoke all access immediately.
          </p>
          {showDeactivateConfirm ? (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deactivateMutation.mutate()}
                disabled={deactivateMutation.isPending}
              >
                {deactivateMutation.isPending ? "Deactivating..." : "Confirm Deactivation"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDeactivateConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={() => setShowDeactivateConfirm(true)}
            >
              Deactivate User
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
