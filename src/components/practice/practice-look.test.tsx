import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FeedbackView } from '@/lib/practice/schema';
import { AnswerBox } from './AnswerBox';
import { FeedbackCard } from './FeedbackCard';
import { QuestionList } from './QuestionList';
import type { SessionQuestion } from '@/lib/practice/session';

const attempt: FeedbackView = {
  questionText: 'Tell me about a budget you managed.',
  followUpOf: null,
  score: 7,
  answer: 'I tracked the budget monthly with finance and reported variances.',
  durationSeconds: 45,
  inputMethod: 'typed',
  star: {
    situation: { rating: 'strong', note: 'Clear context.' },
    task: { rating: 'weak', note: 'Goal is vague.' },
    action: { rating: 'strong', note: 'Specific steps.' },
    result: { rating: 'missing', note: 'No outcome.' },
  },
  fixes: ['Add the outcome.'],
  rewrite: null,
  rewriteWithheld: null,
  followUpQuestion: null,
} as unknown as FeedbackView;

describe('application practice type scale', () => {
  it('sets the answer textarea at body size', () => {
    const html = renderToStaticMarkup(<AnswerBox disabled={false} onSubmit={() => {}} />);
    expect(html).toMatch(/<textarea[^>]*class="[^"]*\btext-body\b/);
  });
  it('titles the feedback card at lead size without semibold', () => {
    const html = renderToStaticMarkup(<FeedbackCard attempt={attempt} />);
    const h3 = html.match(/<h3[^>]*>/)?.[0] ?? '';
    expect(h3).toMatch(/\btext-lead\b/);
    expect(h3).not.toMatch(/font-semibold/);
  });
  it('keeps the score and its unit on one line', () => {
    const html = renderToStaticMarkup(<FeedbackCard attempt={attempt} />);
    const score = html.match(/<p[^>]*>7<span[^>]*>\/10<\/span><\/p>/)?.[0] ?? '';
    expect(score).toMatch(/^<p[^>]*\bwhitespace-nowrap\b/);
  });
});

describe('question list type scale', () => {
  it('sets question rows at body size, dropping to small in the narrow column', () => {
    const html = renderToStaticMarkup(
      <QuestionList
        questions={[{ key: 'q1', text: 'Tell me about a budget.', source: 'cv', progress: { latest: null } } as unknown as SessionQuestion]}
        selectedKey={null}
        onSelect={() => {}}
        onGenerate={() => {}}
        canGenerate={false}
        capReached={false}
        generating={false}
        disabled={false}
      />,
    );
    const button = html.match(/<button[^>]*>/)?.[0] ?? '';
    expect(button).toMatch(/\btext-body\b/);
    expect(button).toMatch(/\blg:text-small\b/);
  });
});
