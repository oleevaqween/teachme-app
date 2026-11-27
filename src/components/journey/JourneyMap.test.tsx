import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JourneyMap, type JourneyStage } from './JourneyMap';
import type { JourneyProgress, StageProgress } from '@/lib/progress-tracker';
import type { JourneyActivity } from '@/lib/progress-tracker/activity';

const noop = () => {};
const stages: JourneyStage[] = [
  { id: 's1', title: 'Foundations', summary: 'Basics.', theme: 'Intro', order: 1 },
  { id: 's2', title: 'Stakeholder maps', summary: 'Who matters.', theme: 'People', order: 2 },
  { id: 's3', title: 'Reporting', summary: 'Telling people.', theme: 'Comms', order: 3 },
];

function progress(statuses: StageProgress['status'][]): JourneyProgress {
  const completedCount = statuses.filter((s) => s === 'completed').length;
  return {
    journeyId: 'j1',
    stages: statuses.map((status, i) => ({ stageId: `s${i + 1}`, journeyId: 'j1', status })),
    completedCount,
    totalStages: statuses.length,
    percentComplete: Math.round((completedCount / statuses.length) * 100),
  };
}

const activity: JourneyActivity = {
  now: new Date(2026, 10, 19, 12, 0),
  stages: [
    { stageId: 's1', lastStudiedAt: new Date(2026, 10, 18, 9, 0).toISOString() },
    { stageId: 's2', lastStudiedAt: new Date(2026, 10, 19, 8, 0).toISOString() },
    { stageId: 's3', lastStudiedAt: null },
  ],
};

const render = (p: JourneyProgress, a?: JourneyActivity | null) =>
  renderToStaticMarkup(<JourneyMap stages={stages} progress={p} onStageClick={noop} activity={a} />);

describe('journey map: pick up where you left off', () => {
  it('shows the Continue button for the most recently studied open stage, at the top', () => {
    const html = render(progress(['completed', 'in_progress', 'locked']), activity);
    expect(html).toContain('Continue: Stage 2 · Stakeholder maps');
    expect(html.indexOf('Continue: Stage 2')).toBeLessThan(html.indexOf('stages complete'));
  });

  it('shows last-studied text only on stages with messages', () => {
    const html = render(progress(['completed', 'in_progress', 'locked']), activity);
    expect(html).toContain('Last studied yesterday');
    expect(html).toContain('Last studied today');
    expect(html.match(/Last studied/g)).toHaveLength(2);
  });

  it('hides the Continue button when the journey is complete, keeping the dates', () => {
    const html = render(progress(['completed', 'completed', 'completed']), activity);
    expect(html).not.toContain('Continue:');
    expect(html).toContain('Last studied yesterday');
  });

  it('shows no Continue button and no dates without activity', () => {
    for (const html of [
      render(progress(['completed', 'in_progress', 'locked'])),
      render(progress(['unlocked', 'locked', 'locked']), null),
    ]) {
      expect(html).not.toContain('Continue:');
      expect(html).not.toContain('Last studied');
      expect(html).toContain('Foundations');
    }
  });
});

describe('journey map: study time', () => {
  const timed: JourneyActivity = {
    now: activity.now,
    stages: [
      { stageId: 's1', lastStudiedAt: new Date(2026, 10, 18, 9, 0).toISOString(), studySeconds: 25 * 60 },
      { stageId: 's2', lastStudiedAt: new Date(2026, 10, 19, 8, 0).toISOString(), studySeconds: 30 },
      { stageId: 's3', lastStudiedAt: null, studySeconds: 3600 + 5 * 60 },
    ],
  };

  it('adds the study time to the last-studied line, only from a minute up', () => {
    const html = render(progress(['completed', 'in_progress', 'unlocked']), timed);
    expect(html).toContain('Last studied yesterday · 25 min');
    expect(html).toContain('Last studied today<');
    expect(html).toContain('Studied 1 h 5 min');
  });

  it('shows the journey total under the progress bar', () => {
    const html = render(progress(['completed', 'in_progress', 'unlocked']), timed);
    expect(html).toContain('Time studied: 1 h 30 min');
    expect(html.indexOf('stages complete')).toBeLessThan(html.indexOf('Time studied:'));
  });

  it('shows no total under a minute or without activity', () => {
    expect(render(progress(['completed', 'in_progress', 'locked']), activity)).not.toContain('Time studied');
    expect(render(progress(['completed', 'in_progress', 'locked']))).not.toContain('Time studied');
  });
});

describe('journey map: check scores', () => {
  it('adds the last check score to the line, alone when nothing else is known', () => {
    const scored: JourneyActivity = {
      now: activity.now,
      stages: [
        { stageId: 's1', lastStudiedAt: new Date(2026, 10, 18, 9, 0).toISOString(), studySeconds: 25 * 60, lastCheck: { correct: 3, total: 4 } },
        { stageId: 's2', lastStudiedAt: null, studySeconds: 0, lastCheck: { correct: 1, total: 3 } },
        { stageId: 's3', lastStudiedAt: null, studySeconds: 0, lastCheck: null },
      ],
    };
    const html = render(progress(['completed', 'in_progress', 'unlocked']), scored);
    expect(html).toContain('Last studied yesterday · 25 min · Last check 3/4');
    expect(html).toContain('>Last check 1/3<');
    expect(html.match(/Last check/g)).toHaveLength(2);
  });
});
