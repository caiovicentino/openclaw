import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { useParams } from "react-router-dom";
import { MessageBubble } from "@/components/MessageBubble";

interface SharedMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface SharedConversation {
  title: string;
  messages: SharedMessage[];
  sharedAt: string;
}

async function fetchSharedConversation(token: string): Promise<SharedConversation> {
  const res = await fetch(`/api/v1/share/${token}`);
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? "Share link not found or expired" : "Failed to load conversation",
    );
  }
  return res.json();
}

export default function SharedConversationPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-conversation", token],
    queryFn: () => fetchSharedConversation(token!),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <Scale className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          {error instanceof Error ? error.message : "Conversation not found"}
        </h1>
        <p className="text-sm text-muted-foreground">
          This share link may have expired or been revoked.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Scale className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">{data.title}</h1>
            <p className="text-xs text-muted-foreground">Shared conversation</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl py-4">
        {data.messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
      </main>
    </div>
  );
}
