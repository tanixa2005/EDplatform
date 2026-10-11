import { textbookForCourseSlug } from '@edplatform/shared';
import type { CurriculumMeta } from '../ai/ai-provider.interface.js';

/**
 * Which curriculum context a tutor session is about.
 *
 * A session can now be anchored two ways. `lessonId` means "this is about one
 * topic" and has existed since Phase 1. `moduleId` means "this is about a
 * chapter", and exists because 139 of the 149 curriculum chapters have no
 * written topics - for those, the chapter is the only anchor there is.
 *
 * Before C13.4 a chapter session carried its chapter name in the opening
 * message and nowhere else. The model is replayed the last 12 messages, so
 * that name was evicted after six exchanges and the system prompt had nothing
 * to replace it with. Resolving from the stored rows instead means the context
 * is rebuilt on every turn and does not care how long the conversation is,
 * whether it was refreshed, or whether it was reopened days later.
 *
 * Everything here comes from rows the session was authorised against at
 * creation. No part of a conversation is ever read back as context.
 */

/** A lesson as this resolver needs to see it. */
export interface SessionTopic {
  title: string;
  description: string | null;
  /** The stored teaching brief, straight off the Lesson row. May be null. */
  teachingBrief: string | null;
  moduleId: string;
  module: {
    id: string;
    title: string;
    course: { title: string; slug: string };
  };
}

/** A chapter as this resolver needs to see it. */
export interface SessionChapter {
  id: string;
  title: string;
  course: { title: string; slug: string };
}

export interface SessionAnchors {
  lessonId: string | null;
  lesson: SessionTopic | null;
  moduleId: string | null;
  module: SessionChapter | null;
}

export interface ResolvedSessionCurriculum {
  curriculum: CurriculumMeta | null;
  /** Which anchor answered. Surfaced so tests can assert the branch taken. */
  source: 'topic' | 'chapter' | 'none';
  /** The course slug behind the answer, for subject resolution. */
  courseSlug: string | null;
}

/**
 * The single place that decides what a session is about.
 *
 * Precedence, and why each step is in this order:
 *
 *   1. The topic, when there is one AND it does not contradict the chapter
 *      anchor. A topic is the more specific fact and the chapter comes free
 *      with it, through Lesson -> Module.
 *
 *      "Does not contradict" is not decoration. The two columns are written by
 *      different code paths, so a future writer - or a bad backfill - could
 *      pair a lesson from one chapter with a module from another. The result
 *      becomes curriculum context in a prompt, so a mismatch must not be able
 *      to describe a chapter the lesson does not belong to.
 *
 *   2. The chapter. This is the C13.4 case: a session about a chapter that has
 *      no topics to anchor to.
 *
 *   3. Nothing, for a homepage or subject-only session. Returning null here is
 *      correct, not a failure: those sessions have no curriculum context and
 *      must not acquire one.
 *
 * A contradiction is resolved by falling back, never by throwing. A content
 * mistake should degrade the prompt, not take the conversation down.
 *
 * This is NOT an authorisation decision. Both anchors were gated when the
 * session was created - the lesson by assertLessonUsableAsContext, the module
 * by assertModuleUsableAsContext - and ownership is enforced separately by
 * getOwnedSession on every read. This only chooses which already-permitted
 * rows to describe.
 */
/**
 * Blank is the same as absent.
 *
 * A column that exists but holds '' or whitespace would otherwise render an
 * empty "reviewed brief" heading - a claim that a brief was written when none
 * was. One place decides, so no call site can disagree - the quiz-hint path
 * imports this rather than repeating the rule, because two definitions of
 * "blank" would eventually disagree about a tab.
 */
export function normaliseBrief(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveSessionCurriculum(session: SessionAnchors): ResolvedSessionCurriculum {
  const topic = session.lesson;

  if (topic) {
    const chapterId = topic.module?.id ?? topic.moduleId;
    const agrees = session.moduleId === null || session.moduleId === chapterId;

    if (agrees) {
      return {
        source: 'topic',
        courseSlug: topic.module.course.slug,
        curriculum: {
          textbook: textbookForCourseSlug(topic.module.course.slug),
          courseTitle: topic.module.course.title,
          chapterTitle: topic.module.title,
          topicTitle: topic.title,
          topicObjective: topic.description ?? null,
          teachingBrief: normaliseBrief(topic.teachingBrief)
        }
      };
    }
  }

  if (session.module) {
    return {
      source: 'chapter',
      courseSlug: session.module.course.slug,
      curriculum: {
        textbook: textbookForCourseSlug(session.module.course.slug),
        courseTitle: session.module.course.title,
        chapterTitle: session.module.title,
        // No topic exists. Saying so is what lets the prompt avoid pretending
        // the student has read something.
        topicTitle: null,
        topicObjective: null,
        // A chapter is not a topic and has no brief of its own in this phase.
        teachingBrief: null
      }
    };
  }

  return { curriculum: null, source: 'none', courseSlug: null };
}
