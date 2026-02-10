import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Trash2, PanelRightClose, PanelRightOpen, Wrench } from "lucide-react";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSession, getTranscript, deleteSession, exportSession } from "@/api/sessions";
import ChatViewer from "@/components/ChatViewer";
import ExportDialog from "@/components/ExportDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id!),
    enabled: !!id,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["session-transcript", id],
    queryFn: () => getTranscript(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSession(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate("/sessions");
    },
  });

  const handleExport = async (format: "json" | "csv") => {
    const blob = await exportSession(id!, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = () => {
    if (confirm("Delete this session? This action cannot be undone.")) {
      deleteMutation.mutate();
    }
  };

  // Extract tool calls from messages metadata
  const toolCalls = messages
    .filter((m) => m.metadata?.toolName)
    .map((m) => ({
      name: m.metadata.toolName as string,
      timestamp: m.createdAt,
      duration: (m.metadata.duration as number) ?? 0,
    }));

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Session not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/sessions")}>
          Back to Sessions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sessions")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Session Detail</h1>
            <p className="text-sm text-muted-foreground">{session.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Session header stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <InfoCard label="User" value={session.userId} />
        <InfoCard label="Agent" value={session.agentId} />
        <InfoCard label="Session Key" value={session.sessionKey} />
        <InfoCard
          label="Status"
          value={
            <Badge variant={session.status === "active" ? "default" : "secondary"}>
              {session.status}
            </Badge>
          }
        />
        <InfoCard label="Created" value={formatDate(session.createdAt)} />
      </div>

      {/* Main content area */}
      <div className="flex gap-6">
        {/* Chat viewer */}
        <div className="min-h-[500px] flex-1">
          <ChatViewer messages={messages} isLoading={messagesLoading} />
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-80 shrink-0 space-y-4">
            {/* Session metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <MetaRow label="Messages" value={String(messages.length)} />
                <MetaRow label="Created" value={formatDate(session.createdAt)} />
                <MetaRow label="Updated" value={formatDate(session.updatedAt)} />
                <MetaRow label="Expires" value={formatDate(session.expiresAt)} />
              </CardContent>
            </Card>

            {/* Tools invoked */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Tools Invoked ({toolCalls.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {toolCalls.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tools were invoked.</p>
                ) : (
                  <ul className="space-y-2">
                    {toolCalls.map((tool, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5 text-amber-600" />
                          <span className="font-mono text-xs">{tool.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{tool.duration}ms</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Token breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Token Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const totalIn = messages.reduce((sum, m) => sum + (m.tokensIn ?? 0), 0);
                  const totalOut = messages.reduce((sum, m) => sum + (m.tokensOut ?? 0), 0);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tokens In</span>
                        <span className="font-medium">{totalIn.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tokens Out</span>
                        <span className="font-medium">{totalOut.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Messages</span>
                        <span className="font-medium">{messages.length}</span>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExport}
        title="Export Session"
      />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
