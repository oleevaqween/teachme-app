import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDocumentRule, readStudioRules, serializeRule, type CssRule } from './studio-css-rules';

const chromeRules = (): CssRule[] => readStudioRules().filter((r) => !isDocumentRule(r));
const clean = (value: string): string => value.replace(/!important/g, '').trim();
const label = (rule: CssRule): string => rule.selectors.join(',');
const get = (rule: CssRule, property: string): string | undefined => {
  const hit = rule.decls.find(([p]) => p === property);
  return hit ? clean(hit[1]) : undefined;
};
const noSpace = (value: string): string => value.replace(/\s+/g, '');

describe('document rules are frozen', () => {
  it('matches the fixture taken from master', () => {
    const fixture = readFileSync(
      join(process.cwd(), 'src', 'components', 'cv-studio', '__fixtures__', 'document-rules.css'),
      'utf8',
    );
    const rules = readStudioRules().filter(isDocumentRule);
    expect(rules.length).toBeGreaterThanOrEqual(60);
    expect(rules.map(serializeRule).join('\n')).toBe(fixture.replace(/\r\n/g, '\n').trim());
  });
});

const TYPE_EXCEPTIONS = ['.studio-rail[data-collapsed] .rail-badge', '.font-sample', '.font-sample small'];
const NUMBER_RULES = ['.checker-number', '.match-number', '.assessment-counts strong'];

describe('chrome type follows the scale', () => {
  it('uses only scale tokens for font-size', () => {
    const bad: string[] = [];
    for (const rule of chromeRules()) {
      if (rule.selectors.every((s) => TYPE_EXCEPTIONS.includes(s))) continue;
      const size = get(rule, 'font-size');
      if (size === undefined) continue;
      if (!/^var\(--text-[a-z0-9]+\)$/.test(size) && size !== 'inherit') bad.push(`${label(rule)} { font-size:${size} }`);
    }
    expect(bad).toEqual([]);
  });

  it('does not use the font shorthand except font:inherit', () => {
    const bad = chromeRules()
      .filter((r) => {
        const font = get(r, 'font');
        return font !== undefined && font !== 'inherit';
      })
      .map((r) => `${label(r)} { font:${get(r, 'font')} }`);
    expect(bad).toEqual([]);
  });

  it('gives label-size text caps or tracking', () => {
    const bad: string[] = [];
    for (const rule of chromeRules()) {
      if (get(rule, 'font-size') !== 'var(--text-label)') continue;
      const upper = get(rule, 'text-transform') === 'uppercase';
      const spacing = get(rule, 'letter-spacing') ?? '';
      const match = /^(-?[\d.]+)(em|px)$/.exec(spacing);
      const tracked = match !== null && (match[2] === 'em' ? Number(match[1]) >= 0.05 : Number(match[1]) >= 1);
      if (!upper && !tracked) bad.push(label(rule));
    }
    expect(bad).toEqual([]);
  });

  it('sets heading-font rules to weight 500 and -0.01em tracking', () => {
    const bad: string[] = [];
    for (const rule of chromeRules()) {
      const family = get(rule, 'font-family');
      if (family === undefined || noSpace(family) !== 'var(--font-heading),serif') continue;
      const isNumber = rule.selectors.every((s) => NUMBER_RULES.includes(s));
      if (get(rule, 'font-weight') !== '500') bad.push(`${label(rule)} weight`);
      if (!isNumber && get(rule, 'letter-spacing') !== '-0.01em') bad.push(`${label(rule)} letter-spacing`);
    }
    expect(bad).toEqual([]);
  });

  it('match and tailoring headings use the h2 step, not a smaller one', () => {
    const rule = readStudioRules().find((r) => r.selectors.includes('.match-heading h3') && r.selectors.includes('.tailoring-panel h3'))!;
    expect(get(rule, 'font-size')).toBe('var(--text-h2)');
    expect(get(rule, 'line-height')).toBe('var(--text-h2--line-height)');
  });
});

describe('layout tiers', () => {
  const all = (): CssRule[] => readStudioRules();
  const find = (selector: string, media: string | null): CssRule | undefined =>
    all().find((r) => r.selectors.includes(selector) && (media === null ? r.media === null : r.media !== null && noSpace(r.media).includes(media)));

  it('rail and preview tracks have a laptop tier', () => {
    expect(get(find('.studio-rail', null)!, 'width')).toBe('248px');
    expect(get(find('.studio-rail', '(max-width:1400px)')!, 'width')).toBe('232px');
    expect(noSpace(get(find('.studio-main', '(max-width:1400px)')!, 'grid-template-columns')!)).toBe('autominmax(0,1fr)minmax(320px,400px)');
    const floating = find('.studio[data-preview=floating] .studio-main', null)!;
    expect(noSpace(get(floating, 'grid-template-columns')!)).toBe('autominmax(0,1fr)');
    expect(find('.studio[data-preview=floating] .studio-main', '(max-width:1400px)')).toBeUndefined();
  });

  it('the collapsed rail keeps icons centred and the badge on the corner', () => {
    expect(get(find('.studio-rail[data-collapsed] .rail-item', null)!, 'justify-content')).toBe('center');
    const badge = find('.studio-rail[data-collapsed] .rail-badge', null)!;
    expect(get(badge, 'position')).toBe('absolute');
    expect(get(badge, 'font-size')).toBe('10px');
  });

  it('long CV names wrap the Delete button below instead of clipping', () => {
    expect(get(find('.editor-heading', null)!, 'flex-wrap')).toBe('wrap');
    expect(get(find('.editor-heading>div', null)!, 'flex')).toBe('1 1 240px');
  });

  it('the 1400px tier comes before every narrower tier (ruling R5)', () => {
    const rules = all();
    const index = (needle: string): number[] =>
      rules.flatMap((r, i) => (r.media !== null && noSpace(r.media).includes(needle) ? [i] : []));
    const wide = index('(max-width:1400px)');
    expect(wide.length).toBeGreaterThan(0);
    const lastWide = Math.max(...wide);
    for (const narrow of ['(max-width:1050px)', '(max-width:900px)', '(max-width:780px)']) {
      const at = index(narrow);
      expect(at.length, narrow).toBeGreaterThan(0);
      expect(Math.min(...at), narrow).toBeGreaterThan(lastWide);
    }
  });
});

const SPACING_PROPERTY = /^(padding|margin)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;
const PX_STEPS = new Set([1, 2, 4, 6, 8, 10, 12, 14, 16]);

function allowedPx(n: number): boolean {
  const abs = Math.abs(n);
  return PX_STEPS.has(abs) || abs % 4 === 0;
}

/** Splits a value on spaces that sit outside parentheses. */
function spaceTokens(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ' ' && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function spacingTokenOk(token: string): boolean {
  if (token === '0' || token === 'auto' || token === 'inherit') return true;
  if (/^var\(--space-[a-z-]+\)$/.test(token)) return true;
  const calc = /^calc\((.*)\)$/.exec(token);
  if (calc) {
    const parts = calc[1].split(/\s+|(?<=\))(?=[*/+-])/).filter((p) => p && !/^[+\-*/]$/.test(p));
    return parts.length > 0 && parts.every((p) => /^-?[\d.]+$/.test(p) || spacingTokenOk(p));
  }
  const m = /^(-?[\d.]+)(px|rem|em)$/.exec(token);
  if (!m) return false;
  const n = Number(m[1]);
  return m[2] === 'px' ? allowedPx(n) : allowedPx(n * 16);
}

describe('chrome spacing follows the 4px steps', () => {
  it('uses only step values for padding, margin and gap', () => {
    const bad: string[] = [];
    for (const rule of chromeRules()) {
      for (const [property, raw] of rule.decls) {
        if (!SPACING_PROPERTY.test(property)) continue;
        for (const token of spaceTokens(clean(raw))) {
          if (!spacingTokenOk(token)) bad.push(`${label(rule)} { ${property}:${clean(raw)} } -> ${token}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  const only = (selector: string, media: string | null = null): CssRule => {
    const hit = readStudioRules().filter(
      (r) => r.selectors.length === 1 && r.selectors[0] === selector && (media === null ? r.media === null : r.media !== null && noSpace(r.media).includes(media)),
    ).pop();
    if (!hit) throw new Error(`no rule for ${selector}`);
    return hit;
  };

  it('page, columns, panels and modals use the spacing tokens', () => {
    expect(get(only('.studio'), 'padding')).toBe('var(--space-page-block) var(--space-page-inline)');
    expect(get(only('.studio-main'), 'gap')).toBe('var(--space-columns)');
    expect(get(only('.editor-heading'), 'padding')).toBe('var(--space-panel-block) var(--space-panel-inline) 0');
    expect(get(only('.studio-content'), 'padding')).toBe('var(--space-card) var(--space-panel-inline) var(--space-panel-block)');
    expect(get(only('.studio-modal'), 'padding')).toBe('var(--space-panel-block) var(--space-panel-inline)');
    expect(get(only('.evidence-dialog'), 'padding')).toBe('var(--space-panel-block) var(--space-panel-inline)');
    const narrow = readStudioRules().filter((r) => r.media !== null && noSpace(r.media).includes('(max-width:1050px)'));
    const bad = narrow.filter((r) => r.selectors.some((s) => s === '.studio' || s === '.studio-content') && get(r, 'padding') !== undefined);
    expect(bad.map(label)).toEqual([]);
  });

  it('findings and cards get the spacious padding', () => {
    expect(get(only('.finding'), 'padding')).toBe('20px 24px');
    expect(get(only('.finding'), 'margin-bottom')).toBe('12px');
    expect(get(only('.checker-score'), 'padding')).toBe('var(--space-card)');
  });
});

describe('shapes and readable secondary text', () => {
  const rulesFor = (selector: string): CssRule[] => readStudioRules().filter((r) => r.media === null && r.selectors.includes(selector));
  const prop = (selector: string, property: string): string | undefined => {
    for (const r of rulesFor(selector).reverse()) {
      const v = get(r, property);
      if (v !== undefined) return noSpace(v);
    }
    return undefined;
  };

  it('Go to and action buttons are small rounded buttons that never wrap their arrow', () => {
    expect(prop('.text-button', 'white-space')).toBe('nowrap');
    expect(prop('.text-button', 'max-width')).toBe('100%');
    expect(prop('.text-button', 'border-radius')).toBe('999px');
    expect(prop('.text-button', 'display')).toBe('inline-flex');
    expect(prop('.text-button', 'font-weight')).toBe('600');
    expect(prop('.text-button', 'font-size')).toBe('var(--text-caption)');
    expect(prop('a.text-button', 'text-decoration')).toBe('underline');
    expect(prop('a.text-button', 'white-space')).toBe('normal');
    expect(prop('.own-words li .text-button', 'border')).toBe('0');
  });

  it('the pill hover tint is scoped to buttons, never anchors', () => {
    expect(prop('button.text-button:hover:not(:disabled)', 'background')).toBe('color-mix(inoklch,var(--primary)18%,transparent)');
    expect(rulesFor('.text-button:hover')).toEqual([]);
    expect(rulesFor('button.text-button:hover')).toEqual([]);
  });

  it('button rows wrap', () => {
    for (const s of ['.suggestion-actions', '.proofread-actions', '.evidence-actions', '.spelling-words li']) {
      expect(prop(s, 'flex-wrap'), s).toBe('wrap');
    }
  });

  it('readable secondary text uses the stronger mix', () => {
    const selectors = [
      '.panel-intro p', '.studio-modal>p', '.finding p', '.suggestion>p', '.question-panel p', '.learning-card p',
      '.interview-question p', '.evidence-launch p', '.studio-empty p', '.studio-hint', '.requirement p',
      '.checker-categories li span',
    ];
    for (const s of selectors) expect(prop(s, 'color'), s).toBe('var(--foreground-secondary)');
  });

  it('findings have rounded right corners', () => {
    expect(prop('.finding', 'border-radius')).toBe('012px12px0');
  });
});

describe('cascade guards', () => {
  const rules = (): CssRule[] => readStudioRules();

  it('the form control font reset has zero specificity', () => {
    const reset = rules().filter((r) => r.media === null && get(r, 'font') === 'inherit' && r.selectors.some((s) => /button/.test(s)));
    expect(reset.map((r) => r.selectors)).toEqual([[':where(.studio) :where(button,input,textarea,select)']]);
  });

  it('the parser keeps commas inside :where() and :not() in one selector', () => {
    const hit = rules().find((r) => r.selectors.includes(':where(.studio) :where(button,input,textarea,select)'));
    expect(hit).toBeDefined();
    expect(hit!.selectors).toHaveLength(1);
  });

  it('alert button reset leaves pills alone and the pill takes the alert colour', () => {
    const strip = rules().find((r) => r.selectors.some((s) => s.startsWith('.studio-alert>button')))!;
    expect(strip.selectors).toEqual(['.studio-alert>button:not(.studio-button):not(.text-button)']);
    const pill = rules().find((r) => r.media === null && r.selectors.includes('.studio-alert .text-button'))!;
    expect(get(pill, 'color')).toBe('inherit');
    expect(get(pill, 'border-color')).toBeDefined();
  });

  it('small text in spelling variants and improve numbers uses the caption token', () => {
    const rule = rules().find((r) => r.selectors.includes('.spelling-variant small') && r.selectors.includes('.improve-number small'))!;
    expect(get(rule, 'font-size')).toBe('var(--text-caption)');
    expect(get(rule, 'line-height')).toBe('var(--text-caption--line-height)');
    const hint = rules().find((r) => r.selectors.includes('.spelling-variant small') && get(r, 'color') !== undefined)!;
    expect(get(hint, 'color')).toBe('var(--foreground-secondary)');
  });

  it('the narrow rail item sets the small line-height token', () => {
    const rule = rules().find((r) => r.media !== null && noSpace(r.media).includes('(max-width:1050px)') && r.selectors.includes('.rail-item'))!;
    expect(get(rule, 'font-size')).toBe('var(--text-small)');
    expect(get(rule, 'line-height')).toBe('var(--text-small--line-height)');
  });

  it('Go to pills in findings sit 14px below the text', () => {
    const rule = rules().find((r) => r.media === null && r.selectors.includes('.finding>.text-button'))!;
    expect(get(rule, 'margin-top')).toBe('14px');
  });

  it('score suffixes use the sans font', () => {
    const rule = rules().find((r) => r.media === null && r.selectors.includes('.checker-number small') && get(r, 'font-family') !== undefined)!;
    expect(noSpace(get(rule, 'font-family')!)).toBe('var(--font-sans),sans-serif');
    const match = rules().find((r) => r.media === null && r.selectors.includes('.match-number small') && get(r, 'font-family') !== undefined)!;
    expect(noSpace(get(match, 'font-family')!)).toBe('var(--font-sans),sans-serif');
  });

  it('no chrome selector reaches into the CV document', () => {
    const bad = chromeRules().flatMap((r) => r.selectors).filter((s) => /\.cv-|\.template-thumbnail/.test(s));
    expect(bad).toEqual([]);
  });
});

describe('cut preview removed lines', () => {
  it('uses the muted text colour, not transparency, so it stays readable in dark mode', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'components', 'cv-studio', 'studio.css'), 'utf8').replace(/\s+/g, '');
    expect(css).toContain('.cut-proposaldel{color:var(--muted-foreground);}');
    expect(css).not.toContain('.cut-proposaldel{opacity');
  });
});

describe('rail move arrows on touch screens', () => {
  it('shows the move arrows when the device cannot hover', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'components', 'cv-studio', 'studio.css'), 'utf8').replace(/\s+/g, '');
    expect(css).toContain('@media(hover:none){.rail-move{opacity:1;pointer-events:auto}}');
  });
});
