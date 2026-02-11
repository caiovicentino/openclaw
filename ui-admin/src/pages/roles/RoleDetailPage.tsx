import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, ShieldCheck, Shield, UserMinus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useParams, useNavigate } from "react-router-dom";
import { z } from "zod";
import { getRole, updateRole } from "@/api/roles";
import PermissionMatrix from "@/components/PermissionMatrix";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const roleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
});

type RoleFormValues = z.infer<typeof roleSchema>;

const TABS = ["Permissions", "Members"] as const;
type Tab = (typeof TABS)[number];

/**
 * Convert API permissions to flat permission keys.
 * Handles both flat strings (["agent:chat"]) and grouped objects ({resource, actions}).
 */
function fromApiPermissions(
  permissions: (string | { resource: string; actions: string[] })[],
): string[] {
  if (!Array.isArray(permissions)) return [];
  const keys: string[] = [];
  for (const perm of permissions) {
    if (typeof perm === "string") {
      keys.push(perm);
    } else if (perm && Array.isArray(perm.actions)) {
      for (const action of perm.actions) {
        keys.push(`${perm.resource}:${action}`);
      }
    }
  }
  return keys;
}

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Permissions");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionsInitialized, setPermissionsInitialized] = useState(false);

  const { data: role, isLoading } = useQuery({
    queryKey: ["role", id],
    queryFn: () => getRole(id!),
    enabled: !!id,
  });

  // Initialize permissions from API format when role loads
  if (role && !permissionsInitialized) {
    setSelectedPermissions(fromApiPermissions(role.permissions));
    setPermissionsInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (payload: { name?: string; description?: string; permissions?: string[] }) =>
      updateRole(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role", id] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    values: role
      ? {
          name: role.name,
          description: role.description,
        }
      : undefined,
  });

  const onSave = (values: RoleFormValues) => {
    updateMutation.mutate({
      ...values,
      permissions: selectedPermissions,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-32 rounded" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="border-b border-border pb-3 flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-sm font-medium">Role not found</p>
        <Button variant="outline" onClick={() => navigate("/roles")}>
          Back to Roles
        </Button>
      </div>
    );
  }

  const isReadOnly = role.isSystemRole;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" className="gap-2" onClick={() => navigate("/roles")}>
        <ArrowLeft className="h-4 w-4" />
        Back to Roles
      </Button>

      {/* Role header */}
      <div className="flex items-center gap-3">
        {role.isSystemRole ? (
          <ShieldCheck className="h-8 w-8 text-primary" />
        ) : (
          <Shield className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{role.name}</h1>
            {role.isSystemRole && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                System Role
              </span>
            )}
          </div>
          <p className="text-muted-foreground">{role.description}</p>
        </div>
      </div>

      {isReadOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            System roles cannot be edited. Their permissions are managed by the system.
          </p>
        </div>
      )}

      {/* Role name/description form (editable for custom roles) */}
      {!isReadOnly && (
        <form onSubmit={form.handleSubmit(onSave)} className="max-w-lg space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Role Name</label>
            <input
              {...form.register("name")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              {...form.register("description")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={2}
            />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>
        </form>
      )}

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

      {/* Permissions Tab */}
      {activeTab === "Permissions" && (
        <div className="space-y-4">
          <PermissionMatrix
            selected={selectedPermissions}
            onChange={setSelectedPermissions}
            readOnly={isReadOnly}
          />

          {!isReadOnly && (
            <Button onClick={form.handleSubmit(onSave)} disabled={updateMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Permissions"}
            </Button>
          )}

          {updateMutation.isSuccess && (
            <p className="text-sm text-green-600">Permissions saved successfully.</p>
          )}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === "Members" && (
        <div className="space-y-4">
          {!role.members?.length ? (
            <p className="py-4 text-sm text-muted-foreground">No members assigned to this role.</p>
          ) : (
            <div className="space-y-2">
              {role.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                      {member.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/users/${member.id}`)}>
                    <UserMinus className="mr-1 h-4 w-4" />
                    View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
