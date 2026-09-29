import { Router } from 'express';
import { getHealthStatus } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', getHealthStatus);
