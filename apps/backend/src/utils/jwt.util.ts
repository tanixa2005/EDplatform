import jwt from 'jsonwebtoken';
import { JwtPayload } from '@edplatform/shared';
import { env } from '../config/env.config.js';

/**
 * Signs a JWT with the user's id, email, and role.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  });
}

/**
 * Verifies a JWT and returns the decoded payload.
 * Throws an error if the token is invalid or expired.
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  return decoded as JwtPayload;
}
