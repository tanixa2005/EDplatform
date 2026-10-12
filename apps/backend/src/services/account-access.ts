import { UnauthorizedError } from '../errors/app.error.js';

/**
 * The rules for whether an existing account may be used, and for when a Clerk
 * identity may be attached to one.
 *
 * Kept free of database and environment imports, so the rules can be tested
 * offline and used identically by every sign-in path.
 */

export interface AccountStatus {
  isActive: boolean;
}

export const DEACTIVATED_ACCOUNT_CODE = 'ACCOUNT_DEACTIVATED';
export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';
export const CLERK_ID_CONFLICT_CODE = 'CLERK_ID_CONFLICT';

/**
 * Refusals that mean "this sign-in or event cannot change anything". The webhook
 * acknowledges these instead of failing them, because Clerk would otherwise retry
 * a refusal that cannot succeed. A later user.updated still provisions the
 * account once it is verified or reactivated.
 */
export const PROVISIONING_REFUSAL_CODES: readonly string[] = [
  DEACTIVATED_ACCOUNT_CODE,
  EMAIL_NOT_VERIFIED_CODE,
  CLERK_ID_CONFLICT_CODE
];

/**
 * Throws a 401 unless the account is active. Call it before any link, update or
 * session is produced for an existing account.
 */
export function assertAccountActive<T extends AccountStatus>(account: T): T {
  if (!account.isActive) {
    throw new UnauthorizedError('This account has been deactivated.', DEACTIVATED_ACCOUNT_CODE);
  }
  return account;
}

/**
 * Request-time form: an inactive account is treated as no account at all, so
 * the caller falls back to anonymous instead of acting on it.
 */
export function activeOrNull<T extends AccountStatus>(account: T | null): T | null {
  return account !== null && account.isActive ? account : null;
}
