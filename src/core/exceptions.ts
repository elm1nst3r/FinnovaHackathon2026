import {
  CLASSIFICATIONS,
  NON_SUPPRESSIBLE_POLICY_IDS,
  invalid,
  isSuppressible,
  valid,
} from './model.ts';
import type {
  Classification,
  GovernanceException,
  Result,
  ValidationError,
} from './model.ts';

/**
 * An exception that outlives the reason it was granted for stops being an
 * exception and becomes an undocumented policy change.
 */
export const MAX_EXCEPTION_DAYS = 90;

/** Exceptions expiring inside this window are highlighted to governance. */
export const EXPIRY_WARNING_DAYS = 14;

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExceptionDraft {
  subject?: { kind?: string; id?: string };
  scope?: { toolId?: string; classifications?: string[] };
  suppressedPolicyIds?: string[];
  justification?: string;
  expiresAt?: string;
  sourceRequestId?: string | null;
}

export interface ExceptionToolRef {
  id: string;
  name: string;
  approved: boolean;
}

export interface ExceptionValidationContext {
  now: Date;
  knownPolicyIds: readonly string[];
  tools: readonly ExceptionToolRef[];
  knownUserIds: readonly string[];
  knownGroupIds: readonly string[];
}

export type ValidatedException = Omit<
  GovernanceException,
  'id' | 'grantedBy' | 'grantedAt' | 'revokedAt' | 'revokedBy'
>;

/**
 * Every field is mandatory, including the expiry. The non-suppressible check
 * runs here so it applies to every route into the store — the request approval
 * path builds exceptions too, and must not get a softer rule.
 */
export function validateExceptionDraft(
  draft: ExceptionDraft,
  context: ExceptionValidationContext,
): Result<ValidatedException> {
  const errors: ValidationError[] = [];

  const subjectKind = draft.subject?.kind;
  const subjectId = draft.subject?.id;
  if (subjectKind !== 'USER' && subjectKind !== 'GROUP') {
    errors.push({
      code: 'SUBJECT_REQUIRED',
      field: 'subject.kind',
      message: 'An exception must name a user or a group.',
    });
  } else if (typeof subjectId !== 'string' || subjectId.trim() === '') {
    errors.push({ code: 'SUBJECT_REQUIRED', field: 'subject.id', message: 'A subject is required.' });
  } else {
    const known = subjectKind === 'USER' ? context.knownUserIds : context.knownGroupIds;
    if (!known.includes(subjectId)) {
      errors.push({
        code: 'UNKNOWN_SUBJECT',
        field: 'subject.id',
        message: `Unknown ${subjectKind.toLowerCase()} "${subjectId}".`,
      });
    }
  }

  const toolId = draft.scope?.toolId;
  const tool =
    typeof toolId === 'string' ? context.tools.find((entry) => entry.id === toolId.trim()) : undefined;
  if (typeof toolId !== 'string' || toolId.trim() === '') {
    errors.push({ code: 'SCOPE_REQUIRED', field: 'scope.toolId', message: 'A tool is required.' });
  } else if (tool === undefined) {
    errors.push({
      code: 'UNKNOWN_TOOL',
      field: 'scope.toolId',
      message: `Tool "${toolId}" is not in the registry. Assess and register it first.`,
    });
  } else if (!tool.approved) {
    // An exception licenses data, not tools. Allowing one here would make the
    // tool approval process optional for anyone willing to ask nicely, which
    // is the same bypass the request queue is not allowed to be.
    errors.push({
      code: 'TOOL_NOT_APPROVED',
      field: 'scope.toolId',
      message: `"${tool.name}" is registered but not approved for Finnova use. Assess the tool and change its status; an exception cannot stand in for that.`,
    });
  }

  const classifications = draft.scope?.classifications;
  if (!Array.isArray(classifications) || classifications.length === 0) {
    errors.push({
      code: 'SCOPE_REQUIRED',
      field: 'scope.classifications',
      message: 'At least one data classification is required.',
    });
  } else {
    const unknown = classifications.filter(
      (value) => !(CLASSIFICATIONS as readonly string[]).includes(value),
    );
    if (unknown.length > 0) {
      errors.push({
        code: 'UNKNOWN_VALUE',
        field: 'scope.classifications',
        message: `Unknown classification(s): ${unknown.join(', ')}.`,
      });
    }
  }

  const policyIds = draft.suppressedPolicyIds;
  if (!Array.isArray(policyIds) || policyIds.length === 0) {
    errors.push({
      code: 'POLICIES_REQUIRED',
      field: 'suppressedPolicyIds',
      message: 'An exception must name the policies it suppresses.',
    });
  } else {
    const unknown = policyIds.filter((id) => !context.knownPolicyIds.includes(id));
    if (unknown.length > 0) {
      errors.push({
        code: 'UNKNOWN_POLICY',
        field: 'suppressedPolicyIds',
        message: `Unknown policy/policies: ${unknown.join(', ')}.`,
      });
    }
    const forbidden = policyIds.filter((id) => !isSuppressible(id));
    if (forbidden.length > 0) {
      // Rejected wholesale rather than partially applied: a half-granted
      // exception would leave the requester believing they had access.
      errors.push({
        code: 'NON_SUPPRESSIBLE_POLICY',
        field: 'suppressedPolicyIds',
        message: `${forbidden.join(', ')} cannot be suppressed by any exception. Non-suppressible policies: ${NON_SUPPRESSIBLE_POLICY_IDS.join(', ')}.`,
      });
    }
  }

  const justification = draft.justification;
  if (typeof justification !== 'string' || justification.trim() === '') {
    errors.push({
      code: 'JUSTIFICATION_REQUIRED',
      field: 'justification',
      message: 'A justification is required for any action that widens access.',
    });
  }

  const expiresAt = draft.expiresAt;
  if (typeof expiresAt !== 'string' || expiresAt.trim() === '') {
    errors.push({
      code: 'EXPIRY_REQUIRED',
      field: 'expiresAt',
      message: 'An exception without an expiry is a policy change in disguise.',
    });
  } else {
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) {
      errors.push({ code: 'EXPIRY_INVALID', field: 'expiresAt', message: 'Expiry is not a valid date.' });
    } else if (expiry.getTime() <= context.now.getTime()) {
      errors.push({
        code: 'EXPIRY_IN_PAST',
        field: 'expiresAt',
        message: 'Expiry must be in the future.',
      });
    } else if (expiry.getTime() - context.now.getTime() > (MAX_EXCEPTION_DAYS + 1) * DAY_MS) {
      // Plus one day: the maximum is a calendar day, and the cockpit stores an
      // expiry as the end of that day, so "90 days out" is up to 91 x 24h away.
      errors.push({
        code: 'EXPIRY_TOO_FAR',
        field: 'expiresAt',
        message: `Expiry may be at most ${MAX_EXCEPTION_DAYS} days out.`,
      });
    }
  }

  if (errors.length > 0) return invalid(errors);

  return valid({
    subject: { kind: subjectKind as 'USER' | 'GROUP', id: (subjectId as string).trim() },
    scope: {
      toolId: (toolId as string).trim(),
      classifications: classifications as Classification[],
    },
    suppressedPolicyIds: policyIds as string[],
    justification: (justification as string).trim(),
    expiresAt: new Date(expiresAt as string).toISOString(),
    sourceRequestId: draft.sourceRequestId ?? null,
  });
}

export interface ExceptionMatchContext {
  now: Date;
  userId: string;
  groups: readonly string[];
  toolId: string;
  classification: Classification;
}

export function isActive(exception: GovernanceException, now: Date): boolean {
  if (exception.revokedAt !== null) return false;
  return new Date(exception.expiresAt).getTime() > now.getTime();
}

export function appliesToSubject(
  exception: GovernanceException,
  userId: string,
  groups: readonly string[],
): boolean {
  return exception.subject.kind === 'USER'
    ? exception.subject.id === userId
    : groups.includes(exception.subject.id);
}

export function exceptionApplies(
  exception: GovernanceException,
  context: ExceptionMatchContext,
): boolean {
  if (!isActive(exception, context.now)) return false;
  if (!appliesToSubject(exception, context.userId, context.groups)) return false;
  if (exception.scope.toolId !== context.toolId) return false;
  return exception.scope.classifications.includes(context.classification);
}

export interface Suppression {
  policyIds: string[];
  exceptionIds: string[];
}

export function resolveSuppression(
  exceptions: readonly GovernanceException[],
  context: ExceptionMatchContext,
): Suppression {
  const policyIds = new Set<string>();
  const exceptionIds: string[] = [];

  for (const exception of exceptions) {
    if (!exceptionApplies(exception, context)) continue;
    let contributed = false;
    for (const policyId of exception.suppressedPolicyIds) {
      // Defence in depth: even a store that somehow contains a forbidden
      // suppression cannot make the enforcement point act on it.
      if (!isSuppressible(policyId)) continue;
      policyIds.add(policyId);
      contributed = true;
    }
    if (contributed) exceptionIds.push(exception.id);
  }

  return { policyIds: [...policyIds].sort(), exceptionIds };
}

export function expiresWithin(exception: GovernanceException, now: Date, days: number): boolean {
  if (!isActive(exception, now)) return false;
  return new Date(exception.expiresAt).getTime() - now.getTime() <= days * DAY_MS;
}
