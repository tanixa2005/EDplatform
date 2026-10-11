-- C13.2: give a quiz question the curriculum topic it actually assesses.
--
-- Quiz.lessonId stays exactly as it is. It answers a different question -
-- where a quiz lives, how a student reaches it, and which course (and
-- therefore which class) gates it. This new column answers "what is this one
-- question about", which a chapter-wide quick check cannot express today:
-- the Class 6 Science Chapter 1 quiz draws on all four topics but hangs off
-- topic 4, so every mistake pointed a student at topic 4.
--
-- Additive and nullable. Null means "no topic of its own" - fall back to the
-- quiz's own anchor, which is precisely the behaviour every existing question
-- has. No row is rewritten, no existing column changes type, and nothing is
-- dropped, so this is safe to replay and safe to roll back by dropping the
-- column.
--
-- ON DELETE SET NULL, deliberately, and unlike "Quiz"."lessonId" which
-- cascades. A quiz attached to a deleted topic has nowhere to live; a
-- question that merely references a topic must outlive it, or removing a
-- topic would silently destroy quiz questions and every QuizAnswer and
-- QuizAttempt history hanging off them.

-- ==========================================
-- 1. The column
-- ==========================================
ALTER TABLE "QuizQuestion" ADD COLUMN "lessonId" TEXT;

-- ==========================================
-- 2. Index
-- ==========================================
-- Supports "every question that assesses topic X" - the lookup behind future
-- per-topic practice and per-topic mastery aggregation.
CREATE INDEX "QuizQuestion_lessonId_idx" ON "QuizQuestion"("lessonId");

-- ==========================================
-- 3. Relation
-- ==========================================
ALTER TABLE "QuizQuestion"
  ADD CONSTRAINT "QuizQuestion_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
