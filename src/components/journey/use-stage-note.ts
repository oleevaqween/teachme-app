'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createNoteSaver,
  type NoteSaveStatus,
  type NoteSaver,
  type SaveResult,
} from '@/lib/teaching-session-engine/stage-note';

/** Turns a save response into a save result. */
async function saveResult(response: Response): Promise<SaveResult> {
  if (response.ok) return 'saved';
  const data = (await response.json().catch(() => ({}))) as { code?: string };
  return data.code === 'NOTES_UNAVAILABLE' ? 'unavailable' : 'error';
}

/**
 * The stage's note: loads it once, then saves as the learner types. Editing stays off until the
 * saved note has loaded, so a failed load can never overwrite it. Waiting text is sent when the
 * lesson closes or the page is left.
 */
export function useStageNote(journeyId: string, stageId: string) {
  const url = `/api/journey/${journeyId}/stage/${stageId}/note`;
  // The note is held with the address it was loaded from, so text from one stage can never be shown or saved as another's.
  const [note, setNote] = useState<{ url: string; text: string; status: NoteSaveStatus }>({ url, text: '', status: 'loading' });
  const [loadRequest, setLoadRequest] = useState(0);
  const saverRef = useRef<NoteSaver | null>(null);
  const current = note.url === url ? note : { url, text: '', status: 'loading' as const };

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { content?: unknown; code?: string };
        if (cancelled) return;
        if (response.ok && typeof data.content === 'string') {
          setNote({ url, text: data.content, status: 'idle' });
        } else {
          setNote({ url, text: '', status: data.code === 'NOTES_UNAVAILABLE' ? 'unavailable' : 'load-error' });
        }
      })
      .catch(() => {
        if (!cancelled) setNote({ url, text: '', status: 'load-error' });
      });
    return () => {
      cancelled = true;
    };
  }, [url, loadRequest]);

  useEffect(() => {
    const saver = createNoteSaver({
      send: (content, keepalive) =>
        fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          keepalive,
        }).then(saveResult),
      onStatus: (status) => setNote((prev) => (prev.url === url ? { ...prev, status } : prev)),
    });
    saverRef.current = saver;
    const onPageHide = () => saver.flush(true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      saver.dispose();
      if (saverRef.current === saver) saverRef.current = null;
    };
  }, [url]);

  const change = useCallback(
    (value: string) => {
      if (note.url !== url) return;
      setNote((prev) => ({ ...prev, text: value }));
      saverRef.current?.change(value);
    },
    [note.url, url]
  );

  const retrySave = useCallback(() => {
    saverRef.current?.retry(current.text);
  }, [current.text]);

  const reload = useCallback(() => {
    setNote((prev) => ({ ...prev, status: 'loading' }));
    setLoadRequest((count) => count + 1);
  }, []);

  return { text: current.text, status: current.status, change, retrySave, reload };
}
