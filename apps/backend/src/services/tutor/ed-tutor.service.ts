import type {
  SafeUser,
  TutorQuickAction,
  TutorTurnInput
} from '@edplatform/shared';
import { env } from '../../config/env.config.js';
import { prisma } from '../../config/prisma.config.js';
import { BadRequestError, ServiceUnavailableError } from '../../errors/app.error.js';
import type { AIMessage } from '../ai/ai-provider.interface.js';
import type { TutorImage } from '../ai/ai-provider.interface.js';
import { devDiagnosticSuffix } from '../ai/failure-diagnostics.js';
import { primaryProvider, streamWithFallback } from '../ai/provider.factory.js';
import { studentProfileService } from '../student-profile.service.js';
import {
  ACTION_TRANSCRIPT_TEXT,
  buildTutorSystemPrompt,
  detectImplicitAction
} from './prompt-builder.service.js';
import { lessonFallbackReply, lessonIntroduction } from './lesson-fallback.js';
import { resolveSessionCurriculum } from './session-curriculum.service.js';
import { tutorSessionService } from './tutor-session.service.js';

/** The outage reply for a lesson session, or null when its stored text is not suitable. */
async function lessonFallbackFor(lessonId: string): Promise<string | null> {
  try {
    const source = await tutorSessionService.getLessonFallbackSource(lessonId);
    const introduction = lessonIntroduction(source?.content);
    return source && introduction ? lessonFallbackReply(source.title, introduction) : null;
  } catch {
    // A database hiccup here must not replace the honest outage message.
    return null;
  }
}

export interface TutorTurnResult {
  /** The student turn that was persisted before streaming started. */
  studentMessageId: string;
  /** ED's full reply, persisted once the stream completed. */
  reply: string;
  edMessageId: string;
}

/**
 * What ED is asked when a student sends a photo and types nothing. Short,
 * natural, and age-appropriate - it is also the text stored for that turn.
 */
export const IMAGE_ONLY_PROMPT = 'Look at this image and explain what it shows.';

/**
 * What a student is told when they attach a photo ED cannot read.
 *
 * Specific rather than generic, and honest rather than flattering: it names
 * the real limitation, does not imply ED glanced at the picture, and points at
 * the thing that does work. "ED is having trouble connecting" was none of
 * those - it blamed the network for a capability the product does not have.
 */
const IMAGE_UNSUPPORTED_MESSAGE =
  "ED can't look at photos yet - the tutor model in use right now reads text only, so your picture has not been seen. Type out the question and ED will work through it with you.";

/**
 * What a student is told when the photo route exists but did not answer.
 *
 * Distinct from the text-outage message on purpose. A student who sent a photo
 * and is told "ED is having trouble connecting" will reasonably retry the same
 * photo forever; this says it is the photo path, and that typing still works.
 * It also says outright that the picture was not seen, so a reply is never
 * mistaken for an answer about their image.
 */
const IMAGE_UNAVAILABLE_MESSAGE =
  "ED couldn't look at your photo just now, so it has not been seen. Try again in a moment, or type the question and ED will help with that.";

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
    onChunk: (chunk: string) => Promise<void> | void,
    /**
     * At most one already-validated, already-EXIF-stripped image for this turn.
     * Produced by image-validation.service; this method never sees raw upload
     * bytes and never persists what it is given.
     */
    images: TutorImage[] = []
  ): Promise<TutorTurnResult> {
    const session = await tutorSessionService.getOwnedSession(sessionId, user.id);
    const profile = await studentProfileService.getProfile(user.id);

    // An explicitly tapped action always wins. Otherwise, read the message for
    // typed confusion so "I still don't understand" behaves like the button.
    const action: TutorQuickAction | null =
      input.action ?? (input.message ? detectImplicitAction(input.message) : null);

    const hasImage = images.length > 0;

    // Checked here, before the student's turn is written and before a single
    // byte is uploaded.
    //
    // The image was always being sent correctly - base64 inside a standard
    // OpenAI image_url part - but the configured tutoring model reads text
    // only, so the route refused it and the refusal surfaced as "ED is having
    // trouble connecting right now". Nothing was wrong with the connection,
    // and the student had no way to know their photo was the problem.
    //
    // Failing before anything is persisted matters: throwing later would leave
    // the question in the transcript with no answer under it.
    if (hasImage && !primaryProvider.supportsImages) {
      throw new BadRequestError(
        IMAGE_UNSUPPORTED_MESSAGE + devDiagnosticSuffix('photo · vision_not_configured', env.NODE_ENV)
      );
    }

    // A photo with no caption is a complete request, so it must not be sent as
    // an empty prompt. The default stands in for the question the student
    // obviously meant, and is also what gets persisted as the turn's text -
    // image bytes never go into TutorMessage.content.
    const studentText = input.message ?? (action ? ACTION_TRANSCRIPT_TEXT[action] : '');
    const effectiveText = studentText || (hasImage ? IMAGE_ONLY_PROMPT : '');

    if (!effectiveText) {
      throw new BadRequestError('Send a message or pick a quick action');
    }

    // History must be read before the new turn is written, otherwise the model
    // sees the current question twice.
    const history = await tutorSessionService.getRecentHistory(sessionId);

    const studentMessage = await tutorSessionService.appendStudentMessage(
      sessionId,
      effectiveText,
      action,
      hasImage ? 'IMAGE' : 'TEXT'
    );

    // Resolve the subject for this turn: the session's own subject, or a guess
    // from the question if the session started without one.
    let subject = session.subject;
    if (input.message) {
      await tutorSessionService.ensureTitle(sessionId, input.message);
      if (!subject) {
        subject = await tutorSessionService.ensureSubject(sessionId, input.message);
      }
    }

    // Curriculum context, assembled entirely from server-resolved rows and
    // rebuilt on EVERY turn.
    //
    // That matters more than it looks. The model is replayed only the last
    // TUTOR_HISTORY_TURNS messages, so anything that lives solely in the
    // conversation is gone after a few exchanges. Resolving from the session's
    // stored anchors instead means the context is identical on turn 1 and on
    // turn 50, survives a refresh, and survives reopening the session a week
    // later - and none of it is ever read back out of what was said.
    //
    // The client supplied at most a lessonId at session creation, and the
    // chapter anchor it cannot supply at all; neither can name the chapter,
    // the book, the course or the topic.
    const { curriculum, source: curriculumSource } = resolveSessionCurriculum(session);

    const systemPrompt = buildTutorSystemPrompt({
      // The session snapshot wins: a student who moves up a class should not have
      // an in-flight conversation change its teaching level mid-way.
      classLevel: session.classLevel,
      subject,
      language: profile?.preferredLanguage ?? 'ENGLISH',
      explanationStyle: profile?.preferredExplanationStyle ?? 'SIMPLE',
      studentFirstName: user.firstName || null,
      curriculum,
      action
    });

    const providerHistory: AIMessage[] = history.map((message) => ({
      role: message.role === 'STUDENT' ? 'user' : 'model',
      text: message.content
    }));

    let reply = '';

    try {
      await streamWithFallback({
        systemPrompt,
        userPrompt: effectiveText,
        history: providerHistory,
        // Typed side-channel so the Mock provider can answer at the right class
        // level and subject without parsing the assembled prompt. The live
        // provider ignores it.
        images,
        meta: {
          classLevel: session.classLevel,
          subject,
          action,
          studentFirstName: user.firstName || null,
          curriculum
        },
        onChunk: async (chunk) => {
          reply += chunk;
          await onChunk(chunk);
        }
      });
    } catch (err) {
      // A photo turn that fails says so in photo terms. There is deliberately
      // no fallback here: the text model is never handed the image, and no
      // answer is produced that could be read as being about the picture.
      if (hasImage && err instanceof ServiceUnavailableError) {
        const diagnostic = (err as { diagnostic?: string }).diagnostic ?? null;
        throw new ServiceUnavailableError(
          IMAGE_UNAVAILABLE_MESSAGE + devDiagnosticSuffix(diagnostic, env.NODE_ENV),
          'AI_VISION_UNAVAILABLE'
        );
      }

      // Every AI route failed before the student saw anything. In a session
      // about one lesson, show the lesson's own opening instead of a bare
      // error - verbatim stored text, labelled as such, never generated.
      // Anything else (a free chat, a partial reply, a lesson with no
      // suitable text) keeps the ordinary unavailable message.
      const outage =
        err instanceof ServiceUnavailableError && err.code === 'AI_PROVIDER_UNAVAILABLE';
      const fallback =
        outage && !hasImage && reply === '' && curriculumSource === 'topic' && session.lessonId
          ? await lessonFallbackFor(session.lessonId)
          : null;
      if (!fallback) throw err;

      console.error('[AI] all AI routes failed; served the lesson introduction instead');
      reply = fallback;
      await onChunk(fallback);
    }

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

    // Top up ACROSS subjects rather than from the first one.
    //
    // A student who picked only Science used to see three chips, two of them
    // Science - which reads as "ED only does Science". They still study four
    // subjects, and the starter row is the clearest signal of what ED covers,
    // so it spans the other subjects before repeating one.
    const ALL_SUBJECTS = ['MATH', 'SCIENCE', 'SOCIAL_SCIENCE', 'ENGLISH'];
    const unchosen = ALL_SUBJECTS.filter((subject) => !subjects.includes(subject as never));

    for (const subject of unchosen) {
      if (prompts.length >= 4) break;
      const first = bySubject[subject]?.[classLevel]?.[0];
      if (first && !prompts.includes(first)) prompts.push(first);
    }

    // Still short (an unusual class/subject combination): fall back to more
    // from the student's own subjects rather than leaving a sparse row.
    for (const subject of subjects) {
      for (const extra of bySubject[subject]?.[classLevel] ?? []) {
        if (prompts.length >= 4) break;
        if (!prompts.includes(extra)) prompts.push(extra);
      }
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
