import type { Components } from "react-markdown";
import { User, Bot, ChevronRight, Copy, Check, RefreshCw } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactType } from "@/types/artifact";
import { cn } from "@/lib/utils";
import { ArtifactReference } from "./artifacts/ArtifactReference";
import { CodeBlock } from "./CodeBlock";

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        Thinking...
      </button>
      {open && (
        <div className="mt-1 border-l-2 border-muted-foreground/30 pl-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  thinkingBlocks?: string[];
  onCopy?: () => void;
  onRegenerate?: () => void;
  onArtifactClick?: (id: string) => void;
}

const ARTIFACT_PLACEHOLDER_RE = /\[ARTIFACT:([^:]+):([^:]+):([^\]]+)\]/g;

/** Split content into text segments and artifact reference objects */
function splitContentWithArtifacts(content: string) {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "artifact"; id: string; title: string; artifactType: ArtifactType }
  > = [];
  let lastIndex = 0;

  for (const match of content.matchAll(ARTIFACT_PLACEHOLDER_RE)) {
    if (match.index! > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index!) });
    }
    parts.push({
      type: "artifact",
      id: match[1] ?? "",
      title: match[2] ?? "",
      artifactType: (match[3] ?? "code") as ArtifactType,
    });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }

  return parts;
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const match = className?.match(/language-(\w+)/);
    const code = String(children).replace(/\n$/, "");
    if (match) {
      return <CodeBlock code={code} language={match[1]} />;
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export function MessageBubble({
  role,
  content,
  isStreaming,
  thinkingBlocks,
  onCopy,
  onRegenerate,
  onArtifactClick,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  }, [content, onCopy]);

  const parts = useMemo(() => splitContentWithArtifacts(content), [content]);
  const hasArtifacts = parts.some((p) => p.type === "artifact");

  return (
    <div className={cn("group flex gap-3 px-4 py-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-[75%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {!isUser && thinkingBlocks && thinkingBlocks.length > 0 && (
            <div className="mb-1">
              {thinkingBlocks.map((block, i) => (
                <ThinkingBlock key={i} text={block} />
              ))}
            </div>
          )}
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">
              {content}
              {isStreaming && !content && (
                <span className="inline-block h-4 w-1 animate-pulse bg-current" />
              )}
              {isStreaming && content && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom" />
              )}
            </div>
          ) : hasArtifacts ? (
            <div className="prose prose-sm max-w-none break-words">
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <ReactMarkdown
                    key={i}
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {part.text}
                  </ReactMarkdown>
                ) : (
                  <div key={i} className="my-2">
                    <ArtifactReference
                      id={part.id}
                      title={part.title}
                      type={part.artifactType}
                      onClick={() => onArtifactClick?.(part.id)}
                    />
                  </div>
                ),
              )}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom" />
              )}
            </div>
          ) : (
            <div className="prose prose-sm max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
              {isStreaming && !content && (
                <span className="inline-block h-4 w-1 animate-pulse bg-current" />
              )}
              {isStreaming && content && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom" />
              )}
            </div>
          )}
        </div>

        {/* Message actions for assistant messages */}
        {!isUser && !isStreaming && content && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Copy message"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Regenerate response"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
