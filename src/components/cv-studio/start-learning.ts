import { saveLearningHandoff, type LearningHandoff } from '@/lib/cv-studio/learning-handoff';
import { useJourneyStore } from '@/store/journey-store';

/** Hands a topic to the Teach Me side of the app; call it from the link's onClick before navigating to /teach-me. */
export function startLearning(input: Omit<LearningHandoff, 'version'>) {
  const topic = input.topic.slice(0, 200);
  useJourneyStore.getState().setTopic(topic);
  try {
    const handoff = saveLearningHandoff(window.sessionStorage, { ...input, topic });
    useJourneyStore.getState().setLearningHandoff(handoff);
  } catch {
    // The in-memory topic still supports this client-side navigation.
  }
}
