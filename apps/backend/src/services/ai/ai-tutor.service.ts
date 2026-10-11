import {
  ChapterSessionInput,
  MistakeSessionInput,
  QuizHintInput,
  QuizMistakeAnalysisResult,
  QuestionMistakeAnalysis,
  quizMistakeAnalysisResultSchema,
  SafeUser,
} from '@edplatform/shared';
import { prisma } from '../../config/prisma.config.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../errors/app.error.js';
import type { CurriculumMeta, StreamMeta } from './ai-provider.interface.js';
import { primaryProvider, streamWithFallback } from './provider.factory.js';
import { quizService } from '../quiz.service.js';
import { studentProfileService } from '../student-profile.service.js';
import { buildTutorSystemPrompt } from '../tutor/prompt-builder.service.js';
import { tutorSessionService } from '../tutor/tutor-session.service.js';
import {
  resolveCurriculumChapterAccess,
  resolveCurriculumQuizAccess
} from '../curriculum-access.service.js';
import {
  curriculumMetaForTopic,
  resolveQuestionTopic,
  TOPIC_LESSON_SELECT,
  type QuizAnchor
} from '../question-topic.service.js';
import { subjectForCourseSlug, textbookForCourseSlug } from '@edplatform/shared';

/** An authorised hint, ready to stream. */
export interface PreparedQuizHint {
  systemPrompt: string;
  userPrompt: string;
  meta: StreamMeta;
}

export class AITutorService {

  /**
   * Stream AI Tutor response via Server-Sent Events (SSE)
   */
  /**
   * One hint for the question the student is looking at right now.
   *
   * This replaces streamTutorResponse, which was the last AI surface built
   * before the C6-C11 access model existed. That version:
   *
   *   - authorised on course enrollment, so it refused every curriculum
   *     student (curriculum access is by class, and nobody is enrolled in a
   *     curriculum course) while admitting anyone holding a legacy enrollment;
   *   - loaded whatever questionId it was given with no join to anything the
   *     student could reach, so an enrolled student could read any question in
   *     the database, including another class's;
   *   - built its own system prompt, bypassing the ED safety rules, voice
   *     guide, class profile and curriculum layer entirely;
   *   - replayed up to twenty client-supplied history messages, letting a
   *     student fabricate things ED had supposedly already said.
   *
   * Here the question id is the only thing the client supplies. Authorisation
   * runs through verifyStudentQuizAccess - the same chokepoint every other
   * quiz endpoint uses - and the class, subject, course, chapter, topic and
   * question text are all read from the database afterwards. History is not
   * accepted at all: a hint is a single turn.
   *
   * The answer key is never selected. isCorrect is not read anywhere in this
   * method, so there is no correct answer in memory to leak however the
   * student phrases their question.
   */
  public async prepareQuizHint(user: SafeUser, input: QuizHintInput): Promise<PreparedQuizHint> {
    const question = await prisma.quizQuestion.findUnique({
      where: { id: input.questionId },
      select: {
        prompt: true,
        quizId: true,
        // The topic this question assesses. Loaded here so a hint on a
        // chapter quiz is pitched at the right topic rather than at whichever
        // one the quiz hangs off.
        lessonId: true,
        // The shared selection, so this path and resolveQuestionTopic can
        // never disagree about which fields a topic has. It carries the
        // reviewed teaching brief too, which is how a hint ends up pitched
        // with the same trusted material the tutor gets.
        lesson: { select: TOPIC_LESSON_SELECT },
        // Option TEXT only. isCorrect is deliberately absent.
        options: {
          select: { text: true },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!question) {
      // Same shape as an unauthorised question, so a real id cannot be
      // distinguished from a made-up one.
      throw new NotFoundError('Question not found');
    }

    // The authorisation decision. Throws for the wrong class, an unpublished
    // quiz, a legacy quiz the student is not enrolled in, or no profile.
    const quiz = await quizService.verifyStudentQuizAccess(question.quizId, user);

    // The topic the hint should be pitched at: this question's own, when it
    // names one inside the quiz's chapter, otherwise the quiz's host lesson -
    // which is what every hint used before C13.2.
    const topic = resolveQuestionTopic(
      { lessonId: question.lessonId, lesson: question.lesson },
      quiz as QuizAnchor
    );
    const lesson = topic.lesson;

    const curriculum: CurriculumMeta | null = curriculumMetaForTopic(lesson);

    const profile = await studentProfileService.getProfile(user.id);
    const subject = lesson ? subjectForCourseSlug(lesson.module.course.slug) : null;

    const systemPrompt = buildTutorSystemPrompt({
      classLevel: profile?.classLevel ?? 'CLASS_7',
      subject,
      language: profile?.preferredLanguage ?? 'ENGLISH',
      explanationStyle: profile?.preferredExplanationStyle ?? 'SIMPLE',
      studentFirstName: user.firstName || null,
      curriculum,
      action: 'hint',
      quizQuestion: {
        prompt: question.prompt,
        options: question.options.map((option) => option.text)
      }
    });

    // No history. A hint stands alone, and the only history this endpoint
    // could have used was supplied by the client.
    return {
      systemPrompt,
      userPrompt: input.message,
      meta: {
        classLevel: profile?.classLevel ?? 'CLASS_7',
        subject,
        action: 'hint',
        studentFirstName: user.firstName || null,
        curriculum
      }
    };
  }

  /**
   * Streams an already-authorised hint.
   *
   * Split from prepareQuizHint so the controller can authorise BEFORE it opens
   * the SSE response. When headers go out first, every refusal has to be
   * delivered as an error frame inside a 200, which tells a client the request
   * succeeded when it did not - and made three of this suite's security tests
   * pass a 200 straight through.
   */
  public async streamPreparedQuizHint(
    prepared: PreparedQuizHint,
    onChunk: (chunk: string) => Promise<void> | void
  ): Promise<void> {
    await streamWithFallback({ ...prepared, onChunk });
  }

  /**
   * Opens a tutor session about one question the student got wrong.
   *
   * The client sends an attempt id and a question id. Everything ED is told -
   * the question, what the student picked, what was correct, the explanation,
   * and the whole curriculum chain - is read here from rows the student has
   * already been proven to own. There is deliberately no way to pass that
   * content in: a student who could supply "the correct answer" could have ED
   * confirm an invented one, and a student who could supply a lesson id could
   * drag another class's context into the conversation.
   *
   * Authorisation runs in the same order as the rest of the attempt
   * endpoints - curriculum class gate, then ownership, then status - so a
   * student probing another class gets the same generic "not found" as someone
   * using an id that does not exist.
   */
  /**
   * Opens an ED session about a chapter that has no written topics yet.
   *
   * Eleven of the twelve Class 6 Science chapters tell a student they "can
   * still ask ED anything from this chapter" and gave them no way to do it.
   * This is that way.
   *
   * The client sends one id. The chapter title, the textbook, the course, the
   * class and the subject are all read from rows the student has been proven
   * to be entitled to, and the opening message is composed here - so a client
   * cannot name a chapter it has no right to, nor claim to be in a different
   * class while asking about one.
   *
   * KNOWN LIMITATION, stated rather than hidden. TutorSession can anchor to a
   * Lesson and nothing else, so a chapter with no lessons cannot be stored as
   * the session's context without a schema change. The session therefore
   * carries the server-derived subject and class, and names the chapter in its
   * opening message - which stays in the conversation history for every later
   * turn. What it does not get is the WHERE THE STUDENT IS RIGHT NOW prompt
   * layer, because that layer describes a topic and there is no topic. No
   * lesson id is invented to fake one.
   */
  public async createSessionFromChapter(
    user: SafeUser,
    input: ChapterSessionInput
  ): Promise<{ sessionId: string; openingMessage: string }> {
    const chapter = await prisma.module.findUnique({
      where: { id: input.moduleId },
      select: {
        title: true,
        course: { select: { title: true, slug: true, isPublished: true } },
        _count: { select: { lessons: true } }
      }
    });

    // One generic refusal for a missing chapter and for one belonging to
    // another class, so this cannot be used to discover which ids are real.
    if (!chapter) {
      throw new NotFoundError('Chapter not found');
    }

    const outcome = await resolveCurriculumChapterAccess(
      { courseSlug: chapter.course.slug, courseIsPublished: chapter.course.isPublished },
      user
    );

    // Legacy marketplace modules are not part of the curriculum and have no
    // "ask ED about this chapter" affordance. Refusing with the same message
    // keeps the endpoint from reporting which courses are which.
    if (outcome !== 'granted') {
      throw new NotFoundError('Chapter not found');
    }

    const textbook = textbookForCourseSlug(chapter.course.slug);
    const subject = subjectForCourseSlug(chapter.course.slug);

    const openingMessage = [
      `I am starting "${chapter.title}" in ${chapter.course.title}` +
        (textbook ? ` (${textbook})` : '') +
        '.',
      '',
      'We have not covered it yet, so can you introduce it? What is this chapter about, and what should I understand first?'
    ].join('\n');

    // No lessonId: there is no topic to attach, and inventing one would put
    // unrelated curriculum context in front of the student. The chapter goes
    // in as server context instead - createSession re-validates it against the
    // stored profile, so the anchor is checked twice independently - and the
    // subject comes from the course slug, never from the request.
    //
    // Before C13.4 the module id was discarded here and the chapter survived
    // only as text in the opening message, which the history window drops
    // after six exchanges.
    const session = await tutorSessionService.createSession(
      user,
      { message: openingMessage, subject: subject ?? undefined },
      { moduleId: input.moduleId, chapterTitle: chapter.title }
    );

    return { sessionId: session.id, openingMessage };
  }

  public async createSessionFromMistake(
    user: SafeUser,
    input: MistakeSessionInput
  ): Promise<{ sessionId: string; openingMessage: string }> {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: input.attemptId },
      include: {
        quiz: {
          include: {
            lesson: { include: { module: { include: { course: true } } } },
            module: { include: { course: true } },
            questions: {
              include: {
                options: { orderBy: { sortOrder: 'asc' } },
                // The topic this particular question assesses, which is not
                // necessarily the topic the quiz hangs off.
                lesson: { include: { module: { include: { course: true } } } }
              }
            }
          }
        },
        answers: true
      }
    });

    // One generic shape for every refusal below, so this endpoint cannot be
    // used as an oracle for which attempts or questions exist.
    const reject = (): never => {
      throw new NotFoundError('That question is not available');
    };

    if (!attempt) reject();

    const course = attempt!.quiz.lesson?.module.course ?? attempt!.quiz.module?.course;
    if (!course) reject();

    // 1. Curriculum class gate, before ownership.
    await resolveCurriculumQuizAccess(
      {
        courseSlug: course!.slug,
        courseIsPublished: course!.isPublished,
        lessonIsPublished: attempt!.quiz.lesson ? attempt!.quiz.lesson.isPublished : null,
        quizIsPublished: attempt!.quiz.isPublished
      },
      user
    );

    // 2. Ownership.
    if (attempt!.userId !== user.id) reject();

    // 3. The attempt has to be finished, or the answers are not final and the
    //    correct answer is not yet something the student is allowed to see.
    if (attempt!.status !== 'SUBMITTED') reject();

    // 4. The question must belong to THIS attempt's quiz, and the student must
    //    actually have answered it. Both checks matter: the first stops a
    //    question from another quiz, the second binds it to this attempt.
    const question = attempt!.quiz.questions.find((q) => q.id === input.questionId);
    if (!question) reject();

    const answer = attempt!.answers.find((a) => a.questionId === input.questionId);
    if (!answer) reject();

    // 5. Build the opening message from stored rows only.
    const selectedIds = Array.isArray(answer!.selectedOptionIds)
      ? (answer!.selectedOptionIds as string[])
      : [];
    const chosen = question!.options.filter((o) => selectedIds.includes(o.id));
    const correct = question!.options.filter((o) => o.isCorrect);

    const chosenText = chosen.length > 0 ? chosen.map((o) => o.text).join(', ') : 'nothing';
    const correctText = correct.map((o) => o.text).join(', ');

    const lines = [
      'I got this wrong in my practice quiz and I want to understand it properly.',
      '',
      `Question: ${question!.prompt}`,
      `What I picked: ${chosenText}`,
      `The right answer: ${correctText}`
    ];
    if (question!.explanation) {
      lines.push(`What the explanation said: ${question!.explanation}`);
    }
    lines.push('', 'Can you explain what I got muddled about?');

    const openingMessage = lines.join('\n');

    // 6. An ordinary tutor session, anchored to the topic THIS question
    //    assesses rather than to whichever topic happens to host the quiz.
    //    Before C13.2 a chapter quiz sent every mistake to its host topic, so
    //    a student who missed "what science really is" opened a session about
    //    "getting good at science".
    //
    //    The lesson is still server-derived - it comes off the question row,
    //    never the request - and createSession re-validates it against the
    //    stored profile, so the curriculum context is checked twice
    //    independently.
    const topic = resolveQuestionTopic(question!, attempt!.quiz);

    const session = await tutorSessionService.createSession(user, {
      message: openingMessage,
      lessonId: topic.lesson?.id ?? undefined
    });

    return { sessionId: session.id, openingMessage };
  }

  /**
   * Analyze student mistakes on a completed quiz attempt
   */
  public async analyzeQuizMistakes(
    user: SafeUser,
    attemptId: string
  ): Promise<QuizMistakeAnalysisResult> {
    // 1. Fetch authoritative attempt data from PostgreSQL
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            lesson: {
              include: {
                module: {
                  include: {
                    course: true,
                  },
                },
              },
            },
            module: {
              include: {
                course: true,
              },
            },
            questions: {
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' },
                },
                // The topic this question assesses, which a chapter quiz's
                // host lesson does not answer.
                lesson: { include: { module: { include: { course: true } } } },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      throw new NotFoundError('Quiz attempt not found');
    }

    // 2. Curriculum class gate, before ownership.
    //
    // Ownership alone is not a class boundary. A student who sat this quiz in
    // Class 6 and later changed their class in Settings still OWNS the attempt,
    // so the check below would hand them Class 6 question text, the answer key
    // and the explanations - while every other attempt endpoint now refuses
    // them. This was the one endpoint in the attempt lifecycle C7 did not
    // reach.
    const analysisCourse = attempt.quiz.lesson?.module.course ?? attempt.quiz.module?.course;
    if (!analysisCourse) {
      throw new NotFoundError('Quiz attempt not found');
    }

    await resolveCurriculumQuizAccess(
      {
        courseSlug: analysisCourse.slug,
        courseIsPublished: analysisCourse.isPublished,
        lessonIsPublished: attempt.quiz.lesson ? attempt.quiz.lesson.isPublished : null,
        quizIsPublished: attempt.quiz.isPublished
      },
      user
    );

    // 3. Authorization check: a student may only analyse their own attempt.
    if (attempt.userId !== user.id) {
      throw new ForbiddenError('You are not authorized to view mistake analysis for this attempt');
    }

    // 3. Status check: Attempt must be submitted
    if (attempt.status !== 'SUBMITTED') {
      throw new BadRequestError('Quiz attempt is not submitted yet. Mistake analysis is only available after submission.');
    }

    // Already analysed? Reuse it.
    //
    // QuizAttempt.aiFeedback has existed in the schema since before this
    // feature and was never written to. A submitted attempt is immutable, so
    // its analysis is too - and re-opening the modal used to spend another
    // generation every time. Only the analysis itself is stored: it contains
    // this student's own questions and answers and nothing else.
    //
    // A stored value that no longer parses is ignored rather than trusted, so
    // a shape change can never feed malformed data to the UI.
    if (attempt.aiFeedback) {
      const cached = quizMistakeAnalysisResultSchema.safeParse(
        JSON.parse(attempt.aiFeedback) as unknown
      );
      if (cached.success) {
        return cached.data as QuizMistakeAnalysisResult;
      }
    }

    // 4. Identify incorrect questions
    interface IncorrectQuestionData {
      questionId: string;
      questionText: string;
      userAnswerText: string;
      correctAnswerText: string;
      explanation?: string | null;
      /**
       * The topic to send this student back to, resolved per question.
       *
       * This used to be one title for the whole attempt - the quiz's host
       * lesson - so every mistake in a chapter quiz recommended the same
       * topic regardless of what was missed.
       */
      topicTitle: string;
      /**
       * Enough to build a link to that topic, or undefined when there is
       * nothing safe to link to.
       *
       * Only set when the resolved lesson is published and its course slug is
       * known, so "worth re-reading" is a link exactly when the student can
       * actually open the page behind it, and plain text otherwise.
       */
      topicLessonId?: string;
      topicCourseSlug?: string;
    }

    const incorrectQuestions: IncorrectQuestionData[] = [];

    for (const question of attempt.quiz.questions) {
      const studentAnswer = attempt.answers.find((a) => a.questionId === question.id);
      const isCorrect = studentAnswer?.isCorrect ?? false;

      if (!isCorrect) {
        let userAnswerText = '(No answer provided)';
        if (studentAnswer && studentAnswer.selectedOptionIds) {
          const selectedIds = Array.isArray(studentAnswer.selectedOptionIds)
            ? (studentAnswer.selectedOptionIds as string[])
            : [];
          const selectedOpts = question.options.filter((o) => selectedIds.includes(o.id));
          if (selectedOpts.length > 0) {
            userAnswerText = selectedOpts.map((o) => o.text).join(', ');
          }
        }

        const correctOptions = question.options.filter((o) => o.isCorrect);
        const correctAnswerText = correctOptions.map((o) => o.text).join(', ');

        const topic = resolveQuestionTopic(question, attempt.quiz);

        // Linkable only when there is a published lesson behind it. The
        // resolver already enforces publication for a question's own topic,
        // but the quiz-anchor fallback does not, so it is checked here too -
        // an unpublished topic must degrade to plain text, never to a link
        // that 404s or, worse, one the student is not entitled to open.
        const canLink = Boolean(topic.lesson?.isPublished && topic.lesson.module.course.slug);

        incorrectQuestions.push({
          questionId: question.id,
          questionText: question.prompt,
          userAnswerText,
          correctAnswerText,
          explanation: question.explanation,
          topicTitle: topic.lesson?.title ?? attempt.quiz.title,
          topicLessonId: canLink ? topic.lesson!.id : undefined,
          topicCourseSlug: canLink ? topic.lesson!.module.course.slug : undefined,
        });
      }
    }

    const percentageNum = Number(attempt.percentage);

    // 5. If student got 100% correct
    if (incorrectQuestions.length === 0) {
      return {
        attemptId: attempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.title,
        score: attempt.score,
        percentage: percentageNum,
        passed: attempt.isPassed,
        totalQuestions: attempt.quiz.questions.length,
        incorrectQuestionsCount: 0,
        generalFeedback: `You got all ${attempt.quiz.questions.length} right, so there is nothing here to go back over.`,
        mistakes: [],
        strengths: [],
        recommendedTopics: [],
      };
    }

    // 6. Generate structured diagnostic analysis
    const systemPrompt = `You are an expert diagnostic educational tutor for EDplatform.
Analyze the student's mistakes on their completed quiz for "${attempt.quiz.title}".
Provide an empathetic, growth-mindset breakdown identifying the specific misconception behind each mistake and giving clear guidance.

Return ONLY a JSON object with this exact structure:
{
  "generalFeedback": "A 2-3 sentence encouraging diagnostic summary",
  "mistakes": [
    {
      "questionId": "ID matching the question",
      "concept": "Core concept tested (e.g., Asynchronous Event Loop)",
      "mistakeType": "One of: misconception | calculation_error | term_confusion | incomplete_knowledge | misread_question | other",
      "explanation": "Why the student's chosen answer was incorrect and why the correct answer is right conceptually",
      "recommendedAction": "Actionable advice on what specific lesson section or concept to review",
      "practicePrompt": "A quick follow-up practice question or challenge to verify their understanding"
    }
  ],
  "strengths": ["List 2-3 specific concepts they did well on"],
  "recommendedTopics": ["List 2-3 targeted topics to revisit"]
}`;

    const userPrompt = `Student Quiz Attempt Results:
Quiz: "${attempt.quiz.title}"
Score: ${attempt.score}/${attempt.quiz.questions.length} (${percentageNum}%)
Passed: ${attempt.isPassed}

Incorrect Questions:
${incorrectQuestions
  .map(
    (q, idx) => `
[Question ${idx + 1}]
ID: ${q.questionId}
Question: ${q.questionText}
Student Answer: ${q.userAnswerText}
Correct Answer: ${q.correctAnswerText}
Explanation: ${q.explanation || 'None provided'}
`
  )
  .join('\n')}`;

    // Fallback generator in case provider fails or in offline/mock mode
    const fallbackGenerator = (): QuizMistakeAnalysisResult => {
      const generatedMistakes: QuestionMistakeAnalysis[] = incorrectQuestions.map((q) => ({
        questionId: q.questionId,
        questionText: q.questionText,
        userAnswerText: q.userAnswerText,
        correctAnswerText: q.correctAnswerText,
        concept: q.questionText.split(' ').slice(0, 4).join(' '),
        mistakeType: 'misconception',
        explanation:
          q.explanation ||
          `You selected "${q.userAnswerText}", whereas "${q.correctAnswerText}" accurately aligns with the core principles taught in the lesson.`,
        recommendedAction: `Worth re-reading "${q.topicTitle}".`,
        practicePrompt: `Can you explain in your own words why "${q.correctAnswerText}" is the valid principle here?`,
        topicLessonId: q.topicLessonId,
        topicCourseSlug: q.topicCourseSlug,
      }));

      return {
        attemptId: attempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.title,
        score: attempt.score,
        percentage: percentageNum,
        passed: attempt.isPassed,
        totalQuestions: attempt.quiz.questions.length,
        incorrectQuestionsCount: incorrectQuestions.length,
        generalFeedback:
          incorrectQuestions.length === 1
            ? `You got ${attempt.quiz.questions.length - 1} of ${attempt.quiz.questions.length} right. Here is the one that did not go through.`
            : `You got ${attempt.quiz.questions.length - incorrectQuestions.length} of ${attempt.quiz.questions.length} right. Here are the ${incorrectQuestions.length} that did not go through.`,
        mistakes: generatedMistakes,
        // Deliberately empty rather than invented. The previous version listed
        // "Active engagement with challenging problem sets" and pasted
        // truncated question prompts in as concepts the student had mastered,
        // which read as nonsense ("Solid grasp on: You write down that a leaf
        // is green. You..."). Nothing true can be said here without a model,
        // and the UI hides both sections when they are empty.
        strengths: [],
        recommendedTopics: [],
      };
    };

    try {
      const rawResult = await primaryProvider.generateStructured<{
        generalFeedback: string;
        mistakes: Array<{
          questionId: string;
          concept: string;
          mistakeType: string;
          explanation: string;
          recommendedAction: string;
          practicePrompt: string;
        }>;
        strengths: string[];
        recommendedTopics: string[];
      }>({
        systemPrompt,
        userPrompt,
        fallbackGenerator: () => ({
          generalFeedback: fallbackGenerator().generalFeedback,
          mistakes: fallbackGenerator().mistakes.map((m) => ({
            questionId: m.questionId,
            concept: m.concept,
            mistakeType: m.mistakeType,
            explanation: m.explanation,
            recommendedAction: m.recommendedAction,
            practicePrompt: m.practicePrompt,
          })),
          strengths: fallbackGenerator().strengths,
          recommendedTopics: fallbackGenerator().recommendedTopics,
        }),
      });

      // Merge metadata with AI output and validate
      const finalResult: QuizMistakeAnalysisResult = {
        attemptId: attempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.title,
        score: attempt.score,
        percentage: percentageNum,
        passed: attempt.isPassed,
        totalQuestions: attempt.quiz.questions.length,
        incorrectQuestionsCount: incorrectQuestions.length,
        generalFeedback: rawResult.generalFeedback,
        mistakes: incorrectQuestions.map((iq) => {
          const aiMistake = rawResult.mistakes?.find((m) => m.questionId === iq.questionId);
          return {
            questionId: iq.questionId,
            questionText: iq.questionText,
            userAnswerText: iq.userAnswerText,
            correctAnswerText: iq.correctAnswerText,
            concept: aiMistake?.concept || 'Lesson Concept',
            mistakeType: (['misconception', 'calculation_error', 'term_confusion', 'incomplete_knowledge', 'misread_question', 'other'].includes(
              aiMistake?.mistakeType || ''
            )
              ? aiMistake?.mistakeType
              : 'misconception') as any,
            explanation: aiMistake?.explanation || iq.explanation || `The correct answer is "${iq.correctAnswerText}".`,
            recommendedAction: aiMistake?.recommendedAction || `Worth re-reading "${iq.topicTitle}".`,
            practicePrompt: aiMistake?.practicePrompt || 'Try solving a similar problem to test your understanding.',
            // Server-derived, never taken from the model's JSON: the link has
            // to point where the data says, not where a generation guessed.
            topicLessonId: iq.topicLessonId,
            topicCourseSlug: iq.topicCourseSlug,
          };
        }),
        strengths: rawResult.strengths || ['Concept recall'],
        // The distinct topics the missed questions actually came from, not
        // the single topic the quiz happens to hang off.
        recommendedTopics:
          rawResult.recommendedTopics || [...new Set(incorrectQuestions.map((iq) => iq.topicTitle))],
      };

      const validated = quizMistakeAnalysisResultSchema.parse(finalResult);

      // Store it so re-opening the modal costs nothing. Best effort: if the
      // write fails the student still gets their analysis, they just pay for
      // it again next time.
      try {
        await prisma.quizAttempt.update({
          where: { id: attempt.id },
          data: { aiFeedback: JSON.stringify(validated) }
        });
      } catch (cacheError) {
        console.warn('[AI] could not cache mistake analysis:', cacheError);
      }

      return validated;
    } catch (err) {
      console.warn('[AITutorService] Structured generation error, using fallback:', err);
      return fallbackGenerator();
    }
  }
}

export const aiTutorService = new AITutorService();
