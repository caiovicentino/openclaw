import { Menu } from "lucide-react";
import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/components/ChatSidebar";
import { Button } from "@/components/ui/button";

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const params = useParams();

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar
        activeSessionId={params.sessionId}
        onNewChat={() => navigate("/chat")}
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

        <Outlet />
      </div>
    </div>
  );
}
