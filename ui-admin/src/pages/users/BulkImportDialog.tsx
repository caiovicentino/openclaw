import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { useState, useCallback } from "react";
import type { BulkImportUser, BulkImportResult } from "@/api/types";
import { bulkImportUsers } from "@/api/users";
import { Button } from "@/components/ui/button";

interface BulkImportDialogProps {
  onClose: () => void;
}

interface ParsedRow {
  name: string;
  email: string;
  role?: string;
  [key: string]: string | undefined;
}

export default function BulkImportDialog({ onClose }: BulkImportDialogProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [allRows, setAllRows] = useState<BulkImportUser[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return;

    const firstLine = lines[0];
    if (!firstLine) return;
    const csvHeaders = firstLine.split(",").map((h) => h.trim());
    setHeaders(csvHeaders);

    const rows: ParsedRow[] = [];
    const importRows: BulkImportUser[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());
      const row: ParsedRow = { name: "", email: "" };
      csvHeaders.forEach((header, idx) => {
        row[header.toLowerCase()] = values[idx] ?? "";
      });
      importRows.push({
        name: row.name,
        email: row.email,
        role: row.role,
      });
      if (i <= 5) rows.push(row);
    }
    setPreview(rows);
    setAllRows(importRows);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(selected);
  };

  const importMutation = useMutation({
    mutationFn: () => bulkImportUsers(allRows),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Import Users from CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            {/* File upload */}
            <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 text-center">
              {file ? (
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreview([]);
                      setHeaders([]);
                      setAllRows([]);
                    }}
                    className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Drop your CSV file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expected columns: name, email, role (optional)
                  </p>
                </>
              )}
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className={file ? "hidden" : "absolute inset-0 cursor-pointer opacity-0"}
              />
            </div>

            {/* Preview table */}
            {preview.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Preview (first {preview.length} rows of {allRows.length} total)
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        {headers.map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-b-0">
                          {headers.map((h) => (
                            <td key={h} className="px-3 py-2 text-sm">
                              {row[h.toLowerCase()] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importMutation.isError && (
              <p className="text-sm text-destructive">
                Import failed. Please check your file and try again.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!file || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="flex items-center gap-3 rounded-lg border border-border p-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Import completed</p>
                <p className="text-xs text-muted-foreground">
                  {result.created} users imported successfully
                  {result.failed > 0 && `, ${result.failed} failed`}
                </p>
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Errors
                </h3>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-destructive/30 p-3">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
