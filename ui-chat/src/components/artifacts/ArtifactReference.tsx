import { FileCode, Globe, Image, GitBranch, FileText, Component, ExternalLink } from "lucide-react";
import type { ArtifactType } from "@/types/artifact";
import { cn } from "@/lib/utils";

interface ArtifactReferenceProps {
  id: string;
  title: string;
  type: ArtifactType;
  onClick: () => void;
}

const iconMap: Record<ArtifactType, typeof Globe> = {
  html: Globe,
  code: FileCode,
  svg: Image,
  mermaid: GitBranch,
  "markdown-document": FileText,
  "react-component": Component,
};

export function ArtifactReference({ title, type, onClick }: ArtifactReferenceProps) {
  const Icon = iconMap[type] || FileCode;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
        "cursor-pointer transition-colors hover:bg-accent",
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{title}</span>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
