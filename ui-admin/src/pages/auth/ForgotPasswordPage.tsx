import { Navigate } from "react-router-dom";

// Password reset is now handled by Stack Auth
export default function ForgotPasswordPage() {
  return <Navigate to="/login" replace />;
}
