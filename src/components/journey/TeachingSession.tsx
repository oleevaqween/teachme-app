'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useJourneyStore } from '@/store/journey-store';
import { MessageBubble } from './MessageBubble';
import { LessonCard } from './LessonCard';
import { LessonActionButtons } from './LessonActions';
import { StageSources, hasSources } from './StageSources';
import { StageTopics, topicCount } from './StageTopics';
import { messageElementId, startOfLatestReply } from './lesson-scroll';
import { removeEmDashes } from '@/lib/teaching-session-engine/lesson-style';
import { parseStageSources, type StageSourceList } from '@/lib/teaching-session-engine/stage-sources';
import { lessonMessage } from './lesson-message';
import { assessStageCompletion } from '@/lib/teaching-session-engine/shared';
import { detectMessageIntent } from '@/lib/teaching-session-engine/intent-detector';
import { getRandomPhrase } from '@/lib/teaching-session-engine/loading-phrases';
import { extractTeachingStreamError } from '@/lib/teaching-session-engine/stream-protocol';
import { apiErrorMessage } from '@/lib/http-response';
import type { TeachingMessage } from '@/lib/teaching-session-engine/shared';
import { checkInProgress, type LessonAction } from '@/lib/teaching-session-engine/lesson-actions';
import type { Stage } from '@/lib/journey-map-generator';
import { cn } from '@/lib/utils';
import { READING_COLUMN as COLUMN } from './reading-width';
import { HeaderPopover } from './HeaderPopover';
import { ArrowLeft, Send, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';

interface TeachingSessionProps {
  journeyId: string;
  stageId: string;
  stageTitle: string;
  topicsCovered: string[];
  onBack: () => void;
  /** Target role remembered from a CV Studio link; used by "How it applies at work". */
  role?: string;
}

type SessionStatus = 'loading' | 'initializing' | 'ready' | 'streaming' | 'error';

export function TeachingSession({
  journeyId,
  stageId,
  stageTitle,
  topicsCovered,
  onBack,
  role,
}: TeachingSessionProps) {
  const [messages, setMessages] = useState<TeachingMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [streamingType, setStreamingType] = useState<'lecture' | 'qa'>('lecture');
  const [loadingPhrase, setLoadingPhrase] = useState<string>('');
  const [stageSources, setStageSources] = useState<StageSourceList | null>(null);

  const { streamingMessage, setStreamingMessage, clearStageMessages } =
    useJourneyStore();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initCalledRef = useRef(false);

  // Scrolling brings a message's start into view once (on opening a stage, and when the
  // user sends), then leaves the page alone so a long lesson can be read from its top.
  const scrollTargetRef = useRef<{ id: string; behavior: ScrollBehavior } | null>(null);
  const scrollPaneRef = useRef<HTMLDivElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);

  const scrollToMessage = useCallback((id: string, behavior: ScrollBehavior) => {
    scrollTargetRef.current = { id, behavior };
    setScrollRequest((count) => count + 1);
  }, []);

  useEffect(() => {
    const target = scrollTargetRef.current;
    if (!target) return;
    scrollTargetRef.current = null;
    const pane = scrollPaneRef.current;
    const element = document.getElementById(messageElementId(target.id));
    if (!pane || !element) return;
    // Only the messages pane moves (scrollIntoView would also scroll the window and hide the header).
    const top = element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 16;
    pane.scrollTo({ top: Math.max(0, top), behavior: target.behavior });
  }, [scrollRequest]);

  const canComplete = useMemo(() => {
    if (messages.length === 0) return false;
    const stage: Stage = {
      id: stageId,
      journeyId,
      title: stageTitle,
      summary: '',
      theme: '',
      order: 0,
      topicsCovered,
    };

    return assessStageCompletion(messages, stage);
  }, [messages, stageId, journeyId, stageTitle, topicsCovered]);

  useEffect(() => {
    loadMessages();
    return () => {
      abortControllerRef.current?.abort();
      setStreamingMessage('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, journeyId]);

  // The stage's source list is read once per stage; if it fails the lesson simply shows no list.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/journey/${journeyId}/stage/${stageId}/sources`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setStageSources(parseStageSources(data));
      })
      .catch(() => {
        if (!cancelled) setStageSources(null);
      });
    return () => {
      cancelled = true;
    };
  }, [journeyId, stageId]);

  async function loadMessages() {
    setStatus('loading');
    setError(null);

    try {
      const response = await fetch(
        `/api/journey/${journeyId}/stage/${stageId}/messages`
      );

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, 'Failed to load messages'));
      }

      const data = await response.json();
      const loadedMessages: TeachingMessage[] = data.messages.map(
        (msg: TeachingMessage) => ({
          ...msg,
          messageType: (msg.messageType ?? 'qa') as 'lecture' | 'qa',
          createdAt: new Date(msg.createdAt),
        })
      );

      setMessages(loadedMessages);
      const resumeAt = startOfLatestReply(loadedMessages);
      if (resumeAt) scrollToMessage(resumeAt, 'auto');

      if (loadedMessages.length === 0 && !initCalledRef.current) {
        initCalledRef.current = true;
        await initializeSession();
      } else {
        setStatus('ready');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load messages';
      setError(message);
      setStatus('error');
    }
  }

  async function initializeSession() {
    setStatus('initializing');
    setStreamingType('lecture');
    setStreamingMessage('');

    try {
      const response = await fetch('/api/teaching-session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journeyId, stageId }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, 'Failed to initialize session'));
      }

      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        if (data.alreadyInitialized) {
          await loadMessages();
          return;
        }
        if (data.error) {
          throw new Error(data.error);
        }
      }

      const streamed = await streamResponse(response);
      const streamError = extractTeachingStreamError(streamed);
      if (streamError) throw new Error(streamError);

      await new Promise((r) => setTimeout(r, 500));
      await reloadMessages();
      setStatus('ready');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Failed to initialize session';
      setError(message);
      setStatus('error');
    }
  }

  async function handleSendMessage(overrideMessage?: string, action?: LessonAction) {
    if (status === 'streaming') return;
    const messageId = crypto.randomUUID();
    const send = lessonMessage({ journeyId, stageId, messageId }, overrideMessage ?? inputValue, action, role);
    if (!send) return;
    const trimmed = send.message;

    // Button replies and replies during a check are saved as 'qa' (the server decides the same
    // way from the saved history), so they stream as a chat answer.
    const intent = send.body.action || checkInProgress(messages) ? 'qa' : detectMessageIntent(trimmed);
    setStreamingType(intent);
    setLoadingPhrase(getRandomPhrase());

    const userMessage: TeachingMessage = {
      id: messageId,
      stageId,
      journeyId,
      role: 'user',
      content: trimmed,
      sources: [],
      messageType: 'qa',
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    scrollToMessage(messageId, 'smooth');
    // A lesson button leaves any half-typed question in the box.
    if (!action) setInputValue('');
    setStatus('streaming');
    setStreamingMessage('');

    try {
      const response = await fetch('/api/teaching-session/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(send.body),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, 'Failed to send message'));
      }

      const streamed = await streamResponse(response);
      const streamError = extractTeachingStreamError(streamed);
      if (streamError) throw new Error(streamError);

      await reloadMessages();
      setStatus('ready');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Failed to send message';
      await reloadMessages();
      setError(message);
      setStatus('ready');
    }
  }

  async function streamResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let accumulated = '';

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        if (!extractTeachingStreamError(accumulated)) {
          setStreamingMessage(accumulated);
        }
      }
      return accumulated;
    } finally {
      setStreamingMessage('');
      abortControllerRef.current = null;
    }
  }

  async function reloadMessages() {
    try {
      const response = await fetch(
        `/api/journey/${journeyId}/stage/${stageId}/messages`
      );
      if (response.ok) {
        const data = await response.json();
        const loaded: TeachingMessage[] = data.messages.map(
          (msg: TeachingMessage) => ({
            ...msg,
            messageType: (msg.messageType ?? 'qa') as 'lecture' | 'qa',
            createdAt: new Date(msg.createdAt),
          })
        );
        setMessages(loaded);
      }
    } catch {
      // Silently fail — messages will be reloaded on next interaction
    }
  }

  async function handleCompleteStage() {
    setIsCompleting(true);
    try {
      const response = await fetch('/api/teaching-session/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journeyId, stageId }),
      });

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, 'Failed to complete stage'));
      }

      onBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete stage';
      setError(message);
    } finally {
      setIsCompleting(false);
    }
  }

  async function handleResetConversation() {
    if (isResetting) return;

    setIsResetting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/journey/${journeyId}/stage/${stageId}/messages`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, 'Failed to reset conversation'));
      }

      setMessages([]);
      clearStageMessages(stageId);

      await initializeSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset conversation';
      setError(message);
      setStatus('ready');
    } finally {
      setIsResetting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  const isInputDisabled = status === 'streaming' || status === 'loading' || status === 'initializing';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border">
        <div className={cn(COLUMN, 'relative flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5')}>
          <button
            onClick={onBack}
            className="flex shrink-0 items-center gap-1 rounded-md text-small text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to journey map"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <h2
            className="min-w-0 flex-1 basis-full line-clamp-2 text-h3 text-foreground sm:basis-0 sm:line-clamp-none sm:truncate sm:text-h2"
            title={stageTitle}
          >
            {stageTitle}
          </h2>

          {topicCount(topicsCovered) > 0 && (
            <HeaderPopover
              id="lesson-topics"
              label={`${topicCount(topicsCovered)} ${topicCount(topicsCovered) === 1 ? 'topic' : 'topics'}`}
            >
              <StageTopics topics={topicsCovered} />
            </HeaderPopover>
          )}
          {stageSources && hasSources(stageSources) && (
            <HeaderPopover id="lesson-sources" label="Sources">
              <StageSources sources={stageSources} />
            </HeaderPopover>
          )}

          <button
            onClick={handleResetConversation}
            disabled={isResetting || status === 'streaming'}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-small font-medium transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-muted',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="Reset conversation"
            title="Reset conversation"
          >
            <RotateCcw className={cn('size-3.5', isResetting && 'animate-spin')} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollPaneRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(COLUMN, 'py-6')}>
          {status === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-small text-muted-foreground">Loading conversation...</span>
            </div>
          )}

          {status === 'error' && error && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-small text-destructive">{error}</p>
              <button
                onClick={loadMessages}
                className="rounded-md bg-primary px-3 py-1.5 text-small font-medium text-primary-foreground hover:bg-primary/90"
              >
                Try again
              </button>
            </div>
          )}

          {(status !== 'loading' || messages.length > 0) && (
            <div className="flex flex-col gap-5" role="list" aria-label="Messages">
              {messages.map((msg) => (
                <div key={msg.id} id={messageElementId(msg.id)} role="listitem">
                  {msg.role === 'assistant' && msg.messageType === 'lecture' ? (
                    <LessonCard content={msg.content} sources={msg.sources} createdAt={msg.createdAt} />
                  ) : (
                    <MessageBubble
                      role={msg.role}
                      content={msg.content}
                      sources={msg.sources}
                      createdAt={msg.createdAt}
                    />
                  )}
                </div>
              ))}

              {/* Streaming preview */}
              {(status === 'streaming' || status === 'initializing') && streamingMessage && (
                <div role="listitem">
                  {streamingType === 'lecture' ? (
                    <LessonCard content={removeEmDashes(streamingMessage)} />
                  ) : (
                    <MessageBubble role="assistant" content={removeEmDashes(streamingMessage)} />
                  )}
                </div>
              )}

              {/* Loading indicator when no content yet */}
              {(status === 'streaming' || status === 'initializing') && !streamingMessage && (
                streamingType === 'qa' ? (
                  <div className="flex justify-start" role="listitem">
                    <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                      <p className="text-small text-muted-foreground italic animate-pulse">
                        {loadingPhrase}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border border-border/60 bg-card px-6 py-6 shadow-sm sm:px-10" role="listitem">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-primary/40 animate-pulse" />
                      <div className="size-2 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
                      <div className="size-2 rounded-full bg-primary/40 animate-pulse [animation-delay:300ms]" />
                      <span className="ml-1 text-small text-muted-foreground">Preparing your lesson...</span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border">
        <div className={cn(COLUMN, 'py-3')}>
          {error && status === 'ready' && (
            <p className="mb-2 text-small text-destructive">{error}</p>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or type 'continue' to learn more..."
              disabled={isInputDisabled}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2',
                'text-body text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'max-h-32 min-h-[40px]'
              )}
              aria-label="Type your message"
            />

            <button
              onClick={() => handleSendMessage('continue')}
              disabled={isInputDisabled}
              className={cn(
                'flex items-center justify-center rounded-xl px-3 py-2.5',
                'border border-border bg-background text-foreground text-small font-medium',
                'hover:bg-muted transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Continue to next topic"
              title="Continue to next topic"
            >
              Next
            </button>

            <button
              onClick={() => handleSendMessage()}
              disabled={isInputDisabled || !inputValue.trim()}
              className={cn(
                'flex items-center justify-center rounded-xl p-2.5',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              {status === 'streaming' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>

          <LessonActionButtons
            disabled={isInputDisabled}
            onAction={(action) => handleSendMessage(undefined, action)}
            end={
              canComplete && status === 'ready' ? (
                <button
                  onClick={handleCompleteStage}
                  disabled={isCompleting}
                  className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1 text-small font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCompleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {isCompleting ? 'Completing...' : 'Complete Stage'}
                </button>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
