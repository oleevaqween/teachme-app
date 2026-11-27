import { templates, type TemplateId } from '@/lib/cv-studio/templates';

/** "Aa" sample drawn in the heading and body fonts the template really uses (see studio.css). */
export function TemplateFontSample({ template }: { template: TemplateId }) {
  const { display, body } = templates[template];
  return (
    <span className="font-sample" aria-hidden="true" data-display={display} data-body={body}>
      <b>Aa</b> <small>Ada Okafor</small>
    </span>
  );
}
