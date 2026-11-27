# Requirements Document

## Introduction

The Interactive Journey Redesign transforms the existing "Teach Me" flow from a static article-based experience into an immersive, conversational learning adventure. Instead of generating a list of text sections that the user reads passively, the redesigned system creates a visual journey map of themed stages (like stops on a road trip) and provides an interactive teaching environment within each stage where users can ask questions, request deeper explanations, and converse with a tutor grounded in their uploaded document content and verified web sources. The experience emphasizes progression, engagement, and factual accuracy — every claim must be traceable to the uploaded documents or verified internet sources (via Tavily API).

## Glossary

- **Platform**: The Learning Journey Platform application (Next.js App Router)
- **Journey_Map_Generator**: The subsystem that analyzes all uploaded document content and creates a themed stage-based journey map using LLM-powered content organization
- **Stage**: A themed milestone within a journey map representing a cluster of related topics extracted from the uploaded documents; stages are creatively organized and do not follow the source documents' table of contents
- **Journey_Map**: A visual representation of all stages as a connected path showing the user's progression through the learning material
- **Teaching_Session**: An interactive, chat-like environment within a single stage where the system teaches the user conversationally and responds to their questions
- **Document_Processor**: The existing subsystem (unpdf-based) that extracts content from uploaded files (PDF, DOCX, etc.)
- **Content_Chunk**: A segment of extracted document content that has been mapped to a specific stage for use as grounding material during teaching
- **Grounding_Engine**: The subsystem responsible for ensuring all generated responses are traceable to document content or verified web sources, preventing hallucination
- **Tavily_Client**: The existing integration with the Tavily API for web search and information retrieval
- **LLM_Provider**: A configurable large language model service used for content generation, stage creation, and conversational teaching
- **Progress_Tracker**: The subsystem that monitors and persists which stages a user has completed within a journey

## Requirements

### Requirement 1: Document Content Extraction for Journey Creation

**User Story:** As a learner, I want to upload my documents and have the system extract ALL content from them, so that the entire knowledge base is available for creating my learning journey.

#### Acceptance Criteria

1. WHEN the user uploads one or more documents, THE Document_Processor SHALL extract the full textual content from each document and make the complete extracted content available to the Journey_Map_Generator
2. THE Document_Processor SHALL support PDF, DOCX, EPUB, XLSX, and PPTX formats with a maximum file size of 100 MB per document
3. IF a document fails to parse, THEN THE Platform SHALL notify the user which specific file could not be processed, include the file name in the error message, and continue processing remaining files
4. THE Platform SHALL allow users to upload up to 20 documents in a single session
5. WHEN multiple documents are uploaded, THE Document_Processor SHALL combine extracted content from all documents into a unified content pool available for stage creation

### Requirement 2: Journey Map Generation

**User Story:** As a learner, I want my uploaded content to be organized into a creative series of themed stages, so that I can explore the material like an adventure rather than reading a textbook.

#### Acceptance Criteria

1. WHEN all documents have been processed, THE Journey_Map_Generator SHALL analyze the complete extracted content and create between 10 and 15 themed stages that collectively cover every major topic from the uploaded documents
2. THE Journey_Map_Generator SHALL organize stages by creative themes (analogies, narratives, progressive complexity, real-world scenarios) such that the stage sequence differs from the source documents' table of contents order
3. THE Journey_Map_Generator SHALL assign a descriptive title and a short summary (20 to 80 words) to each stage that communicates the theme and topics covered without revealing all details
4. THE Journey_Map_Generator SHALL ensure that every distinct topic, concept, definition, and procedure present in the uploaded documents is mapped to at least one stage
5. IF the user provides a topic alongside document uploads, THEN THE Journey_Map_Generator SHALL use the topic as a guiding theme to prioritize and frame stages around the user's learning goal
6. IF the user provides a topic without uploading documents, THEN THE Journey_Map_Generator SHALL create stages sourced exclusively from verified internet resources (via the Tavily_Client) covering that topic
7. WHEN the journey map has been generated, THE Platform SHALL persist the journey map structure (stages, titles, summaries, content mappings) to the database for later access

### Requirement 3: Stage Content Mapping

**User Story:** As a learner, I want each stage to contain all the relevant knowledge from my documents related to that stage's theme, so that the teaching session has comprehensive material to draw from.

#### Acceptance Criteria

1. THE Journey_Map_Generator SHALL decompose the extracted document content into Content_Chunks of 200 to 1000 words each, preserving paragraph and section boundaries
2. THE Journey_Map_Generator SHALL assign each Content_Chunk to the stage whose theme most closely matches the chunk's subject matter using semantic similarity
3. THE Journey_Map_Generator SHALL ensure that every Content_Chunk from the uploaded documents is assigned to at least one stage (no content is orphaned)
4. WHEN a Content_Chunk is relevant to multiple stages, THE Journey_Map_Generator SHALL assign that chunk to all applicable stages
5. THE Platform SHALL persist the mapping between Content_Chunks and stages to the database so that Teaching_Sessions can retrieve relevant material on demand

### Requirement 4: Visual Journey Map UI

**User Story:** As a learner, I want to see my learning journey as a visual path with themed stages, so that I can track my progress and choose which stage to explore next.

#### Acceptance Criteria

1. THE Platform SHALL display the journey map as a connected visual path (road, trail, or stepping stones) with each stage represented as a distinct milestone node
2. THE Platform SHALL display the stage title and summary on or near each milestone node so the user can understand the stage's theme before entering
3. THE Platform SHALL visually distinguish between completed stages, the current/active stage, and locked/upcoming stages using distinct colors, icons, or visual treatments
4. THE Platform SHALL allow the user to click on any unlocked stage to open the Teaching_Session for that stage
5. THE Platform SHALL unlock stages sequentially by default (completing stage N unlocks stage N+1), with the first stage always unlocked
6. THE Platform SHALL render the journey map responsively across mobile (below 768px viewport width), tablet (768px to 1023px), and desktop (1024px and above) breakpoints with all stages visible and interactive at each breakpoint
7. THE Platform SHALL display an overall progress indicator showing the number of completed stages out of total stages

### Requirement 5: Interactive Teaching Session

**User Story:** As a learner, I want to enter a stage and have the system teach me everything about that stage's theme conversationally, so that I can learn naturally by asking questions and getting explanations.

#### Acceptance Criteria

1. WHEN the user opens a stage, THE Teaching_Session SHALL present an initial teaching message that introduces the stage's theme and begins explaining the first key concept using content grounded in the mapped Content_Chunks
2. THE Teaching_Session SHALL present a chat-like interface where the user can type questions, ask for clarification, request examples, or ask the system to explain a concept differently
3. WHEN the user sends a message, THE Teaching_Session SHALL respond within 15 seconds with a grounded answer that draws from the stage's mapped Content_Chunks and optionally from verified web sources
4. THE Teaching_Session SHALL maintain conversation context within a single session so that follow-up questions can reference earlier parts of the conversation
5. THE Teaching_Session SHALL proactively continue teaching new concepts from the stage's Content_Chunks when the user indicates readiness (e.g., "next", "continue", "what else?") until all major topics in the stage have been covered
6. WHEN all major topics in a stage have been covered and the user has engaged with the content, THE Teaching_Session SHALL offer to mark the stage as complete
7. THE Teaching_Session SHALL stream LLM responses token-by-token to the user interface for immediate visual feedback during response generation

### Requirement 6: Grounded Responses and Anti-Hallucination

**User Story:** As a learner, I want every fact the system tells me to be traceable to my documents or verified web sources, so that I can trust the information I am learning.

#### Acceptance Criteria

1. THE Grounding_Engine SHALL include relevant Content_Chunks from the current stage as context for every LLM prompt during a Teaching_Session, ensuring the model's responses are grounded in actual document content
2. WHEN the Teaching_Session generates a response, THE Grounding_Engine SHALL verify that each factual claim in the response can be traced to either a specific Content_Chunk from the uploaded documents or a verified web source retrieved via the Tavily_Client
3. IF the Grounding_Engine cannot trace a factual claim to any source, THEN THE Teaching_Session SHALL omit that claim from the response or explicitly qualify it as an inference rather than a sourced fact
4. THE Teaching_Session SHALL label or annotate responses to indicate the source of information, distinguishing between document-sourced content and web-sourced content
5. WHEN the user asks a question that cannot be answered from the stage's Content_Chunks, THE Grounding_Engine SHALL query the Tavily_Client to find verified web sources before generating a response
6. IF no relevant sources (document or web) can be found for the user's question, THEN THE Teaching_Session SHALL inform the user that the requested information is not available in the uploaded materials or from verified web sources

### Requirement 7: Web Source Enrichment

**User Story:** As a learner, I want the system to enrich my learning with real-world examples, tips, and community insights from the internet, so that I gain practical knowledge beyond what's in the documents.

#### Acceptance Criteria

1. WHEN building a Teaching_Session response, THE Grounding_Engine SHALL query the Tavily_Client for supplementary information that adds practical examples, real-world applications, or community insights related to the current topic
2. THE Grounding_Engine SHALL include web-sourced information in Teaching_Session responses only when the information directly relates to a concept present in the stage's Content_Chunks
3. THE Teaching_Session SHALL attribute web-sourced information by providing the source name and URL alongside the content so the user can verify independently
4. THE Grounding_Engine SHALL timeout web source queries after 10 seconds and proceed with document-grounded content only if the web search fails or times out
5. IF the Tavily_Client is unavailable or returns no results, THEN THE Teaching_Session SHALL continue teaching using document content only and indicate to the user that supplementary web sources were unavailable

### Requirement 8: Progress Tracking

**User Story:** As a learner, I want the system to remember which stages I have completed, so that I can continue my journey across multiple sessions and see my advancement.

#### Acceptance Criteria

1. WHEN the user marks a stage as complete (or the Teaching_Session marks it as complete after covering all topics), THE Progress_Tracker SHALL persist the completion status with a timestamp to the database
2. THE Progress_Tracker SHALL persist progress across browser sessions so that returning users see their previously completed stages
3. WHEN the user returns to a previously completed journey, THE Platform SHALL display the journey map with all previously completed stages marked as complete and the next sequential stage unlocked
4. THE Progress_Tracker SHALL track and display the overall journey completion percentage on the journey map (completed stages divided by total stages, displayed as a percentage)
5. WHEN all stages in a journey are marked as complete, THE Platform SHALL display a completion celebration indicating the user has finished the entire journey

### Requirement 9: Teaching Session Conversation Persistence

**User Story:** As a learner, I want my conversations within each stage to be saved, so that I can return to a stage and see what was previously discussed without starting over.

#### Acceptance Criteria

1. THE Platform SHALL persist all messages (user messages and system responses) exchanged within a Teaching_Session to the database, associated with the specific stage and journey
2. WHEN the user reopens a previously visited stage, THE Teaching_Session SHALL load and display the prior conversation history so the user can continue from where they left off
3. THE Teaching_Session SHALL maintain the LLM conversation context when the user returns to a stage, allowing follow-up questions that reference earlier exchanges
4. THE Platform SHALL allow the user to reset a stage's conversation history and start fresh if desired

### Requirement 10: Journey Entry Flow

**User Story:** As a learner, I want a clear entry point to create a new interactive journey from my documents, so that I can start learning quickly.

#### Acceptance Criteria

1. WHEN the user selects "Teach Me" from the home screen, THE Platform SHALL present a topic input field and a document upload area consistent with the existing entry flow
2. THE Platform SHALL accept topic input between 3 and 200 characters in length
3. IF the user attempts to generate a journey without providing a topic and without uploading any documents, THEN THE Platform SHALL display a validation message indicating that at least a topic or documents are required
4. WHEN the user clicks "Generate Journey" with valid input, THE Platform SHALL display a loading state with progress updates while the Journey_Map_Generator creates the stages
5. WHEN journey map generation is complete, THE Platform SHALL automatically navigate the user to the visual journey map view
6. THE Platform SHALL display a list of previously created journeys on the Teach Me entry page so users can return to past journeys

### Requirement 11: Replacing the Static Journey Viewer

**User Story:** As a learner, I want the new interactive experience to completely replace the old static section viewer, so that there is one cohesive "Teach Me" experience.

#### Acceptance Criteria

1. THE Platform SHALL replace the existing static JourneyViewer component and JourneySection component with the new visual journey map and interactive Teaching_Session interface
2. WHEN a user navigates to a previously created journey (from the old format), THE Platform SHALL display it using the new journey map interface, mapping old sections to stages as closely as possible
3. THE Platform SHALL maintain the existing URL structure (/teach-me and /teach-me/journey/[id]) so that bookmarks and shared links remain functional
4. THE Platform SHALL remove or deprecate the existing static section rendering code after the redesign is complete

