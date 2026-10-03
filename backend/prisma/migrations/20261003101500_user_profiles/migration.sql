-- Adapted from roko commit 615733a: keep hash-only password storage and
-- backfill updatedAt before making it required on databases with users.
BEGIN;

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'MODERATOR');

ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "realName" TEXT,
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "User" SET "updatedAt" = "createdAt";
ALTER TABLE "User"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Project" ADD COLUMN "userId" TEXT;
ALTER TABLE "Message" ADD COLUMN "userId" TEXT;

-- Existing user messages inherit the conversation owner; AI messages and
-- ownerless conversations remain unattributed. Do not invent project owners.
UPDATE "Message" AS message
SET "userId" = conversation."userId"
FROM "Conversation" AS conversation
WHERE message."conversationId" = conversation."id" AND message."role" = 'USER';

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "Conversation_projectId_idx" ON "Conversation"("projectId");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
