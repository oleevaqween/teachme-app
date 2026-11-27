import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerBox } from './AnswerBox';
import { resumedStart } from './useAnswerTimer';

describe('resumed answer time', () => {
  it('starts the clock as if the earlier seconds had already passed', () => {
    expect(resumedStart(100_000, 45)).toBe(55_000);
    expect(resumedStart(100_000, 0)).toBeNull();
    expect(resumedStart(10_000_000, 99_999)).toBe(10_000_000 - 3600 * 1000);
  });

  it('shows a returned-to draft at its earlier time, not 0:00', () => {
    const html = renderToStaticMarkup(
      <AnswerBox disabled={false} onSubmit={() => {}} initialText="I led the rollout." initialMeta={{ seconds: 45, typed: true, spoken: false }} />
    );
    expect(html).toContain('0:45');
    expect(html).toContain('I led the rollout.');
  });

  it('still starts at 0:00 for a new answer', () => {
    expect(renderToStaticMarkup(<AnswerBox disabled={false} onSubmit={() => {}} />)).toContain('0:00');
  });
});
