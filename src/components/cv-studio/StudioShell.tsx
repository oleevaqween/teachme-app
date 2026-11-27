'use client';
import { useMemo, useRef } from 'react';
import Link from 'next/link';
import { Check, FileText, PanelRight, PictureInPicture2, Plus, Trash2, Undo2, Upload, X } from 'lucide-react';
import { branchSource } from '@/lib/cv-studio/workspace-rules';
import { checkCv } from '@/lib/cv-studio/cv-checker';
import type { SectionKey } from '@/lib/cv-studio/section-order';
import { ImprovePanel } from './tools/ImprovePanel';
import { JobMatch } from './JobMatch';
import { EvidenceGuide } from './EvidenceGuide';
import { WorkingBanner } from './WorkingBanner';
import { EvidenceReturnBanner } from './EvidenceReturnBanner';
import { SectionRail } from './SectionRail';
import { PreviewPane } from './PreviewPane';
import { ProfileSection } from './sections/ProfileSection';
import { SummarySection } from './sections/SummarySection';
import { ExperienceSection } from './sections/ExperienceSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { EducationSection } from './sections/EducationSection';
import { VolunteeringSection } from './sections/VolunteeringSection';
import { LanguagesSection } from './sections/LanguagesSection';
import { TextSection, textSectionKeys, type TextSectionKey } from './sections/TextSection';
import { addSection, removeSection, repairOrder, sectionHasContent, sectionKeys, sectionNames } from '@/lib/cv-studio/sections';
import { CheckerPanel } from './tools/CheckerPanel';
import { TargetRolePanel } from './tools/TargetRolePanel';
import { EvidencePanel } from './tools/EvidencePanel';
import { ReviewPanel } from './tools/ReviewPanel';
import { DesignPanel } from './tools/DesignPanel';
import { PackPanel } from './tools/PackPanel';
import { VersionsPanel } from './tools/VersionsPanel';
import { WelcomePanel } from './tools/WelcomePanel';
import { ImportModal } from './ImportModal';
import { DeleteModal } from './DeleteModal';
import { downloadBlob, makeWorkspace } from './useWorkspace';
import { PREVIEW_HIDDEN_KEY, RAIL_COLLAPSED_KEY, SMALL_QUERY, useMediaQuery, useNarrowScreen, useRememberedFlag } from './studio-prefs';
import type { StudioController, Tab } from './useStudioController';

const sectionTitle: Partial<Record<Tab, string>> = { profile: 'Profile', ...sectionNames };
const isTextSection = (tab: Tab): tab is TextSectionKey => (textSectionKeys as readonly string[]).includes(tab);
const isSection = (tab: Tab): tab is SectionKey => (sectionKeys as readonly string[]).includes(tab);

export function StudioShell({ c }: { c: StudioController }) {
  const { state, w, change, save, create, select, workspaces, error, setError, tab, setTab, busy, aiBusy, importOpen, setImportOpen, deleteTarget, setDeleteTarget, evidenceOpen, setEvidenceOpen, setImported, notice, abort, pending, guide, draft, update, run, prepare, loadVersions } = c;
  const narrow = useNarrowScreen();
  const [railCollapsed, setRailCollapsed] = useRememberedFlag(RAIL_COLLAPSED_KEY, narrow);
  // The stored key predates the floating window: true means the preview floats instead of sitting in its column.
  const [previewHidden, setPreviewHidden] = useRememberedFlag(PREVIEW_HIDDEN_KEY, false);
  const small = useMediaQuery(SMALL_QUERY);
  const floating = previewHidden && !small;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const check = useMemo(() => (w ? checkCv(w.resume, undefined, c.spelling, { market: w.market, pageSize: w.layout.pageSize }) : null), [w, c.spelling]);

  function open(next: Tab) {
    if (next === 'history') void loadVersions();
    else setTab(next);
  }

  return <div className="studio" data-preview={floating ? 'floating' : 'docked'}>
    <div className="studio-topbar">
      <h1 className="studio-title">CV Studio</h1>
      <div className="workspace-picker"><FileText size={18} /><select aria-label="Saved CV" value={w?.id ?? ''} disabled={!!busy || !state.loaded} onChange={e => { const next = workspaces.find(x => x.id === e.target.value); if (next) void run('Opening CV…', async () => { await select(next); setTab('profile'); }); }}>
        {!w && <option value="">Your CV library</option>}
        {w && !workspaces.some(x => x.id === w.id) && <option value={w.id}>{w.name}</option>}
        {workspaces.map(x => <option key={x.id} value={x.id}>{x.kind === 'master' ? 'Master · ' : ''}{x.name}</option>)}
      </select></div>
      <div className="toolbar-actions">
        <span className="save-status" role="status">{state.status}</span>
        {w && <button className="icon-button" title="Undo last edit" aria-label="Undo last edit" disabled={!state.canUndo || !!busy} onClick={state.undo}><Undo2 size={18} /></button>}
        {w && !small && <button type="button" className="studio-button secondary" onClick={() => setPreviewHidden(!floating)}>{floating ? <PanelRight size={16} aria-hidden="true" /> : <PictureInPicture2 size={16} aria-hidden="true" />} {floating ? 'Dock preview' : 'Float preview'}</button>}
        <button className="studio-button secondary" disabled={!!busy || !state.loaded} onClick={() => void run('Creating your master CV…', async () => { await create(makeWorkspace('Master CV')); setTab('profile'); })}><Plus size={16} /> New CV</button>
        <button className="studio-button secondary" disabled={!!busy || !state.loaded} onClick={() => { setImportOpen(true); setImported(null); }}><Upload size={16} /> Import</button>
        {w && <button className="studio-button secondary" disabled={!!busy} title="Start a new job application from your master CV" onClick={() => void run('Creating application…', async () => { await create(makeWorkspace('New application', 'application', branchSource(w, workspaces))); setTab('job'); })}><Plus size={16} /> Application</button>}
        {w && <div className="export-buttons" role="group" aria-label="Export your CV">
          <button type="button" className="studio-button" disabled={!!busy || c.viewingDraft} onClick={() => void c.exportFile('pdf')}>Export PDF</button>
          <button type="button" className="studio-button secondary" disabled={!!busy || c.viewingDraft} onClick={() => void c.exportFile('docx')}>Word</button>
          <button type="button" className="studio-button secondary" disabled={!!busy || c.viewingDraft} onClick={() => void c.exportFile('txt')}>Text</button>
        </div>}
      </div>
    </div>
    {error && <div className="studio-alert" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={18} /></button></div>}
    {notice && <div className="studio-notice" role="status"><Check size={16} /> {notice}</div>}
    {c.evidenceTopic && <EvidenceReturnBanner topic={c.evidenceTopic} disabled={!!busy} onAdd={c.addEvidenceFromJourney} onDismiss={c.dismissEvidenceReturn} />}
    {state.recovery && <div className="studio-alert"><span>Unsaved work was recovered from this browser. Restore it as a separate copy to protect saved versions.</span><button className="studio-button secondary" onClick={() => void run('Recovering…', async () => { await create({ ...state.recovery!, id: crypto.randomUUID(), name: state.recovery!.name + ' (recovered)' }); state.clearRecovery(); })}>Recover copy</button><button className="studio-button secondary" onClick={() => { downloadBlob(new Blob([JSON.stringify(state.recovery, null, 2)], { type: 'application/json' }), 'cv-recovery.json'); }}>Download recovery</button></div>}
    {busy && <WorkingBanner key={busy} label={busy} ai={aiBusy} onCancel={() => abort.current?.abort()} />}
    {!w ? <WelcomePanel c={c} /> : <div className="studio-main">
      <SectionRail w={w} tab={tab} collapsed={railCollapsed} pending={pending} checkerScore={check?.score ?? 0} disabled={!!busy}
        onOpen={open} onToggleCollapsed={() => setRailCollapsed(!railCollapsed)}
        onReorder={(order: SectionKey[]) => update({ layout: { ...w.layout, order } })}
        onAdd={key => { update({ layout: { ...w.layout, order: addSection(w.layout.order, key) } }); setTab(key); requestAnimationFrame(() => headingRef.current?.focus()); }} />
      <section className="studio-editor">
        <div className="editor-heading"><div><span className="studio-pill">{w.kind === 'master' ? 'MASTER CV' : 'APPLICATION'}</span><input aria-label="CV name" value={w.name} onChange={e => update({ name: e.target.value })} disabled={!!busy} /></div>
          {w.kind === 'application' && <button type="button" className="studio-button secondary danger-outline" aria-label="Delete this application" title="Delete this application" disabled={!!busy} onClick={() => setDeleteTarget(structuredClone(w))}><Trash2 size={15} aria-hidden="true" /> Delete</button>}
        </div>
        <fieldset className="studio-content" disabled={!!busy}>
          {tab === 'checker' && check && <CheckerPanel c={c} w={w} check={check} />}
          {tab === 'improve' && <ImprovePanel c={c} w={w} />}
          {(tab === 'job' || tab === 'review' || tab === 'package') && <JobMatch workspace={w} gaps={c.termGaps} busy={!!busy} proposed={tab === 'review' && draft?.edits.length ? draft.resume : undefined} />}
          {sectionTitle[tab] && <div className="panel-intro"><h2 ref={headingRef} tabIndex={-1}>{sectionTitle[tab]}</h2></div>}
          {tab === 'profile' && <ProfileSection resume={w.resume} change={resume => update({ resume })} />}
          {tab === 'summary' && <SummarySection resume={w.resume} change={resume => update({ resume })} />}
          {tab === 'experience' && <ExperienceSection resume={w.resume} change={resume => update({ resume })} />}
          {tab === 'projects' && <ProjectsSection resume={w.resume} change={resume => update({ resume })} />}
          {tab === 'education' && <EducationSection resume={w.resume} change={resume => update({ resume })} />}
          {tab === 'volunteering' && <VolunteeringSection resume={w.resume} change={resume => update({ resume })} />}
          {tab === 'languages' && <LanguagesSection resume={w.resume} change={resume => update({ resume })} />}
          {isTextSection(tab) && <TextSection field={tab} resume={w.resume} change={resume => update({ resume })} />}
          {isSection(tab) && repairOrder(w.layout.order, w.resume).includes(tab) && <div className="section-remove">
            <button type="button" className="studio-button secondary" disabled={sectionHasContent(w.resume, tab)}
              onClick={() => { update({ layout: { ...w.layout, order: removeSection(w.layout.order, w.resume, tab) } }); setTab('profile'); }}>
              <Trash2 size={15} aria-hidden="true" /> Remove section
            </button>
            {sectionHasContent(w.resume, tab) && <p className="studio-hint">Clear or delete everything in this section to remove it.</p>}
          </div>}
          {tab === 'job' && <TargetRolePanel c={c} w={w} />}
          {tab === 'evidence' && <EvidencePanel c={c} w={w} />}
          {tab === 'review' && <ReviewPanel c={c} w={w} />}
          {tab === 'design' && <DesignPanel c={c} w={w} />}
          {tab === 'package' && <PackPanel c={c} w={w} />}
          {tab === 'history' && <VersionsPanel c={c} w={w} />}
        </fieldset>
      </section>
      <PreviewPane key={floating ? 'floating' : 'docked'} c={c} w={w} highlight={tab} floating={floating} onDock={() => setPreviewHidden(false)} />
    </div>}
    {importOpen && <ImportModal c={c} />}
    {deleteTarget && <DeleteModal c={c} target={deleteTarget} />}
    {evidenceOpen && w && guide && <EvidenceGuide key={w.id} startAt={c.evidenceStart} workspace={w} status={state.status} change={change} save={save} close={() => setEvidenceOpen(false)} refresh={source => { void prepare('analyze', source); }} />}
    <footer className="studio-footnote"><span>TEACHME / CV STUDIO</span><span>Personal use · Development copy · <Link href="/settings">AI settings</Link></span></footer>
  </div>;
}
