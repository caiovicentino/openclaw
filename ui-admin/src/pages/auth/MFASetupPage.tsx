import { Navigate } from "react-router-dom";

// MFA is now handled by Stack Auth
export default function MFASetupPage() {
  return <Navigate to="/settings" replace />;
}
