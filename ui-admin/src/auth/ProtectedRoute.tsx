import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { usePermissions } from "./usePermissions";

export interface ProtectedRouteProps {
  children?: ReactNode;
  requiredPermission?: string;
  requiredAnyPermission?: string[];
}

export function ProtectedRoute({
  children,
  requiredPermission,
  requiredAnyPermission,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const denied =
    (requiredPermission && !hasPermission(requiredPermission)) ||
    (requiredAnyPermission &&
      requiredAnyPermission.length > 0 &&
      !hasAnyPermission(requiredAnyPermission));

  if (denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">403 - Access Denied</h1>
        <p className="text-gray-500">You do not have permission to view this page.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Go back
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
