import type { Workspace } from '@/lib/cv-studio/schema';
import type { CSSProperties } from 'react';
import { templates, templateSpacing } from '@/lib/cv-studio/templates';
import { formatLanguage, repairOrder, sectionLabels, type SectionKey } from '@/lib/cv-studio/sections';
import { fontPairs, resolveAccent } from '@/lib/cv-studio/design';
import { columnPlan } from '@/lib/cv-studio/columns';

export function ResumePreview({ workspace: w, highlight }: { workspace: Workspace; highlight?: string }) {
  const r = w.resume;
  const theme = templates[w.layout.template], spacing = templateSpacing(w.layout.template);
  const accent = resolveAccent(w.layout);
  const pair = w.layout.fontPair ? fontPairs[w.layout.fontPair] : null;
  const plan = columnPlan(w.layout, r);
  const languages = r.languages.map(formatLanguage).filter(Boolean);
  const header = <header data-section="profile" className={highlight === 'profile' ? 'cv-highlight' : undefined}>
      <h1>{r.personal.fullName || 'Your name'}</h1>
      <p className="cv-profession">{r.personal.professionalTitle || 'Your professional title'}</p>
      <p className="cv-contact">{[r.personal.email, r.personal.phone, r.personal.location, r.personal.linkedin].filter(Boolean).join('  ·  ') || 'Your contact details'}</p>
    </header>;
  const section = (key: SectionKey) => {
    if (key === 'languages' ? !languages.length : !r[key].length) return null;
    return <section key={key} data-section={key} className={highlight === key ? 'cv-highlight' : undefined}>
        <h2>{sectionLabels[key]}</h2>
        {key === 'experience' ? r.experience.map(e => <div key={e.id} className="cv-entry">
          <h3>{[e.title, e.company].filter(Boolean).join(' | ') || 'Role and organization'}</h3>
          <p className="cv-meta">{[e.location, [e.startDate, e.endDate].filter(Boolean).join(' - ')].filter(Boolean).join(' | ')}</p>
          <ul>{e.achievements.split('\n').filter(Boolean).map((b, i) => <li key={i}>{b.replace(/^[•*-]\s*/, '')}</li>)}</ul>
        </div>) : key === 'education' ? r.education.map(e => <div key={e.id} className="cv-entry"><h3>{e.degree}</h3><p className="cv-meta">{[e.institution, e.graduationYear].filter(Boolean).join(' | ')}</p></div>) :
          key === 'volunteering' ? r.volunteering.map(v => <div key={v.id} className="cv-entry">
            <h3>{[v.role, v.organisation].filter(Boolean).join(' | ') || 'Role and organisation'}</h3>
            <p className="cv-meta">{[v.location, [v.startDate, v.endDate].filter(Boolean).join(' - ')].filter(Boolean).join(' | ')}</p>
            <ul>{v.achievements.split('\n').filter(Boolean).map((b, i) => <li key={i}>{b.replace(/^[•*-]\s*/, '')}</li>)}</ul>
          </div>) :
          key === 'languages' ? <p className="cv-paragraph">{languages.join('\n')}</p> :
          <p className="cv-paragraph">{r[key]}</p>}
      </section>;
  };
  return <article className={'cv-paper ' + w.layout.template + ' accent-' + w.layout.accent} data-font-pair={w.layout.fontPair} data-header={theme.header} data-section={theme.section} data-display={theme.display} data-body={theme.body} data-case={theme.uppercase ? 'upper' : 'title'} data-columns={plan?.style} style={{ fontSize: w.layout.fontSize * 1.15, lineHeight: spacing.line, '--cv-name-size': theme.nameSize * 1.15 + 'px', '--cv-heading-size': theme.headingSize * 1.15 + 'px', '--cv-section-gap': spacing.section * 1.15 + 'px', '--accent': accent.hex, '--accent-tint': accent.tint, ...(pair ? { '--cv-heading-font': pair.heading.css, '--cv-body-font': pair.body.css } : {}) } as CSSProperties}>
    {plan?.style === 'panel' ? <>
      {/* The panel holds the header and side sections; it comes first so the name is read first. */}
      <aside className="cv-side cv-panel">{header}{plan.side.map(section)}</aside>
      <div className="cv-main">{plan.main.map(section)}</div>
    </> : <>
      {header}
      {plan ? <div className="cv-columns">
        {/* Main column first in the markup for both sides; CSS places the side column. */}
        <div className="cv-main">{plan.main.map(section)}</div>
        <aside className="cv-side">{plan.side.map(section)}</aside>
      </div> : repairOrder(w.layout.order, r).map(section)}
    </>}
  </article>;
}
