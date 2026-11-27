import { z } from 'zod';
import { ask, boundary } from './ai';
import { evidenceCatalog, targetText, type Workspace } from './schema';
import { improveCatalog } from './improve-schema';
import { sourceQuote } from './source-quote';
import { normalizeVoice, voiceBrief, voiceIssues, voiceMessages, type VoiceKind } from './human-voice';
import { approximateNumbers, fallbackQuestions, headlineNewWords, improveItems, missingApproximations, ownershipFlags, sameSkills, unsupportedNumbers, type ImproveItem } from './improve-rules';

export type ImproveQuestion = { bullet: string; question: string; why: string };
export type ImproveSuggestion = { id: string; field: string; line: number | null; before: string; after: string; reason: string; sources: { source: string; quote: string }[]; flags: string[]; warnings: string[] };

const Source = z.object({ source: z.string().max(300), quote: z.string().max(12000) });
const LineDraft = z.object({ line: z.number().int().min(0), after: z.string().max(2000), reason: z.string().max(1500), sources: z.array(Source).max(8) });
const FieldDraft = z.object({ after: z.string().max(6000), reason: z.string().max(1500), sources: z.array(Source).max(8) });

const IMPROVE_BRIEF = `You are improving the candidate's own CV without a job posting. Use ONLY facts in the supplied CV section, the rest of the CV catalog, and the candidate's confirmed answers. Never invent a duty, tool, number, result, scope, title or employer. A number may appear only if the candidate wrote it (as digits or as a word). If an answer is marked approximate, keep a word such as about, around, roughly or up to, or a range. Never upgrade ownership (assisted, supported or helped must not become led or managed). Every suggestion cites the catalog sources it uses, with EXACT substrings as quotes. Evidence from one role can never be used in another role's bullets.`;

function item(w: Workspace, target: string): ImproveItem {
  const found = improveItems(w.resume).find(i => i.target === target);
  if (!found) throw new Error('Choose a part of your CV to improve.');
  return found;
}
const GENERAL_KEYS = new Set(['personal', 'summary', 'skills', 'certifications', 'additional', 'awards', 'training', 'publications', 'strengths', 'interests', 'references', 'languages']);
/** The sources Improve may use: the CV and answered Improve answers, scoped to the target; never notes, guided answers or documents. */
function improveEvidence(w: Workspace, it: ImproveItem): Record<string, string> {
  const full = evidenceCatalog(w);
  const answerTarget = new Map((w.improve?.answers ?? []).map(a => ['improve.' + a.id, a.target]));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(full)) {
    if (GENERAL_KEYS.has(key) || key.startsWith('education.')) out[key] = value;
    else if (key.startsWith('experience.') || key.startsWith('volunteering.') || key === 'projects') {
      if (it.kind === 'summary' || it.kind === 'headline' || it.kind === 'skills' || key === it.target) out[key] = value;
    }
  }
  // Improve answers live only here, never in the shared evidence catalog.
  for (const [key, value] of Object.entries(improveCatalog(w))) {
    if (it.kind === 'summary' || (it.kind === 'bullets' && answerTarget.get(key) === it.target)) out[key] = value;
  }
  return out;
}
const stripBullet = (s: string) => s.replace(/^\s*[•*-]\s*/, '').trim();
const answersFor = (w: Workspace, target: string) => (w.improve?.answers ?? []).filter(a => a.target === target && a.status === 'answered' && a.answer.trim());

export async function improveQuestions(w: Workspace, target: string, signal?: AbortSignal): Promise<{ questions: ImproveQuestion[]; fallback: boolean }> {
  const it = item(w, target);
  if (it.kind !== 'bullets') throw new Error('Questions are asked about roles, volunteering and projects.');
  const bullets = (targetText(w.resume, it.field) ?? '').split('\n').filter(l => l.trim());
  const asked = new Set((w.improve?.answers ?? []).filter(a => a.target === target).map(a => a.question.trim().toLowerCase()));
  try {
    const raw = await ask(boundary + `
${IMPROVE_BRIEF}
Read this CV section and ask 2 to 5 short questions about its WEAKEST bullets (no result, no scale, vague duty). Each question names the bullet it is about, quoting it exactly in "bullet" (or "" for a general question), and asks the candidate for their own action, the result, how they know, or the scale (people, money, time, volume). Never suggest a number or an answer. Do not repeat questions already asked.
${voiceBrief('guidance')}
Return {"questions":[{"bullet":"exact bullet text","question":"","why":"one short reason"}]}.`,
      { section: it.label, bullets, alreadyAsked: [...asked], answers: answersFor(w, target).map(a => ({ question: a.question, answer: a.answer })) }, signal);
    const parsed = z.object({ questions: z.array(z.object({ bullet: z.string().max(12000), question: z.string().trim().min(1).max(12000), why: z.string().max(1000) })).max(8) }).parse(raw);
    const seen = new Set<string>();
    // A stored answer must satisfy ImproveAnswerSchema (2000 each), so long CV lines and questions are clamped.
    const questions = parsed.questions
      .map(q => ({ bullet: (bullets.find(b => q.bullet.trim() && stripBullet(b) === stripBullet(q.bullet)) ?? '').slice(0, 2000), question: normalizeVoice(q.question).slice(0, 2000), why: normalizeVoice(q.why) }))
      .filter(q => {
        const key = q.question.trim().toLowerCase();
        if (asked.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
    if (questions.length >= 2) return { questions, fallback: false };
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const fixed = fallbackQuestions();
  const fresh = fixed.filter(q => !asked.has(q.question.trim().toLowerCase()));
  return { questions: fresh.length ? fresh : fixed, fallback: true };
}

type Draft = { id: string; line: number | null; before: string; after: string; reason: string; sources: { source: string; quote: string }[] };

export async function improveSuggestions(w: Workspace, target: string, signal?: AbortSignal): Promise<{ suggestions: ImproveSuggestion[]; notices: string[] }> {
  const it = item(w, target);
  const catalog = improveEvidence(w, it);
  const current = targetText(w.resume, it.field) ?? '';
  const kind: VoiceKind = it.kind === 'bullets' ? 'bullet' : it.kind === 'skills' ? 'bullet' : it.kind;
  const lines = current.split('\n');
  const answers = it.kind === 'bullets' ? answersFor(w, target) : it.kind === 'summary' ? (w.improve?.answers ?? []).filter(a => a.status === 'answered' && a.answer.trim()) : [];
  const approximate = approximateNumbers(answers);
  const voiceSources = Object.values(catalog).join('\n');
  const notices: string[] = [];

  const shapeFor = it.kind === 'bullets'
    ? 'Return {"suggestions":[{"line":0,"after":"improved bullet","reason":"why it is stronger","sources":[{"source":"catalog key","quote":"exact substring"}]}]}. Suggest only for lines you can genuinely improve; at most one per line.'
    : 'Return {"suggestion":{"after":"improved text","reason":"why it is stronger","sources":[{"source":"catalog key","quote":"exact substring"}]}}.';
  const task = it.kind === 'bullets' ? 'Rewrite weak bullets as action, context or scale, and recorded result, using the confirmed answers.'
    : it.kind === 'summary' ? 'Write a stronger 2 to 3 sentence professional summary from the strongest confirmed facts.'
    : it.kind === 'headline' ? 'Write a short professional headline using only titles, fields and skills already in the CV.'
    : 'Group and order the listed skills under short labels (one group per line, "Label: skill, skill"). Use every listed skill exactly once and add none.';

  const toDrafts = (raw: unknown): Draft[] => {
    if (it.kind === 'bullets') {
      const parsed = z.object({ suggestions: z.array(LineDraft).max(40) }).parse(raw).suggestions;
      const firstPerLine = parsed.filter((s, i) => parsed.findIndex(o => o.line === s.line) === i);
      return firstPerLine.filter(s => lines[s.line]?.trim()).map(s => ({ id: `${it.field}#${s.line}`, line: s.line, before: lines[s.line], after: normalizeVoice(s.after.trim()), reason: normalizeVoice(s.reason), sources: s.sources }));
    }
    const s = z.object({ suggestion: FieldDraft }).parse(raw).suggestion;
    return [{ id: it.field === 'personal.professionalTitle' ? 'headline' : it.field, line: null, before: current, after: normalizeVoice(s.after.trim()), reason: normalizeVoice(s.reason), sources: s.sources }];
  };
  /** Hard rules: a draft breaking any of these is repaired once, then withheld. */
  const problems = (d: Draft): string[] => {
    const out: string[] = [];
    if (!d.after || d.after === d.before) out.push('It does not change the text.');
    if (d.line !== null && /[\r\n]/.test(d.after)) out.push('A suggestion for one line must stay on one line.');
    if (!d.sources.length || d.sources.some(s => sourceQuote(catalog[s.source], s.quote) === null)) out.push('Its sources could not be found word for word in the CV or answers.');
    const evidence = [d.before, ...d.sources.map(s => s.quote)].join('\n');
    const extra = unsupportedNumbers(evidence, d.after);
    if (extra.length) out.push(`It contains numbers the candidate did not give: ${extra.join(', ')}.`);
    const unqualified = missingApproximations(d.after, approximate);
    if (unqualified.length) out.push(`These approximate numbers need "about", "around", "up to" or a range: ${unqualified.join(', ')}.`);
    if (it.kind === 'skills' && !sameSkills(d.before, d.after)) out.push('Skills grouping must use exactly the same skills, adding and removing none.');
    if (it.kind === 'headline') { const extraWords = headlineNewWords(w.resume, d.after); if (extraWords.length) out.push(`The headline uses words not in the CV: ${extraWords.join(', ')}.`); }
    return out;
  };
  const voiceOf = (d: Draft) => voiceIssues(d.after, kind, voiceSources);

  const prompt = (extra: string) => boundary + `
${IMPROVE_BRIEF}
${task}
${voiceBrief(kind)}
${extra}
${shapeFor}`;
  const data = { section: it.label, lines: it.kind === 'bullets' ? lines.map((text, index) => ({ index, text })) : undefined, text: it.kind === 'bullets' ? undefined : current, catalog, confirmedAnswers: answers.map(a => ({ source: 'improve.' + a.id, question: a.question, answer: a.answer, number: a.number })) };

  const unreadable = new Error('The AI response could not be read. Your CV is unchanged; try again.');
  let raw: unknown;
  try {
    raw = await ask(prompt(''), data, signal);
  } catch (error) {
    // Only a malformed structured response is "unreadable"; setup, length and provider errors keep their own message.
    if (!signal?.aborted && error instanceof Error && /structured response/.test(error.message)) throw unreadable;
    throw error;
  }
  let drafts: Draft[];
  try {
    drafts = toDrafts(raw);
  } catch {
    throw unreadable;
  }
  const noChange = `No changes were suggested for ${it.label}.`;
  const needsRepair = drafts.filter(d => problems(d).length || voiceOf(d).some(v => v.repairable));
  if (needsRepair.length) {
    try {
      const repaired = toDrafts(await ask(prompt('Revise ONLY the listed drafts to fix every listed problem. Keep each line index. If a problem cannot be fixed with the recorded facts, remove that fact.'),
        { ...data, drafts: needsRepair.map(d => ({ line: d.line, after: d.after, sources: d.sources, problems: [...problems(d), ...voiceMessages(voiceOf(d).filter(v => v.repairable))] })) }, signal));
      const repairIds = new Set(needsRepair.map(d => d.id));
      drafts = drafts.map(d => (repairIds.has(d.id) ? repaired.find(r => r.id === d.id) ?? d : d));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  drafts = drafts.filter(d => {
    const failed = problems(d);
    if (failed.length) notices.push(`A suggestion for ${it.label} was withheld: ${failed.join(' ')} Your CV is unchanged.`);
    return !failed.length;
  });
  if (!drafts.length) return { suggestions: [], notices: notices.length ? notices : [noChange] };

  let checks: { id: string; supported: boolean; reason: string }[] | null = null;
  for (let attempt = 0; attempt < 2 && !checks; attempt++) {
    try {
      const verdict = await ask(boundary + `
Audit every proposed CV rewrite against its original text and cited sources. Reject added claims, invented tools or results, increased seniority, upgraded ownership (supported vs led), or lost meaning. Evidence from one role can never be used in another role's bullets. Return {"checks":[{"id":"","supported":true,"reason":""}]}.`,
        { catalog, rewrites: drafts.map(d => ({ id: d.id, before: d.before, after: d.after, sources: d.sources })), confirmedAnswers: answers.map(a => ({ question: a.question, answer: a.answer, number: a.number })) }, signal);
      checks = z.object({ checks: z.array(z.object({ id: z.string(), supported: z.boolean(), reason: z.string() })) }).parse(verdict).checks;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  if (!checks) return { suggestions: [], notices: [...notices, 'The suggestions could not be checked, so none are shown. Your CV is unchanged; try again.'] };
  const verified = checks;
  const suggestions = drafts.flatMap(d => {
    const matches = verified.filter(c => c.id === d.id);
    if (matches.length !== 1 || !matches[0].supported) { notices.push(`A suggestion for ${it.label} was withheld by the meaning check. Your CV is unchanged.`); return []; }
    return [{ ...d, field: it.field, flags: ownershipFlags(d.before, d.sources.map(s => s.quote).join('\n'), d.after), warnings: voiceMessages(voiceOf(d)) }];
  });
  return { suggestions, notices: suggestions.length || notices.length ? notices : [noChange] };
}
