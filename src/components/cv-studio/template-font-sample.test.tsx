import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TemplateFontSample } from './TemplateFontSample';

const css = readFileSync(join(process.cwd(), 'src/components/cv-studio/studio.css'), 'utf8');

/** font-family of the first rule whose selector list contains exactly `selector`. */
function fontOf(selector: string): string | undefined {
  for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some(s => s.trim() === selector)) continue;
    const family = declarations.match(/(?:^|;)\s*font-family:([^;]+)/);
    if (family) return family[1].trim();
  }
  return undefined;
}

describe('template font samples', () => {
  it('draws the thumbnail and "Template\'s own fonts" samples in the stacks the CV paper uses', () => {
    const sans = fontOf('.cv-paper[data-body=sans]');
    const serif = fontOf('.cv-paper[data-display=serif] h1');
    expect(sans).toBe('Arial,Helvetica,sans-serif');
    expect(serif).toBe("'Times New Roman',serif");
    expect(fontOf('.template-thumbnail b')).toBe(sans);
    expect(fontOf('.template-thumbnail[data-display=serif] b')).toBe(serif);
    expect(fontOf('.font-sample[data-display=sans] b')).toBe(sans);
    expect(fontOf('.font-sample[data-display=serif] b')).toBe(serif);
    expect(fontOf('.font-sample[data-body=sans] small')).toBe(sans);
    expect(fontOf('.font-sample[data-body=serif] small')).toBe(serif);
  });

  it("marks the sample with the chosen template's heading and body styles", () => {
    expect(renderToStaticMarkup(<TemplateFontSample template="classic" />)).toContain('data-display="serif" data-body="serif"');
    expect(renderToStaticMarkup(<TemplateFontSample template="editorial" />)).toContain('data-display="serif" data-body="sans"');
    expect(renderToStaticMarkup(<TemplateFontSample template="modern" />)).toContain('data-display="sans" data-body="sans"');
    expect(renderToStaticMarkup(<TemplateFontSample template="modern" />)).toContain('<b>Aa</b> <small>Ada Okafor</small>');
  });
});
