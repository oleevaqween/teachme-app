'use client';

import { create } from 'zustand';
import type { MockQuestion, ArchivedQuestion } from '@/lib/interview-engine';
import type { FeedbackView } from '@/lib/practice/schema';

/** One scored answer in quick practice; kept in memory only, never saved. */
export type QuickAttempt = FeedbackView & { id: string; createdAt: string };

/** What a draft carries besides its text, so a returned-to answer keeps its time and input method. */
export type AnswerMeta = { seconds: number; typed: boolean; spoken: boolean };

export interface InterviewState {
  role: string;
  questions: MockQuestion[];
  currentQuestionIndex: number;
  attempts: Record<string, QuickAttempt[]>;
  /**
   * Half-typed answer text per answer box, keyed by draftKey (question id plus "main" or the follow-up id).
   * Cleared once that answer has been scored.
   */
  answers: Record<string, string>;
  /** Per answer box, like `answers`: seconds spent on the draft and how it was entered, kept when leaving the box. */
  answerMeta: Record<string, AnswerMeta>;
  archivedQuestions: ArchivedQuestion[];
  isLoading: boolean;
  error: string | null;

  setRole: (role: string) => void;
  setQuestions: (questions: MockQuestion[]) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  goToQuestion: (index: number) => void;
  addAttempt: (questionId: string, attempt: QuickAttempt) => void;
  setAnswer: (questionId: string, answer: string) => void;
  /** Saves (or with null, clears) a draft's time and input method. */
  setAnswerMeta: (key: string, meta: AnswerMeta | null) => void;
  setArchivedQuestions: (questions: ArchivedQuestion[]) => void;
  addArchivedQuestion: (question: ArchivedQuestion) => void;
  removeArchivedQuestion: (questionId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  role: '',
  questions: [],
  currentQuestionIndex: 0,
  attempts: {},
  answers: {},
  answerMeta: {},
  archivedQuestions: [],
  isLoading: false,
  error: null,

  setRole: (role) => set({ role }),

  setQuestions: (questions) =>
    set({ questions, currentQuestionIndex: 0, attempts: {}, answers: {}, answerMeta: {} }),

  nextQuestion: () =>
    set((state) => ({
      currentQuestionIndex: Math.min(
        state.currentQuestionIndex + 1,
        state.questions.length - 1
      ),
    })),

  previousQuestion: () =>
    set((state) => ({
      currentQuestionIndex: Math.max(state.currentQuestionIndex - 1, 0),
    })),

  goToQuestion: (index) =>
    set((state) => ({
      currentQuestionIndex: Math.max(
        0,
        Math.min(index, state.questions.length - 1)
      ),
    })),

  addAttempt: (questionId, attempt) =>
    set((state) => ({
      attempts: { ...state.attempts, [questionId]: [...(state.attempts[questionId] ?? []), attempt] },
    })),

  setAnswer: (questionId, answer) =>
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer },
    })),

  setAnswerMeta: (key, meta) =>
    set((state) => {
      const answerMeta = { ...state.answerMeta };
      if (meta) answerMeta[key] = meta;
      else delete answerMeta[key];
      return { answerMeta };
    }),

  setArchivedQuestions: (questions) => set({ archivedQuestions: questions }),

  addArchivedQuestion: (question) =>
    set((state) => {
      // Remove the archived question from active questions. The index then already
      // points at the following question, so only clamp it to the shorter list.
      const questions = state.questions.filter((q) => q.id !== question.id);
      return {
        archivedQuestions: [question, ...state.archivedQuestions],
        questions,
        currentQuestionIndex: Math.max(0, Math.min(state.currentQuestionIndex, questions.length - 1)),
      };
    }),

  removeArchivedQuestion: (questionId) =>
    set((state) => ({
      archivedQuestions: state.archivedQuestions.filter(
        (q) => q.id !== questionId
      ),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      role: '',
      questions: [],
      currentQuestionIndex: 0,
      attempts: {},
      answers: {},
      answerMeta: {},
      archivedQuestions: [],
      isLoading: false,
      error: null,
    }),
}));
