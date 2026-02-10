import { useEffect, useRef, useState } from "react";

interface MermaidRendererProps {
  content: string;
  title?: string;
  language?: string;
}

export function MermaidRenderer({ content }: MermaidRendererProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = await import("mermaid");
        mermaid.default.initialize({ startOnLoad: false, theme: "default" });
        const { svg: rendered } = await mermaid.default.render(idRef.current, content);
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
          setSvg("");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-red-500">
        <p>Mermaid rendering error: {error}</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full items-center justify-center overflow-auto p-6"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
