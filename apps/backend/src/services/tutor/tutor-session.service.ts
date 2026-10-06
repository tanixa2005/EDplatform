import type {
  ClassLevel,
  CreateTutorSessionInput,
  SafeUser,
  TutorMessageDto,
  TutorQuickAction,
  TutorSessionDetailDto,
  TutorSessionSummaryDto
} from '@edplatform/shared';
import type { TutorMessage, TutorSession } from '@prisma/client';
import { prisma } from '../../config/prisma.config.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../errors/app.error.js';
import { studentProfileService } from '../student-profile.service.js';
import { deriveSessionTitle } from './prompt-builder.service.js';

/** How many prior turns are replayed to the model. Bounds tokens per request. */
export const TUTOR_HISTORY_TURNS = 12;

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

  public async createSession(
    user: SafeUser,
    input: CreateTutorSessionInput
  ): Promise<TutorSessionDetailDto> {
    const classLevel = await this.resolveClassLevel(user.id, input.classLevel);

    if (input.lessonId) {
      const lesson = await prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: { id: true }
      });
      if (!lesson) {
        throw new NotFoundError('Lesson not found');
      }
    }

    const session = await prisma.tutorSession.create({
      data: {
        userId: user.id,
        lessonId: input.lessonId ?? null,
        classLevel,
        subject: input.subject ?? null,
        title: input.message ? deriveSessionTitle(input.message) : 'New session'
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
            module: { select: { course: { select: { title: true } } } }
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

  public async appendStudentMessage(
    sessionId: string,
    content: string,
    mode: TutorQuickAction | null
  ): Promise<TutorMessageDto> {
    const message = await prisma.tutorMessage.create({
      data: { sessionId, role: 'STUDENT', inputKind: 'TEXT', content, mode }
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
