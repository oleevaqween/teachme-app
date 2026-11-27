# Implementation Plan: Learning Journey Platform

## Overview

This plan implements the Learning Journey Platform — a full-stack Next.js application that transforms documents and internet-sourced information into engaging learning experiences ("Teach Me" flow) and provides interview preparation tools ("Interview" flow). The implementation is broken into incremental steps: project scaffolding, core libraries, engines, API routes, UI components, and integration wiring.

## Tasks

- [x] 1. Set up project structure, dependencies, and core configuration
  - [x] 1.1 Initialize Next.js 14+ App Router project with TypeScript, Tailwind CSS, and install core dependencies
    - Initialize with `create-next-app` using TypeScript and App Router
    - Install dependencies: `prisma`, `@prisma/client`, `zustand`, `officeparser`, `epub2`, `@react-pdf/renderer`, `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `zod`, `fast-check`, `vitest`
    - Install shadcn/ui and configure Tailwind with responsive breakpoints (mobile <768px, tablet 768-1023px, desktop 1024+)
    - Create directory structure: `src/lib/document-processor/`, `src/lib/curriculum-engine/`, `src/lib/interview-engine/`, `src/lib/information-validator/`, `src/lib/web-sourcer/`, `src/lib/llm/`, `src/lib/db/`, `src/lib/validators/`, `src/components/`, `src/store/`, `uploads/`
    - Configure `vitest.config.ts` with test scripts for property tests (`*.property.test.ts`) and unit tests (`*.test.ts`)
    - _Requirements: 9.1, 10.2_

  - [x] 1.2 Set up Prisma schema and SQLite database
    - Create `prisma/schema.prisma` with models: `LLMProviderSettings`, `ArchivedQuestion`, `Journey`, `JourneySection`
    - Configure SQLite datasource with `DATABASE_URL` environment variable
    - Add indexes on `ArchivedQuestion.role` and `JourneySection.journeyId`
    - Run initial migration
    - Create `src/lib/db/client.ts` with Prisma client singleton
    - _Requirements: 7.2, 9.1_

  - [x] 1.3 Define core TypeScript interfaces and types
    - Create `src/lib/document-processor/index.ts` with types: `ParsedDocument`, `DocumentContent`, `ContentSection`, `DocumentMetadata`, `SupportedFormat`, `ParseResult`, `ParseError`
    - Create `src/lib/curriculum-engine/index.ts` with types: `Journey`, `JourneySection`, `Quiz`, `QuizQuestion`, `SourceAttribution`, `JourneyGenerationParams`
    - Create `src/lib/interview-engine/index.ts` with types: `MockQuestion`, `AnswerScore`, `Weakness`, `ExampleAnswer`, `ArchivedQuestion`
    - Create `src/lib/information-validator/index.ts` with types: `VerificationResult`, `VerificationSource`, `SourceTag`
    - Create `src/lib/llm/provider.ts` with types: `ProviderType`, `LLMProviderConfig`, `ProviderValidationResult`
    - Create `src/lib/errors.ts` with `PlatformError` class and `ErrorCode` type
    - _Requirements: 1.1, 3.7, 4.4, 6.2, 9.1_

- [x] 2. Implement input validators
  - [x] 2.1 Implement topic, role, answer, and document upload validators
    - Create `src/lib/validators/topic.ts` with `validateTopic()` (3-200 characters, trimmed)
    - Create `src/lib/validators/interview.ts` with `validateRole()` (2-100 characters) and `validateAnswer()` (minimum 20 characters)
    - Create `src/lib/validators/document.ts` with `validateDocumentUpload()` (check format in {pdf, docx, epub, xlsx, pptx}, size ≤ 100MB, count < 20) and `validateCVUpload()` (PDF/DOCX only)
    - Error messages for unsupported formats must include the rejected extension and the full list of accepted formats
    - _Requirements: 2.3, 5.2, 6.6, 1.1, 1.3, 1.5, 8.1, 8.2_

  - [x]* 2.2 Write property test for input length validation
    - **Property 1: Input Length Validation**
    - Test `validateTopic`, `validateRole`, `validateAnswer` with random strings (0-500 chars)
    - Verify acceptance iff trimmed length within configured bounds
    - **Validates: Requirements 2.3, 5.2, 6.6**

  - [x]* 2.3 Write property test for document upload validation
    - **Property 2: Document Upload Validation**
    - Generate random extensions, sizes (0-150MB), and file counts (0-30)
    - Verify acceptance iff extension ∈ {pdf,docx,epub,xlsx,pptx} AND size ≤ 100MB AND count < 20
    - **Validates: Requirements 1.1, 1.5**

  - [x]* 2.4 Write property test for unsupported format error message completeness
    - **Property 3: Unsupported Format Error Message Completeness**
    - Generate random non-supported extensions
    - Verify error contains both the unsupported extension and all accepted formats
    - **Validates: Requirements 1.3, 8.2**

  - [x]* 2.5 Write property test for CV format validation
    - **Property 17: CV Format Validation**
    - Generate random file extensions
    - Verify acceptance iff extension ∈ {pdf, docx}
    - **Validates: Requirements 8.1**

- [x] 3. Implement document processor
  - [x] 3.1 Implement document parsing orchestrator and format-specific parsers
    - Create `src/lib/document-processor/pdf-parser.ts` using officeparser for PDF extraction
    - Create `src/lib/document-processor/docx-parser.ts` using officeparser for DOCX extraction
    - Create `src/lib/document-processor/epub-parser.ts` using epub2 for EPUB extraction
    - Create `src/lib/document-processor/xlsx-parser.ts` using officeparser for XLSX extraction
    - Create `src/lib/document-processor/pptx-parser.ts` using officeparser for PPTX extraction
    - Implement `parseDocument()` in `src/lib/document-processor/index.ts` that delegates to format-specific parsers
    - Implement `parseDocuments()` for batch processing with per-file error isolation
    - Implement `validateUpload()` pre-parse check
    - _Requirements: 1.1, 1.2, 1.4_

  - [x]* 3.2 Write property test for batch processing resilience
    - **Property 4: Batch Processing Resilience**
    - Generate random batches of N files with K corrupted
    - Verify exactly (N-K) successes and K errors, each error containing the file name
    - **Validates: Requirements 1.4**

  - [x]* 3.3 Write unit tests for document processor
    - Test each format parser with a representative file
    - Test edge cases: empty file, max size boundary, exactly 20 files
    - Test error handling for corrupted files
    - _Requirements: 1.1, 1.2, 1.4_

- [x] 4. Implement LLM provider abstraction
  - [x] 4.1 Implement LLM provider factory, validation, and model listing
    - Create `src/lib/llm/provider.ts` with `createProvider()` using Vercel AI SDK
    - Support OpenAI (`@ai-sdk/openai`), Anthropic (`@ai-sdk/anthropic`), Ollama Cloud (OpenAI-compatible endpoint), Ollama Local (localhost:11434)
    - Implement `validateProvider()` with 15s timeout for cloud, 10s for local
    - Implement `listModels()` to retrieve available models from provider
    - Create `src/lib/llm/config.ts` for provider configuration loading from database
    - Create `src/lib/llm/prompts.ts` with system prompts for curriculum generation, interview questions, answer scoring, and CV refinement
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.7_

  - [x]* 4.2 Write property test for invalid API key not stored
    - **Property 19: Invalid API Key Not Stored**
    - Generate random invalid key strings, attempt validation, verify key is not persisted in database
    - **Validates: Requirements 9.8**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement information validator
  - [x] 6.1 Implement claim verification and cross-reference logic
    - Create `src/lib/information-validator/cross-reference.ts` with `crossReferenceWithDocument()` for semantic alignment checking
    - Create `src/lib/information-validator/confidence-scorer.ts` with confidence level assignment logic (High: 3+, Medium: 2, Low: 1 source)
    - Implement `verifyClaim()` in `src/lib/information-validator/index.ts` with 30s timeout, excluding unverified claims
    - Implement `verifyBatch()` for parallel verification of multiple claims
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x]* 6.2 Write property test for confidence level assignment
    - **Property 10: Confidence Level Assignment**
    - Generate random source counts (1-10)
    - Verify: High if N≥3, Medium if N=2, Low if N=1
    - **Validates: Requirements 4.5**

  - [x]* 6.3 Write property test for unverified content exclusion
    - **Property 7: Unverified Content Exclusion**
    - Generate random claim arrays with verified/unverified booleans
    - Verify output contains only claims where verified = true
    - **Validates: Requirements 3.6, 11.4**

- [x] 7. Implement web sourcer and community filtering
  - [x] 7.1 Implement internet resource sourcing with community search and quality filtering
    - Create `src/lib/web-sourcer/reddit-searcher.ts` for Reddit API integration
    - Create `src/lib/web-sourcer/community-searcher.ts` for general forum/community search
    - Implement orchestrator in `src/lib/web-sourcer/index.ts` that searches 3+ communities with 30s timeout
    - Implement community quality filter: member count ≥ 1000 AND active within last 12 months
    - Handle graceful degradation when no communities found or timeout occurs
    - _Requirements: 11.1, 11.2, 11.6_

  - [x]* 7.2 Write property test for community quality filter
    - **Property 20: Community Quality Filter**
    - Generate random community metadata (member counts 0-10000, activity dates)
    - Verify inclusion iff members ≥ 1000 AND active within 12 months
    - **Validates: Requirements 11.2**

- [x] 8. Implement curriculum engine
  - [x] 8.1 Implement journey builder with creative non-linear ordering
    - Create `src/lib/curriculum-engine/journey-builder.ts` with `buildJourneyStructure()`
    - Implement concept reordering that differs from source document TOC order (group by theme, introduce branching paths)
    - Ensure journey section count is between 5 and 50
    - _Requirements: 3.1, 3.2, 3.8_

  - [x] 8.2 Implement quiz generator with frequency constraints
    - Create `src/lib/curriculum-engine/quiz-generator.ts` with `planQuizInsertion()`
    - Embed quizzes every 3-5 concepts: ⌈N/5⌉ ≤ Q ≤ ⌊N/3⌋
    - Generate multiple-choice questions with explanations
    - _Requirements: 3.3_

  - [x] 8.3 Implement source integrator and journey generation orchestrator
    - Create `src/lib/curriculum-engine/source-integrator.ts` for embedding community content into matching journey sections with attribution
    - Implement `generateJourney()` in `src/lib/curriculum-engine/index.ts` orchestrating: document extraction → web sourcing → validation → LLM generation → quiz insertion → source integration
    - Tag each section as "Document-sourced" or "Internet-sourced" with confidence levels for internet-sourced content
    - Stream journey generation for progressive rendering
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 4.4, 4.5, 11.5_

  - [x]* 8.4 Write property test for journey section order differs from source
    - **Property 5: Journey Section Order Differs from Source**
    - Generate random heading lists (2-50 items)
    - Verify generated section ordering ≠ original heading order
    - **Validates: Requirements 3.2**

  - [x]* 8.5 Write property test for quiz frequency invariant
    - **Property 6: Quiz Frequency Invariant**
    - Generate random section counts (5-50)
    - Verify ⌈N/5⌉ ≤ Q ≤ ⌊N/3⌋
    - **Validates: Requirements 3.3**

  - [x]* 8.6 Write property test for journey section metadata completeness
    - **Property 8: Journey Section Metadata Completeness**
    - Generate random section objects
    - Verify: sourceTag is "Document-sourced" or "Internet-sourced"; if "Internet-sourced" then non-empty attribution AND confidence level present
    - **Validates: Requirements 3.7, 4.4, 4.5**

  - [x]* 8.7 Write property test for journey section count bounds
    - **Property 9: Journey Section Count Bounds**
    - Verify generated journey has 5 ≤ S ≤ 50 sections
    - **Validates: Requirements 3.8**

  - [x]* 8.8 Write property test for community content topic matching
    - **Property 21: Community Content Topic Matching**
    - Generate random content/section topic pairs
    - Verify community content is placed in the most topic-matching section
    - **Validates: Requirements 11.5**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement interview engine
  - [x] 10.1 Implement mock question generator
    - Create `src/lib/interview-engine/question-generator.ts` with `generateMockQuestions()`
    - Generate 5-10 questions per role targeting high failure rate topics
    - Exclude archived question IDs from generation
    - Handle case when all questions are archived (notify user)
    - _Requirements: 6.1, 6.5, 6.7_

  - [x] 10.2 Implement answer scorer
    - Create `src/lib/interview-engine/answer-scorer.ts` with `scoreAnswer()`
    - Return score (1-10), weaknesses (1-5 with explanations), and 2 example answers with distinct style labels
    - Validate answer length ≥ 20 chars before scoring
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

  - [x] 10.3 Implement question archive with persistence
    - Implement `archiveQuestion()`, `getArchive()`, `unarchiveQuestion()` in `src/lib/interview-engine/index.ts`
    - Persist to SQLite via Prisma
    - Support grouping by role
    - Archive stores question text, user answer, score, and date
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x]* 10.4 Write property test for mock question count bounds
    - **Property 12: Mock Question Count Bounds**
    - Verify generated question set contains 5-10 questions
    - **Validates: Requirements 6.1**

  - [x]* 10.5 Write property test for answer scoring structural invariants
    - **Property 11: Answer Scoring Structural Invariants**
    - Generate random answer strings
    - Verify: score ∈ [1,10], weaknesses length ∈ [1,5] with non-empty explanations, exactly 2 example answers with distinct non-empty style names
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [x]* 10.6 Write property test for archive exclusion
    - **Property 13: Archive Exclusion**
    - Generate random archived ID sets
    - Verify intersection of archived IDs and generated question IDs is empty
    - **Validates: Requirements 6.5, 7.3**

  - [x]* 10.7 Write property test for archive round-trip
    - **Property 14: Archive Round-Trip**
    - Generate random question/answer/score tuples
    - Archive → query → verify same question text, answer text, and score value
    - **Validates: Requirements 7.1**

  - [x]* 10.8 Write property test for unarchive removes item
    - **Property 15: Unarchive Removes Item**
    - Archive → unarchive → query → verify question no longer present
    - **Validates: Requirements 7.6**

  - [x]* 10.9 Write property test for archive grouping by role
    - **Property 16: Archive Grouping by Role**
    - Generate random items across multiple roles
    - Verify: every item in a group has same role, no duplicates, all items in exactly one group
    - **Validates: Requirements 7.5**

- [x] 11. Implement CV refiner
  - [x] 11.1 Implement CV parsing and refinement with PDF output
    - Create `src/lib/interview-engine/cv-refiner.ts` with `parseCV()` and `refineCV()`
    - Parse CV from PDF/DOCX within 30s timeout
    - Use LLM to generate improved version emphasizing role-relevant skills
    - Preserve all factual data: dates, job titles, company names, credentials, quantitative achievements
    - Output refined CV as downloadable PDF using `@react-pdf/renderer`
    - Handle failure gracefully (retain original for retry)
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6_

  - [x]* 11.2 Write property test for CV factual data preservation
    - **Property 18: CV Factual Data Preservation**
    - Generate random CV data with known factual elements
    - Verify refined output contains all original factual elements exactly
    - **Validates: Requirements 8.4**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement API routes
  - [x] 13.1 Implement document upload API route
    - Create `src/app/api/documents/upload/route.ts`
    - Handle multipart file upload, validate with `validateDocumentUpload()`
    - Store files to `uploads/` directory, parse via document processor
    - Return parsed results with success/error per file
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 13.2 Implement journey generation API route
    - Create `src/app/api/journey/generate/route.ts`
    - Accept topic and optional document references
    - Validate topic input, load active LLM provider
    - Invoke curriculum engine and return streamed journey response
    - Persist generated journey to database
    - _Requirements: 2.3, 2.4, 2.5, 3.1_

  - [x] 13.3 Implement interview API routes (questions, score, archive)
    - Create `src/app/api/interview/questions/route.ts` — generate mock questions for a role
    - Create `src/app/api/interview/score/route.ts` — score submitted answer
    - Create `src/app/api/interview/archive/route.ts` — GET archive by role, POST to archive, DELETE to unarchive
    - Validate role and answer inputs
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 7.1, 7.5, 7.6_

  - [x] 13.4 Implement CV refinement API route
    - Create `src/app/api/interview/cv/route.ts`
    - Accept CV upload (PDF/DOCX), validate format
    - Parse CV, refine with LLM, return PDF buffer as downloadable response
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 13.5 Implement LLM provider settings API route
    - Create `src/app/api/settings/provider/route.ts`
    - GET: retrieve current provider settings (mask API key)
    - POST: validate provider credentials, store if valid, reject if invalid
    - GET models: list available models for selected provider
    - _Requirements: 9.2, 9.3, 9.7, 9.8_

- [x] 14. Implement client-side state management
  - [x] 14.1 Create Zustand stores for journey and interview state
    - Create `src/store/journey-store.ts` — manage journey generation state, current journey, loading status
    - Create `src/store/interview-store.ts` — manage current role, questions, scores, archive state
    - _Requirements: 10.6_

- [x] 15. Implement UI components - Core layout and home
  - [x] 15.1 Implement root layout, navigation, and home screen
    - Create `src/app/layout.tsx` with global navigation (max 3 actions to any feature)
    - Create `src/app/page.tsx` with "Teach Me" and "Interview" primary action buttons
    - Implement responsive layout for mobile, tablet, and desktop breakpoints
    - Apply consistent design system: spacing scale, typographic hierarchy (≤5 levels), WCAG AA color contrast
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 16. Implement UI components - Teach Me flow
  - [x] 16.1 Implement Teach Me entry page and file uploader
    - Create `src/app/teach-me/page.tsx` with topic input field, document upload area, and "Generate Journey" button
    - Create `src/components/documents/FileUploader.tsx` with drag-and-drop, format validation, and file list display
    - Create `src/components/documents/FileList.tsx` to show uploaded files with status
    - Show validation messages for empty topic or invalid files
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 16.2 Implement Journey viewer with sections, quizzes, and source attribution
    - Create `src/app/teach-me/journey/[id]/page.tsx` as journey viewer page
    - Create `src/components/journey/JourneyViewer.tsx` — renders full journey with progressive loading
    - Create `src/components/journey/JourneySection.tsx` — renders individual section with source tag and confidence level
    - Create `src/components/journey/Quiz.tsx` — interactive quiz component with options and explanations
    - Create `src/components/journey/SourceAttribution.tsx` — displays attribution (community name, URL)
    - Show loading indicator within 1s of generation start
    - _Requirements: 3.1, 3.3, 3.7, 4.4, 4.5, 10.6_

- [x] 17. Implement UI components - Interview flow
  - [x] 17.1 Implement interview entry and mock questions pages
    - Create `src/app/interview/page.tsx` with role input and options: "Upload CV/Resume", "Mock Questions", "Archive"
    - Create `src/app/interview/mock/page.tsx` displaying questions with answer input and scoring display
    - Create `src/components/interview/QuestionCard.tsx` for individual question display
    - Create `src/components/interview/AnswerInput.tsx` for answer submission with character validation
    - Create `src/components/interview/ScoreDisplay.tsx` showing score, weaknesses, and example answers
    - Apply visually distinct color scheme differentiating interview from Teach Me flow
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.6, 10.5_

  - [x] 17.2 Implement archive page and CV refinement page
    - Create `src/app/interview/archive/page.tsx` with archived questions grouped by role
    - Create `src/components/interview/ArchiveList.tsx` showing question, answer, score, date with unarchive button
    - Create `src/app/interview/cv/page.tsx` with CV upload, refine button, and PDF download
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 8.1, 8.3, 8.5_

- [x] 18. Implement settings UI
  - [x] 18.1 Implement LLM provider settings page
    - Create `src/app/settings/page.tsx` with provider selection (OpenAI, Anthropic, Ollama Cloud, Ollama Local)
    - Create `src/components/settings/ProviderConfig.tsx` with API key input (masked), model selection, validation status
    - Show validation progress and success/error feedback
    - Prompt unconfigured users to set up a provider before content generation
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.9, 9.10_

- [x] 19. Integration wiring and error handling
  - [x] 19.1 Wire all components together and implement global error handling
    - Implement `handleApiError()` in `src/lib/errors.ts` for consistent API error responses
    - Wire loading indicators across all async operations (journey generation, scoring, CV refinement)
    - Ensure all API routes use error boundary with `PlatformError`
    - Verify provider-not-configured guard on all generation endpoints
    - Ensure timeout handling: 30s for verification, 15s/10s for provider validation, 60s for LLM generation, 30s for internet search
    - _Requirements: 4.2, 4.6, 9.6, 9.9, 10.6_

  - [x]* 19.2 Write integration tests for end-to-end flows
    - Test journey generation with mocked LLM
    - Test interview flow: question generation → scoring → archiving
    - Test CV upload → parse → refine → PDF output pipeline
    - Test provider switching and validation
    - _Requirements: 3.1, 6.1, 8.3, 9.5_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of progress
- Property tests validate universal correctness properties defined in the design using `fast-check`
- Unit tests validate specific examples and edge cases
- All property tests should use `fast-check` with minimum 100 iterations
- Property test files use `*.property.test.ts` naming convention
- The Vercel AI SDK provides unified LLM provider abstraction across OpenAI, Anthropic, and Ollama

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.1", "4.2"] },
    { "id": 4, "tasks": ["3.2", "3.3", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1", "8.2"] },
    { "id": 7, "tasks": ["8.3", "8.4", "8.5"] },
    { "id": 8, "tasks": ["8.6", "8.7", "8.8", "10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.4", "10.5", "10.6", "10.7", "10.8", "10.9", "11.1"] },
    { "id": 10, "tasks": ["11.2", "13.1", "13.5"] },
    { "id": 11, "tasks": ["13.2", "13.3", "13.4", "14.1"] },
    { "id": 12, "tasks": ["15.1"] },
    { "id": 13, "tasks": ["16.1", "17.1", "18.1"] },
    { "id": 14, "tasks": ["16.2", "17.2"] },
    { "id": 15, "tasks": ["19.1"] },
    { "id": 16, "tasks": ["19.2"] }
  ]
}
```
