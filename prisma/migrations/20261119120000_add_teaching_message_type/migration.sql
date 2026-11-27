-- Teach Me labels each message as a lecture or a question and answer; older rows default to "qa".
ALTER TABLE "TeachingMessage" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'qa';
