import { useQuery } from "@tanstack/react-query";
import {
  X,
  Download,
  File,
  FileCode,
  FileJson,
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchWorkspaceFiles,
  fetchFileContent,
  downloadWorkspace,
  type WorkspaceFile,
} from "@/api/chat";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";

interface WorkspaceFilesProps {
  sessionId: string;
  isStreaming: boolean;
  onClose: () => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  modified: string;
  children: Map<string, TreeNode>;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h"].includes(ext)) {
    return <FileCode className="h-4 w-4 shrink-0 text-blue-400" />;
  }
  if (["json", "yaml", "yml", "toml"].includes(ext)) {
    return <FileJson className="h-4 w-4 shrink-0 text-yellow-400" />;
  }
  if (["md", "txt", "csv", "log"].includes(ext)) {
    return <FileText className="h-4 w-4 shrink-0 text-zinc-400" />;
  }
  return <File className="h-4 w-4 shrink-0 text-zinc-500" />;
}

function getLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    c: "c",
    cpp: "cpp",
    h: "c",
    xml: "xml",
    svg: "xml",
  };
  return map[ext] ?? "text";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTree(files: WorkspaceFile[]): TreeNode {
  const root: TreeNode = {
    name: "",
    fullPath: "",
    isDir: true,
    size: 0,
    modified: "",
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath,
          isDir: !isLast,
          size: isLast ? file.size : 0,
          modified: isLast ? file.modified : "",
          children: new Map(),
        });
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

const FileTreeNode = memo(function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = selectedPath === node.fullPath;

  const sortedChildren = useMemo(() => {
    return Array.from(node.children.values()).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-zinc-300 hover:bg-zinc-800"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          )}
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          sortedChildren.map((child) => (
            <FileTreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.fullPath)}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm ${
        isSelected
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3.5 shrink-0" />
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
      <span className="ml-auto shrink-0 text-xs text-zinc-600">{formatSize(node.size)}</span>
    </button>
  );
});

export const WorkspaceFiles = memo(function WorkspaceFiles({
  sessionId,
  isStreaming,
  onClose,
}: WorkspaceFilesProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const {
    data: files = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["workspace-files", sessionId],
    queryFn: () => fetchWorkspaceFiles(sessionId),
    refetchInterval: isStreaming ? 5000 : false,
  });

  const { data: fileContent, isLoading: isLoadingContent } = useQuery({
    queryKey: ["file-content", sessionId, selectedFile],
    queryFn: () => fetchFileContent(sessionId, selectedFile!),
    enabled: !!selectedFile,
  });

  useEffect(() => {
    if (isStreaming) {
      refetch();
    }
  }, [isStreaming, refetch]);

  const tree = useMemo(() => buildTree(files), [files]);

  const handleSelect = useCallback((path: string) => {
    setSelectedFile((prev) => (prev === path ? null : path));
  }, []);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const blob = await downloadWorkspace(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workspace-${sessionId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Download failed silently
    } finally {
      setIsDownloading(false);
    }
  }, [sessionId]);

  const selectedFileName = selectedFile?.split("/").pop() ?? "";

  return (
    <div className="flex h-full flex-col bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h3 className="text-sm font-medium text-zinc-200">Files ({files.length})</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={files.length === 0 || isDownloading}
            className="h-7 gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-sm text-zinc-500">
            No files yet. Files created during the session will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="flex-shrink-0 overflow-y-auto border-b border-zinc-800 py-1"
            style={{ maxHeight: "50%" }}
          >
            {Array.from(tree.children.values())
              .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((node) => (
                <FileTreeNode
                  key={node.fullPath}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile}
                  onSelect={handleSelect}
                />
              ))}
          </div>

          {selectedFile && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-1.5">
                {getFileIcon(selectedFileName)}
                <span className="truncate text-xs text-zinc-300">{selectedFile}</span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {isLoadingContent ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <CodeBlock code={fileContent ?? ""} language={getLanguage(selectedFileName)} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
