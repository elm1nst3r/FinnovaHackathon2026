import type { Identity } from '../core/model.ts';
import { SEED_IDENTITIES } from '../fixtures/seed.ts';

/**
 * Mocked identity, as the PRD's FR-02 allows for the prototype. The header is a
 * stand-in for a real SSO assertion: it is trusted only because the server is
 * bound to the loopback interface for the demo. Nothing downstream of this
 * module knows or cares how the identity was established, so replacing this
 * with an OIDC middleware touches one file.
 */
export const IDENTITY_HEADER = 'x-aig-user';

const DIRECTORY = new Map<string, Identity>(SEED_IDENTITIES.map((identity) => [identity.id, identity]));

export function listIdentities(): Identity[] {
  return [...DIRECTORY.values()].map((identity) => ({ ...identity, groups: [...identity.groups] }));
}

export function resolveIdentity(headerValue: string | undefined): Identity | null {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') return null;
  const identity = DIRECTORY.get(headerValue.trim());
  if (!identity) return null;
  return { ...identity, groups: [...identity.groups] };
}

export function knownUserIds(): string[] {
  return [...DIRECTORY.keys()];
}

/**
 * Group membership is read, never written — the cockpit is explicitly not an IAM
 * system. Revoking membership here takes effect on the next request, which is
 * what makes "membership revoked mid-session" behave correctly: authorisation is
 * evaluated per request against the directory, not against a session snapshot.
 */
export function setGroups(userId: string, groups: string[]): void {
  const identity = DIRECTORY.get(userId);
  if (!identity) return;
  DIRECTORY.set(userId, { ...identity, groups: [...groups] });
}
