'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Quote } from 'lucide-react';
import { formatElapsed } from '@/components/cv-studio/WorkingBanner';
import { claimFromSearch, type ClaimTarget } from '@/lib/practice/claims';
import { MAX_EXTRA_QUESTIONS, type Attempt } from '@/lib/practice/schema';
import { summarize, type SessionApplication, type SessionQuestion } from '@/lib/practice/session';
import { AnswerBox, type AnswerSubmission } from './AnswerBox';
import { AttemptHistory } from './AttemptHistory';
import { FeedbackCard } from './FeedbackCard';
import { QuestionList } from './QuestionList';
import { SaveEvidenceBox, savedMessage, type EvidenceResult } from './SaveEvidenceBox';

type SessionData = { application: SessionApplication; questions: SessionQuestion[]; attempts: Attempt[]; unreadable: number };
type View = { kind: 'answer'; followUpOf: Attempt | null } | { kind: 'attempt'; attemptId: string };

const STALE_PACK = 'Your CV or posting changed since these questions were written. Regenerate the pack in CV Studio for updated questions.';

const CLAIM_FALLBACK = 'The AI could not be reached, so this is a standard question.';
const MASTER_EMPTY = 'In CV Studio, open Improve my CV, pick a role or Projects and press Practise defending this on a bullet.';
type ClaimOpened = { question: SessionQuestion; fallback: boolean };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body as T;
}

/** Opens (or reuses) the claim question for one bullet. */
async function postClaim(applicationId: string, claim: ClaimTarget, fresh: boolean, signal?: AbortSignal): Promise<ClaimOpened> {
  return readJson<ClaimOpened>(await fetch('/api/practice', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ action: 'claim', application: applicationId, ...claim, fresh }),
  }));
}

function BusyBanner({ label, onCancel }: { label: string; onCancel?: () => void }) {
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg bg-accent p-3 text-small text-accent-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
      <span aria-hidden="true" className="font-mono">{formatElapsed((now - started) / 1000)}</span>
      {onCancel && <button type="button" onClick={onCancel} className="ml-auto underline">Cancel</button>}
    </div>
  );
}

export function PracticeSession({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'answer', followUpOf: null });
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState<'' | 'score' | 'generate' | 'claim' | 'evidence'>('');
  const [actionError, setActionError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [returnTo, setReturnTo] = useState<View | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [notice, setNotice] = useState('');
  const [evidenceResults, setEvidenceResults] = useState<Record<string, { message: string; error: boolean }>>({});
  const abort = useRef<AbortController | null>(null);
  const focusFeedback = useRef(false);
  const claimFromUrl = useRef<ClaimTarget | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/practice?application=${encodeURIComponent(applicationId)}`, { cache: 'no-store' })
      .then(response => readJson<SessionData>(response))
      .then(async loaded => {
        if (cancelled) return;
        setData(loaded); setLoadError('');
        if (claimFromUrl.current === undefined) claimFromUrl.current = claimFromSearch(window.location.search);
        const wanted = claimFromUrl.current;
        if (!wanted) return;
        claimFromUrl.current = null;
        setBusy('claim');
        const controller = new AbortController();
        abort.current = controller;
        try {
          const opened = await postClaim(applicationId, wanted, false, controller.signal);
          if (cancelled) return;
          setData(d => (d && !d.questions.some(q => q.key === opened.question.key) ? { ...d, questions: [...d.questions, opened.question] } : d));
          setSelectedKey(opened.question.key);
          const params = new URLSearchParams(window.location.search);
          params.delete('target'); params.delete('bullet');
          const search = params.toString();
          window.history.replaceState(null, '', window.location.pathname + (search ? '?' + search : ''));
          if (opened.fallback) setNotice(CLAIM_FALLBACK);
        } catch (e) {
          const aborted = e instanceof Error && e.name === 'AbortError';
          if (!cancelled) setActionError(aborted ? 'Cancelled.' : e instanceof Error ? e.message : 'Could not open this claim.');
          // The server may have saved the question before Cancel: read the list again so the screen matches it.
          if (aborted && !cancelled) setReloadTick(t => t + 1);
        } finally {
          // Always end this request's busy state, even if the page moved on, unless a newer request took over.
          if (abort.current === controller) { setBusy(''); abort.current = null; }
        }
      })
      .catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load this practice session.'); });
    return () => { cancelled = true; };
  }, [applicationId, reloadTick]);
  useEffect(() => () => abort.current?.abort(), []);

  const question = data?.questions.find(q => q.key === selectedKey) ?? data?.questions[0] ?? null;
  const questionAttempts = useMemo(() => (data && question ? data.attempts.filter(a => a.questionKey === question.key) : []), [data, question]);
  const shownAttempt = view.kind === 'attempt' ? data?.attempts.find(a => a.id === view.attemptId) ?? null : null;
  const shownQuestion = shownAttempt ? data?.questions.find(q => q.key === shownAttempt.questionKey) ?? null : null;
  const progress = data ? summarize(data.questions) : null;
  const extraCount = data?.questions.filter(q => q.source === 'extra').length ?? 0;
  const canGenerate = !!data?.application.hasPosting && extraCount < MAX_EXTRA_QUESTIONS;
  const questionIndex = data && question ? data.questions.findIndex(q => q.key === question.key) : -1;
  const nextQuestion = data && questionIndex >= 0 ? data.questions[questionIndex + 1] ?? null : null;

  function freshAnswer(followUpOf: Attempt | null) {
    setHasDraft(false);
    setView({ kind: 'answer', followUpOf });
    setReturnTo(null);
    setRound(r => r + 1);
    setActionError('');
  }
  function confirmDiscard(): boolean {
    return !hasDraft || window.confirm('Discard your unsaved answer?');
  }
  function selectQuestion(key: string) {
    if (busy || key === question?.key || !confirmDiscard()) return;
    setSelectedKey(key);
    freshAnswer(null);
  }
  function showAttempt(id: string) {
    if (view.kind === 'answer') setReturnTo(view);
    setView({ kind: 'attempt', attemptId: id });
  }
  function backToAnswer() {
    if (!returnTo) return;
    setView(returnTo);
    setReturnTo(null);
  }
  function failureMessage(e: unknown, fallback: string, cancelled: string) {
    if (e instanceof Error && e.name === 'AbortError') return cancelled;
    return e instanceof Error ? e.message : fallback;
  }

  async function submit(submission: AnswerSubmission) {
    if (!question) return;
    const followUpOf = view.kind === 'answer' ? view.followUpOf : null;
    setBusy('score');
    setActionError('');
    setNotice('');
    abort.current = new AbortController();
    try {
      const saved = await readJson<Attempt>(await fetch('/api/practice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify({
          action: 'score', application: applicationId, questionKey: question.key,
          questionText: followUpOf?.followUpQuestion ?? question.text, followUpOf: followUpOf?.id ?? null, ...submission,
        }),
      }));
      setData(d => (d ? { ...d, attempts: [...d.attempts, saved] } : d));
      focusFeedback.current = true;
      setHasDraft(false);
      setReturnTo(null);
      setView({ kind: 'attempt', attemptId: saved.id });
      setReloadTick(t => t + 1);
    } catch (e) {
      setActionError(failureMessage(e, 'Feedback failed. Your answer is still in the box.', 'Cancelled. If feedback had already been saved, it will appear in your attempts.'));
      setReloadTick(t => t + 1);
    } finally {
      setBusy('');
      abort.current = null;
    }
  }

  async function generate() {
    setBusy('generate');
    setActionError('');
    setNotice('');
    abort.current = new AbortController();
    try {
      const result = await readJson<{ questions?: unknown[] }>(await fetch('/api/practice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify({ action: 'generate', application: applicationId }),
      }));
      if (!result.questions?.length) setNotice('No new questions this time. Try again for different ones.');
      setReloadTick(t => t + 1);
    } catch (e) {
      setActionError(failureMessage(e, 'Could not generate questions.', 'Cancelled. If new questions had already been added, they will appear in the list.'));
      setReloadTick(t => t + 1);
    } finally {
      setBusy('');
      abort.current = null;
    }
  }

  async function differentQuestion() {
    if (!question?.claim || busy || !confirmDiscard()) return;
    setBusy('claim');
    setActionError('');
    setNotice('');
    abort.current = new AbortController();
    try {
      const opened = await postClaim(applicationId, question.claim, true, abort.current.signal);
      setData(d => (d ? { ...d, questions: [...d.questions, opened.question] } : d));
      setSelectedKey(opened.question.key);
      freshAnswer(null);
      if (opened.fallback) setNotice(CLAIM_FALLBACK);
    } catch (e) {
      setActionError(failureMessage(e, 'Could not get a different question.', 'Cancelled.'));
      // The server may have saved the new question before Cancel: read the list again so the screen matches it.
      if (e instanceof Error && e.name === 'AbortError') setReloadTick(t => t + 1);
    } finally {
      setBusy('');
      abort.current = null;
    }
  }

  async function saveEvidence(attemptId: string, input: { answer: string; number: string }): Promise<boolean> {
    setBusy('evidence');
    setEvidenceResults(r => Object.fromEntries(Object.entries(r).filter(([id]) => id !== attemptId)));
    try {
      const result = await readJson<EvidenceResult>(await fetch('/api/practice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-evidence', application: applicationId, attemptId, ...input, confirmed: true }),
      }));
      setEvidenceResults(r => ({ ...r, [attemptId]: { message: [savedMessage(result), result.masterNote].filter(Boolean).join(' '), error: false } }));
      return true;
    } catch (e) {
      setEvidenceResults(r => ({ ...r, [attemptId]: { message: e instanceof Error ? e.message : 'The evidence could not be saved. Please try again.', error: true } }));
      return false;
    } finally {
      setBusy('');
    }
  }

  if (loadError && !data) {
    return (
      <div className="mx-auto max-w-3xl px-(--space-page-inline) py-10">
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-small text-destructive">{loadError}</p>
        <Link href="/interview" className="mt-4 inline-block text-small underline">Back to Interview</Link>
      </div>
    );
  }
  if (!data) {
    return <p className="mx-auto flex max-w-3xl items-center gap-2 px-(--space-page-inline) py-10 text-small text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your practice session…</p>;
  }

  const answering = view.kind === 'answer' ? view : null;
  return (
    <div className="mx-auto w-full max-w-6xl px-(--space-page-inline) py-8">
      <Link href="/interview" className="mb-4 inline-flex items-center gap-1.5 text-small text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to Interview
      </Link>
      <header className="mb-6 space-y-1">
        <h1 className="text-h2 text-foreground sm:text-h1">
          {data.application.kind === 'master' ? 'Master CV · ' : ''}{data.application.role}{data.application.company ? ` · ${data.application.company}` : ''}
        </h1>
        <p className="text-small text-muted-foreground">
          {progress && progress.total > 0
            ? `${progress.practised} of ${progress.total} practised${progress.average !== null ? ` · average ${progress.average}/10` : ''}`
            : 'Interview practice'}
          {' · '}
          <Link href={`/cv-studio?open=${encodeURIComponent(data.application.id)}`} className="underline">Open in CV Studio</Link>
        </p>
        {data.application.packStale && <p role="note" className="rounded-lg bg-accent p-3 text-small text-accent-foreground">{STALE_PACK}</p>}
        {loadError && <p role="status" className="text-small text-muted-foreground">Could not refresh your progress. Reload the page to see the latest.</p>}
        {data.unreadable > 0 && <p role="status" className="text-small text-muted-foreground">{data.unreadable} saved practice record(s) could not be read and are hidden. Nothing was deleted.</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <QuestionList questions={data.questions} selectedKey={question?.key ?? null} onSelect={selectQuestion} onGenerate={() => void generate()}
          canGenerate={canGenerate} capReached={!!data.application.hasPosting && extraCount >= MAX_EXTRA_QUESTIONS} generating={busy === 'generate'} disabled={!!busy}
          emptyHint={data.application.kind === 'master' ? MASTER_EMPTY : undefined} />

        <main className="space-y-5">
          {busy && <BusyBanner label={busy === 'score' ? 'Getting feedback on your answer…' : busy === 'claim' ? 'Writing a question about your claim…' : busy === 'evidence' ? 'Saving your evidence…' : 'Writing new questions…'} onCancel={busy === 'evidence' ? undefined : () => abort.current?.abort()} />}
          {notice && <p role="status" className="rounded-lg bg-muted/60 p-3 text-body text-foreground">{notice}</p>}
          {actionError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-small text-destructive">{actionError}</p>}

          {question && (
            <section className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-5">
              {question.claim && !answering?.followUpOf && (
                <blockquote className="flex gap-2 rounded-lg bg-muted/60 p-3 text-body text-foreground">
                  <Quote className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span><span className="sr-only">Your CV says: </span>{question.claim.bullet}</span>
                </blockquote>
              )}
              <h2 className="text-h3 text-foreground">
                {answering?.followUpOf ? <><span className="text-small font-medium text-muted-foreground">Follow-up · </span>{answering.followUpOf.followUpQuestion}</> : question.text}
              </h2>
              {question.claim && !answering?.followUpOf && (
                <div className="flex flex-wrap items-center gap-3 text-small">
                  <p className="text-muted-foreground">Aim for about 60 seconds.</p>
                  <button type="button" onClick={() => void differentQuestion()} disabled={!!busy} className="underline disabled:opacity-50">Ask me a different question</button>
                </div>
              )}
              {!answering?.followUpOf && (question.guidance || question.evidence.length > 0) && (
                <details className="text-small">
                  <summary className="cursor-pointer text-muted-foreground">How to approach this</summary>
                  {question.guidance && <p className="mt-2 text-foreground">{question.guidance}</p>}
                  {question.evidence.length > 0 && <p className="mt-1 text-muted-foreground">Draw on: {question.evidence.join('; ')}</p>}
                </details>
              )}
              {(answering || returnTo) && (
                <div hidden={!answering}>
                  <AnswerBox key={`${question.key}:${round}`} disabled={!!busy} hidden={!answering} onSubmit={s => void submit(s)} onDraftChange={setHasDraft} />
                </div>
              )}
            </section>
          )}

          {shownAttempt && returnTo && (
            <button type="button" onClick={backToAnswer} className="rounded-lg border border-primary/40 px-4 py-2 text-small font-medium text-primary hover:bg-accent">Back to your answer</button>
          )}
          {shownAttempt && (
            <FeedbackCard
              attempt={shownAttempt}
              sectionRef={el => { if (el && focusFeedback.current) { focusFeedback.current = false; el.focus(); } }}
              onTryAgain={() => { if (confirmDiscard()) freshAnswer(null); }}
              onFollowUp={shownAttempt.followUpOf === null ? () => { if (confirmDiscard()) freshAnswer(shownAttempt); } : undefined}
              onNext={nextQuestion ? () => selectQuestion(nextQuestion.key) : undefined}
            />
          )}

          {shownAttempt && shownAttempt.followUpOf === null && shownQuestion?.claim && (
            <SaveEvidenceBox key={shownAttempt.id} initialAnswer={shownAttempt.answer} busy={busy === 'evidence'} disabled={!!busy}
              result={evidenceResults[shownAttempt.id] ?? null} onSave={input => saveEvidence(shownAttempt.id, input)} />
          )}

          <AttemptHistory attempts={questionAttempts} selectedId={shownAttempt?.id ?? null} onSelect={showAttempt} />
        </main>
      </div>
    </div>
  );
}
