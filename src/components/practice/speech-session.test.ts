import { beforeEach, describe, expect, it } from 'vitest';
import { createSpeechSession, MIC_BLOCKED, SPEECH_UNAVAILABLE, type SpeechRecognitionLike } from './speech-session';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static startError: Error | null = null;
  continuous = false;
  interimResults = false;
  lang = '';
  starts = 0;
  stops = 0;
  aborts = 0;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() {
    this.starts++;
    if (FakeRecognition.startError) throw FakeRecognition.startError;
  }
  stop() { this.stops++; }
  abort() { this.aborts++; }
}

function setup() {
  const log = { finals: [] as string[], interims: [] as string[], listening: false, error: '' };
  const session = createSpeechSession(FakeRecognition, {
    onFinal: t => log.finals.push(t),
    onInterim: t => log.interims.push(t),
    onState: s => {
      log.listening = s.listening;
      if (s.error !== undefined) log.error = s.error;
    },
  });
  return { log, session };
}

const result = (text: string, isFinal: boolean) => ({ isFinal, 0: { transcript: text } });

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.startError = null;
});

describe('createSpeechSession', () => {
  it('forwards final and interim text, respecting resultIndex', () => {
    const { log, session } = setup();
    session.start();
    const r = FakeRecognition.instances[0];
    expect(log.listening).toBe(true);
    r.onresult?.({ resultIndex: 1, results: [result('old', true), result('hello', true), result('wor', false)] });
    expect(log.finals).toEqual(['hello']);
    expect(log.interims.at(-1)).toBe('wor');
  });

  it('maps permission errors to MIC_BLOCKED and stops listening without onend', () => {
    for (const code of ['not-allowed', 'service-not-allowed', 'audio-capture']) {
      FakeRecognition.instances = [];
      const { log, session } = setup();
      session.start();
      FakeRecognition.instances[0].onerror?.({ error: code });
      expect(log.error).toBe(MIC_BLOCKED);
      expect(log.listening).toBe(false);
      session.start();
      expect(FakeRecognition.instances).toHaveLength(2);
    }
  });

  it('treats no-speech and aborted as a quiet end', () => {
    for (const code of ['no-speech', 'aborted']) {
      const { log, session } = setup();
      session.start();
      FakeRecognition.instances.at(-1)?.onerror?.({ error: code });
      expect(log.error).toBe('');
      expect(log.listening).toBe(false);
    }
  });

  it('uses generic wording for other errors', () => {
    const { log, session } = setup();
    session.start();
    FakeRecognition.instances[0].onerror?.({ error: 'network' });
    expect(log.error).toBe(SPEECH_UNAVAILABLE);
    expect(log.error).not.toContain('network');
    expect(log.listening).toBe(false);
  });

  it('keeps the error message when onend follows onerror', () => {
    const { log, session } = setup();
    session.start();
    const r = FakeRecognition.instances[0];
    r.onerror?.({ error: 'not-allowed' });
    r.onend?.();
    expect(log.error).toBe(MIC_BLOCKED);
  });

  it('ignores a second start while active', () => {
    const { log, session } = setup();
    session.start();
    session.start();
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0].starts).toBe(1);
    expect(log.error).toBe('');
  });

  it('forwards a final result delivered after stop() until that instance ends', () => {
    const { log, session } = setup();
    session.start();
    const r = FakeRecognition.instances[0];
    session.stop();
    expect(r.stops).toBe(1);
    expect(log.listening).toBe(false);
    const interimsBefore = log.interims.length;
    r.onresult?.({ resultIndex: 0, results: [result('partial', false)] });
    expect(log.interims.length).toBe(interimsBefore);
    r.onresult?.({ resultIndex: 0, results: [result('last phrase', true)] });
    expect(log.finals).toEqual(['last phrase']);
    r.onend?.();
    r.onresult?.({ resultIndex: 0, results: [result('after end', true)] });
    expect(log.finals).toEqual(['last phrase']);
    expect(log.listening).toBe(false);
  });

  it('allows a fresh start while stopping; old late final is forwarded but its end is ignored', () => {
    const { log, session } = setup();
    session.start();
    const old = FakeRecognition.instances[0];
    session.stop();
    session.start();
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(log.listening).toBe(true);
    old.onresult?.({ resultIndex: 0, results: [result('late', true)] });
    expect(log.finals).toEqual(['late']);
    old.onerror?.({ error: 'not-allowed' });
    old.onend?.();
    expect(log.error).toBe('');
    expect(log.listening).toBe(true);
    old.onresult?.({ resultIndex: 0, results: [result('too late', true)] });
    expect(log.finals).toEqual(['late']);
  });

  it('dispose silences stopping instances too', () => {
    const { log, session } = setup();
    session.start();
    const r = FakeRecognition.instances[0];
    const onresult = r.onresult;
    session.stop();
    session.dispose();
    expect(r.aborts).toBe(1);
    onresult?.({ resultIndex: 0, results: [result('late', true)] });
    expect(log.finals).toEqual([]);
  });

  it('dispose aborts the active recognition and silences later events', () => {
    const { log, session } = setup();
    session.start();
    const r = FakeRecognition.instances[0];
    const onresult = r.onresult;
    session.dispose();
    expect(r.aborts).toBe(1);
    onresult?.({ resultIndex: 0, results: [result('late', true)] });
    r.onend?.();
    expect(log.finals).toEqual([]);
    expect(log.listening).toBe(true);
    session.start();
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('maps a NotAllowedError from start() to MIC_BLOCKED', () => {
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    FakeRecognition.startError = err;
    const { log, session } = setup();
    session.start();
    expect(log.error).toBe(MIC_BLOCKED);
    expect(log.listening).toBe(false);
  });

  it('maps other start() failures to SPEECH_UNAVAILABLE', () => {
    FakeRecognition.startError = new Error('boom');
    const { log, session } = setup();
    session.start();
    expect(log.error).toBe(SPEECH_UNAVAILABLE);
    expect(log.listening).toBe(false);
  });
});
