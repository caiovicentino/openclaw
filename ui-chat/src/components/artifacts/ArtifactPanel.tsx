import { X, Copy, Download, ChevronLeft, ChevronRight, Code, Eye, Check } from "lucide-react";
import { useState } from "react";
import type { Artifact, ArtifactVersion } from "@/types/artifact";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CodeRenderer } from "./renderers/CodeRenderer";
import { HtmlRenderer } from "./renderers/HtmlRenderer";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
import { MermaidRenderer } from "./renderers/MermaidRenderer";
import { ReactComponentRenderer } from "./renderers/ReactComponentRenderer";
import { SvgRenderer } from "./renderers/SvgRenderer";

interface ArtifactPanelProps {
  artifact: Artifact;
  versions: ArtifactVersion[];
  onClose: () => void;
  onNavigateVersion: (version: number) => void;
}

const extensionMap: Record<string, string> = {
  html: ".html",
  svg: ".svg",
  "markdown-document": ".md",
  "react-component": ".tsx",
  mermaid: ".mmd",
  code: ".txt",
};

function getLanguageForType(artifact: Artifact): string {
  switch (artifact.type) {
    case "html":
      return "html";
    case "svg":
      return "svg";
    case "markdown-document":
      return "markdown";
    case "react-component":
      return "tsx";
    case "mermaid":
      return "mermaid";
    case "code":
      return artifact.language || "text";
    default:
      return "text";
  }
}

export function ArtifactPanel({
  artifact,
  versions,
  onClose,
  onNavigateVersion,
}: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const totalVersions = versions.length;
  const canGoPrev = artifact.version > 1;
  const canGoNext = artifact.version < totalVersions;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = extensionMap[artifact.type] || ".txt";
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderPreview = () => {
    switch (artifact.type) {
      case "html":
        return <HtmlRenderer content={artifact.content} />;
      case "code":
        return <CodeRenderer content={artifact.content} language={artifact.language} />;
      case "svg":
        return <SvgRenderer content={artifact.content} />;
      case "mermaid":
        return <MermaidRenderer content={artifact.content} />;
      case "markdown-document":
        return <MarkdownRenderer content={artifact.content} />;
      case "react-component":
        return <ReactComponentRenderer content={artifact.content} />;
      default:
        return <pre className="whitespace-pre-wrap p-4 text-sm">{artifact.content}</pre>;
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="truncate text-sm font-medium">{artifact.title}</h3>
        <div className="flex items-center gap-1">
          {/* Version navigation */}
          {totalVersions > 1 && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={!canGoPrev}
                onClick={() => onNavigateVersion(artifact.version - 1)}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span>
                v{artifact.version} of {totalVersions}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={!canGoNext}
                onClick={() => onNavigateVersion(artifact.version + 1)}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {activeTab === "preview" ? (
          renderPreview()
        ) : (
          <CodeBlock code={artifact.content} language={getLanguageForType(artifact)} />
        )}
      </div>

      {/* Footer tabs */}
      <div className="flex border-t">
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            activeTab === "preview"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("preview")}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            activeTab === "code"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("code")}
        >
          <Code className="h-3.5 w-3.5" />
          Code
        </button>
      </div>
    </div>
  );
}
