import { isCourseVisibleToClass, resolveCourseClassLevel } from '@edplatform/shared';
import type { SafeUser } from '@edplatform/shared';
import { NotFoundError, ForbiddenError } from '../errors/app.error.js';
import { studentProfileService } from './student-profile.service.js';

/**
 * Authorization for the Class 6-8 curriculum Learn path.
 *
 * Legacy technical courses are gated by enrollment, which is correct for paid
 * marketplace material. Curriculum courses are different: a Class 6 student
 * should be able to read their own syllabus without enrolling in anything, but
 * must never reach Class 7 or Class 8 material. So curriculum access is gated
 * by class instead of by enrollment.
 *
 * Two deliberate properties:
 *
 * 1. The class comes from the stored StudentProfile, never from the request.
 *    A request-supplied classLevel would let a Class 6 student ask for Class 8
 *    content simply by claiming to be in Class 8.
 *
 * 2. It reuses isCourseVisibleToClass(), the same canonical allowlist that the
 *    course catalogue, course detail and tutor session gate already use. One
 *    gate, not four that can drift apart.
 */

export type CurriculumAccessOutcome = 'not-curriculum' | 'granted';

interface CurriculumLessonTarget {
  courseSlug: string;
  courseIsPublished: boolean;
  lessonIsPublished: boolean;
}

interface CurriculumQuizTarget {
  courseSlug: string;
  courseIsPublished: boolean;
  /** null when the quiz hangs off a module rather than a lesson. */
  lessonIsPublished: boolean | null;
  quizIsPublished: boolean;
}

/**
 * The one decision, shared by every curriculum entry point.
 *
 * `publishedFlags` is every must-be-true flag on the path to the thing being
 * opened, so a quiz can require its lesson AND itself to be published without
 * this function knowing what a quiz is.
 *
 * `signInMessage` is the only caller-visible difference: an anonymous visitor
 * is told to sign in, and that wording should name what they were reaching for.
 */
async function resolveCurriculumAccess(
  courseSlug: string,
  publishedFlags: Array<boolean | null>,
  signInMessage: string,
  notFoundMessage: string,
  currentUser?: SafeUser
): Promise<CurriculumAccessOutcome> {
  if (resolveCourseClassLevel(courseSlug) === null) {
    return 'not-curriculum';
  }

  // Anonymous visitors get a useful message rather than a silent 404: the
  // twelve curriculum slugs are public structure, so saying "sign in" leaks
  // nothing an unauthenticated caller could not already guess.
  if (!currentUser) {
    throw new ForbiddenError(signInMessage);
  }

  // Everything below shares one generic NotFoundError. A Class 6 student
  // probing a Class 8 id must not be able to tell a real row from a made-up
  // one by comparing responses.
  const reject = (): never => {
    throw new NotFoundError(notFoundMessage);
  };

  if (publishedFlags.some((flag) => flag === false)) reject();

  const profile = await studentProfileService.getProfile(currentUser.id);
  if (!profile) reject();

  if (!isCourseVisibleToClass(courseSlug, profile!.classLevel)) reject();

  return 'granted';
}

/**
 * Decides curriculum access for one lesson.
 *
 * Returns 'not-curriculum' when the lesson belongs to a legacy course, which
 * tells the caller to fall through to its existing enrollment logic unchanged.
 * Returns 'granted' when the signed-in student's own class owns this material.
 * Throws otherwise.
 */
export async function resolveCurriculumLessonAccess(
  target: CurriculumLessonTarget,
  currentUser?: SafeUser
): Promise<CurriculumAccessOutcome> {
  return resolveCurriculumAccess(
    target.courseSlug,
    [target.courseIsPublished, target.lessonIsPublished],
    'Sign in to open your lessons',
    'Lesson not found',
    currentUser
  );
}

/**
 * Decides curriculum access for one chapter.
 *
 * A chapter has no published flag of its own and no content to gate - what is
 * being authorised is the right to be told its name and to start a session
 * about it. That still has to be gated: chapter titles are the syllabus of a
 * particular class, and a Class 6 student guessing a Class 8 module id must
 * not learn what is in it or get ED pitched at it.
 *
 * Same allowlist, same stored profile, same generic refusal as every other
 * curriculum entry point.
 */
export async function resolveCurriculumChapterAccess(
  target: { courseSlug: string; courseIsPublished: boolean },
  currentUser?: SafeUser
): Promise<CurriculumAccessOutcome> {
  return resolveCurriculumAccess(
    target.courseSlug,
    [target.courseIsPublished],
    'Sign in to ask ED about your chapters',
    'Chapter not found',
    currentUser
  );
}

/**
 * Decides curriculum access for one quiz, and for every operation on an attempt
 * at it: fetching it, starting, submitting, and reading the result.
 *
 * Needed because the legacy student quiz gate grants access whenever the
 * parent lesson carries isFreePreview - and every seeded curriculum topic
 * carries that flag, so a curriculum quiz would otherwise be fetchable and
 * submittable by anonymous callers and by students in other classes. Exactly
 * the hole C6 closed for lesson reads, one layer up.
 */
export async function resolveCurriculumQuizAccess(
  target: CurriculumQuizTarget,
  currentUser?: SafeUser
): Promise<CurriculumAccessOutcome> {
  return resolveCurriculumAccess(
    target.courseSlug,
    [target.courseIsPublished, target.lessonIsPublished, target.quizIsPublished],
    'Sign in to open your practice questions',
    'Quiz not found',
    currentUser
  );
}
