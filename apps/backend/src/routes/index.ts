import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const apiRouter = Router();

// API v1 root routes
apiRouter.use('/health', healthRouter);
