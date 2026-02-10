interface SvgRendererProps {
  content: string;
  title?: string;
  language?: string;
}

export function SvgRenderer({ content }: SvgRendererProps) {
  const srcDoc = `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:white">${content}</body></html>`;

  return (
    <iframe srcDoc={srcDoc} sandbox="allow-scripts" className="h-full w-full border-0 bg-white" />
  );
}
