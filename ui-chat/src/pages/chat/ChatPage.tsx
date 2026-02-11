import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale, FolderOpen, Download } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ChatAgent } from "@/api/types";
import {
  fetchSessionMessages,
  fetchAgents,
  fetchWorkspaceFiles,
  downloadWorkspace,
} from "@/api/chat";
import { AgentSelector } from "@/components/AgentSelector";
import { ArtifactPanel } from "@/components/artifacts/ArtifactPanel";
import { ResizeHandle } from "@/components/artifacts/ResizeHandle";
import { ChatInput } from "@/components/ChatInput";
import { ExportShareMenu } from "@/components/ExportShareMenu";
import { MessageBubble } from "@/components/MessageBubble";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { StarterPrompts } from "@/components/StarterPrompts";
import { ToolApprovalDialog } from "@/components/ToolApprovalDialog";
import { ToolProgress } from "@/components/ToolProgress";
import { TypingIndicator } from "@/components/TypingIndicator";
import { Button } from "@/components/ui/button";
import { WorkspaceFiles } from "@/components/WorkspaceFiles";
import { useArtifacts } from "@/hooks/useArtifacts";
import { useChat } from "@/hooks/useChat";

export default function ChatPage() {
  const { sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    activeArtifact,
    panelOpen,
    versionHistory,
    addArtifact,
    selectArtifact,
    navigateVersion,
    closePanel,
    reset: resetArtifacts,
  } = useArtifacts();

  const {
    messages,
    isStreaming,
    isUploading,
    sessionId: chatSessionId,
    toolSteps,
    pendingApproval,
    sendMessage,
    stopStreaming,
    loadHistory,
    resetChat,
    removeLastAssistantMessage,
    respondToApproval,
  } = useChat({
    onArtifact: addArtifact,
  });

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [panelPercent, setPanelPercent] = useState(45);
  const [filesOpen, setFilesOpen] = useState(false);

  // Fetch agents to get default
  const { data: agents = [] } = useQuery<ChatAgent[]>({
    queryKey: ["chat-agents"],
    queryFn: fetchAgents,
  });

  // Set default agent when loaded
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      const defaultAgent = agents.find((a) => a.isDefault) ?? agents[0];
      if (defaultAgent) {
        setSelectedAgentId(defaultAgent.id);
      }
    }
  }, [agents, selectedAgentId]);

  // Load history when navigating to a session
  const { data: historyMessages } = useQuery({
    queryKey: ["chat-messages", urlSessionId],
    queryFn: () => fetchSessionMessages(urlSessionId!),
    enabled: !!urlSessionId,
  });

  const { data: workspaceFiles = [] } = useQuery({
    queryKey: ["workspace-files", urlSessionId],
    queryFn: () => fetchWorkspaceFiles(urlSessionId!),
    enabled: !!urlSessionId,
    refetchInterval: isStreaming ? 5000 : false,
  });

  const hasFiles = workspaceFiles.length > 0;

  useEffect(() => {
    if (urlSessionId && historyMessages) {
      loadHistory(historyMessages, urlSessionId);
    }
  }, [urlSessionId, historyMessages, loadHistory]);

  // Reset when navigating to /chat (no session)
  useEffect(() => {
    if (!urlSessionId) {
      resetChat();
      resetArtifacts();
    }
  }, [urlSessionId, resetChat, resetArtifacts]);

  // Navigate to new session after first message
  useEffect(() => {
    if (chatSessionId && !urlSessionId) {
      navigate(`/chat/${chatSessionId}`, { replace: true });
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    }
  }, [chatSessionId, urlSessionId, navigate, queryClient]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (filesOpen) {
          setFilesOpen(false);
        } else if (panelOpen) {
          closePanel();
        } else if (isStreaming) {
          stopStreaming();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filesOpen, panelOpen, isStreaming, closePanel, stopStreaming]);

  const handleSend = useCallback(
    (text: string, files?: File[]) => {
      if (!selectedAgentId) return;
      sendMessage(text, selectedAgentId, files);
    },
    [selectedAgentId, sendMessage],
  );

  const handleRegenerate = useCallback(() => {
    if (!selectedAgentId || isStreaming) return;
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    removeLastAssistantMessage();
    sendMessage(lastUserMsg.content, selectedAgentId);
  }, [selectedAgentId, isStreaming, messages, removeLastAssistantMessage, sendMessage]);

  const handleArtifactClick = useCallback(
    (id: string) => {
      selectArtifact(id);
    },
    [selectArtifact],
  );

  const isEmptyState = messages.length === 0 && !urlSessionId;

  const activeSessionId = urlSessionId ?? chatSessionId;

  // Show typing indicator when streaming and last message has no content yet
  const lastMsg = messages[messages.length - 1] as (typeof messages)[number] | undefined;
  const showTypingIndicator = isStreaming && lastMsg?.role === "assistant" && !lastMsg.content;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Chat column */}
      <div
        className="flex flex-1 flex-col overflow-hidden"
        style={
          panelOpen || filesOpen ? { flexBasis: `${100 - panelPercent}%`, flexGrow: 0 } : undefined
        }
      >
        {/* Session header with export/share and quota */}
        {activeSessionId && messages.length > 0 && (
          <div className="flex items-center justify-between border-b px-4 py-1.5">
            <QuotaIndicator />
            <div className="flex items-center gap-2">
              {hasFiles && (
                <>
                  <Button
                    variant={filesOpen ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFilesOpen((v) => !v)}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Files ({workspaceFiles.length})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={async () => {
                      if (!urlSessionId) return;
                      try {
                        const blob = await downloadWorkspace(urlSessionId);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `workspace-${urlSessionId}.zip`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        // silently fail
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                </>
              )}
              <ExportShareMenu sessionId={activeSessionId} />
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {isEmptyState ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
                <Scale className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold">Cerebro Chat</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select an agent and start chatting
                </p>
              </div>
              <AgentSelector value={selectedAgentId} onChange={setSelectedAgentId} />
              <StarterPrompts onSelect={handleSend} />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl py-4">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  thinkingBlocks={msg.thinkingBlocks}
                  isStreaming={isStreaming && msg.role === "assistant" && i === messages.length - 1}
                  onRegenerate={
                    msg.role === "assistant" && i === messages.length - 1 && !isStreaming
                      ? handleRegenerate
                      : undefined
                  }
                  onArtifactClick={handleArtifactClick}
                />
              ))}
              {showTypingIndicator && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <ToolProgress steps={toolSteps} isStreaming={isStreaming} />

        <ChatInput
          onSend={handleSend}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          isUploading={isUploading}
          disabled={!selectedAgentId}
          placeholder={selectedAgentId ? "Type a message..." : "Select an agent first"}
        />

        {/* Tool approval dialog */}
        {pendingApproval && (
          <ToolApprovalDialog
            toolName={pendingApproval.toolName}
            toolInput={pendingApproval.toolInput}
            riskLevel={pendingApproval.riskLevel}
            onRespond={respondToApproval}
          />
        )}
      </div>

      {/* Artifact panel */}
      {panelOpen && activeArtifact && (
        <>
          <div className="hidden lg:contents">
            <ResizeHandle onResize={setPanelPercent} />
            <div
              className="flex flex-col overflow-hidden border-l"
              style={{ flexBasis: `${panelPercent}%`, flexGrow: 0, flexShrink: 0 }}
            >
              <ArtifactPanel
                artifact={activeArtifact}
                versions={versionHistory.get(activeArtifact.title) ?? []}
                onClose={closePanel}
                onNavigateVersion={(v) => navigateVersion(activeArtifact.title, v)}
              />
            </div>
          </div>

          <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
            <ArtifactPanel
              artifact={activeArtifact}
              versions={versionHistory.get(activeArtifact.title) ?? []}
              onClose={closePanel}
              onNavigateVersion={(v) => navigateVersion(activeArtifact.title, v)}
            />
          </div>
        </>
      )}

      {filesOpen && activeSessionId && !panelOpen && (
        <>
          <div className="hidden lg:contents">
            <ResizeHandle onResize={setPanelPercent} />
            <div
              className="flex flex-col overflow-hidden border-l"
              style={{ flexBasis: `${panelPercent}%`, flexGrow: 0, flexShrink: 0 }}
            >
              <WorkspaceFiles
                sessionId={activeSessionId}
                isStreaming={isStreaming}
                onClose={() => setFilesOpen(false)}
              />
            </div>
          </div>

          <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
            <WorkspaceFiles
              sessionId={activeSessionId}
              isStreaming={isStreaming}
              onClose={() => setFilesOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
