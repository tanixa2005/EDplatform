import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { courseRouter } from './course.routes.js';
import { moduleRouter } from './module.routes.js';
import { lessonRouter } from './lesson.routes.js';
import { enrollmentRouter } from './enrollment.routes.js';
import { quizRouter } from './quiz.routes.js';
import { questionRouter } from './question.routes.js';
import { attemptRouter } from './attempt.routes.js';
import { aiRouter } from './ai.routes.js';
import { dashboardRouter } from './dashboard.routes.js';

export const apiRouter = Router();

// API v1 root routes
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/courses', courseRouter);
apiRouter.use('/modules', moduleRouter);
apiRouter.use('/lessons', lessonRouter);
apiRouter.use('/enrollments', enrollmentRouter);
apiRouter.use('/quizzes', quizRouter);
apiRouter.use('/questions', questionRouter);
apiRouter.use('/attempts', attemptRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/dashboard', dashboardRouter);
