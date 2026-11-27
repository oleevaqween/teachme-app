import { describe, it, expect } from 'vitest';
import { assessStageCompletion, TeachingMessage } from './index';
import type { Stage } from '@/lib/journey-map-generator';

function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  index: number
): TeachingMessage {
  return {
    id: `msg-${index}`,
    stageId: 'stage-1',
    journeyId: 'journey-1',
    role,
    content,
    sources: [],
    messageType: 'qa',
    createdAt: new Date(),
  };
}

function makeStage(topicsCovered: string[]): Stage {
  return {
    id: 'stage-1',
    journeyId: 'journey-1',
    title: 'Test Stage',
    summary: 'A test stage for unit tests',
    theme: 'testing',
    order: 1,
    topicsCovered,
  };
}

describe('assessStageCompletion', () => {
  it('returns false when there are no topics', () => {
    const messages = [
      makeMessage('assistant', 'Hello, welcome to the stage!', 1),
      makeMessage('user', 'Thanks!', 2),
      makeMessage('assistant', 'Let me explain something.', 3),
      makeMessage('user', 'OK', 4),
      makeMessage('assistant', 'Here is more info.', 5),
    ];
    const stage = makeStage([]);
    expect(assessStageCompletion(messages, stage)).toBe(false);
  });

  it('returns false when fewer than 3 assistant messages', () => {
    const messages = [
      makeMessage('assistant', 'Here are variables and functions in JavaScript.', 1),
      makeMessage('user', 'Tell me more', 2),
      makeMessage('assistant', 'Variables store data, functions encapsulate logic.', 3),
    ];
    const stage = makeStage(['variables', 'functions', 'loops']);
    expect(assessStageCompletion(messages, stage)).toBe(false);
  });

  it('returns true when all topics are covered with enough messages', () => {
    const messages = [
      makeMessage('assistant', 'Let me teach you about variables in JavaScript.', 1),
      makeMessage('user', 'OK', 2),
      makeMessage('assistant', 'Functions are reusable blocks of code.', 3),
      makeMessage('user', 'What about loops?', 4),
      makeMessage('assistant', 'Loops allow you to repeat actions. For loops and while loops are common.', 5),
    ];
    const stage = makeStage(['variables', 'functions', 'loops']);
    expect(assessStageCompletion(messages, stage)).toBe(true);
  });

  it('returns false when less than 80% of topics are covered', () => {
    const messages = [
      makeMessage('assistant', 'Variables store values.', 1),
      makeMessage('user', 'OK', 2),
      makeMessage('assistant', 'Let me explain more about variables.', 3),
      makeMessage('user', 'Continue', 4),
      makeMessage('assistant', 'Variables can be reassigned in some languages.', 5),
    ];
    // Only 1 out of 5 topics covered = 20%, well below 80%
    const stage = makeStage(['variables', 'functions', 'loops', 'arrays', 'objects']);
    expect(assessStageCompletion(messages, stage)).toBe(false);
  });

  it('returns true at exactly 80% coverage', () => {
    const messages = [
      makeMessage('assistant', 'Variables hold data values.', 1),
      makeMessage('user', 'OK', 2),
      makeMessage('assistant', 'Functions encapsulate reusable logic. Loops repeat actions.', 3),
      makeMessage('user', 'More please', 4),
      makeMessage('assistant', 'Arrays store ordered collections of items.', 5),
    ];
    // 4 out of 5 topics covered = 80%
    const stage = makeStage(['variables', 'functions', 'loops', 'arrays', 'objects']);
    expect(assessStageCompletion(messages, stage)).toBe(true);
  });

  it('handles multi-word topics by checking individual keywords', () => {
    const messages = [
      makeMessage('assistant', 'Object-oriented programming uses classes and inheritance.', 1),
      makeMessage('user', 'OK', 2),
      makeMessage('assistant', 'Design patterns help solve common problems.', 3),
      makeMessage('user', 'Continue', 4),
      makeMessage('assistant', 'Error handling uses try-catch blocks.', 5),
    ];
    const stage = makeStage([
      'object-oriented programming',
      'design patterns',
      'error handling',
    ]);
    expect(assessStageCompletion(messages, stage)).toBe(true);
  });

  it('is case-insensitive when matching topics', () => {
    const messages = [
      makeMessage('assistant', 'JAVASCRIPT is a popular language.', 1),
      makeMessage('user', 'OK', 2),
      makeMessage('assistant', 'TypeScript adds types to JavaScript.', 3),
      makeMessage('user', 'Continue', 4),
      makeMessage('assistant', 'React is a UI framework built with JavaScript.', 5),
    ];
    const stage = makeStage(['JavaScript', 'TypeScript', 'React']);
    expect(assessStageCompletion(messages, stage)).toBe(true);
  });

  it('ignores user messages when checking coverage', () => {
    const messages = [
      makeMessage('assistant', 'Welcome to the stage.', 1),
      makeMessage('user', 'Tell me about variables and functions and loops', 2),
      makeMessage('assistant', 'Sure, let me start.', 3),
      makeMessage('user', 'I know about arrays and objects too', 4),
      makeMessage('assistant', 'Great question.', 5),
    ];
    // Topics are only mentioned in user messages, not assistant messages
    const stage = makeStage(['variables', 'functions', 'loops', 'arrays', 'objects']);
    expect(assessStageCompletion(messages, stage)).toBe(false);
  });
});
