import { Router, raw } from 'express';
import { webhookController } from '../controllers/webhook.controller.js';

export const webhookRouter = Router();

// Clerk signs the raw request body, so this route must parse it as raw bytes.
// It is mounted before the global express.json() middleware in app.ts.
webhookRouter.post('/clerk', raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
  webhookController.handleClerk(req, res, next);
});
