# Implementation Plan: Interactive Journey Redesign

## Overview

This plan transforms the "Teach Me" flow from a static article viewer into an interactive conversational learning experience. Implementation proceeds incrementally: database schema first, then core libraries (journey-map-generator, content-chunker, grounding-engine, teaching-session-engine, progress-tracker), followed by API routes, UI components, and finally legacy migration and integration wiring.

## Tasks

- [x] 1. Database schema and project structure
  - [x] 1.1 Update Prisma schema with new models (Stage, ContentChunk, TeachingMessage, StageProgress)
    - Add `isInteractive` Boolean field to existing `Journey` model (default: true)
    - Add `stages` and `progress` relations to `Journey` model
    - Create `Stage` model with fields: id, journeyId, title, summary, theme, order, topicsCovered (JSON string), relations to ContentChunk, TeachingMessage, StageProgress
    - Create `ContentChunk` model with fields: id, stageId, journeyId, content, sourceDocument, sourceSection, order, wordCount
    - Create `TeachingMessage` model with fields: id, stageId, journeyId, role, content, sources (JSON string), createdAt
    - Create `StageProgress` model with fields: id, stageId (unique), journeyId, status, completedAt
    - Add appropriate indexes and unique constraints as defined in design
    - Run `npx prisma migrate dev` to generate and apply migration
    - _Requirements: 2.7, 3.5, 8.1, 9.1_

  - [x] 1.2 Create directory structure and core type definitions
    - Create `src/lib/journey-map-generator/` directory with `index.ts` exporting `Stage`, `ContentChunk`, `JourneyMap`, `GenerateJourneyMapParams` interfaces
    - Create `src/lib/journey-map-generator/content-chunker.ts` with `ChunkingOptions`, `RawChunk` interfaces
    - Create `src/lib/teaching-session-engine/` directory with `index.ts` exporting `TeachingMessage`, `MessageSource`, `SendMessageParams` interfaces
    - Create `src/lib/teaching-session-engine/grounding-engine.ts` with `GroundedPrompt`, `WebSource` interfaces
    - Create `src/lib/progress-tracker/` directory with `index.ts` exporting `StageProgress`, `JourneyProgress` interfaces
    - _Requirements: 2.1, 3.1, 5.1, 6.1, 8.1_

- [x] 2. Content Chunker implementation
  - [x] 2.1 Implement `chunkDocumentContent` function
    - Implement pure function in `src/lib/journey-map-generator/content-chunker.ts`
    - Accept `ContentSection[]` and optional `ChunkingOptions` (minWords: 200, maxWords: 1000, overlapWords: 50)
    - Split content respecting paragraph boundaries (never split mid-paragraph)
    - Merge small paragraphs to meet minimum word count
    - Split oversized paragraphs at sentence boundaries if single paragraph exceeds max
    - Return `RawChunk[]` with content, wordCount, sourceSection, sourceDocument
    - _Requirements: 3.1, 3.3_

  - [x]* 2.2 Write property test for content chunking bounds (Property 1)
    - **Property 1: Content chunking respects word count bounds and paragraph boundaries**
    - **Validates: Requirements 3.1**
    - File: `src/lib/journey-map-generator/content-chunker.property.test.ts`
    - Generate arbitrary paragraph arrays with fast-check, verify all chunks have 200-1000 words and chunk boundaries align with paragraph breaks

  - [x]* 2.3 Write unit tests for content chunker edge cases
    - Test empty input returns empty array
    - Test single paragraph within bounds returns one chunk
    - Test paragraph at exact boundary (200 words, 1000 words)
    - Test very long single paragraph splits at sentence boundary
    - Test multiple small paragraphs merge correctly
    - _Requirements: 3.1_

- [x] 3. Checkpoint - Content chunker verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Journey Map Generator implementation
  - [x] 4.1 Implement unified content pool assembly
    - Create `src/lib/journey-map-generator/content-pool.ts`
    - Implement `buildUnifiedContentPool(documents: ParsedDocument[]): ContentSection[]`
    - Combine all sections from all parsed documents into a single array preserving source metadata
    - _Requirements: 1.5, 2.1_

  - [x]* 4.2 Write property test for unified content pool completeness (Property 8)
    - **Property 8: Unified content pool completeness**
    - **Validates: Requirements 1.5**
    - File: `src/lib/journey-map-generator/content-pool.property.test.ts`
    - Generate arbitrary arrays of ParsedDocument with ContentSection[], verify every section appears in the output pool

  - [x] 4.3 Implement stage generation with LLM
    - Create `src/lib/journey-map-generator/stage-generator.ts`
    - Implement `generateStages(contentPool: ContentSection[], topic: string, llmProvider: LLMProviderConfig): Promise<Stage[]>`
    - Build LLM prompt instructing creative theming and 10-15 stage output
    - Parse LLM response into `Stage[]` with validation (title, summary 20-80 words, topicsCovered array)
    - Ensure stages differ from source document table of contents order
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x]* 4.4 Write property test for stage structure validation (Property 4)
    - **Property 4: Stage structure validation**
    - **Validates: Requirements 2.1, 2.3**
    - File: `src/lib/journey-map-generator/stage-validation.property.test.ts`
    - Verify generated journey maps have 10-15 stages and every stage summary has 20-80 words

  - [x] 4.5 Implement content chunk to stage assignment
    - Create `src/lib/journey-map-generator/stage-assignment.ts`
    - Implement `assignChunksToStages(chunks: RawChunk[], stages: Stage[], llmProvider: LLMProviderConfig): Promise<ContentChunk[]>`
    - Use LLM to semantically match chunks to stages based on topic similarity
    - Allow a chunk to be assigned to multiple stages if relevant
    - Ensure no chunk is left unassigned (orphan check)
    - _Requirements: 3.2, 3.3, 3.4_

  - [x]* 4.6 Write property test for no orphaned chunks (Property 2) and topic coverage (Property 5)
    - **Property 2: No orphaned chunks after stage assignment**
    - **Property 5: Topic coverage completeness**
    - **Validates: Requirements 3.3, 2.4**
    - File: `src/lib/journey-map-generator/stage-assignment.property.test.ts`
    - Verify every chunk has a non-empty stageId; verify every topic from source documents appears in at least one stage's topicsCovered

  - [x] 4.7 Implement main `generateJourneyMap` orchestrator function
    - Wire together in `src/lib/journey-map-generator/index.ts`: content pool → chunking → stage generation → chunk assignment
    - Support `onProgress` callback for SSE streaming of generation progress events
    - Handle topic-only mode (no documents) by querying Tavily for source content
    - Persist journey map, stages, and content chunks to database via Prisma
    - _Requirements: 2.1, 2.6, 2.7, 3.5_

- [x] 5. Checkpoint - Journey map generator verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Progress Tracker implementation
  - [x] 6.1 Implement `computeStageStatuses` pure function
    - Implement in `src/lib/progress-tracker/index.ts`
    - Accept `stages: Stage[]` and `completions: { stageId: string; completedAt: Date }[]`
    - Stage 1 always unlocked or completed; stage K unlocked only if stage K-1 completed
    - No stage after first incomplete stage is unlocked
    - Return `StageProgress[]` with computed statuses
    - _Requirements: 4.5, 8.3_

  - [x]* 6.2 Write property test for sequential stage unlock logic (Property 3)
    - **Property 3: Sequential stage unlock logic**
    - **Validates: Requirements 4.5, 8.3**
    - File: `src/lib/progress-tracker/stage-unlock.property.test.ts`
    - Generate arbitrary stage arrays and completion sets, verify unlock invariants hold

  - [x] 6.3 Implement progress percentage computation
    - Implement `computeProgressPercentage(completedCount: number, totalStages: number): number`
    - Guard against division by zero (return 0 if totalStages is 0)
    - Return `Math.round((completedCount / totalStages) * 100)` clamped to [0, 100]
    - _Requirements: 4.7, 8.4_

  - [x]* 6.4 Write property test for progress percentage (Property 6)
    - **Property 6: Progress percentage computation**
    - **Validates: Requirements 4.7, 8.4**
    - File: `src/lib/progress-tracker/percentage.property.test.ts`
    - Generate arbitrary totalStages > 0 and completedCount in [0, totalStages], verify formula correctness

  - [x] 6.5 Implement `getJourneyProgress` and `completeStage` database functions
    - `getJourneyProgress(journeyId)`: query stages and progress from DB, call `computeStageStatuses`, return `JourneyProgress`
    - `completeStage(journeyId, stageId)`: update StageProgress status to 'completed', set completedAt, unlock next stage
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 7. Grounding Engine and Teaching Session Engine implementation
  - [x] 7.1 Implement `buildGroundedPrompt` function
    - Implement in `src/lib/teaching-session-engine/grounding-engine.ts`
    - Accept stageChunks, userMessage, conversationHistory, and optional tavilySearch function
    - Assemble system prompt with all chunk content as context
    - Include instructions for source attribution and anti-hallucination
    - If chunks insufficient for user's question, invoke tavilySearch with 10s timeout
    - Return `GroundedPrompt` with systemPrompt, contextChunks, webSources, instructions
    - _Requirements: 6.1, 6.2, 6.5, 7.1, 7.4_

  - [x]* 7.2 Write property test for grounded prompt includes all chunks (Property 10)
    - **Property 10: Grounded prompt includes stage chunk content**
    - **Validates: Requirements 6.1**
    - File: `src/lib/teaching-session-engine/grounded-prompt.property.test.ts`
    - Generate arbitrary non-empty ContentChunk arrays and user message, verify prompt context includes text from every chunk

  - [x] 7.3 Implement `formatSourceAttribution` function
    - Implement in `src/lib/teaching-session-engine/grounding-engine.ts`
    - Map document sources to "Document: {name}" labels
    - Map web sources to "{name} ({url})" labels
    - _Requirements: 6.4, 7.3_

  - [x]* 7.4 Write property test for source attribution formatting (Property 7)
    - **Property 7: Source attribution formatting**
    - **Validates: Requirements 6.4, 7.3**
    - File: `src/lib/teaching-session-engine/source-attribution.property.test.ts`
    - Generate arbitrary MessageSource arrays, verify document sources have "Document" label with name and web sources include name and URL

  - [x] 7.5 Implement `createTeachingStream` function
    - Implement in `src/lib/teaching-session-engine/index.ts`
    - Load stage chunks from DB, load conversation history
    - Call `buildGroundedPrompt` to assemble context
    - Use Vercel AI SDK `streamText` to generate streaming response
    - After stream completes, persist user message and assistant response to DB as TeachingMessage records
    - Include source attribution in persisted message
    - _Requirements: 5.2, 5.3, 5.4, 5.7, 6.1, 9.1_

  - [x] 7.6 Implement `generateInitialMessage` function
    - Implement in `src/lib/teaching-session-engine/index.ts`
    - Load stage data (title, summary, topicsCovered) and chunks
    - Build prompt instructing LLM to introduce the stage theme and begin teaching the first concept
    - Stream response and persist as first assistant message
    - _Requirements: 5.1_

  - [x] 7.7 Implement `assessStageCompletion` function
    - Implement in `src/lib/teaching-session-engine/index.ts`
    - Compare topics in `stage.topicsCovered` against message content
    - Return true when conversation has substantively covered all major topics
    - _Requirements: 5.5, 5.6_

- [x] 8. Checkpoint - Core libraries verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. API Routes implementation
  - [x] 9.1 Refactor `/api/journey/generate` route for interactive journey
    - Update `src/app/api/journey/generate/route.ts`
    - Call `generateJourneyMap` with document content and topic
    - Stream progress events via SSE (reuse existing SSE pattern)
    - Return journey ID on completion
    - Handle topic-only and documents-only modes
    - _Requirements: 2.1, 2.6, 10.4, 10.5_

  - [x] 9.2 Update `/api/journey/[id]` route to include stages
    - Update GET handler in `src/app/api/journey/[id]/route.ts`
    - Return journey with stages array (title, summary, theme, order, topicsCovered)
    - Include `isInteractive` flag to distinguish legacy vs new journeys
    - Support DELETE for journey cleanup (cascade to stages, chunks, messages, progress)
    - _Requirements: 2.7, 4.1_

  - [x] 9.3 Create `/api/journey/[id]/progress` route
    - Create `src/app/api/journey/[id]/progress/route.ts`
    - GET: call `getJourneyProgress(id)` and return full progress state
    - _Requirements: 8.3, 8.4_

  - [x] 9.4 Create `/api/journey/[id]/stage/[stageId]/messages` route
    - Create `src/app/api/journey/[id]/stage/[stageId]/messages/route.ts`
    - GET: load all TeachingMessage records for stageId, ordered by createdAt
    - DELETE: remove all messages for the stage (conversation reset)
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 9.5 Create `/api/teaching-session/message` route
    - Create `src/app/api/teaching-session/message/route.ts`
    - POST: accept { journeyId, stageId, message }, call `createTeachingStream`, return SSE stream
    - Validate input with Zod schema
    - Handle errors (LLM unavailable, stage not found)
    - _Requirements: 5.2, 5.3, 5.7, 6.1_

  - [x] 9.6 Create `/api/teaching-session/init` route
    - Create `src/app/api/teaching-session/init/route.ts`
    - POST: accept { journeyId, stageId }, call `generateInitialMessage`, return SSE stream
    - Check if stage already has messages (if so, skip init and return existing)
    - _Requirements: 5.1, 9.2_

  - [x] 9.7 Create `/api/teaching-session/complete` route
    - Create `src/app/api/teaching-session/complete/route.ts`
    - POST: accept { journeyId, stageId }, call `completeStage`, return updated progress
    - _Requirements: 5.6, 8.1_

- [x] 10. Checkpoint - API routes verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Zustand store and UI state management
  - [x] 11.1 Create interactive journey Zustand store
    - Create `src/store/journey-store.ts` (or extend existing)
    - Add state: `currentStageId`, `stageMessages: Record<string, TeachingMessage[]>`, `journeyProgress`, `isTeaching`, `streamingMessage`
    - Add actions: `setCurrentStage`, `addMessage`, `setStreamingMessage`, `updateProgress`, `clearStageMessages`
    - _Requirements: 4.4, 5.4, 8.3_

- [x] 12. UI Components implementation
  - [x] 12.1 Implement `JourneyMap` component
    - Create `src/components/journey/JourneyMap.tsx`
    - Render connected visual path with stage nodes (road/trail metaphor)
    - Accept journey data with stages array and progress state
    - Display overall progress indicator (completed/total stages and percentage)
    - Responsive layout: vertical path on mobile, horizontal/diagonal on desktop
    - _Requirements: 4.1, 4.6, 4.7_

  - [x] 12.2 Implement `StageNode` component
    - Create `src/components/journey/StageNode.tsx`
    - Display stage title and summary on/near the node
    - Visually distinguish: completed (green/checkmark), active/unlocked (highlighted), locked (dimmed/padlock)
    - Handle click to navigate to teaching session (only for unlocked stages)
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 12.3 Implement `ProgressIndicator` component
    - Create `src/components/journey/ProgressIndicator.tsx`
    - Display "{completed}/{total} stages complete" and percentage bar
    - _Requirements: 4.7, 8.4_

  - [x] 12.4 Implement `TeachingSession` component
    - Create `src/components/journey/TeachingSession.tsx`
    - Chat-like interface with message list and input area
    - Load existing messages on mount (from API)
    - Trigger initial message generation if no messages exist for stage
    - Handle streaming responses (display tokens as they arrive)
    - Show "Complete Stage" button when `assessStageCompletion` returns true
    - Provide "Reset Conversation" option
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 9.2, 9.4_

  - [x] 12.5 Implement `MessageBubble` component
    - Create `src/components/journey/MessageBubble.tsx`
    - Render user messages aligned right, assistant messages aligned left
    - Display source attributions below assistant messages using `SourceLabel`
    - Support markdown rendering in message content
    - _Requirements: 5.2, 6.4_

  - [x] 12.6 Implement `SourceLabel` component
    - Create `src/components/journey/SourceLabel.tsx`
    - Badge/chip displaying source type (document vs web) with name and optional URL link
    - _Requirements: 6.4, 7.3_

  - [x] 12.7 Implement `CompletionCelebration` component
    - Create `src/components/journey/CompletionCelebration.tsx`
    - Display congratulatory UI when all stages are completed
    - Include journey stats (total stages, topics covered)
    - _Requirements: 8.5_

- [x] 13. Checkpoint - UI components verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Page integration and routing
  - [x] 14.1 Update Teach Me entry page (`/teach-me`)
    - Update `src/app/teach-me/page.tsx`
    - Keep existing topic input and document upload area
    - Add list of previously created journeys (with interactive/legacy distinction)
    - Wire "Generate Journey" button to refactored `/api/journey/generate`
    - Show loading state with progress updates during generation
    - Navigate to journey map view on completion
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 14.2 Update journey detail page (`/teach-me/journey/[id]`)
    - Update `src/app/teach-me/journey/[id]/page.tsx`
    - Render `JourneyMap` component with stages and progress
    - Handle stage click navigation to teaching session view
    - Load progress on mount from `/api/journey/[id]/progress`
    - Show `CompletionCelebration` when all stages complete
    - _Requirements: 4.1, 4.4, 4.5, 8.3, 8.5, 11.3_

  - [x] 14.3 Implement teaching session view within journey page
    - Add teaching session state to journey detail page (or nested route)
    - Render `TeachingSession` component when a stage is selected
    - Pass journeyId and stageId to teaching session
    - Provide navigation back to journey map
    - _Requirements: 5.1, 5.2, 11.3_

- [x] 15. Legacy journey migration
  - [x] 15.1 Implement legacy journey migration function
    - Create `src/lib/journey-map-generator/legacy-migration.ts`
    - Implement `migrateLegacyJourney(journey: LegacyJourney): Stage[]`
    - Map each `JourneySection` to a `Stage` (title → title, content → summary truncated to 80 words, order preserved)
    - Ensure sequential ordering starting from 1
    - Handle edge cases: journey with 0 sections, journey with many sections
    - _Requirements: 11.2_

  - [x]* 15.2 Write property test for legacy migration (Property 9)
    - **Property 9: Legacy journey migration produces valid stages**
    - **Validates: Requirements 11.2**
    - File: `src/lib/journey-map-generator/legacy-migration.property.test.ts`
    - Generate arbitrary legacy journeys with JourneySection arrays, verify output stages have valid titles, summaries, and sequential ordering

  - [x] 15.3 Integrate migration into journey detail page
    - In `/teach-me/journey/[id]` page, detect if journey is legacy (`isInteractive === false`)
    - If legacy, run migration on the fly and display using new JourneyMap UI
    - Optionally persist migrated stages to DB on first view
    - _Requirements: 11.2, 11.3_

- [x] 16. Cleanup and integration wiring
  - [x] 16.1 Remove deprecated static journey viewer code
    - Remove or deprecate `JourneyViewer.tsx` component
    - Remove or deprecate `JourneySection.tsx` component (the UI one, not the Prisma model)
    - Remove or deprecate `Quiz.tsx` component
    - Remove or deprecate `SourceAttribution.tsx` component (replaced by `SourceLabel`)
    - Ensure no broken imports across the codebase
    - _Requirements: 11.1, 11.4_

  - [x] 16.2 Wire document upload flow to new journey generation
    - Ensure document upload → content extraction → journey map generation pipeline works end-to-end
    - Verify that uploaded document content flows through Document_Processor → content pool → chunking → stage assignment
    - Handle error cases: parse failures show per-file errors, processing continues for remaining files
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x]* 16.3 Write integration tests for end-to-end flow
    - Test: upload documents → generate journey → verify DB has stages and chunks
    - Test: open stage → send message → verify streamed response and message persisted
    - Test: complete stages → verify progress state and next stage unlocked
    - Test: reset conversation → verify messages cleared
    - _Requirements: 1.1, 5.3, 8.1, 9.4_

- [x] 17. Final checkpoint - Full integration verified
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementations use `.ts`/`.tsx` files
- The existing Vercel AI SDK `streamText` pattern is reused for all streaming responses
- Prisma/SQLite is used for all persistence (no additional databases needed)
- The existing `curriculum-engine` is effectively replaced by the `journey-map-generator`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "4.1", "6.1", "6.3"] },
    { "id": 3, "tasks": ["2.2", "2.3", "4.2", "6.2", "6.4"] },
    { "id": 4, "tasks": ["4.3", "4.5", "6.5"] },
    { "id": 5, "tasks": ["4.4", "4.6", "4.7"] },
    { "id": 6, "tasks": ["7.1", "7.3", "15.1"] },
    { "id": 7, "tasks": ["7.2", "7.4", "15.2"] },
    { "id": 8, "tasks": ["7.5", "7.6", "7.7"] },
    { "id": 9, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 10, "tasks": ["9.5", "9.6", "9.7"] },
    { "id": 11, "tasks": ["11.1"] },
    { "id": 12, "tasks": ["12.1", "12.2", "12.3", "12.5", "12.6", "12.7"] },
    { "id": 13, "tasks": ["12.4"] },
    { "id": 14, "tasks": ["14.1", "14.2"] },
    { "id": 15, "tasks": ["14.3", "15.3"] },
    { "id": 16, "tasks": ["16.1", "16.2"] },
    { "id": 17, "tasks": ["16.3"] }
  ]
}
```
