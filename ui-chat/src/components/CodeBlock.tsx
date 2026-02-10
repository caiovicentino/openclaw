import { Copy, Check } from "lucide-react";
import { memo, useState, useEffect } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock = memo(function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { codeToHtml } = await import("shiki/bundle/web");
        const result = await codeToHtml(code, {
          lang: language || "text",
          theme: "github-dark",
        });
        if (!cancelled) setHtml(result);
      } catch {
        // Fallback: no highlighting
        if (!cancelled) setHtml("");
      }
    }, 100); // 100ms debounce during streaming

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-1.5 text-xs text-gray-400">
        <span>{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-700 hover:text-gray-200"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Code */}
      {html ? (
        <div
          className="overflow-x-auto p-4 text-sm [&>pre]:!bg-transparent [&>pre]:!p-0"
          style={{ backgroundColor: "#24292e" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto bg-gray-900 p-4 text-sm text-gray-100">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});
