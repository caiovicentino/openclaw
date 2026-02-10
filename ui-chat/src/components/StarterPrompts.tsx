import { Layout, BarChart3, FileText, Lightbulb } from "lucide-react";

interface StarterPromptsProps {
  onSelect: (prompt: string) => void;
}

const prompts = [
  {
    icon: Layout,
    title: "Build a landing page",
    description: "Create a modern, responsive landing page",
    prompt:
      "Build a modern landing page with a hero section, features grid, and a call-to-action. Use clean, professional design.",
  },
  {
    icon: BarChart3,
    title: "Create a dashboard",
    description: "Design an interactive data dashboard",
    prompt:
      "Create an interactive dashboard with charts, stats cards, and a clean layout. Include sample data.",
  },
  {
    icon: FileText,
    title: "Write documentation",
    description: "Generate technical documentation",
    prompt:
      "Help me write comprehensive technical documentation for my project. Include setup instructions, API reference, and examples.",
  },
  {
    icon: Lightbulb,
    title: "Brainstorm ideas",
    description: "Get creative suggestions and ideas",
    prompt:
      "Help me brainstorm ideas for my next project. I'm looking for innovative and practical suggestions.",
  },
];

export function StarterPrompts({ onSelect }: StarterPromptsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
      {prompts.map((p) => (
        <button
          key={p.title}
          onClick={() => onSelect(p.prompt)}
          className="flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-accent"
        >
          <p.icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{p.title}</p>
            <p className="text-xs text-muted-foreground">{p.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
