import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LETTER_WORTH_IT, ParagraphRewriter, SpecificityList } from './LetterParts';

const noop = () => {};
const paragraphs = ['Dear Hiring Manager,', 'Acme is bringing power to rural clinics.', 'I prepared monthly reports for 4 stakeholders.', 'Kind regards,\nAda Okoro'];

describe('cover letter parts', () => {
  it('shows each specificity result', () => {
    const good = renderToStaticMarkup(<SpecificityList result={{ example: true, employer: true, company: 'Acme' }} />);
    expect(good).toContain('Has a concrete example from your experience.');
    expect(good).toContain('Gives a reason specific to Acme.');
    const weak = renderToStaticMarkup(<SpecificityList result={{ example: false, employer: false, company: 'Acme' }} />);
    expect(weak).toContain('Add one real example with its result from your experience.');
    expect(weak).toContain('Say why this employer, using the job advert or what you pasted about them.');
    expect(renderToStaticMarkup(<SpecificityList result={{ example: true, employer: null, company: '' }} />)).not.toContain('this employer');
  });
  it('offers a rewrite for body paragraphs only', () => {
    const html = renderToStaticMarkup(<ParagraphRewriter paragraphs={paragraphs} busy={false} disabled={false} pending={null} onRewrite={noop} onUse={noop} onKeep={noop} />);
    expect(html.match(/Rewrite this paragraph<\/button>/g)).toHaveLength(2);
    expect(html).toContain('placeholder="e.g. shorter, or lead with the result"');
    expect(html).toContain('maxLength="300"');
  });
  it('shows a passing rewrite side by side with Use this and Keep mine, and a failing one with its issues', () => {
    const ok = renderToStaticMarkup(<ParagraphRewriter paragraphs={paragraphs} busy={false} disabled={false} onRewrite={noop} onUse={noop} onKeep={noop}
      pending={{ index: 2, result: { ok: true, coverLetter: 'x', letterReview: [], paragraph: 'I prepare monthly reports for 4 stakeholders, every month.' } }} />);
    expect(ok).toContain('I prepared monthly reports for 4 stakeholders.');
    expect(ok).toContain('I prepare monthly reports for 4 stakeholders, every month.');
    for (const label of ['Use this', 'Keep mine']) expect(ok).toContain(label);
    const failed = renderToStaticMarkup(<ParagraphRewriter paragraphs={paragraphs} busy={false} disabled={false} onRewrite={noop} onUse={noop} onKeep={noop}
      pending={{ index: 2, result: { ok: false, issues: ['Paragraph 3: The claimed meaning was not supported.'] } }} />);
    expect(failed).toContain('This rewrite did not pass the checks:');
    expect(failed).toContain('Paragraph 3: The claimed meaning was not supported.');
    expect(failed).not.toContain('Use this');
    expect(failed).toContain('Dismiss</button>');
    expect(failed).toContain('Issues may refer to other paragraphs of your letter, because the whole letter is checked again.');
  });
  it('keeps the Use this row outside the side-by-side view and disables it for a stale pack', () => {
    const pending = { index: 2, result: { ok: true as const, coverLetter: 'x', letterReview: [], paragraph: 'I prepare monthly reports for 4 stakeholders, every month.' } };
    const fresh = renderToStaticMarkup(<ParagraphRewriter paragraphs={paragraphs} busy={false} disabled={false} onRewrite={noop} onUse={noop} onKeep={noop} pending={pending} />);
    const sideBySide = fresh.slice(fresh.indexOf('class="before-after"'));
    expect(sideBySide.indexOf('Use this')).toBeGreaterThan(sideBySide.indexOf('</div></div>'));
    expect(fresh).not.toMatch(/<button[^>]*disabled=""[^>]*>.{0,200}Use this/);
    const stale = renderToStaticMarkup(<ParagraphRewriter paragraphs={paragraphs} busy={false} disabled onRewrite={noop} onUse={noop} onKeep={noop} pending={pending} />);
    expect(stale).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Use this/);
  });
  it('explains when a letter is worth it', () => {
    expect(LETTER_WORTH_IT).toBe('Letters matter most for in-house roles, smaller employers and career changes. For agency applications a short note is often enough.');
  });
});
