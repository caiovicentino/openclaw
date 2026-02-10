import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Trash2,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
} from "lucide-react";
import { useState, useCallback } from "react";
import { client } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// --- Types ---

interface KBFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: "pending" | "processing" | "ready" | "error";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KBStats {
  totalFiles: number;
  readyFiles: number;
  processingFiles: number;
  errorFiles: number;
  totalSize: number;
  totalChunks: number;
}

interface SearchResult {
  content: string;
  score: number;
  fileName: string;
}

// --- Helpers ---

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function statusBadge(status: KBFile["status"]) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

// --- Component ---

export default function KnowledgeBaseTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Fetch files
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["agent", agentId, "kb-files"],
    queryFn: () => client.get<{ files: KBFile[] }>(`/knowledge-base/agents/${agentId}/files`),
    refetchInterval: 5000, // Poll for processing status updates
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["agent", agentId, "kb-stats"],
    queryFn: () => client.get<KBStats>(`/knowledge-base/agents/${agentId}/stats`),
    refetchInterval: 10000,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return client.post(`/knowledge-base/agents/${agentId}/upload`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "kb-files"],
      });
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "kb-stats"],
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      client.delete(`/knowledge-base/agents/${agentId}/files/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "kb-files"],
      });
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "kb-stats"],
      });
    },
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: (query: string) =>
      client.post<{ results: SearchResult[] }>(`/knowledge-base/agents/${agentId}/search`, {
        query,
        limit: 5,
      }),
    onSuccess: (data) => {
      setSearchResults(data.results);
    },
  });

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file) uploadMutation.mutate(file);
      }
    },
    [uploadMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

  const files = filesData?.files ?? [];

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Files</p>
              <p className="text-2xl font-bold">{stats.totalFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Chunks</p>
              <p className="text-2xl font-bold">{stats.totalChunks}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Total Size</p>
              <p className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center gap-2 mt-1">
                {stats.readyFiles > 0 && (
                  <span className="text-sm text-green-600">{stats.readyFiles} ready</span>
                )}
                {stats.processingFiles > 0 && (
                  <span className="text-sm text-yellow-600">
                    {stats.processingFiles} processing
                  </span>
                )}
                {stats.errorFiles > 0 && (
                  <span className="text-sm text-red-600">{stats.errorFiles} error</span>
                )}
                {stats.totalFiles === 0 && (
                  <span className="text-sm text-muted-foreground">No files yet</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <HardDrive className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drag and drop files here, or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supported: .txt, .md, .csv, .json, .pdf, .js, .ts, .py (max 20MB)
            </p>
            <input
              type="file"
              multiple
              className="hidden"
              id="kb-file-upload"
              accept=".txt,.md,.csv,.json,.pdf,.js,.ts,.jsx,.tsx,.py"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => document.getElementById("kb-file-upload")?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Browse Files
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Database className="h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No documents uploaded yet. Upload files to build the knowledge base.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.fileName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.fileSize)}</span>
                        <span>{file.fileType}</span>
                        <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                      </div>
                      {file.errorMessage && (
                        <p className="text-xs text-destructive mt-1">{file.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statusBadge(file.status)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(file.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Test Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Test the knowledge base search to verify documents are properly indexed. The agent will
            automatically use this when chatting.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="kb-search" className="sr-only">
                Search query
              </Label>
              <Input
                id="kb-search"
                placeholder="Enter a search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    searchMutation.mutate(searchQuery.trim());
                  }
                }}
              />
            </div>
            <Button
              onClick={() => searchMutation.mutate(searchQuery.trim())}
              disabled={!searchQuery.trim() || searchMutation.isPending}
            >
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {searchResults !== null && (
            <div className="space-y-2 mt-4">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No results found.</p>
              ) : (
                searchResults.map((result, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{result.fileName}</span>
                      <Badge variant="outline" className="text-xs">
                        Score: {result.score.toFixed(3)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {result.content.slice(0, 500)}
                      {result.content.length > 500 ? "..." : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
