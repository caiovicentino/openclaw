import { SignIn, useUser } from "@stackframe/stack";
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function LoginPage() {
  const user = useUser({ or: "return-null" });
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Cerebro</h1>
          <p className="mt-1 text-sm text-gray-500">Admin Portal</p>
        </div>

        <SignIn />
      </div>
    </div>
  );
}
