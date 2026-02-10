export type ArtifactType =
  | "html"
  | "code"
  | "svg"
  | "mermaid"
  | "markdown-document"
  | "react-component";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  version: number;
  messageId: string;
}

export interface ArtifactVersion {
  version: number;
  content: string;
  createdAt: Date;
  messageId: string;
}
