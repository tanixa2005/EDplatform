import {
  AITutorStreamRequest,
  QuizMistakeAnalysisResult,
  QuestionMistakeAnalysis,
  quizMistakeAnalysisResultSchema,
  SafeUser,
} from '@edplatform/shared';
import { prisma } from '../../config/prisma.config.js';
import { env } from '../../config/env.config.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../errors/app.error.js';
import { IAITutorProvider, StreamParams } from './ai-provider.interface.js';
import { GeminiAITutorProvider } from './gemini.provider.js';
import { MockAITutorProvider } from './mock.provider.js';

export class AITutorService {
  private primaryProvider: IAITutorProvider;
  private mockProvider: MockAITutorProvider;

  constructor() {
    this.mockProvider = new MockAITutorProvider();

    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim() !== '') {
      this.primaryProvider = new GeminiAITutorProvider(env.GEMINI_API_KEY);
      console.log('🤖 AI Tutor initialized with official Gemini provider');
    } else {
      this.primaryProvider = this.mockProvider;
      console.log('🤖 AI Tutor initialized with Mock provider (GEMINI_API_KEY not set)');
    }
  }

  /**
   * Stream AI Tutor response via Server-Sent Events (SSE)
   */
  public async streamTutorResponse(
    user: SafeUser,
    input: AITutorStreamRequest,
    onChunk: (chunk: string) => Promise<void> | void
  ): Promise<void> {
    const { lessonId, mode, message, questionId, history = [] } = input;

    // 1. Fetch lesson, module, course context
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: {
              include: {
                enrollments: {
                  where: { userId: user.id },
                },
              },
            },
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }

    const course = lesson.module.course;

    // 2. Authorization check: User must be enrolled or course instructor or admin
    const isEnrolled = course.enrollments.length > 0;
    const isCourseInstructor = course.instructorId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isEnrolled && !isCourseInstructor && !isAdmin) {
      throw new ForbiddenError('You must be enrolled in this course to access the AI Tutor');
    }

    // 3. Construct Context Prompts based on Mode
    let systemPrompt = '';
    let userPromptWithContext = '';

    if (mode === 'study') {
      systemPrompt = `You are EDplatform's pedagogical AI Tutor, an encouraging and expert personal teacher.
Current Educational Context:
- Course: "${course.title}" (${course.description})
- Module: "${lesson.module.title}" (${lesson.module.description || 'No description'})
- Current Lesson: "${lesson.title}" (${lesson.description || 'No description'})

Teaching Guidelines:
1. Explain concepts thoroughly with clear, intuitive reasoning.
2. If code is discussed, explain each line step-by-step with clean markdown code blocks.
3. For mathematical formulas, ALWAYS format formulas with LaTeX notation: \\( inline \\) or \\[ display \\].
4. If the student asks for practice questions, provide thought-provoking questions with helpful answer criteria.
5. Keep your tone supportive, encouraging, and academically rigorous.
6. Ground your answers primarily in the concepts of "${course.title}" and specifically lesson "${lesson.title}".`;

      userPromptWithContext = message;
    } else {
      // mode === 'quiz' - SOCRATIC MODE
      let questionContext = '';

      if (questionId) {
        const question = await prisma.quizQuestion.findUnique({
          where: { id: questionId },
          include: {
            options: {
              select: {
                id: true,
                text: true,
                sortOrder: true,
                // CRITICAL SAFETY: isCorrect is NEVER fetched or passed to the prompt
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });

        if (question) {
          questionContext = `\nActive Quiz Question being viewed:
Question: "${question.prompt}"
Question Type: ${question.type}
Options available:
${question.options.map((opt, idx) => `  ${idx + 1}. ${opt.text}`).join('\n')}`;
        }
      }

      systemPrompt = `You are EDplatform's SOCRATIC QUIZ TUTOR.
The student is actively taking a graded or formative quiz.

Current Context:
- Course: "${course.title}"
- Lesson: "${lesson.title}"
${questionContext}

CRITICAL RULES (STRICTLY ENFORCED):
1. NEVER REVEAL THE DIRECT ANSWER OR CORRECT OPTION.
2. NEVER STATE WHICH OPTION NUMBER OR LETTER IS CORRECT OR INCORRECT.
3. NEVER say things like "The answer is...", "Option 1 is correct", or "Eliminate Option 3".
4. Use the Socratic method: Ask guiding questions, point to fundamental definitions, highlight key terms, and guide the student to deduce the answer themselves.
5. If the student directly asks "What's the answer?", politely decline and instead offer a hint or ask what their intuition is.
6. Help the student think critically about the concepts without compromising quiz integrity.`;

      userPromptWithContext = `Student query during quiz: ${message}`;
    }

    const streamParams: StreamParams = {
      systemPrompt,
      userPrompt: userPromptWithContext,
      history,
      onChunk,
    };

    try {
      await this.primaryProvider.generateStream(streamParams);
    } catch (err) {
      console.warn(`[AITutorService] Primary provider failed, falling back to mock provider:`, err);
      await this.mockProvider.generateStream(streamParams);
    }
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

    // 2. Authorization check: Must be owner or instructor or admin
    const course = attempt.quiz.lesson?.module.course || attempt.quiz.module?.course;
    const isOwner = attempt.userId === user.id;
    const isInstructor = course ? course.instructorId === user.id : false;
    const isAdmin = user.role === 'ADMIN';

    if (!isOwner && !isInstructor && !isAdmin) {
      throw new ForbiddenError('You are not authorized to view mistake analysis for this attempt');
    }

    // 3. Status check: Attempt must be submitted
    if (attempt.status !== 'SUBMITTED') {
      throw new BadRequestError('Quiz attempt is not submitted yet. Mistake analysis is only available after submission.');
    }

    // 4. Identify incorrect questions
    interface IncorrectQuestionData {
      questionId: string;
      questionText: string;
      userAnswerText: string;
      correctAnswerText: string;
      explanation?: string | null;
    }

    const incorrectQuestions: IncorrectQuestionData[] = [];
    const masteredConcepts: string[] = [];

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

        incorrectQuestions.push({
          questionId: question.id,
          questionText: question.prompt,
          userAnswerText,
          correctAnswerText,
          explanation: question.explanation,
        });
      } else {
        masteredConcepts.push(question.prompt.slice(0, 40) + '...');
      }
    }

    const percentageNum = Number(attempt.percentage);
    const lessonTitle = attempt.quiz.lesson?.title || attempt.quiz.title;

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
        generalFeedback: `Outstanding performance! You answered all ${attempt.quiz.questions.length} questions correctly with a perfect score of 100%. You have demonstrated comprehensive mastery over this topic.`,
        mistakes: [],
        strengths: [
          `Full mastery of ${attempt.quiz.title}`,
          'Accurate conceptual understanding and problem-solving',
          'High precision in applying core principles',
        ],
        recommendedTopics: [
          'Proceed confidently to the next lesson or advanced module.',
          'Consider attempting capstone projects or peer explanations.',
        ],
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
Instructor Explanation: ${q.explanation || 'None provided'}
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
        recommendedAction: `Revisit the section in "${lessonTitle}" addressing this concept.`,
        practicePrompt: `Can you explain in your own words why "${q.correctAnswerText}" is the valid principle here?`,
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
        generalFeedback: `You scored ${percentageNum}% on "${attempt.quiz.title}". Reviewing these ${incorrectQuestions.length} specific areas will help you master the material.`,
        mistakes: generatedMistakes,
        strengths: [
          'Active engagement with challenging problem sets',
          masteredConcepts.length > 0
            ? `Solid grasp on: ${masteredConcepts.slice(0, 2).join(', ')}`
            : 'Good persistence in completing the assessment',
        ],
        recommendedTopics: [
          `Review core concepts in ${lessonTitle}`,
          'Practice contrasting key definitions',
        ],
      };
    };

    try {
      const rawResult = await this.primaryProvider.generateStructured<{
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
            recommendedAction: aiMistake?.recommendedAction || `Review lesson "${lessonTitle}".`,
            practicePrompt: aiMistake?.practicePrompt || 'Try solving a similar problem to test your understanding.',
          };
        }),
        strengths: rawResult.strengths || ['Concept recall'],
        recommendedTopics: rawResult.recommendedTopics || [lessonTitle],
      };

      return quizMistakeAnalysisResultSchema.parse(finalResult);
    } catch (err) {
      console.warn('[AITutorService] Structured generation error, using fallback:', err);
      return fallbackGenerator();
    }
  }
}

export const aiTutorService = new AITutorService();
