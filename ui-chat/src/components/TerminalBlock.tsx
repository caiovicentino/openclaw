import { ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TerminalBlockProps {
  command: string;
  output: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
}

export default function TerminalBlock({
  command,
  output,
  isStreaming = false,
  defaultExpanded = true,
}: TerminalBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (isStreaming && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, isStreaming]);

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-zinc-900 text-zinc-300 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <Terminal className="h-3.5 w-3.5 shrink-0" />
        <code className="text-xs font-mono truncate">$ {command}</code>
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-zinc-500">running</span>
          </span>
        )}
      </div>
      {expanded && output && (
        <pre
          ref={outputRef}
          className={cn(
            "px-3 py-2 bg-zinc-950 text-zinc-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all",
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
