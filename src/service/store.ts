import {
  ACCESS_WIDENING_ACTIONS,
  invalid,
  valid,
} from '../core/model.ts';
import type {
  AccessRequest,
  AuditEvent,
  GovernanceAction,
  GovernanceException,
  GovernanceRecord,
  Identity,
  Policy,
  PolicySetVersion,
  RegistryVersion,
  RequestState,
  Result,
  Tool,
} from '../core/model.ts';
import { validatePolicy } from '../core/policy.ts';
import { validateExceptionDraft, isActive } from '../core/exceptions.ts';
import type { ExceptionDraft } from '../core/exceptions.ts';
import { canTransition, validateRequestDraft } from '../core/requests.ts';
import type { RequestDraft } from '../core/requests.ts';
import {
  SEED_EXCEPTIONS,
  SEED_GROUPS,
  SEED_POLICY_SET,
  SEED_REGISTRY,
  SEED_REQUESTS,
  seedAuditEvents,
} from '../fixtures/seed.ts';
import { knownUserIds } from './identity.ts';

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * In-memory stores, kept separate on purpose. The audit log and the governance
 * records are never joined, and there is no store anywhere in this file that
 * links an identified employee to an AI interaction.
 */
export class GovernanceStore {
  #policySets: PolicySetVersion[];
  #activePolicySet: string;
  #registries: RegistryVersion[];
  #activeRegistry: string;
  #exceptions: GovernanceException[];
  #requests: AccessRequest[];
  #records: GovernanceRecord[];
  #auditEvents: AuditEvent[];
  #sequence = 0;

  constructor() {
    this.#policySets = [clone(SEED_POLICY_SET)];
    this.#activePolicySet = SEED_POLICY_SET.version;
    this.#registries = [clone(SEED_REGISTRY)];
    this.#activeRegistry = SEED_REGISTRY.version;
    this.#exceptions = clone(SEED_EXCEPTIONS);
    this.#requests = clone(SEED_REQUESTS);
    this.#records = [];
    this.#auditEvents = seedAuditEvents();
  }

  #nextId(prefix: string): string {
    this.#sequence += 1;
    return `${prefix}-${Date.now().toString(36)}${this.#sequence.toString(36)}`;
  }

  // ---------------------------------------------------------------- reads

  activePolicySet(): PolicySetVersion {
    const active = this.#policySets.find((version) => version.version === this.#activePolicySet);
    if (!active) throw new Error('No active policy set. The store was constructed incorrectly.');
    return clone(active);
  }

  policySetVersions(): PolicySetVersion[] {
    return clone(this.#policySets);
  }

  policySet(version: string): PolicySetVersion | null {
    const found = this.#policySets.find((candidate) => candidate.version === version);
    return found ? clone(found) : null;
  }

  activeRegistry(): RegistryVersion {
    const active = this.#registries.find((version) => version.version === this.#activeRegistry);
    if (!active) throw new Error('No active registry. The store was constructed incorrectly.');
    return clone(active);
  }

  registryVersions(): RegistryVersion[] {
    return clone(this.#registries);
  }

  exceptions(): GovernanceException[] {
    return clone(this.#exceptions);
  }

  /**
   * The only exception read the enforcement point performs. It returns the
   * caller's own exceptions and takes no user parameter from the request body,
   * so it cannot be turned into a lookup of somebody else's entitlements.
   */
  exceptionsFor(identity: Identity, now: Date): GovernanceException[] {
    return this.#exceptions
      .filter((exception) => isActive(exception, now))
      .filter((exception) =>
        exception.subject.kind === 'USER'
          ? exception.subject.id === identity.id
          : identity.groups.includes(exception.subject.id),
      )
      .map(clone);
  }

  requests(): AccessRequest[] {
    return clone(this.#requests);
  }

  requestsFor(userId: string): AccessRequest[] {
    return this.#requests.filter((request) => request.requesterId === userId).map(clone);
  }

  request(id: string): AccessRequest | null {
    const found = this.#requests.find((candidate) => candidate.id === id);
    return found ? clone(found) : null;
  }

  governanceRecords(): GovernanceRecord[] {
    return clone(this.#records);
  }

  auditEvents(): AuditEvent[] {
    return clone(this.#auditEvents);
  }

  // ---------------------------------------------------------------- writes

  record(
    actor: Identity,
    action: GovernanceAction,
    targetType: string,
    targetId: string,
    before: unknown,
    after: unknown,
    reason: string | null,
  ): GovernanceRecord {
    const entry: GovernanceRecord = Object.freeze({
      id: this.#nextId('gr'),
      at: new Date().toISOString(),
      actorId: actor.id,
      actorName: actor.displayName,
      action,
      targetType,
      targetId,
      before: clone(before),
      after: clone(after),
      reason,
    });
    this.#records.push(entry);
    return entry;
  }

  appendAuditEvent(event: AuditEvent): void {
    this.#auditEvents.unshift(clone(event));
  }

  publishPolicySet(actor: Identity, rawPolicies: unknown, reason: string): Result<PolicySetVersion> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      return invalid([
        { code: 'REASON_REQUIRED', field: 'reason', message: 'Publishing a policy set requires a reason.' },
      ]);
    }
    if (!Array.isArray(rawPolicies) || rawPolicies.length === 0) {
      return invalid([
        { code: 'POLICIES_REQUIRED', field: 'policies', message: 'A policy set needs at least one policy.' },
      ]);
    }

    const policies: Policy[] = [];
    for (const raw of rawPolicies) {
      const result = validatePolicy(raw);
      if (!result.ok) return result;
      policies.push(result.value);
    }

    const duplicates = policies
      .map((policy) => policy.id)
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicates.length > 0) {
      return invalid([
        {
          code: 'DUPLICATE_POLICY_ID',
          field: 'policies',
          message: `Duplicate policy ID(s): ${[...new Set(duplicates)].join(', ')}.`,
        },
      ]);
    }

    const previous = this.activePolicySet();
    const version: PolicySetVersion = Object.freeze({
      version: this.#nextVersion('ps'),
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      reason: reason.trim(),
      basedOn: previous.version,
      policies,
    });

    this.#policySets.push(version);
    this.#activePolicySet = version.version;
    this.record(actor, 'POLICY_PUBLISHED', 'policy-set', version.version, previous.version, version.version, reason.trim());
    return valid(clone(version));
  }

  rollbackPolicySet(actor: Identity, toVersion: string, reason: string): Result<PolicySetVersion> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      return invalid([{ code: 'REASON_REQUIRED', field: 'reason', message: 'A rollback requires a reason.' }]);
    }
    const target = this.#policySets.find((candidate) => candidate.version === toVersion);
    if (!target) {
      return invalid([{ code: 'UNKNOWN_VERSION', field: 'version', message: `Unknown version ${toVersion}.` }]);
    }
    if (target.version === this.#activePolicySet) {
      return invalid([
        { code: 'ALREADY_ACTIVE', field: 'version', message: 'That version is already active.' },
      ]);
    }

    const previous = this.activePolicySet();
    // A rollback is a new version, not a deletion: history stays readable and
    // the audit events from the bad window still resolve to the rules that
    // produced them.
    const version: PolicySetVersion = Object.freeze({
      version: this.#nextVersion('ps'),
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      reason: `Rollback to ${target.version}: ${reason.trim()}`,
      basedOn: previous.version,
      policies: clone(target.policies),
    });

    this.#policySets.push(version);
    this.#activePolicySet = version.version;
    this.record(actor, 'POLICY_ROLLED_BACK', 'policy-set', version.version, previous.version, target.version, reason.trim());
    return valid(clone(version));
  }

  publishRegistry(actor: Identity, tools: Tool[], reason: string): Result<RegistryVersion> {
    if (typeof reason !== 'string' || reason.trim() === '') {
      return invalid([{ code: 'REASON_REQUIRED', field: 'reason', message: 'A registry change requires a reason.' }]);
    }
    const previous = this.activeRegistry();
    const version: RegistryVersion = Object.freeze({
      version: this.#nextVersion('reg'),
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      reason: reason.trim(),
      basedOn: previous.version,
      tools: clone(tools),
    });
    this.#registries.push(version);
    this.#activeRegistry = version.version;
    this.record(actor, 'REGISTRY_PUBLISHED', 'registry', version.version, previous.version, version.version, reason.trim());
    return valid(clone(version));
  }

  grantException(actor: Identity, draft: ExceptionDraft, now: Date): Result<GovernanceException> {
    const validated = validateExceptionDraft(draft, {
      now,
      knownPolicyIds: this.activePolicySet().policies.map((policy) => policy.id),
      tools: this.activeRegistry().tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        approved: tool.approvalStatus === 'APPROVED',
      })),
      knownUserIds: knownUserIds(),
      knownGroupIds: SEED_GROUPS,
    });
    if (!validated.ok) {
      // A refused attempt is itself governance-relevant: somebody tried to
      // suppress a control, and that should be visible even though it failed.
      this.record(
        actor,
        'REJECTED_ATTEMPT',
        'exception',
        String(draft.subject?.id ?? 'unknown'),
        null,
        { errors: validated.errors.map((error) => error.code) },
        null,
      );
      return validated;
    }

    const exception: GovernanceException = Object.freeze({
      ...validated.value,
      id: this.#nextId('EX'),
      grantedBy: actor.id,
      grantedAt: new Date().toISOString(),
      revokedAt: null,
      revokedBy: null,
    });

    this.#exceptions.push(exception);
    this.record(
      actor,
      'EXCEPTION_GRANTED',
      'exception',
      exception.id,
      null,
      exception,
      exception.justification,
    );
    return valid(clone(exception));
  }

  revokeException(actor: Identity, exceptionId: string, reason: string): Result<GovernanceException> {
    const index = this.#exceptions.findIndex((exception) => exception.id === exceptionId);
    const existing = this.#exceptions[index];
    if (index === -1 || !existing) {
      return invalid([{ code: 'UNKNOWN_EXCEPTION', field: 'id', message: `Unknown exception ${exceptionId}.` }]);
    }
    if (existing.revokedAt !== null) {
      return invalid([{ code: 'ALREADY_REVOKED', field: 'id', message: 'That exception is already revoked.' }]);
    }

    const revoked: GovernanceException = Object.freeze({
      ...existing,
      revokedAt: new Date().toISOString(),
      revokedBy: actor.id,
    });
    this.#exceptions[index] = revoked;
    this.record(actor, 'EXCEPTION_REVOKED', 'exception', exceptionId, existing, revoked, reason || null);
    return valid(clone(revoked));
  }

  createRequest(requester: Identity, draft: RequestDraft): Result<AccessRequest> {
    const validated = validateRequestDraft(draft);
    if (!validated.ok) return validated;

    const now = new Date().toISOString();
    const request: AccessRequest = {
      ...validated.value,
      id: this.#nextId('REQ'),
      requesterId: requester.id,
      state: 'SUBMITTED',
      createdAt: now,
      transitions: [{ at: now, actorId: requester.id, from: null, to: 'SUBMITTED', reason: null }],
      resultingExceptionId: null,
    };

    this.#requests.push(request);
    return valid(clone(request));
  }

  transitionRequest(
    actor: Identity,
    requestId: string,
    to: RequestState,
    reason: string | null,
    resultingExceptionId: string | null,
  ): Result<AccessRequest> {
    const index = this.#requests.findIndex((request) => request.id === requestId);
    const existing = this.#requests[index];
    if (index === -1 || !existing) {
      return invalid([{ code: 'UNKNOWN_REQUEST', field: 'id', message: `Unknown request ${requestId}.` }]);
    }
    if (!canTransition(existing.state, to)) {
      return invalid([
        {
          code: 'INVALID_TRANSITION',
          field: 'state',
          message: `A request in state ${existing.state} cannot move to ${to}.`,
        },
      ]);
    }

    const updated: AccessRequest = {
      ...existing,
      state: to,
      resultingExceptionId: resultingExceptionId ?? existing.resultingExceptionId,
      transitions: [
        ...existing.transitions,
        { at: new Date().toISOString(), actorId: actor.id, from: existing.state, to, reason },
      ],
    };
    this.#requests[index] = updated;
    return valid(clone(updated));
  }

  /**
   * Adds a dated, attributed note without changing state, for outcomes the
   * requester needs to see that are not a decision: an approval that was
   * attempted and refused, for instance.
   */
  annotateRequest(actor: Identity, requestId: string, reason: string): Result<AccessRequest> {
    const index = this.#requests.findIndex((request) => request.id === requestId);
    const existing = this.#requests[index];
    if (index === -1 || !existing) {
      return invalid([{ code: 'UNKNOWN_REQUEST', field: 'id', message: `Unknown request ${requestId}.` }]);
    }
    const updated: AccessRequest = {
      ...existing,
      transitions: [
        ...existing.transitions,
        { at: new Date().toISOString(), actorId: actor.id, from: existing.state, to: existing.state, reason },
      ],
    };
    this.#requests[index] = updated;
    return valid(clone(updated));
  }

  #nextVersion(prefix: string): string {
    const pool = prefix === 'ps' ? this.#policySets : this.#registries;
    return `${prefix}-${new Date().getFullYear()}.${pool.length + 1}`;
  }
}

/**
 * Actions that widen access need a stated reason. Checked here as well as in the
 * route so that a new route cannot quietly skip it.
 */
export function requiresReason(action: GovernanceAction): boolean {
  return ACCESS_WIDENING_ACTIONS.includes(action);
}
