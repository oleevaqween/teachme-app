export const templateIds = ['executive', 'modern', 'classic', 'minimal', 'studio', 'editorial', 'precision', 'meridian', 'signature'] as const;
export type TemplateId = typeof templateIds[number];
type Template = {
  name: string; description: string;
  body: 'sans' | 'serif'; display: 'sans' | 'serif';
  header: 'plain' | 'top-rule' | 'centered' | 'banner' | 'rail' | 'signature';
  section: 'underline' | 'plain' | 'shaded' | 'rail' | 'centered';
  density: 'normal' | 'airy' | 'compact';
  nameSize: number; headingSize: number; uppercase: boolean;
};
export const templates: Record<TemplateId, Template> = {
  executive: { name: 'Executive', description: 'Clear hierarchy and understated section rules.', body: 'sans', display: 'sans', header: 'plain', section: 'underline', density: 'normal', nameSize: 25, headingSize: 10, uppercase: true },
  modern: { name: 'Modern', description: 'A crisp accent bar and familiar structure.', body: 'sans', display: 'sans', header: 'top-rule', section: 'underline', density: 'normal', nameSize: 25, headingSize: 10, uppercase: true },
  classic: { name: 'Classic', description: 'Traditional serif type with a centred introduction.', body: 'serif', display: 'serif', header: 'centered', section: 'underline', density: 'normal', nameSize: 27, headingSize: 10, uppercase: true },
  minimal: { name: 'Minimal', description: 'Generous space, clean type and no decorative rules.', body: 'sans', display: 'sans', header: 'plain', section: 'plain', density: 'airy', nameSize: 31, headingSize: 10, uppercase: true },
  studio: { name: 'Studio', description: 'A confident colour masthead with restrained body text.', body: 'sans', display: 'sans', header: 'banner', section: 'underline', density: 'normal', nameSize: 27, headingSize: 10, uppercase: true },
  editorial: { name: 'Editorial', description: 'Elegant serif headings paired with readable sans-serif text.', body: 'sans', display: 'serif', header: 'plain', section: 'plain', density: 'airy', nameSize: 31, headingSize: 14, uppercase: false },
  precision: { name: 'Precision', description: 'Compact spacing and lightly shaded section labels.', body: 'sans', display: 'sans', header: 'top-rule', section: 'shaded', density: 'compact', nameSize: 24, headingSize: 10, uppercase: true },
  meridian: { name: 'Meridian', description: 'A slim accent rail and strongly aligned headings.', body: 'sans', display: 'sans', header: 'rail', section: 'rail', density: 'normal', nameSize: 28, headingSize: 11, uppercase: false },
  signature: { name: 'Signature', description: 'A centred nameplate, fine double rule and balanced spacing.', body: 'sans', display: 'sans', header: 'signature', section: 'centered', density: 'airy', nameSize: 29, headingSize: 10, uppercase: true },
};
export function templateSpacing(id: TemplateId) {
  const density = templates[id].density;
  return density === 'compact' ? { section: 12, entry: 6, body: 5, line: 1.4 } : density === 'airy' ? { section: 22, entry: 9, body: 8, line: 1.5 } : { section: 17, entry: 8, body: 7, line: 1.45 };
}
