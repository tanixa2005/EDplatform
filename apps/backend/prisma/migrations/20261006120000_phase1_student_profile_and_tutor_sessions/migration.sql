-- Phase 1: student-only product foundation.
--
-- Everything here is additive or widening, with one exception: the dead
-- AIChatSession / AIMessage tables are renamed and reshaped into
-- TutorSession / TutorMessage. Both tables were verified empty (0 rows) and
-- have zero references anywhere in the application code, so no data is lost.

-- ==========================================
-- 1. New enums
-- ==========================================
CREATE TYPE "ClassLevel" AS ENUM ('CLASS_6', 'CLASS_7', 'CLASS_8');
CREATE TYPE "Board" AS ENUM ('CBSE');
CREATE TYPE "SubjectKey" AS ENUM ('MATH', 'SCIENCE', 'SOCIAL_SCIENCE', 'ENGLISH');
CREATE TYPE "Language" AS ENUM ('ENGLISH', 'HINDI', 'HINGLISH');
CREATE TYPE "ExplanationStyle" AS ENUM ('SIMPLE', 'STEP_BY_STEP', 'REAL_LIFE', 'EXAM_FOCUSED');
CREATE TYPE "TutorRole" AS ENUM ('STUDENT', 'ED');
CREATE TYPE "TutorInputKind" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

-- ==========================================
-- 2. User: Clerk identity link, password becomes optional
-- ==========================================
-- Nullable so existing legacy rows keep working until they are linked to Clerk.
ALTER TABLE "User" ADD COLUMN "clerkUserId" TEXT;

-- Clerk-created accounts have no local password. Widening only: existing
-- Argon2id hashes are untouched and legacy login keeps working.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE INDEX "User_clerkUserId_idx" ON "User"("clerkUserId");

-- ==========================================
-- 3. StudentProfile + StudentSubject
-- ==========================================
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classLevel" "ClassLevel" NOT NULL,
    "board" "Board" NOT NULL DEFAULT 'CBSE',
    "preferredLanguage" "Language" NOT NULL DEFAULT 'ENGLISH',
    "preferredExplanationStyle" "ExplanationStyle" NOT NULL DEFAULT 'SIMPLE',
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");
CREATE INDEX "StudentProfile_classLevel_idx" ON "StudentProfile"("classLevel");

ALTER TABLE "StudentProfile"
    ADD CONSTRAINT "StudentProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StudentSubject" (
    "profileId" TEXT NOT NULL,
    "subject" "SubjectKey" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSubject_pkey" PRIMARY KEY ("profileId", "subject")
);

CREATE INDEX "StudentSubject_subject_idx" ON "StudentSubject"("subject");

ALTER TABLE "StudentSubject"
    ADD CONSTRAINT "StudentSubject_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==========================================
-- 4. AIChatSession -> TutorSession, AIMessage -> TutorMessage
-- ==========================================
-- Drop the old foreign keys and secondary indexes first.
ALTER TABLE "AIMessage" DROP CONSTRAINT "AIMessage_sessionId_fkey";
ALTER TABLE "AIChatSession" DROP CONSTRAINT "AIChatSession_userId_fkey";
ALTER TABLE "AIChatSession" DROP CONSTRAINT "AIChatSession_lessonId_fkey";

DROP INDEX "AIChatSession_userId_lessonId_key";
DROP INDEX "AIChatSession_userId_idx";
DROP INDEX "AIChatSession_lessonId_idx";
DROP INDEX "AIMessage_sessionId_idx";

-- Rename tables and their primary keys.
ALTER TABLE "AIChatSession" RENAME TO "TutorSession";
ALTER INDEX "AIChatSession_pkey" RENAME TO "TutorSession_pkey";

ALTER TABLE "AIMessage" RENAME TO "TutorMessage";
ALTER INDEX "AIMessage_pkey" RENAME TO "TutorMessage_pkey";

-- TutorSession: a session no longer has to belong to a lesson, and carries the
-- class level it was taught at plus a human-readable title.
ALTER TABLE "TutorSession" ALTER COLUMN "lessonId" DROP NOT NULL;
ALTER TABLE "TutorSession" ADD COLUMN "classLevel" "ClassLevel" NOT NULL;
ALTER TABLE "TutorSession" ADD COLUMN "subject" "SubjectKey";
ALTER TABLE "TutorSession" ADD COLUMN "title" TEXT NOT NULL;
ALTER TABLE "TutorSession" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TutorSession" ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE INDEX "TutorSession_userId_lastActiveAt_idx" ON "TutorSession"("userId", "lastActiveAt");
CREATE INDEX "TutorSession_lessonId_idx" ON "TutorSession"("lessonId");

ALTER TABLE "TutorSession"
    ADD CONSTRAINT "TutorSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TutorSession"
    ADD CONSTRAINT "TutorSession_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TutorMessage: role becomes a typed enum, plus input kind and quick-action mode.
ALTER TABLE "TutorMessage" DROP COLUMN "role";
ALTER TABLE "TutorMessage" ADD COLUMN "role" "TutorRole" NOT NULL;
ALTER TABLE "TutorMessage" ADD COLUMN "inputKind" "TutorInputKind" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "TutorMessage" ADD COLUMN "mode" TEXT;

CREATE INDEX "TutorMessage_sessionId_createdAt_idx" ON "TutorMessage"("sessionId", "createdAt");

ALTER TABLE "TutorMessage"
    ADD CONSTRAINT "TutorMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
