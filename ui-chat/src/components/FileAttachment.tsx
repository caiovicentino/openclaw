import { File as FileIcon, Image, X } from "lucide-react";

interface FileAttachmentProps {
  file: File;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachment({ file, onRemove }: FileAttachmentProps) {
  const isImage = file.type.startsWith("image/");

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
      {isImage ? (
        <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate max-w-[150px]" title={file.name}>
        {file.name}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">{formatSize(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 shrink-0 rounded p-0.5 hover:bg-muted"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
