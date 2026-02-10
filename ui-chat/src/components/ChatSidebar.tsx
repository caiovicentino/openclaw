import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { Plus, MessageSquare, Trash2, LogOut, X, Search, Moon, Sun } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ChatSession } from "@/api/types";
import { fetchSessions, deleteSessionApi } from "@/api/chat";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  activeSessionId?: string;
  onNewChat: () => void;
  open: boolean;
  onClose: () => void;
}

function groupSessions(sessions: ChatSession[]) {
  const groups: { label: string; sessions: ChatSession[] }[] = [];
  const today: ChatSession[] = [];
  const yesterday: ChatSession[] = [];
  const thisWeek: ChatSession[] = [];
  const thisMonth: ChatSession[] = [];
  const older: ChatSession[] = [];

  for (const s of sessions) {
    const d = new Date(s.updatedAt || s.createdAt);
    if (isToday(d)) today.push(s);
    else if (isYesterday(d)) yesterday.push(s);
    else if (isThisWeek(d)) thisWeek.push(s);
    else if (isThisMonth(d)) thisMonth.push(s);
    else older.push(s);
  }

  if (today.length) groups.push({ label: "Today", sessions: today });
  if (yesterday.length) groups.push({ label: "Yesterday", sessions: yesterday });
  if (thisWeek.length) groups.push({ label: "This week", sessions: thisWeek });
  if (thisMonth.length) groups.push({ label: "This month", sessions: thisMonth });
  if (older.length) groups.push({ label: "Older", sessions: older });

  return groups;
}

export function ChatSidebar({ activeSessionId, onNewChat, open, onClose }: ChatSidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sessions = [] } = useQuery<ChatSession[]>({
    queryKey: ["chat-sessions"],
    queryFn: fetchSessions,
    refetchInterval: 15_000,
  });

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const groups = groupSessions(filteredSessions);

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    setDeleteError(null);
    try {
      await deleteSessionApi(sessionId);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (activeSessionId === sessionId) {
        navigate("/chat");
      }
    } catch {
      setDeleteError("Failed to delete conversation");
      setTimeout(() => setDeleteError(null), 3000);
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r bg-card transition-transform duration-200 lg:relative lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3">
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2"
            onClick={() => {
              onNewChat();
              onClose();
            }}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <Button variant="ghost" size="icon" className="ml-2 lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Delete error */}
        {deleteError && (
          <div className="mx-2 mb-1 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {deleteError}
          </div>
        )}

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              {group.sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    navigate(`/chat/${s.id}`);
                    onClose();
                  }}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                    activeSessionId === s.id && "bg-accent",
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{s.title}</span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(e, s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleDelete(e as unknown as React.MouseEvent, s.id);
                    }}
                    className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="h-3 w-3" />
                  </div>
                </button>
              ))}
            </div>
          ))}

          {sessions.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </p>
          )}
        </div>

        {/* User menu */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
