/**
 * The Neon endpoints this codebase knows about, and how to read one from a
 * connection string.
 *
 * Used by the offline demo mode and the demo curriculum runner. The development
 * seeds and the production curriculum runner keep their own constants and are
 * not changed by this file.
 *
 * Only the host part of a connection string is read here. The password and the
 * user name are never returned, logged or included in an error message.
 */

/** Neon production endpoint. Never a demo target. */
export const PRODUCTION_ENDPOINT = 'ep-dark-flower-azql23vb';
/** Existing development endpoint, which holds copied user data. Never a demo target. */
export const DEVELOPMENT_ENDPOINT = 'ep-young-moon-azdhrnrr';
/** Backup branch endpoint (pre-release-backup-2026-10-11). Never a demo target. */
export const BACKUP_ENDPOINT = 'ep-soft-heart-azu0z7dk';

/** Endpoints that no demo may ever target. Checked before any allowlist. */
export const DENIED_ENDPOINTS: readonly string[] = [
  PRODUCTION_ENDPOINT,
  DEVELOPMENT_ENDPOINT,
  BACKUP_ENDPOINT
];

/**
 * A Neon endpoint id: "ep-" followed by one to four lowercase segments, for
 * example "ep-young-moon-azdhrnrr". Matched in full, so a longer id that merely
 * starts with a known id is a different id.
 */
const ENDPOINT_ID = /^ep-[a-z0-9]+(?:-[a-z0-9]+){1,3}$/;

/**
 * A Neon hostname and nothing else:
 *   <endpoint id>[-pooler].c-<n>.<region>.aws.neon.tech
 * The whole hostname must match, so a forged suffix, an extra label, a different
 * domain or a missing label does not match. The "-pooler" suffix is removed
 * explicitly, rather than left to the id pattern, so it can never be read as part
 * of the endpoint id.
 */
const NEON_HOSTNAME = /^([a-z0-9-]+)\.c-\d+\.[a-z0-9-]+\.aws\.neon\.tech$/;
const POOLER_SUFFIX = '-pooler';

/** True when the value is a well-formed Neon endpoint id. */
export function isEndpointId(value: string): boolean {
  return ENDPOINT_ID.test(value);
}

/**
 * The Neon endpoint id of a postgres(ql) connection string, for example
 * "ep-young-moon-azdhrnrr" from
 * "ep-young-moon-azdhrnrr-pooler.c-3.ap-southeast-1.aws.neon.tech".
 *
 * Returns null unless the scheme is postgres(ql) and the hostname is a valid Neon
 * hostname. It never throws and never echoes the input. Only the host is read,
 * so the user name and password are never returned.
 */
export function endpointIdOf(databaseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return null;
  // Non-special schemes keep the host's case, so normalise before matching.
  const match = NEON_HOSTNAME.exec(url.hostname.toLowerCase());
  if (!match) return null;
  const label = match[1];
  const id = label.endsWith(POOLER_SUFFIX) ? label.slice(0, -POOLER_SUFFIX.length) : label;
  return isEndpointId(id) ? id : null;
}
