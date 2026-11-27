"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useInterviewStore, type QuickAttempt } from "@/store/interview-store";
import { QuestionCard } from "@/components/interview/QuestionCard";
import { AnswerBox, type AnswerSubmission } from "@/components/practice/AnswerBox";
import { FeedbackCard } from "@/components/practice/FeedbackCard";
import type { MockQuestion } from "@/lib/interview-engine";
import { draftKey, isCancelled } from "@/lib/quick-practice/drafts";

/** An explicit "Try again" or "Answer the follow-up" choice for one question. */
type AnswerTarget = { questionId: string; followUpOf: QuickAttempt | null };
type ScoreResponse = Pick<QuickAttempt, "score" | "star" | "fixes" | "rewrite" | "rewriteWithheld" | "followUpQuestion">;

export default function MockQuestionsPage() {
  const router = useRouter();
  const {
    role,
    questions,
    currentQuestionIndex,
    attempts,
    answers,
    answerMeta,
    isLoading,
    error,
    setQuestions,
    addAttempt,
    setAnswer,
    setAnswerMeta,
    nextQuestion,
    previousQuestion,
    setLoading,
    setError,
    addArchivedQuestion,
  } = useInterviewStore();

  // The draft being scored (its draftKey), or null. Only that answer shows "Scoring…" and its Cancel.
  const [scoringKey, setScoringKey] = useState<string | null>(null);
  const isScoring = scoringKey !== null;
  const [isArchiving, setIsArchiving] = useState(false);
  const [target, setTarget] = useState<AnswerTarget | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Errors from scoring/archiving one question. Kept separate from the page-level
  // `error` (question loading) so a failed call never hides the question or the typed answer.
  // Stored with its question id so it disappears when the user moves to another question.
  const [actionErrorState, setActionErrorState] = useState<{ questionId: string; message: string } | null>(null);

  const currentQuestion: MockQuestion | undefined = questions[currentQuestionIndex];
  const questionAttempts: QuickAttempt[] = currentQuestion ? attempts[currentQuestion.id] ?? [] : [];
  const latestMain = [...questionAttempts].reverse().find((a) => a.followUpOf === null);
  // The answer box shows for a question with no attempts yet, or after "Try again" / "Answer the follow-up".
  const answering: { followUpOf: QuickAttempt | null } | null = !currentQuestion
    ? null
    : target?.questionId === currentQuestion.id
      ? { followUpOf: target.followUpOf }
      : questionAttempts.length === 0
        ? { followUpOf: null }
        : null;
  const currentDraftKey = currentQuestion && answering ? draftKey(currentQuestion.id, answering.followUpOf?.id ?? null) : "";

  const actionError =
    actionErrorState && actionErrorState.questionId === currentQuestion?.id ? actionErrorState.message : null;
  function setActionError(message: string | null) {
    setActionErrorState(message && currentQuestion ? { questionId: currentQuestion.id, message } : null);
  }

  // Redirect if no role is set
  useEffect(() => {
    if (!role) {
      router.push("/interview");
    }
  }, [role, router]);

  // Load questions when the page mounts
  useEffect(() => {
    if (!role || questions.length > 0) return;

    async function loadQuestions() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/interview/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error ?? "Failed to load questions.");
          return;
        }

        const data = await response.json();
        setQuestions(data.questions ?? []);
      } catch {
        setError("Failed to load questions. Please check your connection and try again.");
      } finally {
        setLoading(false);
      }
    }

    loadQuestions();
  }, [role, questions.length, setQuestions, setLoading, setError]);

  function answerAgain(followUpOf: QuickAttempt | null) {
    if (!currentQuestion) return;
    setActionError(null);
    setTarget({ questionId: currentQuestion.id, followUpOf });
  }

  function cancelAnswer() {
    setActionError(null);
    setTarget(null);
  }

  async function submit(submission: AnswerSubmission) {
    if (!currentQuestion || !answering) return;
    const question = currentQuestion;
    const followUpOf = answering.followUpOf;
    const questionText = followUpOf?.followUpQuestion ?? question.question;
    const key = draftKey(question.id, followUpOf?.id ?? null);
    const controller = new AbortController();
    abortRef.current = controller;

    setScoringKey(key);
    setActionError(null);
    try {
      const response = await fetch("/api/interview/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          role: question.role,
          question: questionText,
          answer: submission.answer,
          ...(followUpOf ? { parent: { question: followUpOf.questionText, answer: followUpOf.answer } } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setActionError(data.error ?? "Failed to score your answer.");
        return;
      }
      const feedback = data as ScoreResponse;
      addAttempt(question.id, {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        questionText,
        followUpOf: followUpOf?.id ?? null,
        answer: submission.answer,
        durationSeconds: submission.durationSeconds,
        inputMethod: submission.inputMethod,
        score: feedback.score,
        star: feedback.star,
        fixes: feedback.fixes,
        rewrite: feedback.rewrite,
        rewriteWithheld: feedback.rewriteWithheld,
        followUpQuestion: feedback.followUpQuestion,
      });
      setAnswer(key, "");
      setTarget(null);
      // Cleared after the box has gone away (its leave report would otherwise save the old time again).
      setTimeout(() => setAnswerMeta(key, null), 0);
    } catch (error) {
      // A cancelled request keeps the answer in the box and shows no error.
      if (!isCancelled(error)) setActionError("Failed to score your answer. Please check your connection.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setScoringKey(null);
    }
  }

  async function handleArchive(attempt: QuickAttempt) {
    if (!currentQuestion) return;

    setIsArchiving(true);
    setActionError(null);
    try {
      const response = await fetch("/api/interview/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          role: currentQuestion.role,
          questionText: currentQuestion.question,
          userAnswer: attempt.answer,
          score: attempt.score,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setActionError(data.error ?? "Failed to archive question.");
        return;
      }

      // The API wraps the record as { archived }. Removing the question from the list
      // already moves the view to the following question.
      const data = await response.json();
      addArchivedQuestion(data.archived ?? data);
    } catch {
      setActionError("Failed to archive question. Please check your connection.");
    } finally {
      setIsArchiving(false);
    }
  }

  // If no role, show nothing (redirect will kick in)
  if (!role) {
    return null;
  }

  return (
    <div className="relative flex flex-1 flex-col px-(--space-page-inline) py-8 overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="animate-orbit absolute left-[10%] top-[20%] h-32 w-32 rounded-full border border-primary/40 opacity-60" />
        <div className="animate-drift absolute right-[15%] top-[30%] h-24 w-24 rounded-2xl bg-primary/20 rotate-12" />
        <div className="animate-spin-slow absolute bottom-[20%] left-[20%] h-48 w-48 rounded-full border-2 border-dashed border-primary/30" />
        <div className="animate-float absolute right-[25%] bottom-[30%] h-4 w-4 rounded-full bg-primary/40" />
        <div className="animate-float-slow absolute -left-20 top-[10%] h-72 w-72 rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-2xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <Link
          href="/interview"
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-small font-medium text-primary transition-all duration-200 hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Interview
        </Link>

        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-h2 text-foreground sm:text-h1">
            Mock Questions
          </h1>
          <p className="mt-1 text-small text-muted-foreground">
            Role: <span className="font-medium text-primary">{role}</span>
          </p>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Loader2 className="relative size-10 animate-spin text-primary" aria-hidden="true" />
            </div>
            <p className="mt-6 text-small text-muted-foreground">
              Generating challenging questions for <span className="font-medium text-primary">{role}</span>...
            </p>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm animate-fade-in-up" role="alert">
            <p className="text-small text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setQuestions([]);
              }}
              className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-foreground"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && questions.length === 0 && (
          <div className="rounded-2xl border border-border/60 bg-card/80 p-10 text-center shadow-lg shadow-primary/5 backdrop-blur-sm animate-fade-in-up">
            <p className="text-foreground-secondary">
              No new questions are available for this role. All questions may have been archived.
            </p>
            <Link
              href="/interview/archive"
              className="mt-4 inline-flex items-center rounded-lg bg-accent px-4 py-2 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-accent-foreground"
            >
              View your archive
            </Link>
          </div>
        )}

        {!isLoading && !error && currentQuestion && (
          <div className="space-y-6 animate-fade-in-up delay-200" style={{ animationFillMode: "both" }}>
            <QuestionCard
              question={currentQuestion}
              currentIndex={currentQuestionIndex}
              totalQuestions={questions.length}
            />

            {actionError && (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-small" role="alert">
                <p className="text-destructive">
                  {actionError}
                  {answering && " Your answer is still in the box below; press Submit to try again."}
                </p>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            {questionAttempts.map((attempt, index) => {
              const latest = index === questionAttempts.length - 1 && !answering;
              return (
                <FeedbackCard
                  key={attempt.id}
                  attempt={attempt}
                  onTryAgain={latest ? () => answerAgain(null) : undefined}
                  onFollowUp={latest && attempt.followUpOf === null ? () => answerAgain(attempt) : undefined}
                  onNext={latest && currentQuestionIndex < questions.length - 1 ? nextQuestion : undefined}
                />
              );
            })}

            {answering && (
              <div className="space-y-3">
                {answering.followUpOf && (
                  <p className="text-body text-foreground">
                    <span className="font-semibold">Follow-up:</span> {answering.followUpOf.followUpQuestion}
                  </p>
                )}
                <AnswerBox
                  key={`${currentQuestion.id}:${questionAttempts.length}:${answering.followUpOf?.id ?? "main"}`}
                  disabled={isScoring}
                  initialText={answers[currentDraftKey] ?? ""}
                  onTextChange={(text) => setAnswer(currentDraftKey, text)}
                  initialMeta={answerMeta[currentDraftKey]}
                  onLeave={(meta) => {
                    if ((answers[currentDraftKey] ?? "").trim() || meta.seconds > 0) setAnswerMeta(currentDraftKey, meta);
                  }}
                  onSubmit={(submission) => void submit(submission)}
                />
                {isScoring && scoringKey !== currentDraftKey && (
                  <p role="status" className="text-small text-muted-foreground">
                    Another answer is being scored. You can send this one when it has finished.
                  </p>
                )}
                {scoringKey === currentDraftKey && (
                  <div role="status" className="flex items-center gap-2 text-small text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Scoring your answer…
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
                      className="rounded-md px-2 py-1 text-small font-medium text-primary underline hover:bg-accent"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {!isScoring && target?.questionId === currentQuestion.id && (
                  <button
                    type="button"
                    onClick={cancelAnswer}
                    className="rounded-lg border border-border px-4 py-2 text-small hover:bg-muted"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {latestMain && !answering && (
              <button
                type="button"
                onClick={() => void handleArchive(latestMain)}
                disabled={isArchiving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-accent px-4 py-2.5 text-small font-medium text-primary transition-colors hover:bg-primary/15 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive className="size-4" aria-hidden="true" />
                {isArchiving ? "Archiving..." : "Archive this Question"}
              </button>
            )}

            {questions.length > 1 && (
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-4 py-3 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={previousQuestion}
                  disabled={currentQuestionIndex === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-small font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </button>

                <div className="flex items-center gap-2" role="tablist" aria-label="Question navigation">
                  {questions.map((question, index) => {
                    const scored = (attempts[question.id]?.length ?? 0) > 0;
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => useInterviewStore.getState().goToQuestion(index)}
                        className={`rounded-full transition-all duration-300 ${
                          index === currentQuestionIndex
                            ? "size-3 bg-primary shadow-md shadow-primary/30"
                            : scored
                              ? "size-2.5 bg-green-400 dark:bg-green-500"
                              : "size-2.5 bg-muted-foreground/25 hover:bg-muted-foreground/40"
                        }`}
                        role="tab"
                        aria-selected={index === currentQuestionIndex}
                        aria-label={`Question ${index + 1}${scored ? " (scored)" : ""}`}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={nextQuestion}
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-small font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
