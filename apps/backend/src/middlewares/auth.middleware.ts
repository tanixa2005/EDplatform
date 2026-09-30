import { Request, Response, NextFunction } from 'express';
import { SafeUser } from '@edplatform/shared';
import { AUTH_COOKIE_NAME } from '../config/cookie.config.js';
import { verifyToken } from '../utils/jwt.util.js';
import { UnauthorizedError } from '../errors/app.error.js';
import { prisma } from '../config/prisma.config.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Extract token from HttpOnly cookie (primary) or Authorization header (fallback)
    let token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required: No token provided');
    }

    // 2. Verify token
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new UnauthorizedError('Authentication failed: Invalid or expired token');
    }

    // 3. Look up user in database
    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user) {
      throw new UnauthorizedError('Authentication failed: User does not exist');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Authentication failed: Account has been deactivated');
    }

    // 4. Attach safe user to request
    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    req.user = safeUser;
    next();
  } catch (error) {
    next(error);
  }
}
