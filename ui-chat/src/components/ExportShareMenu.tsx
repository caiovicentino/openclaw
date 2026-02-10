import { Download, Share2, Link, Check } from "lucide-react";
import { useState } from "react";
import { client } from "@/api/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface ExportShareMenuProps {
  sessionId: string;
}

export function ExportShareMenu({ sessionId }: ExportShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function handleExport(format: "markdown" | "json") {
    const res = await client.raw("GET", `/share/sessions/${sessionId}/export/${format}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="(.+?)"/);
    const filename = match?.[1] ?? `conversation.${format === "markdown" ? "md" : "json"}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    setSharing(true);
    try {
      const data = await client.post<{ token: string; url: string }>(
        `/share/sessions/${sessionId}/share`,
        {},
      );
      const shareUrl = `${window.location.origin}/shared/${data.token}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setSharing(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-10 w-10"
        title="Export / Share"
      >
        <Share2 className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleExport("markdown")}>
          <Download className="h-4 w-4" />
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("json")}>
          <Download className="h-4 w-4" />
          JSON (.json)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Share</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleShare} disabled={sharing}>
          {copied ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
          {copied ? "Link copied!" : "Copy share link"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
