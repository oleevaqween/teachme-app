"use client";

import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFormatBadgeColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "docx":
      return "bg-accent text-accent-foreground";
    case "epub":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "xlsx":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "pptx":
      return "bg-primary/10 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function FileList({ files, onRemove }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-small font-medium text-foreground">
        Uploaded files ({files.length}/20)
      </p>
      <ul className="space-y-2" role="list" aria-label="Uploaded files">
        {files.map((file, index) => {
          const ext = file.name.split(".").pop()?.toUpperCase() ?? "";
          return (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors"
            >
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-small text-foreground">
                  {file.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-label font-medium uppercase",
                    getFormatBadgeColor(file.name)
                  )}
                >
                  {ext}
                </span>
              </div>
              <span className="shrink-0 text-caption text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
