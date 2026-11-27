'use client';
import { useRef, useState, type ReactNode } from 'react';
import {
  AlignLeft, ArrowDown, ArrowUp, Award, BookOpen, Briefcase, ChevronsLeft, ChevronsRight, ClipboardCheck, Contact, Dumbbell, FolderKanban,
  GraduationCap, GripVertical, HeartHandshake, History, Info, Languages, ListChecks, Mail, Newspaper, NotebookPen, Palette, Plus, Sparkles,
  Target, Trophy, User, WandSparkles, Wrench, type LucideIcon,
} from 'lucide-react';
import type { Workspace } from '@/lib/cv-studio/schema';
import { availableSections, repairOrder, sectionDescriptions, sectionNames } from '@/lib/cv-studio/sections';
import { moveSection, type SectionKey } from '@/lib/cv-studio/section-order';
import type { Tab } from './useStudioController';

const sectionMeta: Record<SectionKey, { label: string; Icon: LucideIcon }> = {
  summary: { label: 'Summary', Icon: AlignLeft },
  experience: { label: 'Experience', Icon: Briefcase },
  projects: { label: 'Projects', Icon: FolderKanban },
  education: { label: 'Education', Icon: GraduationCap },
  skills: { label: 'Skills', Icon: Wrench },
  certifications: { label: 'Certifications', Icon: Award },
  additional: { label: 'Additional', Icon: Info },
  volunteering: { label: 'Volunteering', Icon: HeartHandshake },
  languages: { label: 'Languages', Icon: Languages },
  awards: { label: 'Awards', Icon: Trophy },
  training: { label: 'Training', Icon: BookOpen },
  publications: { label: 'Publications', Icon: Newspaper },
  strengths: { label: 'Strengths', Icon: Dumbbell },
  interests: { label: 'Interests', Icon: Sparkles },
  references: { label: 'References', Icon: Contact },
};

const tools: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'checker', label: 'CV checker', Icon: ClipboardCheck },
  { id: 'improve', label: 'Improve my CV', Icon: WandSparkles },
  { id: 'job', label: 'Target role', Icon: Target },
  { id: 'evidence', label: 'Evidence and notes', Icon: NotebookPen },
  { id: 'review', label: 'Review edits', Icon: ListChecks },
  { id: 'design', label: 'Design', Icon: Palette },
  { id: 'package', label: 'Application pack', Icon: Mail },
  { id: 'history', label: 'Versions', Icon: History },
];

export function SectionRail({ w, tab, collapsed, pending, checkerScore, disabled, onOpen, onReorder, onAdd, onToggleCollapsed }: {
  w: Workspace;
  tab: Tab;
  collapsed: boolean;
  pending: number;
  checkerScore: number;
  disabled: boolean;
  onOpen: (tab: Tab) => void;
  onReorder: (order: SectionKey[]) => void;
  onAdd: (key: SectionKey) => void;
  onToggleCollapsed: () => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const order = repairOrder(w.layout.order, w.resume);
  const available = availableSections(order);
  const counts: Partial<Record<SectionKey, number>> = { experience: w.resume.experience.length, education: w.resume.education.length, volunteering: w.resume.volunteering.length, languages: w.resume.languages.length };

  function move(from: number, to: number) {
    if (disabled) return;
    const next = moveSection(order, from, to);
    if (next.some((key, i) => key !== order[i])) onReorder(next);
  }

  function item(id: Tab, label: string, Icon: LucideIcon, extra?: ReactNode, accessibleLabel?: string) {
    return (
      <button type="button" className="rail-item" aria-current={tab === id ? 'page' : undefined} onClick={() => onOpen(id)}
        disabled={disabled} title={collapsed ? label : undefined} aria-label={collapsed ? (accessibleLabel ?? label) : undefined}>
        <Icon size={16} aria-hidden="true" />
        {!collapsed && <span>{label}</span>}
        {extra}
      </button>
    );
  }

  return (
    <nav className="studio-rail" aria-label="CV sections and tools" data-collapsed={collapsed || undefined}>
      <div className="rail-head">
        {!collapsed && <span className="rail-label">Your CV</span>}
        <button type="button" className="icon-button" onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Show section names' : 'Show icons only'} title={collapsed ? 'Show section names' : 'Show icons only'}>
          {collapsed ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
        </button>
      </div>
      <ul className="rail-list">
        <li className="rail-row">{item('profile', 'Profile', User)}</li>
        {order.map((key, index) => {
          const { label, Icon } = sectionMeta[key];
          return (
            <li key={key} className="rail-row" draggable={!disabled} data-dragging={dragging === index || undefined}
              onDragStart={e => { setDragging(index); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); }}
              onDragOver={e => { if (dragging !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDrop={e => { e.preventDefault(); if (dragging !== null) move(dragging, index); setDragging(null); }}
              onDragEnd={() => setDragging(null)}>
              {!collapsed && <GripVertical size={14} className="rail-grip" aria-hidden="true" />}
              {item(key, label, Icon, !collapsed && counts[key] !== undefined ? <small className="rail-count">{counts[key]}</small> : undefined)}
              {!collapsed && (
                <span className="rail-move">
                  <button type="button" className="icon-button" aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={14} aria-hidden="true" /></button>
                  <button type="button" className="icon-button" aria-label={`Move ${label} down`} disabled={disabled || index === order.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {available.length > 0 && (
        <div className="rail-add" tabIndex={-1} onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); addButton.current?.focus(); } }}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAdding(false); }}>
          <button ref={addButton} type="button" className="rail-item rail-add-button" aria-haspopup="true" aria-expanded={adding} disabled={disabled}
            onClick={() => setAdding(!adding)} title={collapsed ? 'Add section' : undefined} aria-label={collapsed ? 'Add section' : undefined}>
            <Plus size={16} aria-hidden="true" />{!collapsed && <span>Add section</span>}
          </button>
          {adding && (
            <ul className="rail-add-menu" aria-label="Sections you can add">
              {available.map(key => (
                <li key={key}>
                  <button type="button" disabled={disabled} onClick={() => { setAdding(false); onAdd(key); }}>
                    <strong>{sectionNames[key]}</strong><small>{sectionDescriptions[key]}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!collapsed && <span className="rail-label">Tools</span>}
      <ul className="rail-list">
        {tools.map(t => {
          const badge = t.id === 'checker' ? String(checkerScore) : t.id === 'review' && pending > 0 ? String(pending) : null;
          const name = t.id === 'checker' ? `${t.label} (score ${checkerScore})` : t.id === 'review' && pending > 0 ? `${t.label} (${pending} pending)` : undefined;
          return <li key={t.id} className="rail-row">{item(t.id, t.label, t.Icon, badge ? <small className="rail-badge">{badge}</small> : undefined, name)}</li>;
        })}
      </ul>
    </nav>
  );
}
