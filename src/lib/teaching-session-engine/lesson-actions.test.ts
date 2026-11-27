import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_CONTINUE_INSTRUCTION,
  LESSON_ACTIONS,
  LESSON_ACTION_LABELS,
  checkInProgress,
  cleanRole,
  lessonActionInstruction,
  lessonActionLine,
  typedLessonAction,
} from './lesson-actions';
import { buildGroundedPrompt } from './grounding-engine';
import type { ContentChunk } from '@/lib/journey-map-generator';

const chunk: ContentChunk = {
  id: 'c1', stageId: 's1', journeyId: 'j1', content: 'A RACI chart names who is responsible.',
  sourceDocument: 'raci.pdf', sourceSection: 'Basics', order: 1, wordCount: 7,
};

describe('lesson actions', () => {
  it('lists the five buttons in order with their labels', () => {
    expect(LESSON_ACTIONS).toEqual(['simpler', 'example', 'steps', 'work', 'check']);
    expect(LESSON_ACTIONS.map((a) => LESSON_ACTION_LABELS[a])).toEqual([
      'Simpler', 'Give an example', 'Step by step', 'How it applies at work', 'Check my understanding',
    ]);
  });

  it('saves the exact visible line for each action', () => {
    expect(lessonActionLine('simpler')).toBe('Explain that more simply.');
    expect(lessonActionLine('example')).toBe('Give me an example.');
    expect(lessonActionLine('steps')).toBe('Walk me through it step by step.');
    expect(lessonActionLine('work')).toBe('How does this apply at work?');
    expect(lessonActionLine('check')).toBe('Check my understanding.');
  });

  it('names the role in the work line only when it is known', () => {
    expect(lessonActionLine('work', 'Project Manager')).toBe('How does this apply at work, for a Project Manager role?');
    expect(lessonActionLine('work', '   ')).toBe('How does this apply at work?');
    expect(lessonActionLine('work', null)).toBe('How does this apply at work?');
    expect(lessonActionLine('simpler', 'Project Manager')).toBe('Explain that more simply.');
  });

  it('treats a typed button line as that button, ignoring case, spacing and closing punctuation', () => {
    expect(typedLessonAction('Check my understanding.')).toEqual({ action: 'check' });
    expect(typedLessonAction('  check my   understanding ')).toEqual({ action: 'check' });
    expect(typedLessonAction('Check my understanding!')).toEqual({ action: 'check' });
    expect(typedLessonAction('Explain that more simply')).toEqual({ action: 'simpler' });
    expect(typedLessonAction('give me an example.')).toEqual({ action: 'example' });
    expect(typedLessonAction('Walk me through it step by step')).toEqual({ action: 'steps' });
    expect(typedLessonAction('How does this apply at work?')).toEqual({ action: 'work' });
    expect(typedLessonAction('How does this apply at work, for a Project Manager role?')).toEqual({ action: 'work', role: 'Project Manager' });
    expect(typedLessonAction('how does this apply at work for an  Analyst role')).toEqual({ action: 'work', role: 'Analyst' });
  });

  it('leaves every other message alone', () => {
    expect(typedLessonAction('')).toBeNull();
    expect(typedLessonAction('   ')).toBeNull();
    expect(typedLessonAction('continue')).toBeNull();
    expect(typedLessonAction('Can you check my understanding of RACI?')).toBeNull();
    expect(typedLessonAction('Give me an example of a RACI chart.')).toBeNull();
    expect(typedLessonAction('How does this apply at work, for a  role?')).toBeNull();
  });

  it('keeps a role to one trimmed line of at most 200 characters', () => {
    expect(cleanRole('  Data\nAnalyst  ')).toBe('Data Analyst');
    expect(cleanRole('x'.repeat(250))).toHaveLength(200);
    expect(cleanRole(undefined)).toBe('');
  });

  it('gives each action its fixed instruction', () => {
    expect(lessonActionInstruction('simpler')).toContain('plain language for a newcomer');
    expect(lessonActionInstruction('simpler')).toContain('do not introduce new topics');
    expect(lessonActionInstruction('example')).toContain('one or two concrete examples');
    expect(lessonActionInstruction('steps')).toContain('short numbered sequence');
    expect(lessonActionInstruction('work')).toBe('Relate the most recent teaching point to real job tasks.');
    expect(lessonActionInstruction('work', 'Project Manager')).toBe(
      'Relate the most recent teaching point to real job tasks for someone in a Project Manager role.'
    );
    const check = lessonActionInstruction('check');
    expect(check).toContain('3 or 4 short questions');
    expect(check).toContain('one at a time');
    expect(check).toContain('what was right, what to correct, and the source');
    expect(check).toContain('summarise what the student should review');
    expect(check).toContain('Score: N/M');
    expect(check).toContain("only from this stage's material");
  });
});

describe('lesson instructions in the grounded prompt', () => {
  it('leaves the prompt and the search exactly as before without options', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const before = await buildGroundedPrompt([chunk], 'What is RACI?', [], search);
    const withEmpty = await buildGroundedPrompt([chunk], 'What is RACI?', [], search, {});
    expect(withEmpty.systemPrompt).toBe(before.systemPrompt);
    expect(before.systemPrompt).not.toContain('LESSON REQUEST');
    expect(search).toHaveBeenNthCalledWith(1, 'What is RACI?');
    expect(search).toHaveBeenNthCalledWith(2, 'What is RACI?');
  });

  it('adds the instruction after the conversation context and searches with the given query', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const prompt = await buildGroundedPrompt([chunk], 'Give me an example.', [], search, {
      searchQuery: 'Roles and responsibilities',
      lessonInstruction: lessonActionInstruction('example'),
    });
    expect(search).toHaveBeenCalledWith('Roles and responsibilities');
    expect(prompt.systemPrompt.indexOf('--- CONVERSATION CONTEXT ---')).toBeLessThan(prompt.systemPrompt.indexOf('--- LESSON REQUEST ---'));
    expect(prompt.systemPrompt.endsWith(lessonActionInstruction('example'))).toBe(true);
    expect(prompt.systemPrompt).toContain('GROUNDING RULES');
    expect(prompt.systemPrompt).toContain('A RACI chart names who is responsible.');
  });
});

type Line = { role: 'user' | 'assistant'; content: string };
const learner = (content: string): Line => ({ role: 'user', content });
const tutor = (content: string): Line => ({ role: 'assistant', content });
const lesson: Line[] = [
  tutor('Welcome to stage 1. A RACI chart names who is Responsible, Accountable, Consulted and Informed.'),
  learner('continue'),
  tutor('Next, the Accountable person signs off the work.'),
];

describe('check in progress', () => {
  it('is false when the stage has no check', () => {
    expect(checkInProgress([])).toBe(false);
    expect(checkInProgress(lesson)).toBe(false);
    expect(checkInProgress([...lesson, learner('check my understanding please')])).toBe(false);
  });

  it('is true just after the check started', () => {
    expect(checkInProgress([...lesson, learner('Check my understanding.'), tutor('Question 1: who signs off the work?')])).toBe(true);
  });

  it('is true two questions in, whatever the answers say', () => {
    expect(checkInProgress([
      ...lesson,
      learner('Check my understanding.'),
      tutor('Question 1: who signs off the work?'),
      learner('The accountable person'),
      tutor('Right [Document: raci.pdf]. Question 2: who only needs to be told?'),
      learner('ok'),
    ])).toBe(true);
  });

  it('is false once 5 assistant replies follow the check line', () => {
    const replies = [1, 2, 3, 4].flatMap((n) => [tutor(`Question ${n}?`), learner(`Answer ${n}`)]);
    expect(checkInProgress([...lesson, learner('Check my understanding.'), ...replies])).toBe(true);
    expect(checkInProgress([...lesson, learner('Check my understanding.'), ...replies, tutor('Summary: review the Consulted role.')])).toBe(false);
  });

  it('is false once the scored summary arrives, even before 5 replies', () => {
    const started = [...lesson, learner('Check my understanding.'), tutor('Question 1?'), learner('A'), tutor('Right. Question 2?'), learner('B')];
    expect(checkInProgress(started)).toBe(true);
    expect(checkInProgress([...started, tutor('Review the Consulted role.\n\nScore: 1/2')])).toBe(false);
  });

  it('is false after another button interrupts it', () => {
    const started = [...lesson, learner('Check my understanding.'), tutor('Question 1: who signs off the work?')];
    for (const line of ['Explain that more simply.', 'Give me an example.', 'Walk me through it step by step.', 'How does this apply at work?', 'How does this apply at work, for a Project Manager role?']) {
      expect(checkInProgress([...started, learner(line), tutor('Here you go.')])).toBe(false);
    }
  });

  it('follows the most recent check line when a new check starts', () => {
    const ended = [learner('Check my understanding.'), tutor('Q1'), learner('Give me an example.'), tutor('Example')];
    expect(checkInProgress(ended)).toBe(false);
    expect(checkInProgress([...ended, learner('Check my understanding.'), tutor('Q1 again')])).toBe(true);
  });

  it('has a fixed continuation instruction', () => {
    expect(CHECK_CONTINUE_INSTRUCTION).toContain('in progress; continue it');
    expect(CHECK_CONTINUE_INSTRUCTION).toContain("latest message as their answer");
    expect(CHECK_CONTINUE_INSTRUCTION).toContain('ask the next short question');
    expect(CHECK_CONTINUE_INSTRUCTION).toContain('summarise what they should review');
    expect(CHECK_CONTINUE_INSTRUCTION).toContain('Score: N/M');
  });
});
