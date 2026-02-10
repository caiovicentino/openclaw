import { Navigate } from "react-router-dom";

// Password reset is now handled by Stack Auth
export default function ResetPasswordPage() {
  return <Navigate to="/login" replace />;
}
