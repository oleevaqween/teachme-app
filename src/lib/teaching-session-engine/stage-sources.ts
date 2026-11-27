// src/lib/teaching-session-engine/stage-sources.ts
//
// Client-safe: the "Sources for this stage" list, built from the stage's content chunks.

/** Your documents with their section names, and web material by title (no addresses are stored for it). */
export interface StageSourceList {
  documents: { name: string; sections: string[] }[];
  web: { title: string }[];
}

/**
 * Groups a stage's chunks, in chunk order: a chunk with a document name belongs to that
 * document (its section names listed once each); a chunk without one is web material,
 * named by its section title. Blank names are skipped.
 */
export function stageSourceList(chunks: readonly { sourceDocument: string; sourceSection: string }[]): StageSourceList {
  const documents = new Map<string, string[]>();
  const web: string[] = [];
  for (const chunk of chunks) {
    const name = chunk.sourceDocument.trim();
    const section = chunk.sourceSection.trim();
    if (name) {
      const sections = documents.get(name) ?? [];
      if (section && !sections.includes(section)) sections.push(section);
      documents.set(name, sections);
    } else if (section && !web.includes(section)) {
      web.push(section);
    }
  }
  return {
    documents: [...documents].map(([name, sections]) => ({ name, sections })),
    web: web.map((title) => ({ title })),
  };
}

/** Reads the sources endpoint's JSON; anything malformed counts as no list. */
export function parseStageSources(data: unknown): StageSourceList | null {
  if (!data || typeof data !== 'object') return null;
  const { documents, web } = data as Record<string, unknown>;
  if (!Array.isArray(documents) || !Array.isArray(web)) return null;
  const okDocument = (d: unknown) =>
    !!d && typeof d === 'object' && typeof (d as { name?: unknown }).name === 'string' &&
    Array.isArray((d as { sections?: unknown }).sections) &&
    (d as { sections: unknown[] }).sections.every((s) => typeof s === 'string');
  const okWeb = (w: unknown) => !!w && typeof w === 'object' && typeof (w as { title?: unknown }).title === 'string';
  if (!documents.every(okDocument) || !web.every(okWeb)) return null;
  return { documents, web } as StageSourceList;
}
