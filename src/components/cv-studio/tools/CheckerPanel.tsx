'use client';
import { ArrowRight, SpellCheck } from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import type { CheckTarget, CvCheck } from '@/lib/cv-studio/cv-checker';
import { analysisMatchesJob, jobMatchEstimate } from '@/lib/cv-studio/job-match';
import { tailoringIsCurrent } from '@/lib/cv-studio/tailoring';
import type { StudioController } from '../useStudioController';
import { OwnWords, ProofreadResults, SpellingStatus, SpellingVariantSwitch, SpellingWords } from './SpellingParts';
import { CutAction, CutPanel } from './CutPanel';
import { MarketSwitch } from './MarketSwitch';

const targetLabels: Record<CheckTarget, string> = { profile: 'Profile', summary: 'Summary', experience: 'Experience', volunteering: 'Volunteering', projects: 'Projects',
  education: 'Education', skills: 'Skills', certifications: 'Certifications', additional: 'Additional', awards: 'Awards', training: 'Training',
  publications: 'Publications', strengths: 'Strengths', interests: 'Interests', references: 'References', design: 'Design' };

export function CheckerPanel({ c, w, check }: { c: StudioController; w: Workspace; check: CvCheck }) {
  const { setTab } = c;
  const match = w.kind === 'application' && analysisMatchesJob(w) && tailoringIsCurrent(w) ? jobMatchEstimate(w).score : null;
  return <>
    <div className="panel-intro"><h2>CV checker</h2><p>An instant check of how clearly your CV shows your impact. It updates as you edit and never changes your CV.</p></div>
    <MarketSwitch value={w.market ?? 'international'} onChange={c.setMarket} disabled={!!c.busy} />
    <SpellingVariantSwitch value={w.spelling ?? 'en-GB'} onChange={c.setSpellingVariant} disabled={!!c.busy} />
    <div className="checker-score">
      <div className="checker-number">{check.score}<small>/ 100</small></div>
      <div className="checker-label"><strong>{check.label}</strong><progress aria-label="CV quality score" value={check.score} max={100} /></div>
    </div>
    <ul className="checker-categories">
      {check.categories.map(category => <li key={category.id}><span>{category.title}</span><strong>{category.earned}/{category.possible}</strong></li>)}
    </ul>
    {check.categories.map(category => {
      const items = check.findings.filter(f => f.category === category.id);
      return <section key={category.id} className="checker-group" aria-label={category.title}>
        <h3 className="subheading">{category.title}</h3>
        {category.id === 'clarity' && <SpellingStatus status={c.spellingChecking ? 'pending' : check.spelling} />}
        {items.length ? items.map(f => <div key={f.id} className={'finding ' + (f.level === 'fix' ? 'warning' : 'info')}>
          <strong>{f.level === 'fix' ? 'Fix: ' : 'Consider: '}{f.title}</strong>
          <p>{f.detail}</p>
          {f.id === 'structure.long' && <CutAction kind={w.kind} busy={!!c.busy} onSuggest={c.suggestCuts} />}
          {f.words?.length
            ? <SpellingWords finding={f} onGo={setTab} onAdd={f.id === 'spelling.words' ? c.addOwnWord : undefined} disabled={!!c.busy} />
            : <button type="button" className="text-button" onClick={() => setTab(f.target)}>Go to {targetLabels[f.target]} <ArrowRight size={14} aria-hidden="true" /></button>}
        </div>) : <p className="studio-hint">Nothing to fix here.</p>}
        {/* One fixed place after the findings, so the panel (and its focus) stays when a cut clears "Your CV is long". */}
        {category.id === 'structure' && c.cuts && <CutPanel plan={c.cuts} busy={!!c.busy} onApply={id => void c.applyCuts([id])} onDismiss={c.dismissCut}
          onApplyAll={() => void c.applyCuts(c.cuts!.proposals.map(p => p.id))} />}
        {category.id === 'clarity' && <div className="proofread">
          <button type="button" className="studio-button secondary" disabled={!!c.busy} onClick={() => void c.askProofread()}><SpellCheck size={16} aria-hidden="true" /> Proofread with AI</button>
          <p className="studio-hint">Uses your AI provider. It suggests grammar and wording fixes only; nothing changes until you apply one.</p>
          <ProofreadResults ran={c.proofread.ran} suggestions={c.proofread.suggestions} dropped={c.proofread.dropped} busy={!!c.busy}
            onApply={s => void c.applyProofreadFix(s)} onDismiss={c.dismissProofread} />
        </div>}
        {category.id === 'clarity' && <OwnWords words={w.ownWords ?? []} onRemove={c.removeOwnWord} disabled={!!c.busy} />}
      </section>;
    })}
    {match !== null && <div className="checker-match">
      <div><span className="studio-step">JOB MATCH</span><p><strong>{match}/100</strong> for this posting, measured separately from CV quality.</p></div>
      <button type="button" className="studio-button secondary" onClick={() => setTab('job')}>Open Target role</button>
    </div>}
    <p className="studio-hint">This is TeachMe&apos;s own guide to CV quality. It isn&apos;t an employer&apos;s screening (ATS) score.</p>
  </>;
}
