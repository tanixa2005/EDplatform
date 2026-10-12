/**
 * Reads the email address and its verification status from a Clerk user, from
 * either the SDK object or a webhook payload.
 *
 * Only Clerk's own status "verified" counts as proof. Anything else, including a
 * missing verification object, is unverified. Pure: no database, no environment,
 * no network.
 */

export interface ProvisionEmail {
  email: string;
  verified: boolean;
}

/** The Clerk verification object, as the SDK and the webhook both describe it. */
export type ClerkVerification = { status?: string | null } | null | undefined;

export function isVerified(verification: ClerkVerification): boolean {
  return verification?.status === 'verified';
}

interface SdkAddress {
  emailAddress: string;
  verification?: ClerkVerification;
}

/**
 * The address the app should use for a Clerk user: the primary address, else the
 * first one (the same choice the app has always made). Its verification is read
 * from that same address, so a verified secondary address cannot vouch for an
 * unverified primary one.
 */
export function primaryFromClerkUser(user: {
  primaryEmailAddress?: SdkAddress | null;
  emailAddresses: SdkAddress[];
}): ProvisionEmail | null {
  const address = user.primaryEmailAddress ?? user.emailAddresses[0];
  if (!address || !address.emailAddress) return null;
  return { email: address.emailAddress, verified: isVerified(address.verification) };
}

interface WebhookAddress {
  id: string;
  email_address: string;
  verification?: ClerkVerification;
}

/** The same selection for a webhook payload, which names the primary address by id. */
export function primaryFromWebhook(data: {
  email_addresses?: WebhookAddress[];
  primary_email_address_id?: string | null;
}): ProvisionEmail | null {
  const addresses = data.email_addresses ?? [];
  if (addresses.length === 0) return null;
  const primary = data.primary_email_address_id
    ? addresses.find((a) => a.id === data.primary_email_address_id)
    : undefined;
  const chosen = primary ?? addresses[0];
  if (!chosen.email_address) return null;
  return { email: chosen.email_address, verified: isVerified(chosen.verification) };
}
