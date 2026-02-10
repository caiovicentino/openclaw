import { useState, useCallback, useMemo } from "react";
import type { Artifact, ArtifactVersion } from "@/types/artifact";

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<Map<string, ArtifactVersion[]>>(new Map());

  const addArtifact = useCallback((artifact: Artifact) => {
    setArtifacts((prev) => {
      const existing = prev.find((a) => a.title === artifact.title);

      if (existing) {
        const newVersion = existing.version + 1;
        const updated = {
          ...artifact,
          id: existing.id,
          version: newVersion,
        };

        setVersionHistory((hist) => {
          const next = new Map(hist);
          const versions = next.get(artifact.title) ?? [
            {
              version: existing.version,
              content: existing.content,
              createdAt: new Date(),
              messageId: existing.messageId,
            },
          ];
          next.set(artifact.title, [
            ...versions,
            {
              version: newVersion,
              content: artifact.content,
              createdAt: new Date(),
              messageId: artifact.messageId,
            },
          ]);
          return next;
        });

        setActiveArtifactId(existing.id);
        setPanelOpen(true);

        return prev.map((a) => (a.id === existing.id ? updated : a));
      }

      setActiveArtifactId(artifact.id);
      setPanelOpen(true);
      return [...prev, artifact];
    });
  }, []);

  const selectArtifact = useCallback((id: string) => {
    setActiveArtifactId(id);
    setPanelOpen(true);
  }, []);

  const navigateVersion = useCallback(
    (title: string, version: number) => {
      const versions = versionHistory.get(title);
      if (!versions) return;

      const target = versions.find((v) => v.version === version);
      if (!target) return;

      setArtifacts((prev) =>
        prev.map((a) =>
          a.title === title ? { ...a, version: target.version, content: target.content } : a,
        ),
      );
    },
    [versionHistory],
  );

  const closePanel = useCallback(() => setPanelOpen(false), []);
  const openPanel = useCallback(() => setPanelOpen(true), []);

  const reset = useCallback(() => {
    setArtifacts([]);
    setActiveArtifactId(null);
    setPanelOpen(false);
    setVersionHistory(new Map());
  }, []);

  const activeArtifact = useMemo(
    () => artifacts.find((a) => a.id === activeArtifactId) ?? null,
    [artifacts, activeArtifactId],
  );

  return {
    artifacts,
    activeArtifact,
    panelOpen,
    versionHistory,
    addArtifact,
    selectArtifact,
    navigateVersion,
    closePanel,
    openPanel,
    reset,
  };
}
