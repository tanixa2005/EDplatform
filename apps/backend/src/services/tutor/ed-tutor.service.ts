import type {
  SafeUser,
  TutorQuickAction,
  TutorTurnInput
} from '@edplatform/shared';
import { prisma } from '../../config/prisma.config.js';
import { BadRequestError } from '../../errors/app.error.js';
import type { AIMessage } from '../ai/ai-provider.interface.js';
import { streamWithFallback } from '../ai/provider.factory.js';
import { studentProfileService } from '../student-profile.service.js';
import {
  ACTION_TRANSCRIPT_TEXT,
  buildTutorSystemPrompt
} from './prompt-builder.service.js';
import { tutorSessionService } from './tutor-session.service.js';

export interface TutorTurnResult {
  /** The student turn that was persisted before streaming started. */
  studentMessageId: string;
  /** ED's full reply, persisted once the stream completed. */
  reply: string;
  edMessageId: string;
}

export class EdTutorService {
  /**
   * Runs one tutoring turn on a persistent session.
   *
   * Order matters: the student's turn is persisted first so it survives a dropped
   * connection, then ED's reply is streamed to the client and only persisted once
   * the stream finishes - a half-written answer is never stored.
   */
  public async streamTurn(
    user: SafeUser,
    sessionId: string,
    input: TutorTurnInput,
    onChunk: (chunk: string) => Promise<void> | void
  ): Promise<TutorTurnResult> {
    const session = await tutorSessionService.getOwnedSession(sessionId, user.id);
    const profile = await studentProfileService.getProfile(user.id);

    const action: TutorQuickAction | null = input.action ?? null;
    const studentText = input.message ?? (action ? ACTION_TRANSCRIPT_TEXT[action] : '');

    if (!studentText) {
      throw new BadRequestError('Send a message or pick a quick action');
    }

    // History must be read before the new turn is written, otherwise the model
    // sees the current question twice.
    const history = await tutorSessionService.getRecentHistory(sessionId);

    const studentMessage = await tutorSessionService.appendStudentMessage(
      sessionId,
      studentText,
      action
    );

    if (input.message) {
      await tutorSessionService.ensureTitle(sessionId, input.message);
    }

    const systemPrompt = buildTutorSystemPrompt({
      // The session snapshot wins: a student who moves up a class should not have
      // an in-flight conversation change its teaching level mid-way.
      classLevel: session.classLevel,
      subject: session.subject,
      language: profile?.preferredLanguage ?? 'ENGLISH',
      explanationStyle: profile?.preferredExplanationStyle ?? 'SIMPLE',
      studentFirstName: user.firstName || null,
      lessonTitle: session.lesson?.title ?? null,
      courseTitle: session.lesson?.module.course.title ?? null,
      action
    });

    const providerHistory: AIMessage[] = history.map((message) => ({
      role: message.role === 'STUDENT' ? 'user' : 'model',
      text: message.content
    }));

    let reply = '';

    await streamWithFallback({
      systemPrompt,
      userPrompt: studentText,
      history: providerHistory,
      onChunk: async (chunk) => {
        reply += chunk;
        await onChunk(chunk);
      }
    });

    const edMessage = await tutorSessionService.appendEdMessage(
      sessionId,
      reply.trim() ||
        "Sorry, I lost my train of thought there. Could you ask me that again?"
    );

    return {
      studentMessageId: studentMessage.id,
      reply,
      edMessageId: edMessage.id
    };
  }

  /**
   * Subject-aware starter prompts for the home screen, picked from the subjects
   * the student chose during onboarding and pitched at their class.
   */
  public async getSuggestedPrompts(userId: string): Promise<string[]> {
    const profile = await studentProfileService.getProfile(userId);
    const classLevel = profile?.classLevel ?? 'CLASS_7';
    const subjects = profile?.subjects ?? ['MATH', 'SCIENCE'];

    const bySubject: Record<string, Record<string, string[]>> = {
      MATH: {
        CLASS_6: ['Explain fractions', 'Quiz me on integers', 'What is a decimal?'],
        CLASS_7: ['Explain fractions', 'Quiz me on integers', 'Help me with ratios'],
        CLASS_8: ['Explain linear equations', 'Quiz me on exponents', 'Help me with mensuration']
      },
      SCIENCE: {
        CLASS_6: ['Why do plants need sunlight?', "I don't understand photosynthesis"],
        CLASS_7: ["I don't understand photosynthesis", 'Explain acids and bases'],
        CLASS_8: ['Explain force and pressure', "I don't understand cell structure"]
      },
      SOCIAL_SCIENCE: {
        CLASS_6: ['Explain how a map works', 'Who were the early humans?'],
        CLASS_7: ['Explain the Mughal empire simply', 'What is a democracy?'],
        CLASS_8: ['Explain the Indian Constitution', 'Why did the 1857 revolt happen?']
      },
      ENGLISH: {
        CLASS_6: ['What is a noun?', 'Help me write a short paragraph'],
        CLASS_7: ['Explain active and passive voice', 'Help me summarise a story'],
        CLASS_8: ['Explain figures of speech', 'Help me write a formal letter']
      }
    };

    const prompts: string[] = [];
    for (const subject of subjects) {
      const forSubject = bySubject[subject]?.[classLevel] ?? [];
      if (forSubject.length > 0) prompts.push(forSubject[0]);
    }

    // Always offer the homework entry point; it is the most common real need.
    prompts.push('Help me with this homework');

    // Top up from the student's first subject so the row is never sparse.
    const firstSubject = subjects[0] ?? 'MATH';
    for (const extra of bySubject[firstSubject]?.[classLevel] ?? []) {
      if (prompts.length >= 4) break;
      if (!prompts.includes(extra)) prompts.push(extra);
    }

    return prompts.slice(0, 4);
  }

  /** Recent sessions plus the student's class, for the home screen. */
  public async getHomeContext(userId: string) {
    const [profile, sessions, suggestedPrompts] = await Promise.all([
      studentProfileService.getProfile(userId),
      tutorSessionService.listSessions(userId, 3),
      this.getSuggestedPrompts(userId)
    ]);

    const lastQuizAttempt = await prisma.quizAttempt.findFirst({
      where: { userId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        percentage: true,
        quiz: { select: { title: true } }
      }
    });

    return {
      profile,
      recentSessions: sessions,
      suggestedPrompts,
      lastQuizAttempt: lastQuizAttempt
        ? {
            attemptId: lastQuizAttempt.id,
            quizTitle: lastQuizAttempt.quiz.title,
            percentage: Number(lastQuizAttempt.percentage)
          }
        : null
    };
  }
}

export const edTutorService = new EdTutorService();
