import * as fs from "fs/promises";

export interface ContentBlock {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export async function processFileForLlm(filePath: string, mimeType: string): Promise<ContentBlock> {
  if (mimeType.startsWith("image/")) {
    const data = await fs.readFile(filePath);
    const base64 = data.toString("base64");
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType,
        data: base64,
      },
    };
  }

  // Text-based files
  const text = await fs.readFile(filePath, "utf-8");
  const truncated =
    text.length > 100000 ? text.slice(0, 100000) + "\n\n[File truncated at 100K chars]" : text;

  return {
    type: "text",
    text: `[File: ${filePath.split("/").pop()}]\n${truncated}`,
  };
}
