import { RegisterInput, LoginInput, SafeUser } from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { hashPassword, verifyPassword } from '../utils/password.util.js';
import { signToken } from '../utils/jwt.util.js';
import { ConflictError, UnauthorizedError } from '../errors/app.error.js';

export class AuthService {
  /**
   * Registers a new user, hashes password with Argon2id, creates record in database,
   * and returns a SafeUser along with a signed JWT.
   */
  async register(input: RegisterInput): Promise<{ user: SafeUser; token: string }> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // 1. Verify email uniqueness
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    // 2. Hash password with Argon2id
    const passwordHash = await hashPassword(input.password);

    // 3. Create user in database
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: input.role
      }
    });

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

    // 4. Sign JWT
    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return { user: safeUser, token };
  }

  /**
   * Authenticates user with email and password, verifies Argon2id hash,
   * and returns a SafeUser and signed JWT.
   */
  async login(input: LoginInput): Promise<{ user: SafeUser; token: string }> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // 1. Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated. Please contact support.');
    }

    // 2. Verify password with Argon2id
    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

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

    // 3. Sign JWT
    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return { user: safeUser, token };
  }

  /**
   * Retrieves safe user profile by ID.
   */
  async getUserById(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    return {
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
  }
}

export const authService = new AuthService();
