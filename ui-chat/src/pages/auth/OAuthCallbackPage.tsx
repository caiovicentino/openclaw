import { useStackApp } from "@stackframe/stack";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function OAuthCallbackPage() {
  const app = useStackApp();
  const navigate = useNavigate();
  const called = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    (async () => {
      try {
        await app.callOAuthCallback();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      navigate("/chat", { replace: true });
    })();
  }, [app, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">OAuth error: {error}</p>
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
    </div>
  );
}
