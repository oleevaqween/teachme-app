// src/lib/teaching-session-engine/citations.ts
//
// Client-safe: turns a reply's inline citations and saved sources into the
// chips shown under it. Nothing here changes what is stored.

import type { MessageSource } from './shared';

/** One chip under a message. */
export type SourceChip =
  | { kind: 'document'; name: string }
  | { kind: 'web'; name: string; url?: string }
  | { kind: 'general' };

/** True only for a real http or https web address. */
export function isWebAddress(url?: string | null): url is string {
  if (!url || !/^https?:\/\//i.test(url.trim())) return false;
  try {
    new URL(url.trim());
    return true;
  } catch {
    return false;
  }
}

// Spaces before a marker go with it, so no gap is left before the punctuation that follows.
const CITATION = /[ \t]*\[(Document|Web):\s*([^\]]+)\]/gi;
const GENERAL_KNOWLEDGE = /[ \t]*\[General Knowledge\]/gi;

/**
 * Removes [Document: x], [Web: x] and [General Knowledge] markers from a reply.
 * Inline citations carry no web address: their text is a name, never a link.
 */
export function parseCitations(text: string): {
  cleanedContent: string;
  inlineSources: MessageSource[];
  generalKnowledge: boolean;
} {
  const inlineSources: MessageSource[] = [];
  let generalKnowledge = false;
  const withoutGeneral = text.replace(GENERAL_KNOWLEDGE, () => {
    generalKnowledge = true;
    return '';
  });
  const cleanedContent = withoutGeneral.replace(CITATION, (_, type: string, name: string) => {
    inlineSources.push({ type: type.toLowerCase() === 'web' ? 'web' : 'document', name: name.trim() });
    return '';
  });
  return { cleanedContent: cleanedContent.trim(), inlineSources, generalKnowledge };
}

/**
 * The reply text without markers, and its chips: saved sources first, then inline
 * citations, one chip per type and name (the saved source wins, keeping its address),
 * web addresses only when real, then "General knowledge" when the reply used it.
 */
export function messageChips(content: string, sources: MessageSource[] = []): { content: string; chips: SourceChip[] } {
  const { cleanedContent, inlineSources, generalKnowledge } = parseCitations(content);
  const seen = new Set<string>();
  const chips: SourceChip[] = [];
  for (const source of [...sources, ...inlineSources]) {
    const key = `${source.type}:${source.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(
      source.type === 'web'
        ? { kind: 'web', name: source.name, ...(isWebAddress(source.url) ? { url: source.url.trim() } : {}) }
        : { kind: 'document', name: source.name }
    );
  }
  if (generalKnowledge) chips.push({ kind: 'general' });
  return { content: cleanedContent, chips };
}
