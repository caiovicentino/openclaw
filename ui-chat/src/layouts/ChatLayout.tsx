import { Menu } from "lucide-react";
import { useCallback, useState } from "react";
import { Outlet, useParams, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { Button } from "@/components/ui/button";

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  const handleNewChat = useCallback(() => {
    if (location.pathname === "/chat") {
      setResetKey((k) => k + 1);
    } else {
      navigate("/chat");
    }
  }, [location.pathname, navigate]);

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar
        activeSessionId={params.sessionId}
        onNewChat={handleNewChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center border-b px-3 py-2 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="ml-2 text-sm font-semibold">Cerebro Chat</h1>
        </div>

        <Outlet context={{ resetKey }} />
      </div>
    </div>
  );
}
