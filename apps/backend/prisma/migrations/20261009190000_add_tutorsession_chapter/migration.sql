-- C13.4: let a tutor session be anchored to a chapter, not only to a topic.
--
-- TutorSession.lessonId has been the single curriculum anchor. That works for
-- the ten Class 6 chapters with written topics and fails for the other 139,
-- which have no lessons at all: "Ask ED about this chapter" could name the
-- chapter in its opening message and nowhere else.
--
-- The model is replayed the last 12 messages, so that opening message is
-- evicted after six exchanges, and the system prompt had no curriculum layer
-- to replace it (the layer is built from session.lesson, which is null). From
-- turn seven onward ED retained only the class and the subject. One session in
-- the development database is already past that window.
--
-- With moduleId stored, the chapter is rebuilt from rows on every turn, so it
-- is immune to history length, refresh and reopening.
--
-- Additive and nullable. Every existing row gets NULL, which is exactly the
-- behaviour those sessions have today: topic-anchored sessions keep using
-- lessonId, general sessions keep having no curriculum context. Nothing is
-- rewritten, nothing is dropped, and rolling back is a single DROP COLUMN
-- because the read path falls through to the lesson anchor when no module is
-- present.
--
-- ON DELETE SET NULL, matching "TutorSession"."lessonId". Deleting a chapter
-- must orphan the session's context, never delete a child's conversation.

-- ==========================================
-- 1. The column
-- ==========================================
ALTER TABLE "TutorSession" ADD COLUMN "moduleId" TEXT;

-- ==========================================
-- 2. Index
-- ==========================================
-- Supports loading a session with its chapter, and "every session about this
-- chapter" for any future per-chapter view.
CREATE INDEX "TutorSession_moduleId_idx" ON "TutorSession"("moduleId");

-- ==========================================
-- 3. Relation
-- ==========================================
ALTER TABLE "TutorSession"
  ADD CONSTRAINT "TutorSession_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
