import { SafeUser } from '@edplatform/shared';

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

export {};
