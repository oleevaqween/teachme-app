-- CreateTable
CREATE TABLE "CheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckResult_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckResult_messageId_key" ON "CheckResult"("messageId");

-- CreateIndex
CREATE INDEX "CheckResult_stageId_idx" ON "CheckResult"("stageId");

-- CreateIndex
CREATE INDEX "CheckResult_journeyId_idx" ON "CheckResult"("journeyId");

