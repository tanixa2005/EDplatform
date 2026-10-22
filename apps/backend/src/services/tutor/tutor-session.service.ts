import {
  inferSubjectFromQuestion,
  isCourseVisibleToClass,
  subjectForCourseSlug
} from '@edplatform/shared';
import type {
  ClassLevel,
  CreateTutorSessionInput,
  SafeUser,
  TutorMessageDto,
  TutorQuickAction,
  SubjectKey,
  TutorSessionDetailDto,
  TutorSessionSummaryDto
} from '@edplatform/shared';
import type { Prisma, TutorMessage, TutorSession } from '@prisma/client';
import { prisma } from '../../config/prisma.config.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../errors/app.error.js';
import { studentProfileService } from '../student-profile.service.js';
import { deriveSessionTitle } from './prompt-builder.service.js';

/** How many prior turns are replayed to the model. Bounds tokens per request. */
export const TUTOR_HISTORY_TURNS = 12;

/**
 * The quiz attempts that count as "in progress on this lesson", as a query.
 * Kept pure and exported so the exact rule is tested without a database.
 */
export function quizInProgressWhere(
  userId: string,
  lessonId: string,
  moduleId: string
): Prisma.QuizAttemptWhereInput {
  return {
    userId,
    status: 'IN_PROGRESS',
    quiz: {
      OR: [
        // A quiz hosted on this lesson.
        { lessonId },
        // A quiz hosted on this lesson's chapter.
        { moduleId },
        // A chapter quiz hosted on another lesson of the same chapter.
        { lesson: { moduleId } },
        // Any quiz with a question about this lesson.
        { questions: { some: { lessonId } } }
      ]
    }
  };
}

type SessionWithCount = TutorSession & { _count: { messages: number } };

function toSummaryDto(session: SessionWithCount): TutorSessionSummaryDto {
  return {
    id: session.id,
    title: session.title,
    classLevel: session.classLevel,
    subject: session.subject,
    lessonId: session.lessonId,
    messageCount: session._count.messages,
    lastActiveAt: session.lastActiveAt.toISOString(),
    createdAt: session.createdAt.toISOString()
  };
}

function toMessageDto(message: TutorMessage): TutorMessageDto {
  return {
    id: message.id,
    role: message.role,
    inputKind: message.inputKind,
    content: message.content,
    mode: (message.mode as TutorQuickAction | null) ?? null,
    createdAt: message.createdAt.toISOString()
  };
}

export class TutorSessionService {
  /**
   * Resolves the class level for a new session: an explicit override wins (a
   * Class 8 student revising Class 6), otherwise the onboarded profile value.
   */
  private async resolveClassLevel(
    userId: string,
    override?: ClassLevel
  ): Promise<ClassLevel> {
    if (override) return override;

    const profile = await studentProfileService.getProfile(userId);

    if (!profile) {
      throw new BadRequestError(
        'Tell us which class you are in before starting a session with ED.'
      );
    }

    return profile.classLevel;
  }

  /**
   * Asserts a lesson may be attached to this student's tutor session.
   *
   * Server-side isolation. The frontend hides out-of-class courses, but
   * `POST /tutor/sessions { lessonId }` previously accepted any lesson that
   * merely existed — so a Class 6 student could attach a legacy
   * "Distributed Systems" lesson and have it injected into ED's prompt as
   * course context. Hiding it in the UI was never protection.
   *
   * Three things must hold:
   *   1. the lesson exists and is published,
   *   2. its course is published,
   *   3. its course slug is curriculum approved for THIS student's class.
   *
   * The class comes from the stored profile, never from the request. The
   * optional `classLevel` override on session creation only affects how ED
   * pitches its language — it deliberately cannot widen what content is
   * reachable, or it would be a trivial escalation path.
   *
   * Every failure raises the same generic NotFoundError. A student must not be
   * able to tell "this lesson doesn't exist" from "this lesson exists but
   * belongs to another class", because that difference enumerates the catalogue.
   */
  private async assertLessonUsableAsContext(lessonId: string, userId: string): Promise<string> {
    // One generic failure for every rejection reason.
    const reject = () => {
      throw new NotFoundError('Lesson not found');
    };

    const profile = await studentProfileService.getProfile(userId);
    if (!profile) reject();

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        isPublished: true,
        module: {
          select: {
            course: { select: { slug: true, isPublished: true } }
          }
        }
      }
    });

    if (!lesson || !lesson.isPublished) reject();
    if (!lesson!.module.course.isPublished) reject();

    if (!isCourseVisibleToClass(lesson!.module.course.slug, profile!.classLevel)) {
      reject();
    }

    // Returned so the caller can derive the subject from the course rather than
    // from anything the client sent.
    return lesson!.module.course.slug;
  }

  /**
   * Confirms a module may be used as this student's chapter context.
   *
   * The sibling of assertLessonUsableAsContext, and deliberately separate from
   * the gate the from-chapter endpoint already ran: the context is validated
   * twice, independently, so a future caller cannot attach a chapter by
   * skipping one of them. Same allowlist, same stored profile, same generic
   * refusal - a Class 6 student probing a Class 8 module id must not be able
   * to tell a real chapter from an invented one.
   *
   * Returns the course slug so the subject is derived from the chapter's own
   * course rather than from anything the caller said.
   */
  private async assertModuleUsableAsContext(moduleId: string, userId: string): Promise<string> {
    const reject = (): never => {
      throw new NotFoundError('Chapter not found');
    };

    const profile = await studentProfileService.getProfile(userId);
    if (!profile) reject();

    const chapter = await prisma.module.findUnique({
      where: { id: moduleId },
      select: {
        course: { select: { slug: true, isPublished: true } }
      }
    });

    if (!chapter) reject();
    if (!chapter!.course.isPublished) reject();

    if (!isCourseVisibleToClass(chapter!.course.slug, profile!.classLevel)) {
      reject();
    }

    return chapter!.course.slug;
  }

  /**
   * Context only the server may set.
   *
   * Deliberately a separate parameter rather than a field on
   * CreateTutorSessionInput: that type is what createTutorSessionSchema parses
   * from the request body, so anything added to it becomes client-settable.
   * Keeping the chapter anchor out here means there is no request a student
   * can make that sets it - the property holds by construction, not by
   * validation.
   */
  public async createSession(
    user: SafeUser,
    input: CreateTutorSessionInput,
    serverContext?: {
      /** Supplied only by createSessionFromChapter, after its own gate. */
      moduleId?: string;
      /** The validated chapter title, for a session title worth reading. */
      chapterTitle?: string;
    }
  ): Promise<TutorSessionDetailDto> {
    const classLevel = await this.resolveClassLevel(user.id, input.classLevel);

    // Validate both anchors BEFORE creating anything, so an invalid context
    // can never be attached to a persisted session.
    let curriculumSlug: string | null = null;
    if (input.lessonId) {
      curriculumSlug = await this.assertLessonUsableAsContext(input.lessonId, user.id);
    }

    // A chapter anchor is stored only when there is no topic anchor. A session
    // is about a topic or about a chapter, never recorded as both - which is
    // also what keeps the two columns from being able to contradict.
    let moduleId: string | null = null;
    if (serverContext?.moduleId && !input.lessonId) {
      curriculumSlug = await this.assertModuleUsableAsContext(serverContext.moduleId, user.id);
      moduleId = serverContext.moduleId;
    }

    // Subject resolution, in order of how much it can be trusted:
    //
    //   1. The course this session is attached to. Server-resolved, so a client
    //      cannot claim to be doing Maths inside a Science lesson, and it does
    //      not depend on the student's wording.
    //   2. An explicitly chosen subject, which is how the Learn subject tiles
    //      open a session with no lesson.
    //   3. A keyword guess from the question, for a free-form homepage ask.
    //      Without this the prompt has no subject framing at all.
    const subject =
      (curriculumSlug ? subjectForCourseSlug(curriculumSlug) : null) ??
      input.subject ??
      (input.message ? inferSubjectFromQuestion(input.message) : null);

    // A chapter session's opening message is a composed paragraph, so
    // deriveSessionTitle would truncate it to "I am starting \"Diversity in
    // the Li...". The chapter name is the useful title, and it comes from the
    // module row this method just validated - never from the message text.
    const title = serverContext?.chapterTitle
      ? serverContext.chapterTitle
      : input.message
        ? deriveSessionTitle(input.message)
        : 'New session';

    const session = await prisma.tutorSession.create({
      data: {
        userId: user.id,
        lessonId: input.lessonId ?? null,
        moduleId,
        classLevel,
        subject,
        title
      },
      include: { _count: { select: { messages: true } } }
    });

    return { ...toSummaryDto(session), messages: [] };
  }

  public async listSessions(
    userId: string,
    limit: number
  ): Promise<TutorSessionSummaryDto[]> {
    const sessions = await prisma.tutorSession.findMany({
      where: { userId, closedAt: null },
      orderBy: { lastActiveAt: 'desc' },
      take: limit,
      include: { _count: { select: { messages: true } } }
    });

    return sessions.map(toSummaryDto);
  }

  /**
   * The stored body of a session's lesson, for the outage fallback only.
   *
   * Read separately, and only when every AI route has failed, so the page body
   * stays out of the per-turn query (see getOwnedSession). Read-only. Returns
   * null unless the lesson and its course are still published - the same rows
   * the session was authorised against, re-checked rather than trusted.
   */
  public async getLessonFallbackSource(
    lessonId: string
  ): Promise<{ title: string; content: string } | null> {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        title: true,
        content: true,
        isPublished: true,
        module: { select: { course: { select: { isPublished: true } } } }
      }
    });
    if (!lesson || !lesson.isPublished || !lesson.module.course.isPublished) return null;
    if (!lesson.content) return null;
    return { title: lesson.title, content: lesson.content };
  }

  /**
   * Whether this student has a quiz in progress that covers this lesson.
   *
   * Read-only, and only asked when the outage fallback is about to show
   * lesson text. "In progress" is any IN_PROGRESS attempt by this student on
   * a quiz hosted on this lesson, on its chapter, on another lesson in its
   * chapter, or containing a question about this lesson. A timed attempt that
   * has run out but was never closed still counts - it is only marked expired
   * when the student next opens the quiz - which errs towards not showing the
   * text. An unknown lesson counts as in progress for the same reason.
   */
  public async hasQuizInProgressForLesson(userId: string, lessonId: string): Promise<boolean> {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { moduleId: true }
    });
    if (!lesson) return true;
    const attempt = await prisma.quizAttempt.findFirst({
      where: quizInProgressWhere(userId, lessonId, lesson.moduleId),
      select: { id: true }
    });
    return attempt !== null;
  }

  /**
   * Loads a session and asserts ownership. Every tutor read and write goes
   * through here, so a student can never reach another student's conversation.
   */
  public async getOwnedSession(sessionId: string, userId: string) {
    const session = await prisma.tutorSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: { select: { messages: true } },
        lesson: {
          select: {
            title: true,
            description: true,
            // The reviewed teaching brief, read from the row on every turn
            // like the rest of the curriculum context. `content` - the page
            // body a student reads - is deliberately still not selected.
            teachingBrief: true,
            moduleId: true,
            // The chapter and the course slug are loaded because ED needs
            // them: the slug resolves the NCERT textbook name, and the module
            // title is the official chapter. Both are server-resolved through
            // the Lesson -> Module -> Course chain, so a client cannot name
            // the chapter it claims to be in.
            module: {
              select: {
                id: true,
                title: true,
                course: { select: { title: true, slug: true } }
              }
            }
          }
        },
        // The chapter anchor, for a session about a chapter that has no
        // topics. Loaded on every read so the context is rebuilt from rows
        // rather than recovered from the conversation.
        module: {
          select: {
            id: true,
            title: true,
            course: { select: { title: true, slug: true } }
          }
        }
      }
    });

    if (!session) {
      throw new NotFoundError('Tutor session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenError('This is not your tutor session');
    }

    return session;
  }

  public async getSessionDetail(
    sessionId: string,
    userId: string
  ): Promise<TutorSessionDetailDto> {
    const session = await this.getOwnedSession(sessionId, userId);

    const messages = await prisma.tutorMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });

    return { ...toSummaryDto(session), messages: messages.map(toMessageDto) };
  }

  /** The last N turns, oldest first, for replay into the model. */
  public async getRecentHistory(sessionId: string): Promise<TutorMessageDto[]> {
    const messages = await prisma.tutorMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: TUTOR_HISTORY_TURNS
    });

    return messages.reverse().map(toMessageDto);
  }

  /**
   * Persists the student's turn before streaming starts, so their question
   * survives a dropped connection.
   *
   * Retrying a failed turn must not duplicate it. When ED fails, the student's
   * message is already stored but no reply follows it - and the obvious thing
   * for a student to do after "ED is having trouble connecting" is send the
   * same question again. Without this, every retry appended another copy, and
   * the transcript filled with the same question two or three times over.
   *
   * The signal is precise: the LAST message in the session being a STUDENT
   * message means the previous turn produced no reply. If the new text matches
   * it, this is a retry of that turn, so the existing row is reused. Different
   * text means the student rephrased, which is a genuine new turn.
   */
  public async appendStudentMessage(
    sessionId: string,
    content: string,
    mode: TutorQuickAction | null,
    inputKind: 'TEXT' | 'IMAGE' = 'TEXT'
  ): Promise<TutorMessageDto> {
    const last = await prisma.tutorMessage.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    });

    if (
      last &&
      last.role === 'STUDENT' &&
      last.content === content &&
      last.inputKind === inputKind &&
      inputKind !== 'IMAGE'
    ) {
      return toMessageDto(last);
    }

    const message = await prisma.tutorMessage.create({
      data: { sessionId, role: 'STUDENT', inputKind, content, mode }
    });

    return toMessageDto(message);
  }

  /**
   * Persists ED's reply and bumps the session's activity timestamp. Called after
   * the stream completes so a half-written answer is never stored.
   */
  public async appendEdMessage(
    sessionId: string,
    content: string
  ): Promise<TutorMessageDto> {
    const [message] = await prisma.$transaction([
      prisma.tutorMessage.create({
        data: { sessionId, role: 'ED', inputKind: 'TEXT', content }
      }),
      prisma.tutorSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() }
      })
    ]);

    return toMessageDto(message);
  }

  /**
   * Backfills the subject on a session that started without one, e.g. a session
   * opened empty and then asked a question.
   */
  public async ensureSubject(sessionId: string, fromMessage: string): Promise<SubjectKey | null> {
    const inferred = inferSubjectFromQuestion(fromMessage);
    if (!inferred) return null;

    await prisma.tutorSession.update({
      where: { id: sessionId },
      data: { subject: inferred }
    });

    return inferred;
  }

  /** Titles a session from its first real question, replacing the placeholder. */
  public async ensureTitle(sessionId: string, fromMessage: string): Promise<void> {
    const session = await prisma.tutorSession.findUnique({
      where: { id: sessionId },
      select: { title: true }
    });

    if (!session || session.title !== 'New session') return;

    await prisma.tutorSession.update({
      where: { id: sessionId },
      data: { title: deriveSessionTitle(fromMessage) }
    });
  }

  public async closeSession(sessionId: string, userId: string): Promise<void> {
    await this.getOwnedSession(sessionId, userId);
    await prisma.tutorSession.update({
      where: { id: sessionId },
      data: { closedAt: new Date() }
    });
  }
}

export const tutorSessionService = new TutorSessionService();
