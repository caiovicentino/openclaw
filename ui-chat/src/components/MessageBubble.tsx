import type { Components } from "react-markdown";
import { User, Bot, ChevronRight, Copy, Check, RefreshCw } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactType } from "@/types/artifact";
import { cn } from "@/lib/utils";
import { ArtifactReference } from "./artifacts/ArtifactReference";
import { CodeBlock } from "./CodeBlock";
import TerminalBlock from "./TerminalBlock";
import ToolBlock from "./ToolBlock";

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
const ARTIFACT_RAW_RE =
  /<artifact\s+type="([^"]*)"\s+title="([^"]*)"(?:\s+language="([^"]*)")?>([\s\S]*?)<\/artifact>/g;
const ARTIFACT_RAW_OPEN_RE =
  /<artifact\s+type="([^"]*)"\s+title="([^"]*)"(?:\s+language="([^"]*)")?>([\s\S]*)$/;
const TERMINAL_BLOCK_RE = /<terminal command="([^"]*(?:&quot;[^"]*)*)">([\s\S]*?)<\/terminal>/g;
const TERMINAL_OPEN_RE = /<terminal command="([^"]*(?:&quot;[^"]*)*)">([\s\S]*)$/;
const TOOLBLOCK_RE = /<toolblock name="([^"]*)" summary="([^"]*)">([\s\S]*?)<\/toolblock>/g;
const TOOLBLOCK_OPEN_RE = /<toolblock name="([^"]*)" summary="([^"]*)">([\s\S]*)$/;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "artifact"; id: string; title: string; artifactType: ArtifactType }
  | {
      type: "raw-artifact";
      artifactType: ArtifactType;
      title: string;
      language?: string;
      content: string;
      isStreaming: boolean;
    }
  | { type: "terminal"; command: string; output: string; isStreaming: boolean }
  | {
      type: "toolblock";
      toolName: string;
      summary: string;
      output: string;
      isError: boolean;
      isStreaming: boolean;
    };

function splitContentParts(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    const closedMatch = TERMINAL_BLOCK_RE.exec(remaining);
    TERMINAL_BLOCK_RE.lastIndex = 0;
    const artifactMatch = ARTIFACT_PLACEHOLDER_RE.exec(remaining);
    ARTIFACT_PLACEHOLDER_RE.lastIndex = 0;
    const toolblockMatch = TOOLBLOCK_RE.exec(remaining);
    TOOLBLOCK_RE.lastIndex = 0;
    const rawArtifactMatch = ARTIFACT_RAW_RE.exec(remaining);
    ARTIFACT_RAW_RE.lastIndex = 0;

    let nextMatchIndex = remaining.length;
    let nextType:
      | "terminal"
      | "artifact"
      | "raw-artifact"
      | "open-terminal"
      | "toolblock"
      | "open-toolblock"
      | "open-raw-artifact"
      | null = null;

    if (closedMatch && closedMatch.index < nextMatchIndex) {
      nextMatchIndex = closedMatch.index;
      nextType = "terminal";
    }
    if (artifactMatch && artifactMatch.index < nextMatchIndex) {
      nextMatchIndex = artifactMatch.index;
      nextType = "artifact";
    }
    if (rawArtifactMatch && rawArtifactMatch.index < nextMatchIndex) {
      nextMatchIndex = rawArtifactMatch.index;
      nextType = "raw-artifact";
    }
    if (toolblockMatch && toolblockMatch.index < nextMatchIndex) {
      nextMatchIndex = toolblockMatch.index;
      nextType = "toolblock";
    }

    if (nextType === null) {
      const openMatch = TERMINAL_OPEN_RE.exec(remaining);
      if (openMatch && openMatch.index < nextMatchIndex) {
        nextMatchIndex = openMatch.index;
        nextType = "open-terminal";
      }
    }

    if (nextType === null) {
      const openToolblock = TOOLBLOCK_OPEN_RE.exec(remaining);
      if (openToolblock && openToolblock.index < nextMatchIndex) {
        nextMatchIndex = openToolblock.index;
        nextType = "open-toolblock";
      }
    }

    if (nextType === null) {
      const openRawArtifact = ARTIFACT_RAW_OPEN_RE.exec(remaining);
      if (openRawArtifact && openRawArtifact.index < nextMatchIndex) {
        nextMatchIndex = openRawArtifact.index;
        nextType = "open-raw-artifact";
      }
    }

    if (nextType === null) {
      if (remaining) parts.push({ type: "text", text: remaining });
      break;
    }

    if (nextMatchIndex > 0) {
      parts.push({ type: "text", text: remaining.slice(0, nextMatchIndex) });
    }

    if (nextType === "terminal" && closedMatch) {
      parts.push({
        type: "terminal",
        command: closedMatch[1].replace(/&quot;/g, '"'),
        output: closedMatch[2],
        isStreaming: false,
      });
      remaining = remaining.slice(closedMatch.index + closedMatch[0].length);
    } else if (nextType === "artifact" && artifactMatch) {
      parts.push({
        type: "artifact",
        id: artifactMatch[1] ?? "",
        title: artifactMatch[2] ?? "",
        artifactType: (artifactMatch[3] ?? "code") as ArtifactType,
      });
      remaining = remaining.slice(artifactMatch.index + artifactMatch[0].length);
    } else if (nextType === "raw-artifact" && rawArtifactMatch) {
      parts.push({
        type: "raw-artifact",
        artifactType: (rawArtifactMatch[1] ?? "code") as ArtifactType,
        title: rawArtifactMatch[2] ?? "",
        language: rawArtifactMatch[3],
        content: rawArtifactMatch[4] ?? "",
        isStreaming: false,
      });
      remaining = remaining.slice(rawArtifactMatch.index + rawArtifactMatch[0].length);
    } else if (nextType === "open-raw-artifact") {
      const openRaw = ARTIFACT_RAW_OPEN_RE.exec(remaining)!;
      parts.push({
        type: "raw-artifact",
        artifactType: (openRaw[1] ?? "code") as ArtifactType,
        title: openRaw[2] ?? "",
        language: openRaw[3],
        content: openRaw[4] ?? "",
        isStreaming: true,
      });
      remaining = "";
    } else if (nextType === "toolblock" && toolblockMatch) {
      const raw = toolblockMatch[3];
      const hasError = raw.startsWith("ERROR: ");
      parts.push({
        type: "toolblock",
        toolName: toolblockMatch[1].replace(/&quot;/g, '"'),
        summary: toolblockMatch[2].replace(/&quot;/g, '"'),
        output: hasError ? raw.slice(7) : raw,
        isError: hasError,
        isStreaming: false,
      });
      remaining = remaining.slice(toolblockMatch.index + toolblockMatch[0].length);
    } else if (nextType === "open-terminal") {
      const openMatch = TERMINAL_OPEN_RE.exec(remaining)!;
      parts.push({
        type: "terminal",
        command: openMatch[1].replace(/&quot;/g, '"'),
        output: openMatch[2],
        isStreaming: true,
      });
      break;
    } else if (nextType === "open-toolblock") {
      const openMatch = TOOLBLOCK_OPEN_RE.exec(remaining)!;
      parts.push({
        type: "toolblock",
        toolName: openMatch[1].replace(/&quot;/g, '"'),
        summary: openMatch[2].replace(/&quot;/g, '"'),
        output: openMatch[3],
        isError: false,
        isStreaming: true,
      });
      break;
    }
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

  const parts = useMemo(() => splitContentParts(content), [content]);
  const hasSpecialBlocks = parts.some(
    (p) => p.type === "artifact" || p.type === "terminal" || p.type === "toolblock",
  );

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
          ) : hasSpecialBlocks ? (
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
                ) : part.type === "artifact" ? (
                  <div key={i} className="my-2">
                    <ArtifactReference
                      id={part.id}
                      title={part.title}
                      type={part.artifactType}
                      onClick={() => onArtifactClick?.(part.id)}
                    />
                  </div>
                ) : part.type === "raw-artifact" ? (
                  <div key={i} className="my-3">
                    {part.artifactType === "html" ? (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
                          <span className="text-xs font-medium">{part.title}</span>
                          {part.isStreaming && (
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          )}
                        </div>
                        <iframe
                          srcDoc={part.content}
                          sandbox="allow-scripts"
                          className="w-full border-0"
                          style={{ height: "400px" }}
                          title={part.title}
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
                          <span className="text-xs font-medium">{part.title}</span>
                        </div>
                        <CodeBlock
                          code={part.content}
                          language={part.language ?? part.artifactType}
                        />
                      </div>
                    )}
                  </div>
                ) : part.type === "toolblock" ? (
                  <ToolBlock
                    key={i}
                    toolName={part.toolName}
                    summary={part.summary}
                    output={part.output}
                    isError={part.isError}
                    isStreaming={part.isStreaming}
                  />
                ) : (
                  <TerminalBlock
                    key={i}
                    command={part.command}
                    output={part.output}
                    isStreaming={part.isStreaming}
                  />
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
