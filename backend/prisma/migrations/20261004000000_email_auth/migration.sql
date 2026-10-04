BEGIN;

CREATE TABLE "AuthChallenge" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('SIGNUP', 'LOGIN', 'RESET_PASSWORD')),
  "email" TEXT,
  "codeHash" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'bg',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sendCount" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthChallenge_userId_createdAt_idx" ON "AuthChallenge"("userId", "createdAt");
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

CREATE TABLE "EmailNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailNotification_sentAt_nextAttempt_idx" ON "EmailNotification"("sentAt", "nextAttempt");

-- Older login sessions bypassed email confirmation. Revoke them once at upgrade.
DELETE FROM "Session";
COMMIT;
