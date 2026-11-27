import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type CssRule = {
  media: string | null;
  selectors: string[];
  decls: Array<[property: string, value: string]>;
};

const STUDIO_CSS = join(process.cwd(), 'src', 'components', 'cv-studio', 'studio.css');

/** Splits on a separator that sits outside parentheses and quotes. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function parseDecls(body: string): Array<[string, string]> {
  const decls: Array<[string, string]> = [];
  for (const chunk of splitTopLevel(body, ';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1) continue;
    const property = normalise(chunk.slice(0, colon));
    const value = normalise(chunk.slice(colon + 1));
    if (property) decls.push([property, value]);
  }
  return decls;
}

/** Finds the index of the brace that closes the block opened just before `from`. */
function findClose(text: string, from: number): number {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Error('Unbalanced braces in studio.css');
}

function parseBlock(text: string, media: string | null, out: CssRule[]): void {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    const prelude = normalise(text.slice(i, open));
    const close = findClose(text, open + 1);
    const body = text.slice(open + 1, close);
    i = close + 1;
    if (prelude.startsWith('@media')) {
      parseBlock(body, normalise(prelude.slice('@media'.length)), out);
    } else if (prelude.startsWith('@')) {
      continue; // @keyframes and other at-rules are not style rules
    } else {
      out.push({
        media,
        selectors: splitTopLevel(prelude, ',').map(normalise).filter(Boolean),
        decls: parseDecls(body),
      });
    }
  }
}

/** Reads studio.css and returns its style rules, with comments removed. */
export function readStudioRules(): CssRule[] {
  const source = readFileSync(STUDIO_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  parseBlock(source, null, rules);
  return rules;
}

/** True when every selector belongs to the CV document (paper, thumbnails, cv-*). */
export function isDocumentRule(rule: CssRule): boolean {
  return (
    rule.selectors.length > 0 &&
    rule.selectors.every(
      (s) => s.startsWith('.cv-paper') || s.startsWith('.template-thumbnail') || s.startsWith('.cv-'),
    )
  );
}

/** Whitespace-normalised source form, used for the frozen fixture. */
export function serializeRule(rule: CssRule): string {
  const body = rule.decls.map(([p, v]) => `${p}:${v}`).join(';');
  const core = `${rule.selectors.join(',')}{${body}}`;
  return rule.media === null ? core : `@media ${rule.media}{${core}}`;
}
