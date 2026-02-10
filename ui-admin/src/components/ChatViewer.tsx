import { Bot, User, Info, ChevronDown, ChevronRight, Wrench, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SessionMessage } from "@/api/types";
import { cn } from "@/lib/utils";

interface ChatViewerProps {
  messages: SessionMessage[];
  isLoading?: boolean;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString();
}

function ToolCallBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const [paramsOpen, setParamsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);

  const toolName = (metadata.toolName as string) ?? "tool_call";
  const parameters = metadata.parameters as Record<string, unknown> | undefined;
  const result = metadata.result as string | undefined;
  const duration = metadata.duration as number | undefined;

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/60 px-3 py-2">
        <Wrench className="h-3.5 w-3.5 text-amber-700" />
        <span className="font-mono text-sm font-semibold text-amber-900">{toolName}</span>
        {duration != null && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-600">
            <Clock className="h-3 w-3" />
            {duration}ms
          </span>
        )}
      </div>

      <div className="space-y-0">
        {parameters && (
          <>
            <button
              type="button"
              onClick={() => setParamsOpen(!paramsOpen)}
              className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-100/40"
            >
              {paramsOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Parameters
            </button>
            {paramsOpen && (
              <pre className="mx-3 mb-2 overflow-x-auto rounded bg-white p-2 font-mono text-xs text-gray-700">
                {JSON.stringify(parameters, null, 2)}
              </pre>
            )}
          </>
        )}

        {result != null && (
          <>
            <button
              type="button"
              onClick={() => setResultOpen(!resultOpen)}
              className="flex w-full items-center gap-1 border-t border-amber-200/60 px-3 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-100/40"
            >
              {resultOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Result
            </button>
            {resultOpen && (
              <pre className="mx-3 mb-2 overflow-x-auto rounded bg-white p-2 font-mono text-xs text-gray-700">
                {result}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: SessionMessage }) {
  const isToolCall = message.role === "system" && message.metadata?.toolName;

  if (isToolCall) {
    return (
      <div className="flex gap-3 px-4 py-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Wrench className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 max-w-[80%]">
          <ToolCallBlock metadata={message.metadata} />
        </div>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="flex justify-center py-2">
        <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <Info className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{message.content ?? ""}</span>
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 px-4 py-2", isUser ? "flex-row-reverse" : "")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-blue-500" : "bg-muted",
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[75%] min-w-0", isUser ? "text-right" : "text-left")}>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-2xl rounded-br-md bg-blue-500 text-white"
              : "rounded-2xl rounded-bl-md bg-gray-100 text-gray-900",
          )}
        >
          {message.content ?? ""}
        </div>

        {/* Meta row: timestamp */}
        <div
          className={cn(
            "mt-1 flex items-center gap-2 text-[11px] text-muted-foreground",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span title={formatFullDate(message.createdAt)}>
            {formatRelativeTime(message.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* User message skeleton */}
      <div className="flex flex-row-reverse gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="ml-auto h-10 w-56 animate-pulse rounded-2xl rounded-br-md bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      </div>
      {/* Agent message skeleton */}
      <div className="flex gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="h-16 w-72 animate-pulse rounded-2xl rounded-bl-md bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      </div>
      {/* Another user skeleton */}
      <div className="flex flex-row-reverse gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="ml-auto h-8 w-40 animate-pulse rounded-2xl rounded-br-md bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      </div>
      {/* Agent reply skeleton */}
      <div className="flex gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="h-24 w-64 animate-pulse rounded-2xl rounded-bl-md bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 rounded-full bg-muted p-4">
        <Bot className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">No messages</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This session has no conversation history.
      </p>
    </div>
  );
}

export default function ChatViewer({ messages, isLoading }: ChatViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-background">
        <MessageSkeleton />
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-background">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-background">
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto py-4">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id ?? i} message={msg} />
        ))}
      </div>
    </div>
  );
}
