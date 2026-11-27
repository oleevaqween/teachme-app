import { describe, it, expect } from 'vitest';
import { fixture } from './test-fixture';
import { columnPlan, defaultSideSections, sideSet, toggleSide } from './columns';

describe('column plan', () => {
  it('is null for a one-column layout', () => {
    const w = fixture();
    expect(columnPlan(w.layout, w.resume)).toBeNull();
  });

  it('puts the default short sections in the side column, in section order', () => {
    const w = fixture(); w.layout.columns = 'right';
    expect(columnPlan(w.layout, w.resume)).toEqual({ style: 'right', main: ['summary', 'experience'], side: ['education', 'skills'] });
  });

  it('uses saved side sections and ignores duplicates', () => {
    const w = fixture(); w.layout.columns = 'left'; w.layout.sideSections = ['summary', 'summary', 'skills'];
    expect(columnPlan(w.layout, w.resume)).toEqual({ style: 'left', main: ['experience', 'education'], side: ['summary', 'skills'] });
  });

  it('follows the section order and includes sections with content missing from it', () => {
    const w = fixture(); w.layout.columns = 'panel'; w.layout.order = ['skills', 'experience', 'summary', 'education'];
    w.resume.languages = [{ id: 'l1', language: 'French', level: 'Fluent' }];
    expect(columnPlan(w.layout, w.resume)).toEqual({ style: 'panel', main: ['experience', 'summary'], side: ['skills', 'education', 'languages'] });
  });

  it('ignores sections without content', () => {
    const w = fixture(); w.layout.columns = 'right'; w.layout.sideSections = ['projects', 'skills'];
    expect(columnPlan(w.layout, w.resume)).toEqual({ style: 'right', main: ['summary', 'experience', 'education'], side: ['skills'] });
  });

  it('is null when either column would be empty', () => {
    const w = fixture(); w.layout.columns = 'right'; w.layout.sideSections = [];
    expect(columnPlan(w.layout, w.resume)).toBeNull();
    w.layout.sideSections = ['summary', 'experience', 'education', 'skills'];
    expect(columnPlan(w.layout, w.resume)).toBeNull();
  });

  it('is null when the only side section prints no text', () => {
    const w = fixture(); w.layout.columns = 'right'; w.layout.sideSections = ['languages'];
    w.resume.languages = [{ id: 'l1', language: ' ', level: '' }];
    expect(columnPlan(w.layout, w.resume)).toBeNull();
  });
});

describe('moving sections between columns', () => {
  it('starts from the defaults', () => {
    expect(sideSet({}).size).toBe(defaultSideSections.length);
    expect(toggleSide({}, 'summary', true)).toEqual(['summary', 'education', 'skills', 'certifications', 'languages', 'awards', 'training', 'strengths', 'interests', 'references']);
  });

  it('adds and removes from saved side sections', () => {
    expect(toggleSide({ sideSections: ['skills', 'education'] }, 'education', false)).toEqual(['skills']);
    expect(toggleSide({ sideSections: ['skills'] }, 'skills', true)).toEqual(['skills']);
  });
});
