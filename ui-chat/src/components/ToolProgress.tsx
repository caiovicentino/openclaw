import { CheckCircle, Loader2, XCircle } from "lucide-react";
import type { ToolStep } from "@/hooks/useChat";

interface ToolProgressProps {
  steps: ToolStep[];
  isStreaming: boolean;
}

export function ToolProgress({ steps, isStreaming }: ToolProgressProps) {
  if (!isStreaming || steps.length === 0) return null;

  const currentStep = [...steps].reverse().find((s) => s.status === "running");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const errorCount = steps.filter((s) => s.status === "error").length;

  return (
    <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-2 text-xs text-muted-foreground">
      {currentStep ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="truncate">
            {currentStep.name}: {currentStep.summary}
          </span>
        </>
      ) : (
        <CheckCircle className="h-3 w-3 text-green-500" />
      )}
      {doneCount > 0 && (
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-500" />
          {doneCount}
        </span>
      )}
      {errorCount > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          <XCircle className="h-3 w-3 text-red-500" />
          {errorCount}
        </span>
      )}
    </div>
  );
}
