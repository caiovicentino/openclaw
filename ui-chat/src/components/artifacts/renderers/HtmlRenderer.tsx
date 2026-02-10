interface HtmlRendererProps {
  content: string;
  title?: string;
  language?: string;
}

export function HtmlRenderer({ content }: HtmlRendererProps) {
  return (
    <iframe srcDoc={content} sandbox="allow-scripts" className="h-full w-full border-0 bg-white" />
  );
}
