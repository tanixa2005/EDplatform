export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface SafeUser {
  id: string;
  email: string;
  /** Clerk user id, or null for a legacy account that has not signed in via Clerk yet. */
  clerkUserId: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AuthSession {
  user: SafeUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  user: SafeUser;
}
