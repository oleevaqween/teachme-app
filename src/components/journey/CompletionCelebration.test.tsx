import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompletionCelebration } from './CompletionCelebration';

const cvLink = { journeyId: 'j1', topic: 'Power BI', role: 'Data Analyst', company: 'Acme', applicationId: 'app-1' };

describe('journey completion card', () => {
  it('sends the learner back to CV Studio when this browser remembers the application', () => {
    const html = renderToStaticMarkup(<CompletionCelebration totalStages={4} topic="Power BI" cvLink={cvLink} />);
    expect(html).toContain('You&#x27;ve finished learning Power BI for Data Analyst at Acme.');
    expect(html).toContain('Learning alone isn&#x27;t experience. When you&#x27;ve used it in a project, exercise or task, add it as evidence so your CV can say so truthfully.');
    expect(html).toMatch(/<a [^>]*href="\/cv-studio\?open=app-1&amp;evidence=Power\+BI"[^>]*>Add evidence in CV Studio<\/a>/);
  });

  it('leaves out an unknown role and company', () => {
    const html = renderToStaticMarkup(<CompletionCelebration totalStages={4} topic="Power BI" cvLink={{ ...cvLink, role: '', company: '' }} />);
    expect(html).toContain('You&#x27;ve finished learning Power BI.');
  });

  it('is unchanged without a remembered link', () => {
    const without = renderToStaticMarkup(<CompletionCelebration totalStages={4} topic="Power BI" />);
    expect(without).toBe(renderToStaticMarkup(<CompletionCelebration totalStages={4} topic="Power BI" cvLink={null} />));
    expect(without).toContain('Journey Complete!');
    expect(without).not.toContain('CV Studio');
    expect(without).not.toContain('finished learning');
  });
});
