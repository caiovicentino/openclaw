import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const pathLabels: Record<string, string> = {
  dashboard: "Dashboard",
  users: "Users",
  roles: "Roles",
  agents: "Agents",
  channels: "Channels",
  sessions: "Sessions",
  compliance: "Compliance",
  audit: "Audit Log",
  reports: "Reports",
  privacy: "Privacy",
  settings: "Settings",
  mfa: "MFA Setup",
};

function isUuidOrId(segment: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);
}

export default function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const crumbs = segments.map((segment, index) => {
    const path = "/" + segments.slice(0, index + 1).join("/");
    const label = isUuidOrId(segment)
      ? "Details"
      : (pathLabels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1));
    const isLast = index === segments.length - 1;

    return { path, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-500">
      <Link
        to="/dashboard"
        className="flex items-center gap-1 hover:text-slate-700 transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          {crumb.isLast ? (
            <span className="font-medium text-slate-900">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="hover:text-slate-700 transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
