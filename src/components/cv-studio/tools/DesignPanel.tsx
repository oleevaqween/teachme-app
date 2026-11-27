'use client';
import { useEffect, useRef, useState } from 'react';
import type { Layout, Workspace } from '@/lib/cv-studio/schema';
import { templateIds, templates } from '@/lib/cv-studio/templates';
import { accentIds, accentPresets, colourCheck, DEFAULT_CUSTOM, fontPairIds, fontPairs, normalizeHex } from '@/lib/cv-studio/design';
import { columnPlan, columnStyles, columnStyleDescriptions, columnStyleNames, COLUMNS_ATS_NOTE, COLUMNS_EMPTY_NOTE, sideSet, toggleSide } from '@/lib/cv-studio/columns';
import { repairOrder, sectionNames } from '@/lib/cv-studio/sections';
import { TemplateFontSample } from '../TemplateFontSample';
import type { StudioController } from '../useStudioController';

const HEX = /^#[0-9a-f]{6}$/i;
const columnChoices = ['one', ...columnStyles] as const;

export function DesignPanel({ c, w }: { c: StudioController; w: Workspace }) {
  const { update } = c;
  const [custom, setCustom] = useState(w.layout.customAccent ?? DEFAULT_CUSTOM);
  const [customOpen, setCustomOpen] = useState(w.layout.accent === 'custom');
  // When the CV's colour changes from outside this panel (Undo, Redo, another CV), the editor follows it.
  // Adjusting state while rendering is React's pattern for this; a half-typed code is local and not saved, so it stays.
  const [seen, setSeen] = useState({ accent: w.layout.accent, customAccent: w.layout.customAccent });
  if (seen.accent !== w.layout.accent || seen.customAccent !== w.layout.customAccent) {
    setSeen({ accent: w.layout.accent, customAccent: w.layout.customAccent });
    if (seen.customAccent !== w.layout.customAccent) setCustom(w.layout.customAccent ?? DEFAULT_CUSTOM);
    setCustomOpen(w.layout.accent === 'custom');
  }
  const check = colourCheck(custom);
  const plan = columnPlan(w.layout, w.resume), side = sideSet(w.layout), columnsNow = w.layout.columns ?? 'one';
  const setLayout = (patch: Partial<Layout>) => update({ layout: { ...w.layout, ...patch } });
  function chooseCustom(value: string) {
    // A six-digit code typed without '#' is accepted and shown with it.
    const hex = normalizeHex(value);
    setCustom(hex ?? value);
    if (hex && colourCheck(hex).ok) setLayout({ accent: 'custom', customAccent: hex });
  }
  const pickerRef = useRef<HTMLInputElement>(null);
  const showEditor = customOpen || w.layout.accent === 'custom';
  const chooseCustomRef = useRef(chooseCustom);
  useEffect(() => { chooseCustomRef.current = chooseCustom; });
  // React's onChange fires on every drag step; the native change event fires when the picker commits, so only that saves (one undo entry).
  useEffect(() => {
    const input = pickerRef.current;
    if (!input) return;
    const commit = () => chooseCustomRef.current(input.value);
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [showEditor]);
  return <>
            <div className="panel-intro"><h2>Let the content lead.</h2><p>Restrained layouts, readable type and a clear hierarchy. Your facts stay the same in every design.</p></div>
            <div className="template-grid">{templateIds.map(t => <button className={'template-option ' + (w.layout.template === t ? 'selected' : '')} aria-label={'Use ' + templates[t].name + ' template'} aria-pressed={w.layout.template === t} key={t} onClick={() => setLayout({ template: t })}><span aria-hidden="true" className={'template-thumbnail ' + t} data-header={templates[t].header} data-section={templates[t].section} data-display={templates[t].display}><b>Aa</b><i /><i /><i /><i /></span><strong>{templates[t].name}</strong><span className="template-description">{templates[t].description}</span></button>)}</div>
            <p className="studio-hint">Nine professional layouts. Selecting a design changes presentation only: not your CV text. PDF and Word exports use the selected style; Exact PDF shows the final PDF pagination.</p>

            <div className="design-group">
              <h3 className="subheading">Colour</h3>
              <div className="swatch-row" role="radiogroup" aria-label="CV colour">
                {accentIds.map(id => <label key={id} className="swatch" title={accentPresets[id].name}>
                  <input type="radio" name="cv-colour" checked={!customOpen && w.layout.accent === id} onChange={() => { setCustomOpen(false); setLayout({ accent: id }); }} />
                  <span className="swatch-dot" style={{ background: accentPresets[id].hex }} aria-hidden="true" />
                  <span className="swatch-name">{accentPresets[id].name}</span>
                </label>)}
                <label className="swatch" title="Custom colour">
                  <input type="radio" name="cv-colour" checked={w.layout.accent === 'custom' || customOpen} onChange={() => { setCustomOpen(true); chooseCustom(custom); }} />
                  <span className="swatch-dot swatch-dot-custom" style={check.ok ? { background: custom } : undefined} aria-hidden="true" />
                  <span className="swatch-name">Custom</span>
                </label>
              </div>
              {(customOpen || w.layout.accent === 'custom') && <div className="custom-colour">
                <input type="color" ref={pickerRef} aria-label="Pick a custom colour" value={HEX.test(custom) ? custom.toLowerCase() : DEFAULT_CUSTOM} onChange={e => setCustom(e.target.value)} />
                <label className="studio-field"><span>Hex</span><input value={custom} maxLength={7} onChange={e => chooseCustom(e.target.value.trim())} /></label>
                <p role="status" className={check.ok ? 'colour-ok' : 'colour-warn'}>{check.message}</p>
              </div>}
            </div>

            <div className="design-group">
              <h3 className="subheading">Fonts</h3>
              <div className="font-grid" role="radiogroup" aria-label="CV fonts">
                <label className={'font-option' + (!w.layout.fontPair ? ' selected' : '')}>
                  <input type="radio" name="cv-fonts" checked={!w.layout.fontPair} onChange={() => setLayout({ fontPair: undefined })} />
                  <TemplateFontSample template={w.layout.template} />
                  <strong>Template&apos;s own fonts</strong><span className="template-description">The fonts each template was designed with</span>
                </label>
                {fontPairIds.map(id => {
                  const pair = fontPairs[id];
                  return <label key={id} className={'font-option' + (w.layout.fontPair === id ? ' selected' : '')}>
                    <input type="radio" name="cv-fonts" checked={w.layout.fontPair === id} onChange={() => setLayout({ fontPair: id })} />
                    <span className="font-sample" aria-hidden="true"><b style={{ fontFamily: pair.heading.css }}>Aa</b> <small style={{ fontFamily: pair.body.css }}>Ada Okafor</small></span>
                    <strong>{pair.name}</strong><span className="template-description">{pair.description}</span>
                  </label>;
                })}
              </div>
            </div>

            <div className="design-group">
              <h3 className="subheading">Columns</h3>
              <div className="font-grid column-grid" role="radiogroup" aria-label="CV columns">
                {columnChoices.map(id => <label key={id} className={'font-option' + (columnsNow === id ? ' selected' : '')}>
                  <input type="radio" name="cv-columns" checked={columnsNow === id} onChange={() => setLayout({ columns: id === 'one' ? undefined : id })} />
                  <span className="column-sketch" data-style={id} aria-hidden="true"><i /><i /></span>
                  <strong>{columnStyleNames[id]}</strong><span className="template-description">{columnStyleDescriptions[id]}</span>
                </label>)}
              </div>
              {w.layout.columns && <div className="column-sections">
                <h4 className="column-sections-title">Which column each section uses</h4>
                {repairOrder(w.layout.order, w.resume).map(key => <div key={key} className="column-row" role="radiogroup" aria-label={sectionNames[key]}>
                  <span>{sectionNames[key]}</span>
                  <span className="column-toggle">
                    <label><input type="radio" name={'cv-column-' + key} checked={!side.has(key)} onChange={() => setLayout({ sideSections: toggleSide(w.layout, key, false) })} />Main</label>
                    <label><input type="radio" name={'cv-column-' + key} checked={side.has(key)} onChange={() => setLayout({ sideSections: toggleSide(w.layout, key, true) })} />Side</label>
                  </span>
                </div>)}
                <p className="studio-hint">{COLUMNS_ATS_NOTE}</p>
                {!plan && <p className="colour-warn" role="status">{COLUMNS_EMPTY_NOTE}</p>}
              </div>}
            </div>

            <label className="studio-field"><span>Page size</span><select value={w.layout.pageSize} onChange={e => setLayout({ pageSize: e.target.value as Layout['pageSize'] })}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label>
            <label className="studio-field"><span>Body text · {w.layout.fontSize} pt</span><input type="range" min="9" max="12" step="0.5" value={w.layout.fontSize} onChange={e => setLayout({ fontSize: Number(e.target.value) })} /></label>
            <p className="studio-hint">Empty sections are omitted. Open Exact PDF to inspect real pagination before downloading.</p>
          </>;
}
