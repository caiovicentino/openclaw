import { CodeBlock } from "@/components/CodeBlock";

interface CodeRendererProps {
  content: string;
  title?: string;
  language?: string;
}

export function CodeRenderer({ content, language }: CodeRendererProps) {
  return (
    <div className="h-full overflow-auto">
      <CodeBlock code={content} language={language || "typescript"} />
    </div>
  );
}
