"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, AlertCircle, CheckCircle2, Loader2, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  validateDocumentUpload,
  MAX_FILES_PER_SESSION,
  SUPPORTED_FORMATS,
} from "@/lib/validators/document";
import { useJourneyStore, type UploadedFile } from "@/store/journey-store";

export function FileUploader() {
  const {
    uploadedFiles,
    addFiles,
    updateFileStatus,
    updateFileProgress,
    removeFile,
  } = useJourneyStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File, index: number) => {
      // Simulate progress while uploading
      const progressInterval = setInterval(() => {
        updateFileProgress(index, Math.min(90, Math.random() * 30 + 60));
      }, 500);

      try {
        const formData = new FormData();
        formData.append("files", file);

        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          updateFileStatus(index, "error", undefined, "Upload failed");
          return;
        }

        const data = await response.json();
        const result = data.results?.[0];

        if (result?.success && result.document?.id) {
          updateFileStatus(index, "parsed", result.document.id);
        } else {
          updateFileStatus(
            index,
            "error",
            undefined,
            result?.error?.reason || "Failed to parse document"
          );
        }
      } catch {
        clearInterval(progressInterval);
        updateFileStatus(index, "error", undefined, "Network error during upload");
      }
    },
    [updateFileStatus, updateFileProgress]
  );

  const handleFiles = useCallback(
    (incoming: FileList | File[]) => {
      const fileArray = Array.from(incoming);
      const validFiles: UploadedFile[] = [];
      const newErrors: string[] = [];

      for (const file of fileArray) {
        const result = validateDocumentUpload(
          { name: file.name, size: file.size },
          uploadedFiles.length + validFiles.length
        );

        if (result.valid) {
          validFiles.push({
            file,
            status: "uploading",
            progress: 10,
          });
        } else {
          newErrors.push(result.error!);
        }
      }

      if (validFiles.length > 0) {
        const startIndex = uploadedFiles.length;
        addFiles(validFiles);

        // Immediately start uploading each file
        validFiles.forEach((uploadedFile, i) => {
          uploadFile(uploadedFile.file, startIndex + i);
        });
      }

      setErrors(newErrors);
      if (newErrors.length > 0) {
        setTimeout(() => setErrors([]), 5000);
      }
    },
    [uploadedFiles.length, addFiles, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleClick = () => fileInputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  };

  const acceptedFormats = SUPPORTED_FORMATS.map((f) => `.${f}`).join(",");
  const isAtLimit = uploadedFiles.length >= MAX_FILES_PER_SESSION;
  const parsedCount = uploadedFiles.filter((f) => f.status === "parsed").length;
  const uploadingCount = uploadedFiles.filter((f) => f.status === "uploading").length;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/50",
          isAtLimit && "pointer-events-none opacity-50"
        )}
        aria-label="Upload documents by dragging and dropping or clicking to browse"
        aria-disabled={isAtLimit}
      >
        <Upload
          className={cn(
            "mb-3 size-8",
            isDragOver ? "text-primary" : "text-muted-foreground"
          )}
          aria-hidden="true"
        />
        <p className="text-body font-medium text-foreground">
          {isDragOver ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="mt-1 text-small text-muted-foreground">or click to browse</p>
        <p className="mt-2 text-small text-muted-foreground">
          Supported: PDF, DOCX, EPUB, XLSX, PPTX (max 100 MB each)
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          {uploadedFiles.length}/{MAX_FILES_PER_SESSION} files
          {parsedCount > 0 && ` · ${parsedCount} ready`}
          {uploadingCount > 0 && ` · ${uploadingCount} uploading`}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          multiple
          accept={acceptedFormats}
          onChange={handleInputChange}
          aria-label="Select files to upload"
          disabled={isAtLimit}
        />
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="space-y-1.5" role="alert" aria-live="polite">
          {errors.map((error, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-small text-destructive">{error}</p>
            </div>
          ))}
        </div>
      )}

      {/* File list with upload status */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-2" role="list" aria-label="Uploaded files">
            {uploadedFiles.map((uploadedFile, index) => (
              <FileItem
                key={`${uploadedFile.file.name}-${index}`}
                uploadedFile={uploadedFile}
                onRemove={() => removeFile(index)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FileItem({ uploadedFile, onRemove }: { uploadedFile: UploadedFile; onRemove: () => void }) {
  const { file, status, error, progress } = uploadedFile;
  const ext = file.name.split(".").pop()?.toUpperCase() ?? "";

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <li className="relative flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 overflow-hidden">
      {/* Progress bar background */}
      {status === "uploading" && (
        <div
          className="absolute inset-0 bg-primary/5 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 shrink-0">
        {status === "uploading" && (
          <div className="relative size-5">
            <svg className="size-5 -rotate-90" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
              <circle
                cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2"
                className="text-primary"
                strokeDasharray={`${(progress / 100) * 50.26} 50.26`}
                strokeLinecap="round"
              />
            </svg>
            <Loader2 className="absolute inset-0 m-auto size-3 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}
        {status === "parsed" && (
          <CheckCircle2 className="size-5 text-green-500" aria-hidden="true" />
        )}
        {status === "error" && (
          <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
        )}
      </div>

      {/* File info */}
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-body text-foreground">{file.name}</span>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-caption font-medium uppercase bg-muted text-muted-foreground">
          {ext}
        </span>
      </div>

      {/* Size and status text */}
      <div className="relative z-10 flex items-center gap-2">
        <span className="shrink-0 text-caption text-muted-foreground">
          {status === "uploading" && "Parsing..."}
          {status === "parsed" && formatFileSize(file.size)}
          {status === "error" && (
            <span className="text-destructive text-caption">{error || "Failed"}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${file.name}`}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
