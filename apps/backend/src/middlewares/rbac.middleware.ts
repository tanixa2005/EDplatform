import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@edplatform/shared';
import { ForbiddenError, UnauthorizedError } from '../errors/app.error.js';

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access forbidden: Role '${req.user.role}' is not authorized for this action`
        )
      );
    }

    next();
  };
}
