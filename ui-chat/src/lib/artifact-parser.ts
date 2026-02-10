import type { Artifact, ArtifactType } from "../types/artifact";

type ParserState = "NORMAL" | "INSIDE_TAG" | "INSIDE_ARTIFACT" | "CLOSING_TAG";

interface ProcessChunkResult {
  displayText: string;
  completedArtifacts: Artifact[];
  isInsideArtifact: boolean;
  partialContent?: string;
}

interface PendingArtifact {
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
}

const OPENING_TAG_PREFIX = "<artifact";
const CLOSING_TAG = "</artifact>";

function generateId(): string {
  return `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseOpeningTag(
  tag: string,
): { type: ArtifactType; title: string; language?: string } | null {
  const typeMatch = tag.match(/type="([^"]*)"/);
  const titleMatch = tag.match(/title="([^"]*)"/);
  if (!typeMatch || !titleMatch) return null;

  const languageMatch = tag.match(/language="([^"]*)"/);
  return {
    type: (typeMatch[1] ?? "code") as ArtifactType,
    title: titleMatch[1] ?? "",
    language: languageMatch?.[1],
  };
}

export class ArtifactStreamParser {
  private buffer = "";
  private state: ParserState = "NORMAL";
  private pendingArtifact: PendingArtifact | null = null;
  private messageId = "";
  private artifactCount = 0;

  setMessageId(id: string): void {
    this.messageId = id;
  }

  reset(): void {
    this.buffer = "";
    this.state = "NORMAL";
    this.pendingArtifact = null;
    this.messageId = "";
    this.artifactCount = 0;
  }

  processChunk(chunk: string): ProcessChunkResult {
    this.buffer += chunk;
    let displayText = "";
    const completedArtifacts: Artifact[] = [];

    let safety = 0;
    while (this.buffer.length > 0 && safety++ < 10000) {
      if (this.state === "NORMAL") {
        const tagIdx = this.buffer.indexOf("<artifact");
        if (tagIdx === -1) {
          // Check if buffer ends with a partial prefix of "<artifact"
          const pending = this.findPartialPrefix(this.buffer, OPENING_TAG_PREFIX);
          if (pending > 0) {
            // Emit everything before the partial prefix
            displayText += this.buffer.slice(0, this.buffer.length - pending);
            this.buffer = this.buffer.slice(this.buffer.length - pending);
            break;
          }
          // No tag found at all, emit everything
          displayText += this.buffer;
          this.buffer = "";
          break;
        }

        // Emit text before the tag
        displayText += this.buffer.slice(0, tagIdx);
        this.buffer = this.buffer.slice(tagIdx);
        this.state = "INSIDE_TAG";
        continue;
      }

      if (this.state === "INSIDE_TAG") {
        const closeIdx = this.buffer.indexOf(">");
        if (closeIdx === -1) {
          // Tag not yet complete, wait for more data
          break;
        }

        const fullTag = this.buffer.slice(0, closeIdx + 1);
        const parsed = parseOpeningTag(fullTag);
        if (!parsed) {
          // Not a valid artifact tag, emit as normal text
          displayText += fullTag;
          this.buffer = this.buffer.slice(closeIdx + 1);
          this.state = "NORMAL";
          continue;
        }

        this.pendingArtifact = {
          type: parsed.type,
          title: parsed.title,
          language: parsed.language,
          content: "",
        };
        this.buffer = this.buffer.slice(closeIdx + 1);
        this.state = "INSIDE_ARTIFACT";
        continue;
      }

      if (this.state === "INSIDE_ARTIFACT") {
        const closeIdx = this.buffer.indexOf(CLOSING_TAG);
        if (closeIdx === -1) {
          // Check if buffer ends with a partial prefix of "</artifact>"
          const pending = this.findPartialPrefix(this.buffer, CLOSING_TAG);
          if (pending > 0) {
            // Accumulate content up to the partial prefix
            this.pendingArtifact!.content += this.buffer.slice(0, this.buffer.length - pending);
            this.buffer = this.buffer.slice(this.buffer.length - pending);
            break;
          }
          // No closing tag, accumulate all content
          this.pendingArtifact!.content += this.buffer;
          this.buffer = "";
          break;
        }

        // Found closing tag
        this.pendingArtifact!.content += this.buffer.slice(0, closeIdx);
        this.buffer = this.buffer.slice(closeIdx + CLOSING_TAG.length);

        this.artifactCount++;
        const artifact: Artifact = {
          id: generateId(),
          type: this.pendingArtifact!.type,
          title: this.pendingArtifact!.title,
          content: this.pendingArtifact!.content,
          language: this.pendingArtifact!.language,
          version: 1,
          messageId: this.messageId,
        };
        completedArtifacts.push(artifact);
        displayText += `[ARTIFACT:${artifact.id}:${artifact.title}:${artifact.type}]`;

        this.pendingArtifact = null;
        this.state = "NORMAL";
        continue;
      }
    }

    return {
      displayText,
      completedArtifacts,
      isInsideArtifact: this.state === "INSIDE_ARTIFACT" || this.state === "INSIDE_TAG",
      partialContent: this.pendingArtifact?.content,
    };
  }

  /**
   * Returns how many characters at the end of `text` form a partial prefix of `tag`.
   * For example, if text ends with "</art" and tag is "</artifact>", returns 5.
   */
  private findPartialPrefix(text: string, tag: string): number {
    const maxCheck = Math.min(text.length, tag.length - 1);
    for (let len = maxCheck; len >= 1; len--) {
      if (text.slice(text.length - len) === tag.slice(0, len)) {
        return len;
      }
    }
    return 0;
  }
}
