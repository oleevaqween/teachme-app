-- CreateTable
CREATE TABLE "StageStudyTime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "lastStudiedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StageStudyTime_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StageStudyTime_stageId_key" ON "StageStudyTime"("stageId");

-- CreateIndex
CREATE INDEX "StageStudyTime_journeyId_idx" ON "StageStudyTime"("journeyId");

