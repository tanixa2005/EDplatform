import {
  CreateQuizInput,
  UpdateQuizInput,
  CreateQuizQuestionInput,
  UpdateQuizQuestionInput,
  QuizSummaryDto,
  QuizDetailStudentDto,
  QuizDetailInstructorDto,
  SafeUser
} from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError, ForbiddenError } from '../errors/app.error.js';

export class QuizService {
  /**
   * Verifies instructor ownership or admin permissions for a lesson or module.
   */
  private async verifyParentOwnership(
    parent: { lessonId?: string | null; moduleId?: string | null },
    user: SafeUser
  ): Promise<{ courseId: string; instructorId: string }> {
    if (user.role === 'ADMIN') {
      if (parent.lessonId) {
        const lesson = await prisma.lesson.findUnique({
          where: { id: parent.lessonId },
          include: { module: true }
        });
        if (!lesson) throw new NotFoundError('Lesson not found');
        return { courseId: lesson.module.courseId, instructorId: '' };
      }
      if (parent.moduleId) {
        const moduleItem = await prisma.module.findUnique({
          where: { id: parent.moduleId }
        });
        if (!moduleItem) throw new NotFoundError('Module not found');
        return { courseId: moduleItem.courseId, instructorId: '' };
      }
      throw new NotFoundError('Parent lesson or module required');
    }

    if (parent.lessonId) {
      const lesson = await prisma.lesson.findUnique({
        where: { id: parent.lessonId },
        include: {
          module: {
            include: { course: true }
          }
        }
      });
      if (!lesson) throw new NotFoundError('Lesson not found');
      if (lesson.module.course.instructorId !== user.id) {
        throw new ForbiddenError('You can only manage quizzes for your own courses');
      }
      return { courseId: lesson.module.courseId, instructorId: lesson.module.course.instructorId };
    }

    if (parent.moduleId) {
      const moduleItem = await prisma.module.findUnique({
        where: { id: parent.moduleId },
        include: { course: true }
      });
      if (!moduleItem) throw new NotFoundError('Module not found');
      if (moduleItem.course.instructorId !== user.id) {
        throw new ForbiddenError('You can only manage quizzes for your own courses');
      }
      return { courseId: moduleItem.courseId, instructorId: moduleItem.course.instructorId };
    }

    throw new NotFoundError('Parent lesson or module required');
  }

  /**
   * Verifies instructor ownership or admin permissions for an existing quiz.
   */
  async verifyQuizOwnership(
    quizId: string,
    user: SafeUser
  ): Promise<{ quiz: any; courseId: string }> {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
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
    });

    if (!quiz) throw new NotFoundError('Quiz not found');

    if (user.role === 'ADMIN') {
      const courseId = quiz.lesson?.module.courseId || quiz.module?.courseId || '';
      return { quiz, courseId };
    }

    const instructorId =
      quiz.lesson?.module.course.instructorId || quiz.module?.course.instructorId;

    if (instructorId !== user.id) {
      throw new ForbiddenError('You can only manage quizzes for your own courses');
    }

    const courseId = quiz.lesson?.module.courseId || quiz.module?.courseId || '';
    return { quiz, courseId };
  }

  /**
   * Checks student access to a quiz (enrollment, preview, or published status).
   */
  async verifyStudentQuizAccess(quizId: string, user?: SafeUser): Promise<any> {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
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
    });

    if (!quiz) throw new NotFoundError('Quiz not found');

    const course = quiz.lesson?.module.course || quiz.module?.course;
    if (!course) throw new NotFoundError('Associated course not found');

    // Instructors and Admins always have access
    if (user) {
      if (user.role === 'ADMIN' || course.instructorId === user.id) {
        return quiz;
      }
    }

    // Must be published for students
    if (!quiz.isPublished) {
      throw new ForbiddenError('This quiz is not currently published');
    }

    // Check if free preview applies
    if (quiz.lesson?.isFreePreview) {
      return quiz;
    }

    // Must be authenticated and enrolled
    if (!user) {
      throw new ForbiddenError('Authentication required to access this quiz');
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id
        }
      }
    });

    if (!enrollment) {
      throw new ForbiddenError('You must be enrolled in this course to access this quiz');
    }

    return quiz;
  }

  /**
   * Creates a new quiz for a lesson or module.
   */
  async createQuiz(input: CreateQuizInput, user: SafeUser): Promise<QuizSummaryDto> {
    await this.verifyParentOwnership(
      { lessonId: input.lessonId, moduleId: input.moduleId },
      user
    );

    const quiz = await prisma.quiz.create({
      data: {
        title: input.title,
        description: input.description || null,
        passingScore: input.passingScore,
        timeLimitSeconds: input.timeLimitSeconds,
        isPublished: input.isPublished ?? false,
        lessonId: input.lessonId || null,
        moduleId: input.moduleId || null
      },
      include: {
        _count: {
          select: { questions: true }
        }
      }
    });

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      timeLimitSeconds: quiz.timeLimitSeconds,
      isPublished: quiz.isPublished,
      lessonId: quiz.lessonId,
      moduleId: quiz.moduleId,
      questionsCount: quiz._count.questions,
      totalPoints: 0,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString()
    };
  }

  /**
   * Retrieves quiz by ID. Hides correct answers from students.
   */
  async getQuizById(
    quizId: string,
    user?: SafeUser
  ): Promise<QuizDetailStudentDto | QuizDetailInstructorDto> {
    const quizRecord = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        lesson: {
          include: {
            module: {
              include: { course: true }
            }
          }
        },
        module: {
          include: { course: true }
        },
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        }
      }
    });

    if (!quizRecord) throw new NotFoundError('Quiz not found');

    const course = quizRecord.lesson?.module.course || quizRecord.module?.course;
    const isInstructorOrAdmin =
      user && (user.role === 'ADMIN' || (course && course.instructorId === user.id));

    // If not instructor/admin, verify student access
    if (!isInstructorOrAdmin) {
      await this.verifyStudentQuizAccess(quizId, user);
    }

    const totalPoints = quizRecord.questions.reduce((acc, q) => acc + q.points, 0);

    const baseSummary: QuizSummaryDto = {
      id: quizRecord.id,
      title: quizRecord.title,
      description: quizRecord.description,
      passingScore: quizRecord.passingScore,
      timeLimitSeconds: quizRecord.timeLimitSeconds,
      isPublished: quizRecord.isPublished,
      lessonId: quizRecord.lessonId,
      moduleId: quizRecord.moduleId,
      questionsCount: quizRecord.questions.length,
      totalPoints,
      createdAt: quizRecord.createdAt.toISOString(),
      updatedAt: quizRecord.updatedAt.toISOString()
    };

    if (isInstructorOrAdmin) {
      return {
        ...baseSummary,
        questions: quizRecord.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          type: q.type as any,
          points: q.points,
          explanation: q.explanation,
          sortOrder: q.sortOrder,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            sortOrder: o.sortOrder,
            isCorrect: o.isCorrect
          }))
        }))
      };
    }

    // Student view: Strip isCorrect and explanation
    return {
      ...baseSummary,
      questions: quizRecord.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type as any,
        points: q.points,
        sortOrder: q.sortOrder,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          sortOrder: o.sortOrder
        }))
      }))
    };
  }

  /**
   * Retrieves quiz for a specific lesson.
   */
  async getQuizByLessonId(
    lessonId: string,
    user?: SafeUser
  ): Promise<QuizDetailStudentDto | QuizDetailInstructorDto | null> {
    const quiz = await prisma.quiz.findFirst({
      where: { lessonId }
    });

    if (!quiz) return null;
    return this.getQuizById(quiz.id, user);
  }

  /**
   * Updates quiz details.
   */
  async updateQuiz(
    quizId: string,
    input: UpdateQuizInput,
    user: SafeUser
  ): Promise<QuizSummaryDto> {
    await this.verifyQuizOwnership(quizId, user);

    const updated = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        title: input.title,
        description: input.description !== undefined ? input.description : undefined,
        passingScore: input.passingScore,
        timeLimitSeconds: input.timeLimitSeconds !== undefined ? input.timeLimitSeconds : undefined,
        isPublished: input.isPublished
      },
      include: {
        questions: {
          select: { points: true }
        }
      }
    });

    const totalPoints = updated.questions.reduce((acc, q) => acc + q.points, 0);

    return {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      passingScore: updated.passingScore,
      timeLimitSeconds: updated.timeLimitSeconds,
      isPublished: updated.isPublished,
      lessonId: updated.lessonId,
      moduleId: updated.moduleId,
      questionsCount: updated.questions.length,
      totalPoints,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  /**
   * Toggles quiz published state.
   */
  async setPublishStatus(
    quizId: string,
    isPublished: boolean,
    user: SafeUser
  ): Promise<QuizSummaryDto> {
    await this.verifyQuizOwnership(quizId, user);

    const updated = await prisma.quiz.update({
      where: { id: quizId },
      data: { isPublished },
      include: {
        questions: {
          select: { points: true }
        }
      }
    });

    const totalPoints = updated.questions.reduce((acc, q) => acc + q.points, 0);

    return {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      passingScore: updated.passingScore,
      timeLimitSeconds: updated.timeLimitSeconds,
      isPublished: updated.isPublished,
      lessonId: updated.lessonId,
      moduleId: updated.moduleId,
      questionsCount: updated.questions.length,
      totalPoints,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  /**
   * Deletes a quiz.
   */
  async deleteQuiz(quizId: string, user: SafeUser): Promise<void> {
    await this.verifyQuizOwnership(quizId, user);
    await prisma.quiz.delete({
      where: { id: quizId }
    });
  }

  /**
   * Adds a question with options to a quiz.
   */
  async addQuestion(
    quizId: string,
    input: CreateQuizQuestionInput,
    user: SafeUser
  ) {
    await this.verifyQuizOwnership(quizId, user);

    const question = await prisma.quizQuestion.create({
      data: {
        quizId,
        prompt: input.prompt,
        type: input.type,
        points: input.points,
        explanation: input.explanation || null,
        sortOrder: input.sortOrder,
        options: {
          create: input.options.map((opt, idx) => ({
            text: opt.text,
            sortOrder: opt.sortOrder ?? idx,
            isCorrect: opt.isCorrect
          }))
        }
      },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return question;
  }

  /**
   * Updates a question and replaces options if provided.
   */
  async updateQuestion(
    questionId: string,
    input: UpdateQuizQuestionInput,
    user: SafeUser
  ) {
    const question = await prisma.quizQuestion.findUnique({
      where: { id: questionId },
      select: { quizId: true }
    });

    if (!question) throw new NotFoundError('Question not found');
    await this.verifyQuizOwnership(question.quizId, user);

    return prisma.$transaction(async (tx) => {
      if (input.options) {
        // Replace options
        await tx.quizOption.deleteMany({
          where: { questionId }
        });
        await tx.quizOption.createMany({
          data: input.options.map((opt, idx) => ({
            questionId,
            text: opt.text,
            sortOrder: opt.sortOrder ?? idx,
            isCorrect: opt.isCorrect
          }))
        });
      }

      const updated = await tx.quizQuestion.update({
        where: { id: questionId },
        data: {
          prompt: input.prompt,
          type: input.type,
          points: input.points,
          explanation: input.explanation !== undefined ? input.explanation : undefined,
          sortOrder: input.sortOrder
        },
        include: {
          options: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      return updated;
    });
  }

  /**
   * Deletes a question.
   */
  async deleteQuestion(questionId: string, user: SafeUser): Promise<void> {
    const question = await prisma.quizQuestion.findUnique({
      where: { id: questionId },
      select: { quizId: true }
    });

    if (!question) throw new NotFoundError('Question not found');
    await this.verifyQuizOwnership(question.quizId, user);

    await prisma.quizQuestion.delete({
      where: { id: questionId }
    });
  }

  /**
   * Reorders questions in a quiz.
   */
  async reorderQuestions(
    quizId: string,
    items: { id: string; sortOrder: number }[],
    user: SafeUser
  ): Promise<void> {
    await this.verifyQuizOwnership(quizId, user);

    await prisma.$transaction(
      items.map((item) =>
        prisma.quizQuestion.updateMany({
          where: {
            id: item.id,
            quizId
          },
          data: {
            sortOrder: item.sortOrder
          }
        })
      )
    );
  }
}

export const quizService = new QuizService();
