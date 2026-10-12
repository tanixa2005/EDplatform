import { DENIED_ENDPOINTS, endpointIdOf, isEndpointId } from '../../config/database-endpoints.js';

/**
 * Target checks for the demo curriculum runner. A separate guard from the
 * development and production ones: it has its own variables and its own
 * approved endpoint, and it never reads a file.
 *
 * Every refusal names the rule and never a value (no URL, password or endpoint id).
 */

export const DEMO_CONFIRM_FLAG = '--confirm-demo-seed';
export const DEMO_ALLOW_ENV = 'EDP_ALLOW_DEMO_SEED';
export const DEMO_URL_ENV = 'EDP_DEMO_DATABASE_URL';
export const DEMO_EXPECT_ENV = 'EDP_DEMO_EXPECT_ENDPOINT';

export class DemoRefusal extends Error {}

/**
 * Returns the verified endpoint id, or throws DemoRefusal. Checks, in order:
 * the command-line confirmation, the environment confirmation, the approved
 * endpoint, the denied-endpoint list, the URL's endpoint, and that the URL and
 * the approved endpoint agree.
 */
export function assertDemoTarget(argv: readonly string[], env: Record<string, string | undefined>): string {
  if (!argv.includes(DEMO_CONFIRM_FLAG)) {
    throw new DemoRefusal(`refusing: pass ${DEMO_CONFIRM_FLAG} to confirm a demo write`);
  }
  if (env[DEMO_ALLOW_ENV] !== '1') {
    throw new DemoRefusal(`refusing: set ${DEMO_ALLOW_ENV}=1 to allow a demo write`);
  }

  const expected = (env[DEMO_EXPECT_ENV] ?? '').trim();
  if (expected === '') {
    throw new DemoRefusal(`refusing: ${DEMO_EXPECT_ENV} must name the approved demo endpoint`);
  }
  if (!isEndpointId(expected)) {
    throw new DemoRefusal(`refusing: ${DEMO_EXPECT_ENV} is not a well-formed Neon endpoint id`);
  }
  if (DENIED_ENDPOINTS.includes(expected)) {
    throw new DemoRefusal(`refusing: ${DEMO_EXPECT_ENV} names a denied (production, development or backup) endpoint`);
  }

  const url = (env[DEMO_URL_ENV] ?? '').trim();
  if (url === '') {
    throw new DemoRefusal(`refusing: ${DEMO_URL_ENV} must be provided by the host`);
  }
  const actual = endpointIdOf(url);
  if (actual === null) {
    throw new DemoRefusal(`refusing: ${DEMO_URL_ENV} has no readable Neon endpoint`);
  }
  if (DENIED_ENDPOINTS.includes(actual)) {
    throw new DemoRefusal('refusing: the target is a denied (production, development or backup) endpoint');
  }
  if (actual !== expected) {
    throw new DemoRefusal(`refusing: the target endpoint does not match ${DEMO_EXPECT_ENV}`);
  }
  return actual;
}
