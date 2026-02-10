import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface ToolApprovalDialogProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel: string;
  onRespond: (approved: boolean, alwaysAllow: boolean) => void;
}

const TIMEOUT_SECONDS = 120;

function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Bash":
      return `$ ${(input.command as string) ?? ""}`;
    case "Write":
      return `Write to ${input.file_path ?? "file"}`;
    case "Edit":
      return `Edit ${input.file_path ?? "file"}`;
    default:
      return JSON.stringify(input).slice(0, 200);
  }
}

function getRiskBadge(riskLevel: string) {
  switch (riskLevel) {
    case "dangerous":
      return <Badge variant="destructive">Dangerous</Badge>;
    case "moderate":
      return <Badge variant="secondary">Moderate</Badge>;
    default:
      return <Badge variant="default">Safe</Badge>;
  }
}

export function ToolApprovalDialog({
  toolName,
  toolInput,
  riskLevel,
  onRespond,
}: ToolApprovalDialogProps) {
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-deny on timeout
  useEffect(() => {
    if (secondsLeft === 0) {
      onRespond(false, false);
    }
  }, [secondsLeft, onRespond]);

  const handleApprove = useCallback(() => {
    onRespond(true, alwaysAllow);
  }, [onRespond, alwaysAllow]);

  const handleDeny = useCallback(() => {
    onRespond(false, false);
  }, [onRespond]);

  const summary = getToolSummary(toolName, toolInput);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4 shadow-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Tool Permission Required</CardTitle>
            {getRiskBadge(riskLevel)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Tool</div>
            <div className="text-sm font-mono">{toolName}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Action</div>
            <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap break-all">
              {summary}
            </pre>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="always-allow"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="always-allow" className="text-xs text-muted-foreground">
              Always allow {toolName} this session
            </label>
          </div>
          <div className="text-xs text-muted-foreground">Auto-deny in {secondsLeft}s</div>
        </CardContent>
        <CardFooter className="gap-2 pt-0">
          <Button variant="outline" size="sm" onClick={handleDeny} className="flex-1">
            Deny
          </Button>
          <Button size="sm" onClick={handleApprove} className="flex-1">
            Approve
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
