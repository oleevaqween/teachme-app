'use client';

import type { StageSourceList } from '@/lib/teaching-session-engine/stage-sources';
import { displayTopics } from '@/lib/teaching-session-engine/topic-display';

/** Section headings tidied like stage topics ("2.1.2 Information Flow"), placeholders dropped. */
function sectionLine(sections: readonly string[]): string {
  return displayTopics(sections)
    .map((topic) => (topic.number ? `${topic.number} ${topic.name}` : topic.name))
    .join(' · ');
}

/** True when there is at least one document or web source to list. */
export function hasSources(sources: StageSourceList): boolean {
  return sources.documents.length > 0 || sources.web.length > 0;
}

/** Everything this stage was built from, as a plain list (it lives in a popup); renders nothing when empty. */
export function StageSources({ sources }: { sources: StageSourceList }) {
  if (!hasSources(sources)) return null;
  return (
    <ul
      className="flex flex-col gap-1.5 text-small text-muted-foreground"
      aria-label="Sources for this stage"
    >
      {sources.documents.map((doc) => {
        const sections = sectionLine(doc.sections);
        return (
          <li key={`doc-${doc.name}`}>
            <span className="font-medium text-foreground">Your document: {doc.name}</span>
            {sections && <span>{' · '}{sections}</span>}
          </li>
        );
      })}
      {sources.web.map((item) => (
        <li key={`web-${item.title}`}>
          <span className="font-medium text-foreground">Web:</span> {item.title}
        </li>
      ))}
    </ul>
  );
}
