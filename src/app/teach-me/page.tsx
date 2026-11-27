"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Sparkles, Loader2, Clock, ChevronRight, Trash2, Map, FileText, Check, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/documents/FileUploader";
import { useJourneyStore } from "@/store/journey-store";
import { validateTopic } from "@/lib/validators/topic";
import { clearLearningHandoff, loadLearningHandoff } from "@/lib/cv-studio/learning-handoff";
import { browserLocalStorage, rememberJourneyCvLink } from "@/lib/cv-studio/journey-cv-links";

interface JourneySummary {
  id: string;
  topic: string;
  createdAt: string;
  isInteractive: boolean;
  sectionCount: number;
  stageCount: number;
}

interface SavedDocument {
  id: string;
  fileName: string;
  format: string;
  wordCount: number;
  sectionCount: number;
  parsedAt: string;
}

export default function TeachMePage() {
  const router = useRouter();
  const {
    topic,
    setTopic,
    learningHandoff,
    setLearningHandoff,
    uploadedFiles,
    isGenerating,
    progress,
    progressMessage,
    error,
    startGeneration,
    setProgress,
    setJourney,
    setError,
    getParsedDocumentIds,
    hasUploadingFiles,
  } = useJourneyStore();

  const [topicError, setTopicError] = useState<string | null>(null);
  const [pastJourneys, setPastJourneys] = useState<JourneySummary[]>([]);
  const [loadingJourneys, setLoadingJourneys] = useState(true);
  const [touched, setTouched] = useState(false);
  const [savedDocs, setSavedDocs] = useState<SavedDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [loadingDocs, setLoadingDocs] = useState(true);
  // CV Studio supplies a temporary browser-session draft. Reading it only
  // pre-fills this page; no journey is saved until Generate is selected.
  useEffect(() => {
    const handoff = loadLearningHandoff(window.sessionStorage);
    if (!handoff) return;
    setTopic(handoff.topic);
    setLearningHandoff(handoff);
  }, [setLearningHandoff, setTopic]);

  // Load past journeys from database on mount
  useEffect(() => {
    async function fetchPastJourneys() {
      try {
        const response = await fetch("/api/journey");
        if (response.ok) {
          const data = await response.json();
          setPastJourneys(data.journeys ?? []);
        }
      } catch {
        // Silent fail — past journeys are non-critical
      } finally {
        setLoadingJourneys(false);
      }
    }
    fetchPastJourneys();
  }, []);

  const fetchSavedDocs = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setSavedDocs(data.documents ?? []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  // Load saved documents on mount
  useEffect(() => {
    // State changes happen after the asynchronous request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSavedDocs();
  }, [fetchSavedDocs]);

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleDeleteSavedDoc = async (docId: string) => {
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: docId }),
      });
      if (res.ok) {
        setSavedDocs((prev) => prev.filter((d) => d.id !== docId));
        setSelectedDocIds((prev) => {
          const next = new Set(prev);
          next.delete(docId);
          return next;
        });
      }
    } catch {
      // Silent fail
    }
  };

  const handleTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTopic(value);
    if (learningHandoff && value !== learningHandoff.topic) {
      clearLearningHandoff(window.sessionStorage);
      setLearningHandoff(null);
    }

    if (touched) {
      const result = validateTopic(value);
      setTopicError(result.valid ? null : result.error ?? null);
    }
  };

  const handleTopicBlur = () => {
    setTouched(true);
    const result = validateTopic(topic);
    setTopicError(result.valid ? null : result.error ?? null);
  };

  const handleGenerate = async () => {
    // Validate: at least a topic or documents must be provided
    const result = validateTopic(topic);
    const documentIds = getParsedDocumentIds();
    // Combine freshly uploaded doc IDs with selected saved doc IDs
    const allDocIds = [...documentIds, ...Array.from(selectedDocIds)];
    const hasDocumentsReady = allDocIds.length > 0;

    if (!result.valid && !hasDocumentsReady) {
      setTouched(true);
      setTopicError("Please provide a topic (3-200 chars) or upload documents to generate a journey.");
      return;
    }

    // If topic is provided but invalid, show error
    if (topic.trim().length > 0 && !result.valid) {
      setTouched(true);
      setTopicError(result.error ?? null);
      return;
    }

    // Check if files are still uploading
    if (hasUploadingFiles()) {
      setError("Please wait for all files to finish uploading before generating.");
      return;
    }

    setTopicError(null);
    // Kept for this generation only: the journey it produces remembers its CV Studio application.
    const handoff = learningHandoff;
    clearLearningHandoff(window.sessionStorage);
    setLearningHandoff(null);
    startGeneration();

    try {
      setProgress(10, "Generating your learning journey...");

      // Generate the journey — server loads full content from disk by IDs
      const response = await fetch("/api/journey/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim() || undefined,
          documentIds: allDocIds.length > 0 ? allDocIds : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Failed to generate journey. Please try again."
        );
      }

      setProgress(20, "Processing journey stream...");

      // Read the SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let journeyData = null;
      let streamError: string | null = null;

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.error) {
                  streamError = event.message || "Journey generation failed.";
                } else if (event.progress) {
                  setProgress(event.progress, event.message || "Generating...");
                }
                if (event.stage === "complete" && event.partialJourney) {
                  journeyData = event.partialJourney;
                }
              } catch {
                // Skip malformed SSE lines
              }
            }
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      if (journeyData) {
        setProgress(95, "Finalizing...");
        if (handoff) {
          // Browser-only link back to CV Studio; failures are ignored and nothing reaches dev.db.
          rememberJourneyCvLink(browserLocalStorage(), {
            journeyId: journeyData.id,
            topic: handoff.topic,
            role: handoff.role,
            company: handoff.company,
            applicationId: handoff.applicationId,
          });
        }
        setJourney(journeyData);
        router.push(`/teach-me/journey/${journeyData.id}`);
      } else {
        throw new Error("Journey generation completed but no data was received. Check your LLM provider connection.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    }
  };

  const isTopicValid = validateTopic(topic).valid;
  const hasDocuments = uploadedFiles.some((f) => f.status === 'parsed') || selectedDocIds.size > 0;
  const filesUploading = hasUploadingFiles();
  const canGenerate = (isTopicValid || hasDocuments) && !isGenerating && !filesUploading;

  return (
    <div className="mx-auto w-full max-w-2xl px-(--space-page-inline) py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <BookOpen className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-h2 text-foreground sm:text-h1">
          Teach Me
        </h1>
        <p className="mt-2 text-small text-foreground-secondary sm:text-lead">
          Enter a topic and optionally upload documents to generate a
          personalized learning journey.
        </p>
      </div>

      {learningHandoff && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-small" role="status">
          <p className="font-medium text-foreground">Learning plan from CV Studio</p>
          {(learningHandoff.role || learningHandoff.company) && (
            <p className="mt-1 text-muted-foreground">
              For {learningHandoff.role || "your target role"}{learningHandoff.company ? ` at ${learningHandoff.company}` : ""}
            </p>
          )}
          {learningHandoff.exercise && <p className="mt-2 text-foreground">Suggested practice: {learningHandoff.exercise}</p>}
          <p className="mt-2 text-small text-foreground-secondary">Review the topic below. Nothing is saved until you select Generate Learning Journey.</p>
        </div>
      )}

      {/* Main form area */}
      <div className="space-y-6">
        {/* Topic input */}
        <div className="space-y-2">
          <label
            htmlFor="topic-input"
            className="text-small font-medium text-foreground"
          >
            What do you want to learn?
          </label>
          <input
            id="topic-input"
            type="text"
            value={topic}
            onChange={handleTopicChange}
            onBlur={handleTopicBlur}
            placeholder="e.g., Machine Learning fundamentals, React design patterns..."
            disabled={isGenerating}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-body text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
            aria-describedby={topicError ? "topic-error" : "topic-hint"}
            aria-invalid={topicError ? true : undefined}
            maxLength={200}
          />
          {topicError ? (
            <p id="topic-error" className="text-small text-destructive" role="alert">
              {topicError}
            </p>
          ) : (
            <p id="topic-hint" className="text-small text-muted-foreground">
              {topic.trim().length}/200 characters (minimum 3)
            </p>
          )}
        </div>

        {/* Document upload area */}
        <div className="space-y-2">
          <label className="text-small font-medium text-foreground">
            Upload documents{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <FileUploader />
        </div>

        {/* Saved documents — select previously uploaded docs for reuse */}
        {!loadingDocs && savedDocs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-small font-medium text-foreground">
                Saved documents{" "}
                <span className="font-normal text-muted-foreground">
                  ({selectedDocIds.size} selected)
                </span>
              </label>
              <span className="text-caption text-muted-foreground">
                {uploadedFiles.filter((f) => f.status === "parsed").length + selectedDocIds.size}/20 total documents
              </span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto">
              {savedDocs.map((doc) => {
                const isSelected = selectedDocIds.has(doc.id);
                return (
                  <div
                    key={doc.id}
                    className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => toggleDocSelection(doc.id)}
                      disabled={isGenerating}
                      className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                      aria-label={`${isSelected ? "Deselect" : "Select"} ${doc.fileName}`}
                    >
                      {isSelected && <Check className="size-3" />}
                    </button>

                    <File className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

                    <div className="flex-1 min-w-0">
                      <p className="text-body truncate text-foreground">{doc.fileName}</p>
                      <p className="text-caption text-muted-foreground">
                        {doc.sectionCount} sections · {doc.wordCount.toLocaleString()} words
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSavedDoc(doc.id)}
                      disabled={isGenerating}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${doc.fileName}`}
                      title="Delete document"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {isGenerating && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              <p className="text-small font-medium text-foreground">{progressMessage}</p>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Journey generation progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {error && !isGenerating && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3" role="alert">
            <p className="text-small text-destructive">{error}</p>
          </div>
        )}

        {/* Generate button */}
        <Button
          size="lg"
          className="w-full gap-2 py-3 text-lead"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Generating...
            </>
          ) : filesUploading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Waiting for uploads...
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" />
              Generate Journey
            </>
          )}
        </Button>
      </div>

      {/* Past Journeys section */}
      {!loadingJourneys && pastJourneys.length > 0 && (
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="mb-4 text-h3 text-foreground">My Journeys</h2>
          <div className="space-y-3">
            {pastJourneys.map((j) => (
              <div
                key={j.id}
                className="group relative flex items-center rounded-lg border border-border bg-card transition-colors hover:border-primary/30 hover:bg-muted/30"
              >
                <Link
                  href={`/teach-me/journey/${j.id}`}
                  className="flex flex-1 items-center justify-between p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-body font-medium text-foreground">{j.topic}</p>
                      {j.isInteractive ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary">
                          <Map className="size-2.5" aria-hidden="true" />
                          Interactive
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                          <FileText className="size-2.5" aria-hidden="true" />
                          Legacy
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-caption text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden="true" />
                        {new Date(j.createdAt).toLocaleDateString()}
                      </span>
                      <span>
                        {j.isInteractive
                          ? `${j.stageCount} stages`
                          : `${j.sectionCount} sections`}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${j.topic}"? This cannot be undone.`)) return;
                    try {
                      const res = await fetch(`/api/journey/${j.id}`, { method: "DELETE" });
                      if (res.ok) {
                        setPastJourneys((prev) => prev.filter((p) => p.id !== j.id));
                      }
                    } catch {
                      // Silent fail
                    }
                  }}
                  className="mr-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Delete ${j.topic}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
