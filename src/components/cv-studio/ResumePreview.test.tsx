import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from '@/lib/cv-studio/test-fixture';
import { ResumePreview } from './ResumePreview';

const markup = (w: ReturnType<typeof fixture>) => renderToStaticMarkup(<ResumePreview workspace={w} />);

describe('CV preview columns', () => {
  it('renders a one-column CV exactly as before', () => {
    const w = fixture(); w.resume.languages = [{ id: 'l1', language: 'French', level: 'Fluent' }];
    expect(markup(w)).toMatchSnapshot();
  });

  it('puts side sections in an aside after the main column', () => {
    const w = fixture(); w.layout.columns = 'right';
    const html = markup(w);
    expect(html).toContain('data-columns="right"');
    const main = html.slice(html.indexOf('class="cv-main"'), html.indexOf('class="cv-side"'));
    const side = html.slice(html.indexOf('class="cv-side"'));
    expect(main).toContain('Experience');
    expect(main).not.toContain('Skills');
    expect(side).toContain('Skills');
    expect(side).toContain('Education');
  });

  it('keeps main-first markup for the left style and prints one column when a column would be empty', () => {
    const w = fixture(); w.layout.columns = 'left';
    const html = markup(w);
    expect(html).toContain('data-columns="left"');
    expect(html.indexOf('class="cv-main"')).toBeLessThan(html.indexOf('class="cv-side"'));
    w.layout.sideSections = [];
    expect(markup(w)).not.toContain('cv-columns');
  });

  it('puts the header and side sections in the colour panel', () => {
    const w = fixture(); w.layout.columns = 'panel';
    const html = markup(w);
    expect(html).toContain('data-columns="panel"');
    const panel = html.slice(html.indexOf('class="cv-side cv-panel"'), html.indexOf('class="cv-main"'));
    expect(panel).toContain('Ada Okoro');
    expect(panel).toContain('Skills');
    expect(html.indexOf('class="cv-side cv-panel"')).toBeLessThan(html.indexOf('class="cv-main"'));
  });
});
