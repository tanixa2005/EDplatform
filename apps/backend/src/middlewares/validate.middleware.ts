import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/app.error.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: unknown) {
      const isZod =
        error instanceof ZodError ||
        (Boolean(error) && typeof error === 'object' && ('issues' in (error as object) || (error as Error).name === 'ZodError'));

      if (isZod) {
        const zodErr = error as ZodError;
        const issues = zodErr.issues || zodErr.errors || [];
        const details = issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message
        }));
        next(new ValidationError('Validation error', details));
      } else {
        next(error);
      }
    }
  };
}
