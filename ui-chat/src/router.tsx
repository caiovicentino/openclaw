import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";

const AuthLayout = lazy(() => import("@/layouts/AuthLayout"));
const ChatLayout = lazy(() => import("@/layouts/ChatLayout"));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
const SharedConversationPage = lazy(() => import("@/pages/SharedConversationPage"));

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/chat" replace />,
  },
  {
    element: (
      <Suspense fallback={<Loading />}>
        <AuthLayout />
      </Suspense>
    ),
    children: [
      {
        path: "/login",
        element: (
          <Suspense fallback={<Loading />}>
            <LoginPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "/shared/:token",
    element: (
      <Suspense fallback={<Loading />}>
        <SharedConversationPage />
      </Suspense>
    ),
  },
  {
    element: (
      <ProtectedRoute requiredPermission="agent:chat">
        <Suspense fallback={<Loading />}>
          <ChatLayout />
        </Suspense>
      </ProtectedRoute>
    ),
    children: [
      {
        path: "/chat",
        element: (
          <Suspense fallback={<Loading />}>
            <ChatPage />
          </Suspense>
        ),
      },
      {
        path: "/chat/:sessionId",
        element: (
          <Suspense fallback={<Loading />}>
            <ChatPage />
          </Suspense>
        ),
      },
    ],
  },
]);
