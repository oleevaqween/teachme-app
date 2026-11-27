import { evidenceCatalog, type Workspace } from './schema';
import { limitedAnswer } from './answer-intent';
import type { EvidenceAnswer } from './evidence-schema';

export type AnswerAlternative = { id: string; kind: 'record' | 'outline' | 'uncertainty'; title: string; detail: string; draft: string; source?: string };
const stop = new Set('what which when where why how have has had did does do you your the a an and or to for of in with from that this any about can could would please provide example experience relevant describe tell work used use'.split(' '));
function words(text: string) { return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 1 && !stop.has(word)))]; }

/** Instant, local coaching: recorded text or clearly unfinished outlines, never
 * a generated biography. Selection is a draft, not confirmation or a CV edit. */
export function answerAlternatives(w: Workspace, question: EvidenceAnswer): AnswerAlternative[] {
  const query = words(question.question + ' ' + question.why);
  const results: AnswerAlternative[] = [];
  const catalog = evidenceCatalog(w);
  const related = Object.entries(catalog).filter(([source, text]) => source !== 'personal' && source !== 'notes' && source !== 'answer.' + question.id && !source.startsWith('document.' + question.id + '.') && text.trim() && !limitedAnswer(text))
    .map(([source, text]) => ({ source, text, score: query.filter(word => words(text).includes(word)).length }))
    .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
  for (const entry of related) {
    // Select whole recorded lines rather than rewrite or invent their meaning.
    const lines = entry.text.split('\n').filter(line => query.some(word => words(line).includes(word)));
    let excerpt = '';
    for (const line of lines.length ? lines : [entry.text]) {
      if ((excerpt + '\n' + line).length <= 4500) excerpt += (excerpt ? '\n' : '') + line;
    }
    if (!excerpt) continue;
    const role = entry.source.startsWith('experience.') ? w.resume.experience.find(e => 'experience.' + e.id === entry.source) : undefined;
    results.push({ id: 'record-' + results.length, kind: 'record', source: entry.source,
      title: role ? 'Revisit your work at ' + role.company : 'Revisit your recorded ' + entry.source.split('.')[0],
      detail: 'This passage shares terms with the question. It may offer a transferable example, but it does not prove the specific skill or qualification. Review its relevance and explain your own contribution.',
      draft: (role ? role.title + ' at ' + role.company + ':\n' : 'A related passage from my career record:\n') + excerpt });
  }
  const credential = /certif|credential|licen[cs]|qualification|degree|pmp\b/i.test(question.question);
  const preference = /prefer|relocat|availab|salary|remuneration|willing|on.site|start date/i.test(question.question);
  results.push({ id: 'outline', kind: 'outline', title: preference ? 'Clarify your preference' : credential ? 'Check related learning or qualifications' : 'Build a transferable-experience answer',
    detail: 'An outline to complete, not a claim about you. Replace every bracketed prompt with a true detail, or remove it. Training and personal projects must not be presented as employment.',
    draft: preference ? 'My preference or availability is [your actual preference]. I can confirm [known details]. I still need to clarify [the outstanding detail].' : credential ? 'My relevant completed qualification or learning is [exact title, or state that none applies], issued by [issuer, if applicable], with status [completed / in progress / not applicable]. A related practical example, if any, is [a genuine example and your contribution].' : 'A related example is [a genuine work, volunteering, study or personal project]. My role was [your actual responsibility] at [organisation or context]. I personally [the action you took]. The outcome was [a result you can support; no number is required]. This demonstrates [the relevant transferable skill, without claiming an unheld qualification].' });
  results.push({ id: 'uncertainty', kind: 'uncertainty', title: 'Keep the uncertainty explicit',
    detail: 'You can keep an honest gap and continue. An unanswered detail should not prevent the application from highlighting your verified strengths.',
    draft: limitedAnswer(question.answer) === 'none' ? 'I do not have a relevant example or evidence to add for this question at present.' : 'I am not certain about this detail and need to verify it before making a claim.' });
  return results;
}
export function adoptAnswerAlternative(answer: EvidenceAnswer, alternative: AnswerAlternative): EvidenceAnswer {
  return { ...answer, answer: alternative.draft, status: 'draft', assistance: {
    originalReply: answer.assistance?.originalReply ?? answer.answer,
    kind: alternative.kind, ...(alternative.source ? { source: alternative.source } : {}),
  } };
}
