# Requirements Document

## Introduction

The Learning Journey Platform is an intelligent educational application that transforms uploaded documents and internet-sourced information into creative, journey-like learning experiences. It supports two primary flows: "Teach Me" for personalized curriculum generation with quizzes and supplementary resources, and "Interview" for role-specific interview preparation with mock questions, scoring, and CV/resume refinement. The platform prioritizes information accuracy through validation mechanisms and offers a modern, state-of-the-art user interface with configurable LLM provider support.

## Glossary

- **Platform**: The Learning Journey Platform application
- **Document_Processor**: The subsystem responsible for parsing and extracting content from uploaded files (PDF, DOCX, EPUB, XLSX, PPTX)
- **Curriculum_Engine**: The subsystem that generates creative journey-like learning experiences from extracted content and internet sources
- **Information_Validator**: The subsystem that validates all generated or sourced information for accuracy before presenting it to the user
- **Interview_Engine**: The subsystem that manages interview preparation, mock questions, scoring, and CV refinement
- **LLM_Provider**: A configurable large language model service used by the platform for content generation. Includes cloud API providers (e.g., OpenAI, Anthropic, Ollama Cloud) and local inference (e.g., Ollama local)
- **Ollama_Cloud**: Ollama's hosted cloud inference service that runs larger models on datacenter-grade hardware, accessed via API key authentication through ollama.com's API or OpenAI-compatible endpoints
- **Ollama_Local**: A locally-run Ollama instance that performs inference on the user's own hardware without requiring cloud connectivity
- **Journey**: A structured, creative learning curriculum that teaches a topic through an engaging experience rather than a linear table of contents
- **Quiz**: An interactive assessment embedded within a Journey to test comprehension
- **Mock_Question**: A role-specific interview question designed to challenge candidates on areas where they commonly fail
- **Archive**: A collection of previously asked and answered interview questions for a specific role
- **CV_Refiner**: The component that analyzes and outputs an improved, more professional version of a user's resume

## Requirements

### Requirement 1: Document Upload

**User Story:** As a learner, I want to upload various document types, so that the platform can extract knowledge from my materials to build a personalized curriculum.

#### Acceptance Criteria

1. THE Platform SHALL accept document uploads in PDF, DOCX, EPUB, XLSX, and PPTX formats with a maximum file size of 100 MB per document
2. WHEN a user uploads one or more documents, THE Document_Processor SHALL extract textual and structured content from each uploaded file and display a success confirmation for each successfully processed file
3. IF a user uploads a file in an unsupported format, THEN THE Platform SHALL display an error message identifying the unsupported format and listing accepted formats (PDF, DOCX, EPUB, XLSX, PPTX)
4. IF a document fails to parse due to corruption or encoding issues, THEN THE Document_Processor SHALL notify the user that the specific file could not be processed, include the file name in the error message, and continue processing remaining files
5. THE Platform SHALL allow users to upload up to 20 documents in a single session

### Requirement 2: Teach Me Flow Entry

**User Story:** As a learner, I want to specify a topic and optionally upload documents, so that the platform knows what to teach me and what source materials to use.

#### Acceptance Criteria

1. WHEN the user selects the "Teach Me" button on the home screen, THE Platform SHALL present a topic input field and a document upload area
2. IF the user attempts to generate a Journey without providing a topic, THEN THE Platform SHALL display a validation message indicating that a topic is required and prevent Journey generation
3. THE Platform SHALL accept topic input between 3 and 200 characters in length
4. WHEN the user provides a topic without uploading documents, THE Curriculum_Engine SHALL source information exclusively from validated internet resources to create the Journey
5. WHEN the user provides a topic and uploads documents, THE Curriculum_Engine SHALL create the Journey using extracted document content supplemented by validated internet resources
6. WHEN the user has entered a valid topic and optionally uploaded documents, THE Platform SHALL present a "Generate Journey" button that initiates curriculum creation

### Requirement 3: Journey Curriculum Generation

**User Story:** As a learner, I want a creative journey-like learning experience rather than a linear table of contents, so that I stay engaged and learn more effectively.

#### Acceptance Criteria

1. WHEN document content and/or internet-sourced information is available, THE Curriculum_Engine SHALL generate a Journey that covers all concepts explicitly defined or explained in the source material (headings, definitions, procedures, and stated principles)
2. THE Curriculum_Engine SHALL structure the Journey such that the sequence of concepts differs from the original document's table of contents order by reordering, grouping by theme, or introducing branching paths between related topics
3. THE Curriculum_Engine SHALL embed at least one Quiz for every 3 to 5 concepts presented within the Journey to assess user comprehension
4. THE Curriculum_Engine SHALL incorporate supplementary information sourced from internet communities, forums (including Reddit), and subject-specific groups into the Journey, where the supplementary information directly relates to a concept present in the source material
5. WHEN supplementary information is sourced from the internet, THE Information_Validator SHALL verify the accuracy of each piece of information by cross-referencing it against at least one additional independent source before including it in the Journey
6. IF the Information_Validator cannot verify a piece of supplementary information against at least one independent source, THEN THE Curriculum_Engine SHALL exclude that information from the Journey
7. THE Curriculum_Engine SHALL attribute sourced information to its origin (community name, URL, or resource title)
8. THE Curriculum_Engine SHALL generate a Journey containing a minimum of 5 and a maximum of 50 sections per source document

### Requirement 4: Information Validation and Anti-Hallucination

**User Story:** As a learner, I want all information presented to be validated and accurate, so that I can trust the content I am learning.

#### Acceptance Criteria

1. THE Information_Validator SHALL verify all factual claims and data points generated by the LLM_Provider against source documents or at least two independent, publicly accessible internet sources before presenting them to the user
2. IF the Information_Validator cannot verify a piece of information against at least one source within 30 seconds, THEN THE Platform SHALL exclude that information from the presented content
3. IF uploaded documents are the source of the LLM-generated content, THEN THE Information_Validator SHALL cross-reference each claim against the original uploaded documents and confirm semantic alignment before inclusion
4. THE Platform SHALL label each piece of presented information with a source tag indicating either "Document-sourced" or "Internet-sourced" so the learner can identify the origin of each claim
5. IF information is sourced from the internet, THEN THE Information_Validator SHALL assign a confidence level of High (verified by 3 or more sources), Medium (verified by 2 sources), or Low (verified by 1 source) and display that level alongside the content
6. IF the Information_Validator encounters a verification source that is unavailable or returns an error, THEN THE Platform SHALL proceed with remaining available sources and note reduced verification coverage to the user

### Requirement 5: Interview Flow Entry

**User Story:** As a job seeker, I want to access a dedicated interview preparation environment, so that I can practice for specific roles.

#### Acceptance Criteria

1. WHEN the user selects the "Interview" button on the home screen, THE Platform SHALL navigate to the interview preparation environment
2. THE Platform SHALL require the user to enter a target role (between 2 and 100 characters) before proceeding with interview preparation
3. IF the user attempts to proceed without entering a role or enters fewer than 2 characters, THEN THE Platform SHALL display a validation message indicating that a valid role is required
4. WHEN the user has entered a valid role, THE Platform SHALL present three options: "Upload CV/Resume", "Mock Questions", and "Archive"

### Requirement 6: Mock Interview Questions

**User Story:** As a job seeker, I want to practice with the most challenging interview questions for my target role, so that I can identify and improve my weak areas.

#### Acceptance Criteria

1. WHEN the user selects "Mock Questions" for a specific role, THE Interview_Engine SHALL present between 5 and 10 questions sourced from topics with the highest candidate failure rates for that role
2. WHEN the user submits an answer to a Mock_Question, THE Interview_Engine SHALL provide a score on a scale of 1 to 10 for that answer
3. WHEN the user submits an answer to a Mock_Question, THE Interview_Engine SHALL identify between 1 and 5 specific areas where the answer was weak or incorrect, each with a brief explanation of why it is considered a weakness
4. WHEN the user submits an answer to a Mock_Question, THE Interview_Engine SHALL provide two example answers written in distinct professional styles, where each style is labeled with its approach name
5. WHILE generating Mock_Questions for a role, THE Interview_Engine SHALL exclude any questions that already exist in the user's Archive for that role
6. IF the user submits an answer that contains fewer than 20 characters, THEN THE Interview_Engine SHALL prompt the user to provide a more detailed response before scoring
7. IF all available Mock_Questions for a role have been archived by the user, THEN THE Interview_Engine SHALL notify the user that no new questions are available for that role

### Requirement 7: Question Archive

**User Story:** As a job seeker, I want to archive questions I have already practiced, so that I get fresh questions in future sessions and can track my progress.

#### Acceptance Criteria

1. WHEN the user clicks the "Archive" button on a scored Mock_Question, THE Interview_Engine SHALL store that question, the user's answer, and the score in the Archive for the current role, and remove the question from the active session view
2. THE Interview_Engine SHALL persist the Archive across user sessions, retaining all archived items until the user explicitly removes them
3. WHEN generating new Mock_Questions, THE Interview_Engine SHALL exclude all questions present in the Archive for the current role
4. IF all available Mock_Questions for the current role are present in the Archive, THEN THE Interview_Engine SHALL notify the user that no new questions are available and offer the option to reset the Archive for that role
5. THE Platform SHALL allow users to view their Archive grouped by role, displaying for each archived item the question text, the user's answer, the score received, and the date archived
6. WHEN the user selects "Unarchive" on an archived question, THE Interview_Engine SHALL remove that question from the Archive and make it eligible for selection in future Mock_Question sessions for that role

### Requirement 8: CV/Resume Refinement

**User Story:** As a job seeker, I want to refine my CV/resume for a specific role, so that I present the most professional and relevant version of my experience.

#### Acceptance Criteria

1. WHEN the user uploads a CV/resume in the interview flow, THE Platform SHALL accept the document in PDF or DOCX format and parse the document content within 30 seconds
2. IF the user uploads a CV/resume in an unsupported format or the document fails to parse, THEN THE Platform SHALL display an error message indicating the failure reason and listing accepted formats (PDF, DOCX)
3. WHEN the user clicks "Refine" after uploading a CV/resume, THE CV_Refiner SHALL generate an improved version of the CV/resume that emphasizes skills, experience, and qualifications relevant to the specified target role
4. THE CV_Refiner SHALL maintain factual accuracy of the user's experience and qualifications during refinement by preserving all dates, job titles, company names, education credentials, and quantitative achievements exactly as stated in the original document
5. THE CV_Refiner SHALL output the refined CV/resume as a downloadable PDF document with consistent heading styles, section spacing, and readable font sizing
6. IF the CV_Refiner fails to generate a refined version, THEN THE Platform SHALL notify the user that refinement could not be completed and retain the original uploaded document for retry

### Requirement 9: LLM Provider Configuration

**User Story:** As a user, I want to choose which LLM provider powers the platform, so that I can use my preferred service or a local model.

#### Acceptance Criteria

1. THE Platform SHALL support configuration of multiple LLM_Provider options including cloud API providers (OpenAI, Anthropic, Ollama_Cloud) and local inference (Ollama_Local)
2. THE Platform SHALL allow the user to select their active LLM_Provider from a settings interface
3. WHEN the user selects a cloud-based LLM_Provider (including Ollama_Cloud), THE Platform SHALL require the corresponding API key, validate it by issuing a test request to the provider within 15 seconds, and store it such that it is never displayed in plain text after entry
4. WHEN the user selects Ollama_Local as the LLM_Provider, THE Platform SHALL attempt to connect to the local Ollama instance without requiring an API key within a timeout of 10 seconds
5. WHEN the user selects an LLM_Provider, THE Platform SHALL use that provider for all content generation tasks
6. IF the selected LLM_Provider is unavailable or returns an error within 15 seconds of a request, THEN THE Platform SHALL display an error message indicating the nature of the failure and suggest selecting an alternative provider
7. THE Platform SHALL allow the user to select specific models available from the chosen LLM_Provider by retrieving and displaying the list of models supported by that provider
8. IF the API key validation fails for a cloud-based LLM_Provider, THEN THE Platform SHALL display an error message indicating invalid credentials and SHALL NOT store the key
9. IF the user has not yet configured any LLM_Provider, THEN THE Platform SHALL prompt the user to select and configure a provider before allowing content generation tasks
10. IF the Ollama_Local instance is not reachable within the connection timeout, THEN THE Platform SHALL display an error message indicating the local instance is unavailable and allow the user to retry or select a different provider

### Requirement 10: User Interface Design

**User Story:** As a user, I want a modern, beautiful, and intuitive interface, so that the learning and interview experience is engaging and enjoyable.

#### Acceptance Criteria

1. THE Platform SHALL present a home screen with two primary action buttons: "Teach Me" and "Interview"
2. THE Platform SHALL render all interface elements using a consistent visual design system with uniform spacing scale, a defined typographic hierarchy of no more than 5 heading levels, and color contrast ratios meeting WCAG 2.1 AA (minimum 4.5:1 for normal text, 3:1 for large text)
3. THE Platform SHALL provide responsive layout that adapts to at least three breakpoints: mobile (viewport width below 768px), tablet (768px to 1023px), and desktop (1024px and above), with all content and controls remaining accessible and functional at each breakpoint
4. THE Platform SHALL allow the user to reach any primary feature (Teach Me, Interview, Settings, Archive) from any screen within a maximum of 3 navigation actions
5. THE Platform SHALL present the interview preparation environment with a visually distinct color scheme or layout structure that differentiates it from the Teach Me flow, so that the user can identify which flow they are in without reading page titles
6. WHILE the Platform is performing an asynchronous operation (generating a Journey, scoring an answer, refining a CV), THE Platform SHALL display a loading indicator within 1 second of the operation starting and maintain it until the operation completes or fails

### Requirement 11: Internet Resource Sourcing

**User Story:** As a learner, I want the platform to find and include high-quality information from online communities and groups, so that my learning is enriched with diverse perspectives and practical knowledge.

#### Acceptance Criteria

1. WHEN building a Journey, THE Curriculum_Engine SHALL search at least 3 online communities, forums, Reddit, or subject-specific groups for information matching the target topic and return results within 30 seconds of initiating the search
2. THE Curriculum_Engine SHALL prioritize information from communities that have at least 1,000 members and have been active within the last 12 months in the target topic area
3. WHEN internet-sourced information is retrieved, THE Information_Validator SHALL cross-reference it against at least 2 independent sources before inclusion in the Journey, and discard any information that cannot be corroborated
4. IF the Information_Validator determines that sourced information fails verification, THEN THE Curriculum_Engine SHALL exclude that information from the Journey and proceed with remaining verified content
5. THE Curriculum_Engine SHALL embed sourced community information within the Journey section whose topic matches the sourced content, and include attribution indicating the originating community name
6. IF no community sources meeting the quality criteria are found for a topic, THEN THE Curriculum_Engine SHALL proceed with Journey generation without community-sourced content and indicate to the learner that no community sources were available for that topic
