import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.config.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

export function createApp(): Express {
  const app = express();

  // Trust first reverse proxy (Render, Cloudflare, etc.) to correctly evaluate secure connections
  app.set('trust proxy', 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false
    })
  );

  // CORS configuration (supports single origin or comma-separated list of allowed origins)
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  const corsOrigin = allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins;

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    })
  );

  // Middleware pipeline
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // Mount API v1 router
  app.use('/api/v1', apiRouter);

  // Root fallback
  app.get('/', (_req, res) => {
    res.json({
      name: 'EDplatform API Service',
      version: '1.0.0',
      docs: '/api/v1/health'
    });
  });

  // 404 handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`
      }
    });
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
}
