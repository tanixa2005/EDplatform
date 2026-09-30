import { Request, Response, NextFunction } from 'express';
import { AUTH_COOKIE_NAME, getAuthCookieOptions, getClearAuthCookieOptions } from '../config/cookie.config.js';
import { authService } from '../services/auth.service.js';
import { UnauthorizedError } from '../errors/app.error.js';

export class AuthController {
  /**
   * Registers a new account, sets the HttpOnly auth_token cookie,
   * and returns the safe user profile.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, token } = await authService.register(req.body);

      // Set HttpOnly auth cookie (environment-aware)
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      res.status(201).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticates credentials, sets the HttpOnly auth_token cookie,
   * and returns the safe user profile.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, token } = await authService.login(req.body);

      // Set HttpOnly auth cookie (environment-aware)
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logs out the user by invalidating and clearing the HttpOnly auth_token cookie.
   */
  async logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.cookie(AUTH_COOKIE_NAME, '', getClearAuthCookieOptions());

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Returns the currently authenticated user attached by the auth middleware.
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      res.status(200).json({
        success: true,
        data: { user: req.user }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
