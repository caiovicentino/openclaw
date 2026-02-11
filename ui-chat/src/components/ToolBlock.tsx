import {
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  FileEdit,
  Search,
  Globe,
  Wrench,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ToolBlockProps {
  toolName: string;
  summary: string;
  output: string;
  isError?: boolean;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
}

const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Write: FilePlus,
  Edit: FileEdit,
  Glob: Search,
  Grep: Search,
  WebSearch: Globe,
  WebFetch: Globe,
};

export default function ToolBlock({
  toolName,
  summary,
  output,
  isError = false,
  isStreaming = false,
  defaultExpanded = false,
}: ToolBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || isStreaming);
  const outputRef = useRef<HTMLPreElement>(null);
  const Icon = TOOL_ICONS[toolName] ?? Wrench;

  useEffect(() => {
    if (!isStreaming && expanded) {
      setExpanded(false);
    }
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, isStreaming]);

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-sm",
          isError
            ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
            : "bg-muted/50 text-foreground",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-xs">{toolName}</span>
        <span className="text-xs text-muted-foreground truncate">{summary}</span>
        <span className="ml-auto flex items-center shrink-0">
          {isStreaming ? (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">running</span>
            </span>
          ) : isError ? (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
          )}
        </span>
      </div>
      {expanded && output && (
        <pre
          ref={outputRef}
          className={cn(
            "px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all",
            "bg-muted/30 text-foreground/80 border-t border-border",
            isStreaming ? "max-h-64" : "max-h-48",
            "overflow-y-auto",
          )}
        >
          {output}
        </pre>
      )}
    </div>
  );
}
