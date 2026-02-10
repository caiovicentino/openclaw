import { useState, useCallback, useRef, useEffect } from "react";
import type { PermissionRequestData } from "@/api/chat";
import type { ChatMessage } from "@/api/types";
import type { Artifact } from "@/types/artifact";
import { sendChatMessage, uploadFile, respondToPermissionRequest } from "@/api/chat";
import { ArtifactStreamParser } from "@/lib/artifact-parser";

interface UseChatOptions {
  onArtifact?: (artifact: Artifact) => void;
  onPartialArtifact?: (content: string) => void;
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PermissionRequestData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const thinkingBufferRef = useRef<string>("");
  const parserRef = useRef<ArtifactStreamParser>(new ArtifactStreamParser());
  // Keep a ref to sessionId so the permission callback can access the latest value
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  // Keep options ref stable
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Abort streaming on unmount to prevent state updates after cleanup
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /** Flush accumulated thinking buffer into the last assistant message's thinkingBlocks */
  const flushThinking = useCallback(() => {
    if (!thinkingBufferRef.current) return;
    const block = thinkingBufferRef.current;
    thinkingBufferRef.current = "";
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          thinkingBlocks: [...(last.thinkingBlocks ?? []), block],
        };
      }
      return updated;
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string, agentId: string, files?: File[]) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: files?.length
          ? text + `\n\n[${files.length} file(s) attached: ${files.map((f) => f.name).join(", ")}]`
          : text,
      };

      const assistantMsgId = `assistant-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      thinkingBufferRef.current = "";

      // Reset parser for new message
      parserRef.current.reset();
      parserRef.current.setMessageId(assistantMsgId);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Upload files first if present
        let uploadedFiles;
        if (files?.length) {
          uploadedFiles = await Promise.all(
            files.map((f) => uploadFile(f, sessionId ?? undefined)),
          );
        }

        await sendChatMessage(
          agentId,
          text,
          sessionId,
          {
            onThinking: (chunk) => {
              thinkingBufferRef.current += chunk;
            },
            onText: (chunk) => {
              flushThinking();
              const result = parserRef.current.processChunk(chunk);

              // Update message with display text (artifact tags stripped)
              if (result.displayText) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + result.displayText,
                    };
                  }
                  return updated;
                });
              }

              // Notify about completed artifacts
              for (const artifact of result.completedArtifacts) {
                optionsRef.current?.onArtifact?.(artifact);
              }

              // Notify about partial artifact content for live preview
              if (result.isInsideArtifact && result.partialContent) {
                optionsRef.current?.onPartialArtifact?.(result.partialContent);
              }
            },
            onPermissionRequest: (data) => {
              setPendingApproval(data);
            },
            onToolStream: (data) => {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + data.chunk,
                  };
                }
                return updated;
              });
            },
            onDone: (data) => {
              flushThinking();
              setSessionId(data.sessionId);
              setIsStreaming(false);
            },
            onError: (error) => {
              flushThinking();
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content || `Error: ${error}`,
                  };
                }
                return updated;
              });
              setIsStreaming(false);
            },
          },
          controller.signal,
          uploadedFiles,
        );
      } catch {
        setIsStreaming(false);
      }
    },
    [sessionId, flushThinking],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const loadHistory = useCallback((history: ChatMessage[], sid: string) => {
    setMessages(history);
    setSessionId(sid);
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    setPendingApproval(null);
    parserRef.current.reset();
    abortRef.current?.abort();
  }, []);

  const removeLastAssistantMessage = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant") {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  const respondToApproval = useCallback(
    async (approved: boolean, alwaysAllow: boolean) => {
      if (!pendingApproval) return;
      const sid = sessionIdRef.current;
      if (sid) {
        await respondToPermissionRequest(sid, pendingApproval.id, approved, alwaysAllow);
      }
      setPendingApproval(null);
    },
    [pendingApproval],
  );

  return {
    messages,
    isStreaming,
    sessionId,
    pendingApproval,
    sendMessage,
    stopStreaming,
    loadHistory,
    resetChat,
    removeLastAssistantMessage,
    respondToApproval,
  };
}
