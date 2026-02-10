import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: "json" | "csv") => Promise<void>;
  title?: string;
}

export default function ExportDialog({
  open,
  onClose,
  onExport,
  title = "Export Data",
}: ExportDialogProps) {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(format);
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choose a format to export.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFormat("json")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
              format === "json"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/30",
            )}
          >
            <FileJson className="h-8 w-8" />
            <span className="text-sm font-medium">JSON</span>
            <span className="text-xs text-muted-foreground">Structured data</span>
          </button>

          <button
            type="button"
            onClick={() => setFormat("csv")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
              format === "csv"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/30",
            )}
          >
            <FileSpreadsheet className="h-8 w-8" />
            <span className="text-sm font-medium">CSV</span>
            <span className="text-xs text-muted-foreground">Spreadsheet-friendly</span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting} className="gap-2">
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting..." : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
