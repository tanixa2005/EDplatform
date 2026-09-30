import {
  SubmitQuizAttemptInput,
  QuizAttemptSummaryDto,
  QuizAttemptResultDto,
  QuestionResultDto,
  SafeUser
} from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { quizService } from './quiz.service.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors/app.error.js';

export class QuizAttemptService {
  /**
   * Starts a new attempt or resumes an unexpired IN_PROGRESS attempt.
   */
  async startAttempt(quizId: string, user: SafeUser): Promise<QuizAttemptSummaryDto> {
    const quiz = await quizService.verifyStudentQuizAccess(quizId, user);

    // Check for existing IN_PROGRESS attempt
    const existing = await prisma.quizAttempt.findFirst({
      where: {
        quizId,
        userId: user.id,
        status: 'IN_PROGRESS'
      },
      orderBy: { startedAt: 'desc' }
    });

    if (existing) {
      if (quiz.timeLimitSeconds) {
        const elapsedSeconds = Math.floor((Date.now() - existing.startedAt.getTime()) / 1000);
        if (elapsedSeconds > quiz.timeLimitSeconds) {
          // Expired: finalize and allow starting fresh attempt
          await prisma.quizAttempt.update({
            where: { id: existing.id },
            data: {
              status: 'EXPIRED',
              submittedAt: new Date()
            }
          });
        } else {
          // Resume active attempt
          const remainingSeconds = Math.max(0, quiz.timeLimitSeconds - elapsedSeconds);
          return {
            id: existing.id,
            quizId: existing.quizId,
            userId: existing.userId,
            status: existing.status as any,
            startedAt: existing.startedAt.toISOString(),
            submittedAt: existing.submittedAt?.toISOString() || null,
            score: existing.score,
            earnedPoints: Number(existing.earnedPoints),
            totalPoints: existing.totalPoints,
            percentage: Number(existing.percentage),
            isPassed: existing.isPassed,
            timeLimitSeconds: quiz.timeLimitSeconds,
            remainingSeconds
          };
        }
      } else {
        return {
          id: existing.id,
          quizId: existing.quizId,
          userId: existing.userId,
          status: existing.status as any,
          startedAt: existing.startedAt.toISOString(),
          submittedAt: existing.submittedAt?.toISOString() || null,
          score: existing.score,
          earnedPoints: Number(existing.earnedPoints),
          totalPoints: existing.totalPoints,
          percentage: Number(existing.percentage),
          isPassed: existing.isPassed,
          timeLimitSeconds: null,
          remainingSeconds: null
        };
      }
    }

    // Create new attempt
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        userId: user.id,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        score: 0,
        isPassed: false
      }
    });

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      userId: attempt.userId,
      status: 'IN_PROGRESS',
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: null,
      score: 0,
      earnedPoints: 0,
      totalPoints: 0,
      percentage: 0,
      isPassed: false,
      timeLimitSeconds: quiz.timeLimitSeconds || null,
      remainingSeconds: quiz.timeLimitSeconds || null
    };
  }

  /**
   * Retrieves active IN_PROGRESS attempt if available and not expired.
   */
  async getActiveAttempt(quizId: string, user: SafeUser): Promise<QuizAttemptSummaryDto | null> {
    const existing = await prisma.quizAttempt.findFirst({
      where: {
        quizId,
        userId: user.id,
        status: 'IN_PROGRESS'
      },
      include: {
        quiz: {
          select: { timeLimitSeconds: true }
        }
      },
      orderBy: { startedAt: 'desc' }
    });

    if (!existing) return null;

    if (existing.quiz.timeLimitSeconds) {
      const elapsedSeconds = Math.floor((Date.now() - existing.startedAt.getTime()) / 1000);
      if (elapsedSeconds > existing.quiz.timeLimitSeconds) {
        await prisma.quizAttempt.update({
          where: { id: existing.id },
          data: {
            status: 'EXPIRED',
            submittedAt: new Date()
          }
        });
        return null;
      }

      return {
        id: existing.id,
        quizId: existing.quizId,
        userId: existing.userId,
        status: existing.status as any,
        startedAt: existing.startedAt.toISOString(),
        submittedAt: existing.submittedAt?.toISOString() || null,
        score: existing.score,
        earnedPoints: Number(existing.earnedPoints),
        totalPoints: existing.totalPoints,
        percentage: Number(existing.percentage),
        isPassed: existing.isPassed,
        timeLimitSeconds: existing.quiz.timeLimitSeconds,
        remainingSeconds: Math.max(0, existing.quiz.timeLimitSeconds - elapsedSeconds)
      };
    }

    return {
      id: existing.id,
      quizId: existing.quizId,
      userId: existing.userId,
      status: existing.status as any,
      startedAt: existing.startedAt.toISOString(),
      submittedAt: existing.submittedAt?.toISOString() || null,
      score: existing.score,
      earnedPoints: Number(existing.earnedPoints),
      totalPoints: existing.totalPoints,
      percentage: Number(existing.percentage),
      isPassed: existing.isPassed,
      timeLimitSeconds: null,
      remainingSeconds: null
    };
  }

  /**
   * Deterministic server-side scoring and submission.
   */
  async submitAttempt(
    attemptId: string,
    input: SubmitQuizAttemptInput,
    user: SafeUser
  ): Promise<QuizAttemptResultDto> {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });

    if (!attempt) throw new NotFoundError('Quiz attempt not found');
    if (attempt.userId !== user.id) {
      throw new ForbiddenError('You cannot submit another user\'s attempt');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestError('This quiz attempt has already been submitted or has expired');
    }

    // Authoritative Server Time Check
    if (attempt.quiz.timeLimitSeconds) {
      const elapsedSeconds = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
      // Grace period of 10 seconds for network latency
      if (elapsedSeconds > attempt.quiz.timeLimitSeconds + 10) {
        await prisma.quizAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'EXPIRED',
            submittedAt: new Date()
          }
        });
        throw new BadRequestError('Time limit exceeded. This attempt has expired.');
      }
    }

    // Map student answers by questionId
    const studentAnswersMap = new Map<string, string[]>();
    for (const ans of input.answers) {
      studentAnswersMap.set(ans.questionId, ans.selectedOptionIds);
    }

    let totalEarnedPoints = 0;
    let totalPossiblePoints = 0;
    const questionResults: QuestionResultDto[] = [];
    const answersToCreate: {
      questionId: string;
      selectedOptionIds: string[];
      isCorrect: boolean;
      pointsAwarded: number;
    }[] = [];

    // Deterministic evaluation per question
    for (const q of attempt.quiz.questions) {
      totalPossiblePoints += q.points;
      const selectedOptionIds = studentAnswersMap.get(q.id) || [];
      const correctOptionIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);

      let isQuestionCorrect = false;

      if (q.type === 'SINGLE_CHOICE' || q.type === 'TRUE_FALSE') {
        if (
          selectedOptionIds.length === 1 &&
          correctOptionIds.length === 1 &&
          selectedOptionIds[0] === correctOptionIds[0]
        ) {
          isQuestionCorrect = true;
        }
      } else if (q.type === 'MULTIPLE_CHOICE') {
        const selectedSet = new Set(selectedOptionIds);
        const correctSet = new Set(correctOptionIds);
        if (
          selectedSet.size === correctSet.size &&
          [...selectedSet].every((id) => correctSet.has(id))
        ) {
          isQuestionCorrect = true;
        }
      }

      const pointsAwarded = isQuestionCorrect ? q.points : 0;
      totalEarnedPoints += pointsAwarded;

      answersToCreate.push({
        questionId: q.id,
        selectedOptionIds,
        isCorrect: isQuestionCorrect,
        pointsAwarded
      });

      questionResults.push({
        questionId: q.id,
        prompt: q.prompt,
        type: q.type as any,
        points: q.points,
        pointsAwarded,
        isCorrect: isQuestionCorrect,
        selectedOptionIds,
        correctOptionIds,
        explanation: q.explanation,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect
        }))
      });
    }

    const percentage =
      totalPossiblePoints > 0 ? (totalEarnedPoints / totalPossiblePoints) * 100 : 0;
    const roundedScore = Math.round(percentage);
    const isPassed = roundedScore >= attempt.quiz.passingScore;
    const submittedAt = new Date();

    // Persist evaluation atomically
    await prisma.$transaction(async (tx) => {
      // 1. Create answers
      for (const ans of answersToCreate) {
        await tx.quizAnswer.upsert({
          where: {
            attemptId_questionId: {
              attemptId: attempt.id,
              questionId: ans.questionId
            }
          },
          create: {
            attemptId: attempt.id,
            questionId: ans.questionId,
            selectedOptionIds: ans.selectedOptionIds,
            isCorrect: ans.isCorrect,
            pointsAwarded: ans.pointsAwarded
          },
          update: {
            selectedOptionIds: ans.selectedOptionIds,
            isCorrect: ans.isCorrect,
            pointsAwarded: ans.pointsAwarded
          }
        });
      }

      // 2. Finalize attempt record
      await tx.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUBMITTED',
          submittedAt,
          score: roundedScore,
          earnedPoints: totalEarnedPoints,
          totalPoints: totalPossiblePoints,
          percentage: Number(percentage.toFixed(2)),
          isPassed
        }
      });
    });

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      userId: attempt.userId,
      status: 'SUBMITTED',
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: submittedAt.toISOString(),
      score: roundedScore,
      earnedPoints: totalEarnedPoints,
      totalPoints: totalPossiblePoints,
      percentage: Number(percentage.toFixed(2)),
      isPassed,
      timeLimitSeconds: attempt.quiz.timeLimitSeconds,
      remainingSeconds: 0,
      questions: questionResults
    };
  }

  /**
   * Retrieves all attempts by user for a specific quiz.
   */
  async getUserAttempts(quizId: string, user: SafeUser): Promise<QuizAttemptSummaryDto[]> {
    const attempts = await prisma.quizAttempt.findMany({
      where: {
        quizId,
        userId: user.id
      },
      include: {
        quiz: {
          select: { timeLimitSeconds: true }
        }
      },
      orderBy: { startedAt: 'desc' }
    });

    return attempts.map((att) => ({
      id: att.id,
      quizId: att.quizId,
      userId: att.userId,
      status: att.status as any,
      startedAt: att.startedAt.toISOString(),
      submittedAt: att.submittedAt?.toISOString() || null,
      score: att.score,
      earnedPoints: Number(att.earnedPoints),
      totalPoints: att.totalPoints,
      percentage: Number(att.percentage),
      isPassed: att.isPassed,
      timeLimitSeconds: att.quiz.timeLimitSeconds
    }));
  }

  /**
   * Retrieves full details and question breakdown for a submitted attempt.
   */
  async getAttemptResult(attemptId: string, user: SafeUser): Promise<QuizAttemptResultDto> {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            },
            lesson: {
              include: {
                module: {
                  include: { course: true }
                }
              }
            },
            module: {
              include: { course: true }
            }
          }
        },
        answers: true
      }
    });

    if (!attempt) throw new NotFoundError('Quiz attempt not found');

    const course = attempt.quiz.lesson?.module.course || attempt.quiz.module?.course;
    const isOwner = attempt.userId === user.id;
    const isInstructorOrAdmin =
      user.role === 'ADMIN' || (course && course.instructorId === user.id);

    if (!isOwner && !isInstructorOrAdmin) {
      throw new ForbiddenError('You are not authorized to view this attempt result');
    }

    const answersMap = new Map<string, any>();
    for (const ans of attempt.answers) {
      answersMap.set(ans.questionId, ans);
    }

    const isSubmitted = attempt.status === 'SUBMITTED';

    const questionResults: QuestionResultDto[] = attempt.quiz.questions.map((q) => {
      const recordedAns = answersMap.get(q.id);
      const selectedOptionIds =
        recordedAns && Array.isArray(recordedAns.selectedOptionIds)
          ? (recordedAns.selectedOptionIds as string[])
          : [];

      // Only reveal correct answers and explanations after submission
      const correctOptionIds = isSubmitted
        ? q.options.filter((o) => o.isCorrect).map((o) => o.id)
        : [];

      return {
        questionId: q.id,
        prompt: q.prompt,
        type: q.type as any,
        points: q.points,
        pointsAwarded: recordedAns ? Number(recordedAns.pointsAwarded) : 0,
        isCorrect: recordedAns ? recordedAns.isCorrect : false,
        selectedOptionIds,
        correctOptionIds,
        explanation: isSubmitted ? q.explanation : null,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: isSubmitted ? o.isCorrect : false
        }))
      };
    });

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      userId: attempt.userId,
      status: attempt.status as any,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() || null,
      score: attempt.score,
      earnedPoints: Number(attempt.earnedPoints),
      totalPoints: attempt.totalPoints,
      percentage: Number(attempt.percentage),
      isPassed: attempt.isPassed,
      timeLimitSeconds: attempt.quiz.timeLimitSeconds,
      questions: questionResults
    };
  }
}

export const quizAttemptService = new QuizAttemptService();
