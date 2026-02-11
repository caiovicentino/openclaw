import {
  LayoutDashboard,
  Users,
  Shield,
  Bot,
  Radio,
  MessageSquare,
  MessageCircle,
  FileCheck,
  ScrollText,
  BarChart3,
  Lock,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Bell,
  Search,
  Scale,
  X,
  Menu,
  ExternalLink,
  Clock,
} from "lucide-react";
import { useState, useCallback } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import Breadcrumb from "@/components/Breadcrumb";
import UserMenu from "@/components/UserMenu";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { label: "Users", path: "/users", icon: <Users className="h-5 w-5" /> },
      { label: "Roles", path: "/roles", icon: <Shield className="h-5 w-5" /> },
      { label: "Agents", path: "/agents", icon: <Bot className="h-5 w-5" /> },
      { label: "Channels", path: "/channels", icon: <Radio className="h-5 w-5" /> },
    ],
  },
  {
    title: "CONVERSATIONS",
    items: [{ label: "Sessions", path: "/sessions", icon: <MessageSquare className="h-5 w-5" /> }],
  },
  {
    title: "GOVERNANCE",
    items: [
      { label: "Compliance", path: "/compliance", icon: <FileCheck className="h-5 w-5" /> },
      { label: "Audit Log", path: "/audit", icon: <ScrollText className="h-5 w-5" /> },
      { label: "Reports", path: "/reports", icon: <BarChart3 className="h-5 w-5" /> },
    ],
  },
  {
    title: "PRIVACY",
    items: [{ label: "Privacy / LGPD", path: "/privacy", icon: <Lock className="h-5 w-5" /> }],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Scheduled Tasks", path: "/scheduled-tasks", icon: <Clock className="h-5 w-5" /> },
      { label: "Settings", path: "/settings", icon: <Settings className="h-5 w-5" /> },
    ],
  },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobile} />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out",
          "md:relative md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-70",
          mobileOpen ? "w-70" : "",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-700/50 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Scale className="h-5 w-5 text-primary-foreground" />
          </div>
          {(!collapsed || mobileOpen) && (
            <span className="text-lg font-bold tracking-tight">Cerebro</span>
          )}
          {/* Mobile close button */}
          <button
            onClick={closeMobile}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-800 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navigation.map((group) => (
            <div key={group.title} className="mb-6">
              {(!collapsed || mobileOpen) && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    (item.path !== "/dashboard" && location.pathname.startsWith(item.path + "/"));

                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        onClick={closeMobile}
                        title={collapsed && !mobileOpen ? item.label : undefined}
                        className={[
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-slate-700/60 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-white",
                          collapsed && !mobileOpen ? "justify-center" : "",
                        ].join(" ")}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        {(!collapsed || mobileOpen) && <span>{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Open Chat */}
        <div className="border-t border-slate-700/50 px-3 pt-3">
          <a
            href={
              (globalThis as any).__ENV__?.VITE_CHAT_URL ||
              import.meta.env.VITE_CHAT_URL ||
              "http://localhost:5174"
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            title="Open Chat"
          >
            <MessageCircle className="h-4 w-4" />
            {(!collapsed || mobileOpen) && (
              <>
                <span>Open Chat</span>
                <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60" />
              </>
            )}
          </a>
        </div>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden border-t border-slate-700/50 p-3 md:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 md:px-6">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 md:hidden"
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </button>

          {/* Breadcrumb */}
          <div className="hidden md:block">
            <Breadcrumb />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notifications */}
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
              <Bell className="h-5 w-5 text-slate-600" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>

            {/* Divider */}
            <div className="mx-1 h-6 w-px bg-slate-200" />

            {/* User menu */}
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
