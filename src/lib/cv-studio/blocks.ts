import { formatLanguage, sectionLabels, type SectionKey } from './sections';
import type { Resume } from './schema';

export type Block = { type: 'name' | 'title' | 'contact' | 'heading' | 'entry' | 'meta' | 'body' | 'bullet'; text: string; column?: 'main' | 'side' };
/** The heading and lines for one section, or nothing when the section prints no text. */
export function sectionBlocks(r: Resume, key: SectionKey): Block[] {
  const group: Block[] = [];
  if (key === 'experience') {
    for (const e of r.experience) {
      group.push({ type: 'entry', text: [e.title, e.company].filter(Boolean).join(' | ') });
      group.push({ type: 'meta', text: [e.location, [e.startDate, e.endDate].filter(Boolean).join(' - ')].filter(Boolean).join(' | ') });
      group.push(...e.achievements.split('\n').filter(s => s.trim()).map(text => ({ type: 'bullet' as const, text: text.replace(/^[•*-]\s*/, '') })));
    }
  } else if (key === 'education') {
    for (const e of r.education) {
      group.push({ type: 'entry', text: e.degree }, { type: 'meta', text: [e.institution, e.graduationYear].filter(Boolean).join(' | ') });
    }
  } else if (key === 'volunteering') {
    for (const v of r.volunteering) {
      group.push({ type: 'entry', text: [v.role, v.organisation].filter(Boolean).join(' | ') });
      group.push({ type: 'meta', text: [v.location, [v.startDate, v.endDate].filter(Boolean).join(' - ')].filter(Boolean).join(' | ') });
      group.push(...v.achievements.split('\n').filter(s => s.trim()).map(text => ({ type: 'bullet' as const, text: text.replace(/^[•*-]\s*/, '') })));
    }
  } else if (key === 'languages') {
    group.push(...r.languages.map(formatLanguage).filter(Boolean).map(text => ({ type: 'body' as const, text })));
  } else {
    group.push(...r[key].split('\n').filter(s => s.trim()).map(text => ({ type: 'body' as const, text })));
  }
  return group.some(b => b.text.trim()) ? [{ type: 'heading', text: sectionLabels[key] }, ...group.filter(b => b.text.trim())] : [];
}
