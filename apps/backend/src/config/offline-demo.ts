import { DENIED_ENDPOINTS, endpointIdOf, isEndpointId } from './database-endpoints.js';

/**
 * The offline demo mode (OFFLINE_DEMO_AI=true) runs the Mock tutor in production
 * mode with no AI key. It is for a separate demo backend on its own database,
 * and it must never start against production or any other real database.
 *
 * This file holds the rules as a pure function, so they can be tested without
 * loading the environment. env.config.ts calls it during validation.
 */

export interface OfflineDemoInputs {
  NODE_ENV: string;
  OPENROUTER_API_KEY: string;
  DATABASE_URL: string;
  OFFLINE_DEMO_EXPECT_ENDPOINT: string;
}

/**
 * Every reason the demo mode must not start. An empty list means it may.
 *
 * Fails closed: if the approved endpoint is missing, or the database endpoint
 * cannot be read, the mode is refused. Messages name the rule and never a value.
 */
export function offlineDemoProblems(input: OfflineDemoInputs): string[] {
  const problems: string[] = [];

  if (input.NODE_ENV !== 'production') {
    problems.push('OFFLINE_DEMO_AI=true requires NODE_ENV=production');
  }
  if (input.OPENROUTER_API_KEY.trim() !== '') {
    problems.push('OFFLINE_DEMO_AI=true must not be combined with OPENROUTER_API_KEY');
  }

  const expected = input.OFFLINE_DEMO_EXPECT_ENDPOINT.trim();
  if (expected === '') {
    problems.push('OFFLINE_DEMO_EXPECT_ENDPOINT must name the approved demo endpoint');
  } else if (!isEndpointId(expected)) {
    problems.push('OFFLINE_DEMO_EXPECT_ENDPOINT is not a well-formed Neon endpoint id');
  } else if (DENIED_ENDPOINTS.includes(expected)) {
    problems.push('OFFLINE_DEMO_EXPECT_ENDPOINT names a denied (production, development or backup) endpoint');
  }

  const actual = endpointIdOf(input.DATABASE_URL);
  if (actual === null) {
    problems.push('DATABASE_URL has no readable Neon endpoint, so the demo target cannot be verified');
  } else if (DENIED_ENDPOINTS.includes(actual)) {
    problems.push('DATABASE_URL points at a denied (production, development or backup) endpoint');
  } else if (expected !== '' && actual !== expected) {
    problems.push('DATABASE_URL endpoint does not match OFFLINE_DEMO_EXPECT_ENDPOINT');
  }

  return problems;
}
