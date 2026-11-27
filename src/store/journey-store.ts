'use client';

import { create } from 'zustand';
import type { Journey } from '@/lib/curriculum-engine';
import type { TeachingMessage } from '@/lib/teaching-session-engine/shared';
import type { JourneyProgress } from '@/lib/progress-tracker';
import type { LearningHandoff } from '@/lib/cv-studio/learning-handoff';

export type FileUploadStatus = 'uploading' | 'parsed' | 'error';

export interface UploadedFile {
  file: File;
  status: FileUploadStatus;
  documentId?: string; // set after successful parse
  error?: string;
  progress: number; // 0-100 for upload animation
}

export interface JourneyState {
  topic: string;
  isGenerating: boolean;
  currentJourney: Journey | null;
  progress: number;
  progressMessage: string;
  error: string | null;
  uploadedFiles: UploadedFile[];
  learningHandoff: LearningHandoff | null;

  // Interactive journey state
  currentStageId: string | null;
  stageMessages: Record<string, TeachingMessage[]>;
  journeyProgress: JourneyProgress | null;
  isTeaching: boolean;
  streamingMessage: string;

  setTopic: (topic: string) => void;
  setLearningHandoff: (handoff: LearningHandoff | null) => void;
  addFiles: (files: UploadedFile[]) => void;
  updateFileStatus: (index: number, status: FileUploadStatus, documentId?: string, error?: string) => void;
  updateFileProgress: (index: number, progress: number) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  startGeneration: () => void;
  setProgress: (progress: number, message: string) => void;
  setJourney: (journey: Journey) => void;
  setError: (error: string) => void;
  reset: () => void;

  // Interactive journey actions
  setCurrentStage: (stageId: string) => void;
  addMessage: (stageId: string, message: TeachingMessage) => void;
  setStreamingMessage: (content: string) => void;
  updateProgress: (progress: JourneyProgress) => void;
  clearStageMessages: (stageId: string) => void;

  // Computed helpers
  getParsedDocumentIds: () => string[];
  allFilesReady: () => boolean;
  hasUploadingFiles: () => boolean;
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  topic: '',
  isGenerating: false,
  currentJourney: null,
  progress: 0,
  progressMessage: '',
  error: null,
  uploadedFiles: [],
  learningHandoff: null,

  // Interactive journey state defaults
  currentStageId: null,
  stageMessages: {},
  journeyProgress: null,
  isTeaching: false,
  streamingMessage: '',

  setTopic: (topic) => set({ topic }),
  setLearningHandoff: (learningHandoff) => set({ learningHandoff }),

  addFiles: (files) =>
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, ...files],
    })),

  updateFileStatus: (index, status, documentId, error) =>
    set((state) => {
      const updated = [...state.uploadedFiles];
      if (updated[index]) {
        updated[index] = { ...updated[index], status, documentId, error, progress: status === 'parsed' ? 100 : updated[index].progress };
      }
      return { uploadedFiles: updated };
    }),

  updateFileProgress: (index, progress) =>
    set((state) => {
      const updated = [...state.uploadedFiles];
      if (updated[index]) {
        updated[index] = { ...updated[index], progress };
      }
      return { uploadedFiles: updated };
    }),

  removeFile: (index) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((_, i) => i !== index),
    })),

  clearFiles: () => set({ uploadedFiles: [] }),

  startGeneration: () =>
    set({
      isGenerating: true,
      progress: 0,
      progressMessage: 'Starting journey generation...',
      error: null,
    }),

  setProgress: (progress, message) =>
    set({ progress, progressMessage: message }),

  setJourney: (journey) =>
    set({
      currentJourney: journey,
      isGenerating: false,
      progress: 100,
      progressMessage: 'Complete!',
    }),

  setError: (error) =>
    set({
      error,
      isGenerating: false,
      progress: 0,
      progressMessage: '',
    }),

  reset: () =>
    set({
      topic: '',
      isGenerating: false,
      currentJourney: null,
      progress: 0,
      progressMessage: '',
      error: null,
      uploadedFiles: [],
      learningHandoff: null,
      currentStageId: null,
      stageMessages: {},
      journeyProgress: null,
      isTeaching: false,
      streamingMessage: '',
    }),

  // Interactive journey actions
  setCurrentStage: (stageId) =>
    set({ currentStageId: stageId, isTeaching: true }),

  addMessage: (stageId, message) =>
    set((state) => ({
      stageMessages: {
        ...state.stageMessages,
        [stageId]: [...(state.stageMessages[stageId] || []), message],
      },
    })),

  setStreamingMessage: (content) =>
    set({ streamingMessage: content }),

  updateProgress: (progress) =>
    set({ journeyProgress: progress }),

  clearStageMessages: (stageId) =>
    set((state) => ({
      stageMessages: {
        ...state.stageMessages,
        [stageId]: [],
      },
    })),

  getParsedDocumentIds: () => {
    return get().uploadedFiles
      .filter((f) => f.status === 'parsed' && f.documentId)
      .map((f) => f.documentId!);
  },

  allFilesReady: () => {
    const files = get().uploadedFiles;
    return files.length === 0 || files.every((f) => f.status === 'parsed' || f.status === 'error');
  },

  hasUploadingFiles: () => {
    return get().uploadedFiles.some((f) => f.status === 'uploading');
  },
}));
