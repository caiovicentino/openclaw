import React, { Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import AuthLayout from "@/layouts/AuthLayout";
import DashboardLayout from "@/layouts/DashboardLayout";

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );
}

// Auth pages
const LoginPage = React.lazy(() => import("@/pages/auth/LoginPage"));
const OAuthCallbackPage = React.lazy(() => import("@/pages/auth/OAuthCallbackPage"));

// Dashboard
const DashboardPage = React.lazy(() => import("@/pages/dashboard/DashboardPage"));

// Management
const UsersPage = React.lazy(() => import("@/pages/users/UsersPage"));
const UserDetailPage = React.lazy(() => import("@/pages/users/UserDetailPage"));
const RolesPage = React.lazy(() => import("@/pages/roles/RolesPage"));
const RoleDetailPage = React.lazy(() => import("@/pages/roles/RoleDetailPage"));
const AgentsPage = React.lazy(() => import("@/pages/agents/AgentsPage"));
const AgentDetailPage = React.lazy(() => import("@/pages/agents/AgentDetailPage"));
const ChannelsPage = React.lazy(() => import("@/pages/channels/ChannelsPage"));

// Conversations
const SessionsPage = React.lazy(() => import("@/pages/sessions/SessionsPage"));
const SessionDetailPage = React.lazy(() => import("@/pages/sessions/SessionDetailPage"));

// Governance
const CompliancePage = React.lazy(() => import("@/pages/compliance/CompliancePage"));
const AuditPage = React.lazy(() => import("@/pages/audit/AuditPage"));
const ReportsPage = React.lazy(() => import("@/pages/reports/ReportsPage"));

// Privacy
const PrivacyPage = React.lazy(() => import("@/pages/privacy/PrivacyPage"));

// Scheduled Tasks
const ScheduledTasksPage = React.lazy(() => import("@/pages/scheduled-tasks/ScheduledTasksPage"));
const ScheduledTaskDetailPage = React.lazy(
  () => import("@/pages/scheduled-tasks/ScheduledTaskDetailPage"),
);

// System
const SettingsPage = React.lazy(() => import("@/pages/settings/SettingsPage"));
// MFA is now handled by Stack Auth

// Error
const NotFoundPage = React.lazy(() => import("@/pages/NotFoundPage"));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // Public routes
  {
    element: <AuthLayout />,
    children: [
      {
        path: "/login",
        element: (
          <SuspenseWrapper>
            <LoginPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "/handler/oauth-callback",
        element: (
          <SuspenseWrapper>
            <OAuthCallbackPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "/forgot-password",
        element: <Navigate to="/login" replace />,
      },
      {
        path: "/reset-password/:token",
        element: <Navigate to="/login" replace />,
      },
    ],
  },

  // Protected routes
  {
    element: <ProtectedLayout />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "/dashboard",
            element: (
              <SuspenseWrapper>
                <DashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: "/users",
            element: (
              <ProtectedRoute requiredAnyPermission={["admin:users", "admin:users:view"]}>
                <SuspenseWrapper>
                  <UsersPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/users/:id",
            element: (
              <ProtectedRoute requiredAnyPermission={["admin:users", "admin:users:view"]}>
                <SuspenseWrapper>
                  <UserDetailPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/roles",
            element: (
              <ProtectedRoute requiredPermission="admin:roles">
                <SuspenseWrapper>
                  <RolesPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/roles/:id",
            element: (
              <ProtectedRoute requiredPermission="admin:roles">
                <SuspenseWrapper>
                  <RoleDetailPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/agents",
            element: (
              <ProtectedRoute requiredPermission="admin:agents">
                <SuspenseWrapper>
                  <AgentsPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/agents/:id",
            element: (
              <ProtectedRoute requiredPermission="admin:agents">
                <SuspenseWrapper>
                  <AgentDetailPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/channels",
            element: (
              <ProtectedRoute requiredPermission="admin:channels">
                <SuspenseWrapper>
                  <ChannelsPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/sessions",
            element: (
              <ProtectedRoute requiredPermission="agent:view_own_history">
                <SuspenseWrapper>
                  <SessionsPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/sessions/:id",
            element: (
              <ProtectedRoute requiredPermission="agent:view_own_history">
                <SuspenseWrapper>
                  <SessionDetailPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/compliance",
            element: (
              <ProtectedRoute requiredPermission="admin:compliance">
                <SuspenseWrapper>
                  <CompliancePage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/audit",
            element: (
              <ProtectedRoute requiredPermission="admin:audit">
                <SuspenseWrapper>
                  <AuditPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/reports",
            element: (
              <ProtectedRoute requiredPermission="admin:reports">
                <SuspenseWrapper>
                  <ReportsPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/privacy",
            element: (
              <ProtectedRoute requiredPermission="admin:compliance">
                <SuspenseWrapper>
                  <PrivacyPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/scheduled-tasks",
            element: (
              <ProtectedRoute requiredPermission="admin:config">
                <SuspenseWrapper>
                  <ScheduledTasksPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/scheduled-tasks/:id",
            element: (
              <ProtectedRoute requiredPermission="admin:config">
                <SuspenseWrapper>
                  <ScheduledTaskDetailPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/settings",
            element: (
              <ProtectedRoute requiredPermission="admin:config">
                <SuspenseWrapper>
                  <SettingsPage />
                </SuspenseWrapper>
              </ProtectedRoute>
            ),
          },
          {
            path: "/settings/mfa",
            element: <Navigate to="/settings" replace />,
          },
        ],
      },
    ],
  },

  // 404 catch-all
  {
    path: "*",
    element: (
      <SuspenseWrapper>
        <NotFoundPage />
      </SuspenseWrapper>
    ),
  },
]);
