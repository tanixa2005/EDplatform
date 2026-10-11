import { textbookForCourseSlug } from '@edplatform/shared';
import type { CurriculumMeta } from './ai/ai-provider.interface.js';
import { normaliseBrief } from './tutor/session-curriculum.service.js';

/**
 * Which curriculum topic a quiz question is about.
 *
 * Two different questions were being answered by one field. `Quiz.lessonId`
 * says where a quiz LIVES - it is the routing anchor behind
 * GET /lessons/:lessonId/quiz, the segment in every quiz and result URL, and
 * the row the class gate reads the course from. `QuizQuestion.lessonId` says
 * what a single question is ABOUT.
 *
 * The Class 6 Science chapter quiz made the difference visible: it hangs off
 * topic 4 but draws on all four topics, so a student who missed the question
 * about what science IS was told to re-read "Getting good at science", and ED
 * opened with that topic's context. One of its five questions is actually a
 * topic-4 question.
 *
 * Everything here is derived from rows the caller has already authorised. No
 * topic, lesson, class or subject is ever read from the request - the client
 * sends ids and nothing else.
 */

/** A lesson as this resolver needs to see it. */
export interface TopicLesson {
  id: string;
  title: string;
  description: string | null;
  /**
   * The reviewed teaching brief for this topic, straight off the Lesson row.
   *
   * Present here so a quiz hint is pitched with the same trusted material the
   * tutor gets. Null is the normal state and renders nothing.
   */
  teachingBrief: string | null;
  isPublished: boolean;
  moduleId: string;
  module: {
    id: string;
    title: string;
    course: { title: string; slug: string };
  };
}

/** The quiz's own anchor: a hosting lesson, a hosting module, or neither. */
export interface QuizAnchor {
  lessonId: string | null;
  lesson: TopicLesson | null;
  moduleId: string | null;
  module: {
    id: string;
    title: string;
    course: { title: string; slug: string };
  } | null;
}

/** The question side: only the topic pointer and the lesson behind it. */
export interface TopicCandidate {
  lessonId: string | null;
  lesson: TopicLesson | null;
}

export interface ResolvedQuestionTopic {
  /** Null when the quiz has no lesson anchor and the question names no topic. */
  lesson: TopicLesson | null;
  /**
   * Where the answer came from. Worth surfacing: 'quiz' on a question that
   * does name a topic means the same-chapter rule rejected it.
   */
  source: 'question' | 'quiz' | 'none';
}

/**
 * The chapter a quiz belongs to, from its own anchor.
 *
 * A lesson-hosted quiz inherits its lesson's module; a module-hosted quiz has
 * one directly. This is the boundary a question's topic has to stay inside.
 */
function anchorModuleId(quiz: QuizAnchor): string | null {
  return quiz.lesson?.module.id ?? quiz.lesson?.moduleId ?? quiz.moduleId ?? null;
}

/**
 * The single place that decides which lesson a question is about.
 *
 * Precedence, and the reason for each step:
 *
 *   1. The question's own topic - but only when it is published and sits in
 *      the SAME chapter as the quiz. That constraint is not decoration. The
 *      resolved lesson becomes curriculum context in a prompt and a topic to
 *      send a child back to, so a bad seed or a stray write must not be able
 *      to carry either across a chapter - and therefore across a class.
 *      A rejected value is ignored, never an error: the question still has a
 *      perfectly good fallback, and failing the whole request would turn a
 *      content mistake into an outage.
 *   2. The quiz's own hosting lesson. Exactly what every caller used before
 *      this field existed, which is what makes null safe for legacy questions
 *      and makes the whole change revertible.
 *   3. Nothing, for a module-hosted quiz with no lesson anywhere.
 *
 * Note that this is NOT an authorization decision. The caller has already
 * proven the student may see this quiz, and that gate runs on the quiz's
 * course. This only chooses which already-permitted lesson to describe.
 */
export function resolveQuestionTopic(
  question: TopicCandidate,
  quiz: QuizAnchor
): ResolvedQuestionTopic {
  const chapterId = anchorModuleId(quiz);
  const candidate = question.lesson;

  if (
    candidate &&
    candidate.isPublished &&
    chapterId !== null &&
    (candidate.module?.id ?? candidate.moduleId) === chapterId
  ) {
    return { lesson: candidate, source: 'question' };
  }

  if (quiz.lesson) {
    return { lesson: quiz.lesson, source: 'quiz' };
  }

  return { lesson: null, source: 'none' };
}

/**
 * The same decision, shaped for the tutor prompt.
 *
 * Kept next to the resolver so the prompt can never be built from a different
 * lesson than the one the rest of the loop points at.
 */
export function curriculumMetaForTopic(lesson: TopicLesson | null): CurriculumMeta | null {
  if (!lesson) return null;
  return {
    textbook: textbookForCourseSlug(lesson.module.course.slug),
    courseTitle: lesson.module.course.title,
    chapterTitle: lesson.module.title,
    topicTitle: lesson.title,
    topicObjective: lesson.description ?? null,
    // Same normaliser the session path uses, imported rather than repeated.
    teachingBrief: normaliseBrief(lesson.teachingBrief)
  };
}

/**
 * The Prisma selection a caller needs so the resolver has everything.
 *
 * Exported so the three call sites load the same shape rather than three
 * slightly different ones that drift.
 */
export const TOPIC_LESSON_SELECT = {
  id: true,
  title: true,
  description: true,
  teachingBrief: true,
  isPublished: true,
  moduleId: true,
  module: {
    select: {
      id: true,
      title: true,
      course: { select: { title: true, slug: true } }
    }
  }
} as const;
