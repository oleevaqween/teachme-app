-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "topicsCovered" TEXT NOT NULL,
    CONSTRAINT "Stage_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourceSection" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    CONSTRAINT "ContentChunk_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeachingMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeachingMessage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "StageProgress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StageProgress_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Journey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isInteractive" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Journey" ("createdAt", "id", "topic") SELECT "createdAt", "id", "topic" FROM "Journey";
DROP TABLE "Journey";
ALTER TABLE "new_Journey" RENAME TO "Journey";
CREATE TABLE "new_JourneySection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sourceTag" TEXT NOT NULL,
    "confidenceLevel" TEXT,
    "attributionName" TEXT,
    "attributionUrl" TEXT,
    "quizData" TEXT,
    CONSTRAINT "JourneySection_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JourneySection" ("attributionName", "attributionUrl", "confidenceLevel", "content", "id", "journeyId", "order", "quizData", "sourceTag", "title") SELECT "attributionName", "attributionUrl", "confidenceLevel", "content", "id", "journeyId", "order", "quizData", "sourceTag", "title" FROM "JourneySection";
DROP TABLE "JourneySection";
ALTER TABLE "new_JourneySection" RENAME TO "JourneySection";
CREATE INDEX "JourneySection_journeyId_idx" ON "JourneySection"("journeyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Stage_journeyId_idx" ON "Stage"("journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_journeyId_order_key" ON "Stage"("journeyId", "order");

-- CreateIndex
CREATE INDEX "ContentChunk_stageId_idx" ON "ContentChunk"("stageId");

-- CreateIndex
CREATE INDEX "ContentChunk_journeyId_idx" ON "ContentChunk"("journeyId");

-- CreateIndex
CREATE INDEX "TeachingMessage_stageId_idx" ON "TeachingMessage"("stageId");

-- CreateIndex
CREATE INDEX "TeachingMessage_journeyId_stageId_idx" ON "TeachingMessage"("journeyId", "stageId");

-- CreateIndex
CREATE UNIQUE INDEX "StageProgress_stageId_key" ON "StageProgress"("stageId");

-- CreateIndex
CREATE INDEX "StageProgress_journeyId_idx" ON "StageProgress"("journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "StageProgress_journeyId_stageId_key" ON "StageProgress"("journeyId", "stageId");
