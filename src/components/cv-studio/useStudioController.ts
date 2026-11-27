import { useEffect, useMemo, useRef, useState } from 'react';
import { applySuggestion, analysisSignature, sameInputs, checkResume, inputSignature, targetText, type Analysis, type ApplicationPackage, type Market, type Resume, type Suggestion, type Version, type Workspace } from '@/lib/cv-studio/schema';
import { marketUpdate } from '@/lib/cv-studio/market';
import { acceptTailoredDraft, tailoredDraft, tailoringIsCurrent } from '@/lib/cv-studio/tailoring';
import { usePackPracticeProgress } from '@/components/practice/usePackPracticeProgress';
import { activeEvidenceGuide } from '@/lib/cv-studio/evidence-schema';
import { ensureEvidenceGuide } from '@/lib/cv-studio/evidence-guide';
import { errorMessage } from '@/lib/cv-studio/term-gaps';
import { addEvidenceFor, readEvidenceReturn, searchWithoutEvidence, type EvidenceReturn } from '@/lib/cv-studio/evidence-return';
import { termGapActions } from './term-gap-actions';
import { startLearning } from './start-learning';
import { applicationFromMaster, carryPracticeAnswers, nameAfterAnalysis } from '@/lib/cv-studio/workspace-rules';
import { downloadFileName } from '@/lib/cv-studio/plain-labels';
import type { SectionKey } from '@/lib/cv-studio/section-order';
import { applyCut, cutPlan, refreshCutPlan, type CutPlan } from '@/lib/cv-studio/condense';
import { applyImprove, improveItems, upsertImproveAnswer } from '@/lib/cv-studio/improve-rules';
import type { ImproveAnswer } from '@/lib/cv-studio/improve-schema';
import type { ImproveQuestion, ImproveSuggestion } from '@/lib/cv-studio/improve';
import type { SpellingOutcome, SpellingResult } from '@/lib/cv-studio/cv-checker';
import type { ImportDiagnosis } from '@/lib/cv-studio/import-diagnosis';
import { applyProofread } from '@/lib/cv-studio/cv-text';
import { saveThenPractise } from './defend-claim';
import type { ProofreadResult, ProofreadSuggestion } from '@/lib/cv-studio/proofread';
import type { ParagraphRewrite } from '@/lib/cv-studio/ai';
import { applyParagraphRewrite, type SentRewrite } from '@/lib/cv-studio/letter-rewrite';
import { currentSpelling, type LastDoneSpelling, type SpellingState } from './spelling-state';
import { runExport, type ExportReply } from './export-file';
import { downloadBlob,jsonResponse, makeWorkspace, useWorkspace } from './useWorkspace';

/** The import awaiting review: the extracted resume, the original text and the server's read check (null or missing when it failed). */
export type ImportedRecord = { resume: Resume; sourceText: string; diagnosis?: ImportDiagnosis | null };

const PENDING: SpellingOutcome = { status: 'pending' };
const NO_PROOFREAD = { ran: false, suggestions: [] as ProofreadSuggestion[], dropped: 0 };

export type Tab = 'profile' | SectionKey | 'checker' | 'improve' | 'job' | 'evidence' | 'review' | 'design' | 'package' | 'history';

export function useStudioController() {
  const state = useWorkspace();
  const { workspace: w, change, save, create, select, removeApplication, workspaces, error, setError } = state;
  const [tab, setTab] = useState<Tab>('profile');
  const practice = usePackPracticeProgress(w?.kind === 'application' ? w.id : null, tab === 'package');
  const [busy, setBusy] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceStart, setEvidenceStart] = useState<string | undefined>(undefined);
  // Set from ?open=ID&evidence=TOPIC when a finished Teach Me journey links here; cleared by the banner's buttons.
  const [evidenceReturn, setEvidenceReturn] = useState<EvidenceReturn | null>(null);
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [imported, setImported] = useState<ImportedRecord | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview, setPreview] = useState<{ url: string; input: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [showTailored, setShowTailored] = useState(true);
  const [improve, setImprove] = useState<{ target: string; questions: ImproveQuestion[]; fallback: boolean; suggestions: ImproveSuggestion[]; notices: string[] }>({ target: '', questions: [], fallback: false, suggestions: [], notices: [] });
  // The "Before Improve my CV" version is saved once per CV per session, before its first accepted change.
  const improveCheckpoint = useRef(new Set<string>());
  const cutCheckpoint = useRef(new Set<string>());
  const [spellingState, setSpellingState] = useState<SpellingState>({ key: '', outcome: PENDING });
  // The last finished result and the CV it belongs to, kept so the score holds steady while a re-check is pending.
  const [lastDone, setLastDone] = useState<LastDoneSpelling | null>(null);
  const spellWorkspaceId = w?.id ?? '';
  const [proofread, setProofread] = useState(NO_PROOFREAD);
  const [rewrite, setRewrite] = useState<SentRewrite & { index: number; result: ParagraphRewrite } | null>(null);
  // The "Before proofread" version is saved once per CV per session, before its first applied fix.
  const proofreadCheckpoint = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => { abort.current?.abort(); if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  // Reads `evidence` once the saved CVs have loaded, then removes it from the address bar (keeping `open`), so a reload
  // shows no banner. Waiting for the load also means Next.js has finished updating the address bar after a client-side link.
  const loaded = state.loaded;
  useEffect(() => {
    if (!loaded) return;
    const { pathname, search, hash } = window.location;
    if (!new URLSearchParams(search).has('evidence')) return;
    window.history.replaceState(null, '', pathname + searchWithoutEvidence(search) + hash);
    // The address bar is browser-only input, read once after loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvidenceReturn(readEvidenceReturn(search));
  }, [loaded]);
  useEffect(() => {
    if (!importOpen && !deleteTarget) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('.studio-modal');
    if (!modal) return;
    const focusable = () => [...modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary')].filter(e => e.getClientRects().length);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); setImportOpen(false); setDeleteTarget(null); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    modal.addEventListener('keydown', onKey);
    return () => { modal.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [importOpen, deleteTarget, busy]);
  const findings = w ? checkResume(w.resume) : [];
  const freshAnalysis = !!w?.analysis && (sameInputs(w.analysisInput, analysisSignature(w)) || sameInputs(w.analysisInput, inputSignature(w)));
  const freshPackage = !!w?.package && w.packageInput === inputSignature(w);
  const pending = w?.analysis?.suggestions.filter(s => s.status === 'pending').length ?? 0;
  const guide = w ? activeEvidenceGuide(w) : undefined;
  const draft = w ? tailoredDraft(w) : null;
  const viewingDraft = tab === 'review' && showTailored && !!draft?.edits.length;
  function openEvidence() {
    if (!w) return;
    try { const next = ensureEvidenceGuide(w); change(next); setEvidenceStart(undefined); setEvidenceOpen(true); }
    catch (e) { setError(errorMessage(e, 'The evidence guide could not be opened.')); }
  }
  /** Keyword-gap actions for the job-match panel; each change goes through the normal autosave. */
  const termGaps = termGapActions({
    workspace: w, change, setError, learn: startLearning,
    openGuide: answerId => { setEvidenceStart(answerId); setEvidenceOpen(true); },
  });
  /** The banner shows only on the application the journey came from; an unknown `open` id never matches. */
  const evidenceTopic = evidenceReturn && w?.id === evidenceReturn.applicationId ? evidenceReturn.topic : null;
  /** "Add evidence for TOPIC": the only write is "I have this" plus clearing its "don't have yet" mark, as one autosaved change. */
  function addEvidenceFromJourney() {
    if (!w || !evidenceTopic) return;
    addEvidenceFor(w, evidenceTopic, {
      change, setError,
      // the banner closes only when the outcome went through; a failed save (guide full) keeps it for a retry
      done: () => setEvidenceReturn(null),
      openQuestion: termGaps.open,
      // A guide with questions opens as it is; otherwise the Evidence tab offers the existing button that prepares one.
      openGuide: () => { if (guide?.answers.length) { setEvidenceStart(undefined); setEvidenceOpen(true); } else setTab('evidence'); },
    });
  }
  function dismissEvidenceReturn() { setEvidenceReturn(null); }
  function update(patch: Partial<Workspace>) {
    if (w) change({ ...w, ...patch });
  }
  async function run(label: string, action: () => Promise<void>) {
    setError(''); setNotice(''); setBusy(label);
    try { await action(); } catch (e) {
      // Cancelling is a choice, not a failure: confirm it calmly instead of showing a browser abort message.
      if (e instanceof Error && e.name === 'AbortError') setNotice('Cancelled. The AI request was stopped and your saved CV was not changed by it.');
      else setError(e instanceof Error ? e.message : 'Please try again.');
    }
    finally { setBusy(''); setAiBusy(false); abort.current = null; }
  }
  async function prepare(action: 'analyze' | 'package', source = w) {
    if (!source) return;
    setRewrite(null);
    await run(action === 'analyze' ? 'Matching the job and tailoring your summary, skills and experience…' : 'Preparing your letter and interview practice…', async () => {
      let target = source;
      if (source.kind === 'master') {
        target = applicationFromMaster(source, makeWorkspace('New application', 'application', source));
        await create(target);
      } else await save(source, 'Before ' + action);
      abort.current = new AbortController();
      setAiBusy(true);
      const response = await jsonResponse<{ result: Analysis | ApplicationPackage; input: string }>(await fetch('/api/cv-studio/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: target, action }), signal: abort.current.signal,
      }));
      // Keep practice answers across pack regeneration, and never overwrite a name the user typed.
      const carried = action === 'package' ? carryPracticeAnswers(target.package, response.result as ApplicationPackage) : null;
      const next: Workspace = action === 'analyze' ? { ...target, analysis: response.result as Analysis, analysisInput: response.input,
        name: nameAfterAnalysis(target, response.result as Analysis)
      } : { ...target, package: carried!.package, packageInput: response.input };
      change(next); await save(next, action === 'analyze' ? 'Job analysis prepared' : 'Application pack prepared');
      if (carried?.carried) setNotice(`Kept ${carried.carried} practice answer${carried.carried === 1 ? '' : 's'} from your previous pack.`
        + (carried.notCarried ? ` ${carried.notCarried} more did not fit; find them under Versions → "Before package".` : ''));
      if (action === 'analyze') setShowTailored(true);
      setTab(action === 'analyze' ? 'review' : 'package');
    });
  }
  async function decide(s: Suggestion, accept: boolean) {
    if (!w?.analysis) return;
    await run(accept ? 'Saving your approved edit…' : 'Saving your decision…', async () => {
      if (accept && targetText(w.resume, s.target) !== s.before) throw new Error('This section has changed. Prepare fresh suggestions.');
      if (accept && (w.kind !== 'application' || !tailoringIsCurrent(w))) throw new Error('Refresh the tailoring review before applying edits to this application. Your saved CV is unchanged.');
      await save(w, 'Before decision: ' + s.target);
      const next = { ...w, resume: accept ? applySuggestion(w.resume, s) : w.resume,
        analysis: { ...w.analysis!, suggestions: w.analysis!.suggestions.map(x => x.id === s.id ? { ...x, status: accept ? 'accepted' as const : 'rejected' as const } : x) } };
      // Assessment remains tied to the original snapshot; each remaining edit must still match its target.
      change(next); await save(next, (accept ? 'Accepted: ' : 'Declined: ') + s.target);
    });
  }
  async function applyDraft() {
    if (!w) return;
    await run('Saving your reviewed, tailored CV…', async () => {
      const next = acceptTailoredDraft(w);
      await save(w, 'Before applying tailored CV');
      change(next); await save(next, 'Applied reviewed tailored CV');
      setShowTailored(false);
      setNotice('Tailored edits saved to this application. Your master is unchanged. Undo or Versions can restore the previous CV. Regenerate the application pack to use this CV.');
    });
  }
  // Another CV has its own parts and suggestions, so nothing from the previous one may linger.
  const openId = w?.id;
  const [improveCv, setImproveCv] = useState(openId);
  if (improveCv !== openId) { setImproveCv(openId); setImprove({ target: '', questions: [], fallback: false, suggestions: [], notices: [] }); }
  // Proposals belong to one CV and one moment; they reset when another CV opens.
  const [storedCuts, setCuts] = useState<CutPlan | null>(null);
  const cuts = useMemo(() => (storedCuts && w ? refreshCutPlan(w, storedCuts) : null), [storedCuts, w]);
  const [cutsCv, setCutsCv] = useState(openId);
  if (cutsCv !== openId) { setCutsCv(openId); setCuts(null); }
  // Roles dismissed from the cut suggestions, per CV, until the page is reloaded; never saved.
  const dismissedCuts = useRef(new Map<string, Set<string>>());
  function suggestCuts() {
    if (!w || w.kind !== 'application') return;
    setCuts(cutPlan(w, new Date(), dismissedCuts.current.get(w.id)));
  }
  function dismissCut(id: string) {
    if (w) dismissedCuts.current.set(w.id, new Set([...(dismissedCuts.current.get(w.id) ?? []), id]));
    setCuts(prev => (prev ? { ...prev, proposals: prev.proposals.filter(p => p.id !== id) } : prev));
  }
  async function applyCuts(ids: string[]) {
    if (!w || !cuts) return;
    const chosen = cuts.proposals.filter(p => ids.includes(p.id));
    if (!chosen.length) return;
    await run('Applying cuts…', async () => {
      let resume = w.resume;
      for (const proposal of chosen) resume = applyCut(resume, proposal);
      if (!cutCheckpoint.current.has(w.id)) { await save(w, 'Before cut and condense'); cutCheckpoint.current.add(w.id); }
      const next = { ...w, resume };
      change(next);
      setCuts(prev => (prev ? { ...prev, proposals: prev.proposals.filter(p => !ids.includes(p.id)) } : prev));
      await save(next);
    });
  }
  const [proofreadCv, setProofreadCv] = useState(openId);
  if (proofreadCv !== openId) { setProofreadCv(openId); setProofread(NO_PROOFREAD); setRewrite(null); }
  async function askRewrite(index: number, instruction: string) {
    if (!w?.package) return;
    const sent = w.package.coverLetter, workspaceId = w.id, packageInput = w.packageInput;
    await run('Rewriting the paragraph…', async () => {
      abort.current = new AbortController();
      setAiBusy(true);
      const { result } = await jsonResponse<{ result: ParagraphRewrite }>(await fetch('/api/cv-studio/letter-paragraph', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace: w, index, instruction }), signal: abort.current.signal,
      }));
      setRewrite({ index, workspaceId, packageInput, sent, result });
    });
  }
  /** Replaces the letter with the checked rewrite; the user must approve the letter again. */
  function applyRewrite() {
    if (!w || !rewrite?.result.ok) return;
    const applied = applyParagraphRewrite(w, { ...rewrite, result: rewrite.result });
    if ('error' in applied) { setError(applied.error); setRewrite(null); return; }
    update({ package: applied.package });
    setRewrite(null);
  }
  function keepMine() { setRewrite(null); }
  async function askProofread() {
    if (!w) return;
    await run('Proofreading your CV…', async () => {
      abort.current = new AbortController();
      setAiBusy(true);
      const { result } = await jsonResponse<{ result: ProofreadResult }>(await fetch('/api/cv-studio/proofread', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace: w }), signal: abort.current.signal,
      }));
      setProofread({ ran: true, suggestions: result.suggestions, dropped: result.dropped });
    });
  }
  async function applyProofreadFix(s: ProofreadSuggestion) {
    if (!w) return;
    const resume = applyProofread(w.resume, s);
    if (!resume) { setError('That wording has changed since the proofread. Run the proofread again.'); return; }
    await run('Saving the proofread fix…', async () => {
      if (!proofreadCheckpoint.current.has(w.id)) { await save(w, 'Before proofread'); proofreadCheckpoint.current.add(w.id); }
      const next = { ...w, resume };
      change(next);
      setProofread(prev => ({ ...prev, suggestions: prev.suggestions.filter(x => x.id !== s.id) }));
      await save(next, 'Proofread: ' + s.label);
    });
  }
  function dismissProofread(s: ProofreadSuggestion) {
    setProofread(prev => ({ ...prev, suggestions: prev.suggestions.filter(x => x.id !== s.id) }));
  }
  // Spelling runs on the server, where the dictionaries live, after a pause in typing, on every tab so the score never changes with the tab.
  const spellKey = w ? JSON.stringify([w.resume, w.spelling ?? 'en-GB', w.ownWords ?? []]) : '';
  const wantSpelling = !!w;
  useEffect(() => {
    if (!wantSpelling || spellingState.key === spellKey) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const [resume, spelling, ownWords] = JSON.parse(spellKey) as [Resume, string, string[]];
      fetch('/api/cv-studio/spelling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume, spelling, ownWords }), signal: controller.signal })
        .then(response => jsonResponse<{ result: SpellingResult }>(response))
        .then(({ result }) => {
          if (controller.signal.aborted) return;
          const outcome: SpellingOutcome = { status: 'done', result };
          setSpellingState({ key: spellKey, outcome });
          setLastDone({ workspaceId: spellWorkspaceId, outcome });
        })
        .catch(() => { if (!controller.signal.aborted) setSpellingState({ key: spellKey, outcome: { status: 'failed' } }); });
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [wantSpelling, spellKey, spellingState.key, spellWorkspaceId]);
  const spelling: SpellingOutcome = currentSpelling(spellingState, lastDone, spellKey, w?.id);
  const spellingChecking = !!w && spellingState.key !== spellKey;
  function setSpellingVariant(variant: 'en-GB' | 'en-US') { update({ spelling: variant }); }
  /** A market also sets the spelling; the spelling switch can still change it afterwards. */
  function setMarket(market: Market) { update(marketUpdate(market)); }
  function addOwnWord(word: string) {
    if (!w) return;
    const words = w.ownWords ?? [];
    const clean = word.trim().slice(0, 60);
    if (!clean || words.some(x => x.toLowerCase() === clean.toLowerCase())) return;
    if (words.length >= 500) { setError('Your word list is full (500 words). Remove a word under "My words" first.'); return; }
    update({ ownWords: [...words, clean] });
  }
  function removeOwnWord(word: string) {
    if (w) update({ ownWords: (w.ownWords ?? []).filter(x => x !== word) });
  }
  function setImproveTarget(target: string) {
    if (target === improve.target) return;
    setImprove({ target, questions: [], fallback: false, suggestions: [], notices: [] });
  }
  async function callImprove<T>(action: 'questions' | 'suggest', target: string): Promise<T> {
    if (!w) throw new Error('Open a CV first.');
    abort.current = new AbortController();
    setAiBusy(true);
    const response = await jsonResponse<{ result: T }>(await fetch('/api/cv-studio/improve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace: w, action, target }), signal: abort.current.signal,
    }));
    return response.result;
  }
  async function askImprove(target: string) {
    await run('Reading this part of your CV and preparing a few questions…', async () => {
      const result = await callImprove<{ questions: ImproveQuestion[]; fallback: boolean }>('questions', target);
      setImprove(prev => ({ ...prev, target, questions: result.questions, fallback: result.fallback }));
    });
  }
  async function suggestImprove(target: string) {
    await run('Writing and checking stronger wording from your CV and answers…', async () => {
      const result = await callImprove<{ suggestions: ImproveSuggestion[]; notices: string[] }>('suggest', target);
      setImprove(prev => ({ ...prev, target, suggestions: result.suggestions, notices: result.notices }));
    });
  }
  function answerImprove(answer: ImproveAnswer) {
    if (!w) return;
    const result = upsertImproveAnswer(w.improve?.answers ?? [], answer);
    if (result.error) { setError(result.error); return; }
    update({ improve: { answers: result.answers } });
  }
  function clearImproveAnswers(target: string) {
    if (!w || !window.confirm('Clear all your saved answers for this part of your CV?')) return;
    update({ improve: { answers: (w.improve?.answers ?? []).filter(a => a.target !== target) } });
  }
  async function acceptImprove(s: ImproveSuggestion, after: string) {
    if (!w) return;
    await run('Saving your improved wording…', async () => {
      const resume = applyImprove(w.resume, { field: s.field, line: s.line, before: s.before, after: after.trim() });
      if (!improveCheckpoint.current.has(w.id)) { await save(w, 'Before Improve my CV'); improveCheckpoint.current.add(w.id); }
      const next = { ...w, resume };
      change(next);
      setImprove(prev => ({ ...prev, suggestions: prev.suggestions.filter(x => x.id !== s.id) }));
      await save(next, 'Improved: ' + (improveItems(w.resume).find(i => i.field === s.field)?.label ?? s.field));
    });
  }
  function rejectImprove(s: ImproveSuggestion) {
    setImprove(prev => ({ ...prev, suggestions: prev.suggestions.filter(x => x.id !== s.id) }));
  }
  /** Saves any unsaved edits, then opens Mock Interview on one bullet so the server sees the same wording. */
  async function defendClaim(target: string, bullet: string) {
    if (!w) return;
    const current = w;
    await run('Saving your CV before practice…', () => saveThenPractise(current, target, bullet, { save, go: url => window.location.assign(url) }));
  }
  async function exportFile(format: 'pdf'|'docx'|'txt', kind: 'cv'|'letter' = 'cv', view = false) {
    if (!w) return;
    await run(view ? 'Rendering the exact PDF and checking its text…' : 'Preparing and checking your download…', async () => {
      setNotice(await runExport({
        view, label: 'Exported ' + kind + ' ' + format.toUpperCase(),
        save: label => save(w, label),
        fetchExport: async () => jsonResponse<ExportReply>(await fetch('/api/cv-studio/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace: w, format, kind, delivery: 'json' }) })),
        show: blob => {
          if (previewRef.current) URL.revokeObjectURL(previewRef.current);
          const url = URL.createObjectURL(blob); previewRef.current = url;
          setPreview({ url, input: JSON.stringify([w.resume, w.layout]) });
        },
        download: blob => downloadBlob(blob, downloadFileName(w, kind, format)),
      }));
    });
  }
  async function importCV() {
    await run('Extracting your career record for review…', async () => {
      const body = new FormData();
      if (importFile) body.append('file', importFile); else body.append('text', importText);
      abort.current = new AbortController();
      setAiBusy(true);
      setImported(await jsonResponse<ImportedRecord>(await fetch('/api/cv-studio/import', { method: 'POST', body, signal: abort.current.signal })));
    });
  }
  async function loadVersions() {
    if (!w) return;
    setVersions([]); setTab('history');
    await run('Loading saved versions…', async () => {
      await save(w);
      setVersions((await jsonResponse<{ versions: Version[] }>(await fetch('/api/cv-studio/versions?id=' + encodeURIComponent(w.id)))).versions);
    });
  }
  const currentPreview = preview && w && preview.input === JSON.stringify([w.resume, w.layout]);
  return {
    state, w, change, save, create, select, removeApplication, workspaces, error, setError, tab, setTab, practice, busy, aiBusy,
    importOpen, setImportOpen, deleteTarget, setDeleteTarget, evidenceOpen, setEvidenceOpen, evidenceStart, termGaps, importText, setImportText,
    evidenceTopic, addEvidenceFromJourney, dismissEvidenceReturn,
    importFile, setImportFile, imported, setImported, versions, setVersions, preview, setPreview, notice, setNotice,
    showTailored, setShowTailored, abort, findings, freshAnalysis, freshPackage, pending, guide, draft, viewingDraft,
    currentPreview, openEvidence, update, run, prepare, decide, applyDraft, exportFile, importCV, loadVersions,
    spelling, spellingChecking, setSpellingVariant, setMarket, addOwnWord, removeOwnWord,
    proofread, askProofread, applyProofreadFix, dismissProofread,
    rewrite, askRewrite, applyRewrite, keepMine,
    cuts, suggestCuts, applyCuts, dismissCut,
    improve, setImproveTarget, askImprove, suggestImprove, answerImprove, clearImproveAnswers, acceptImprove, rejectImprove, defendClaim,
  };
}

export type StudioController = ReturnType<typeof useStudioController>;
