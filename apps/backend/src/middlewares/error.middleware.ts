import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.config.js';
import { AppError } from '../errors/app.error.js';

export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Resilient check for Zod validation errors
  const isZod =
    err instanceof ZodError ||
    (Boolean(err) && typeof err === 'object' && ('issues' in (err as object) || (err as Error).name === 'ZodError'));

  if (isZod) {
    const zodErr = err as ZodError;
    const issues = zodErr.issues || zodErr.errors || [];
    const details = issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error',
        details
      }
    });
    return;
  }

  // Handle AppError and standard errors
  const isAppError = err instanceof AppError;
  const statusCode =
    'statusCode' in err && typeof err.statusCode === 'number'
      ? err.statusCode
      : isAppError
      ? err.statusCode
      : 500;

  const errorCode =
    'code' in err && typeof err.code === 'string'
      ? err.code
      : isAppError
      ? err.code
      : 'INTERNAL_SERVER_ERROR';

  // In production, never leak internal error messages or database details for unhandled 500 errors
  const isProductionUnhandled = env.NODE_ENV === 'production' && !isAppError && statusCode >= 500;
  const message = isProductionUnhandled
    ? 'An unexpected server error occurred'
    : (err.message || 'An unexpected server error occurred');
  const details = isProductionUnhandled ? undefined : ('details' in err ? err.details : undefined);

  if (env.NODE_ENV !== 'test' && statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(details ? { details } : {}),
      ...(env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}
