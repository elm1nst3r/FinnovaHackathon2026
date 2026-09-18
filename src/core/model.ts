/**
 * The shared governance data model.
 *
 * This module is the single schema consumed by the cockpit, the policy service
 * and the enforcement point. Nothing here performs I/O, so the enforcement
 * point can import it into a browser extension unchanged.
 */

export const CLASSIFICATIONS = ['INTERNAL', 'CONFIDENTIAL', 'STRICTLY_CONFIDENTIAL'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const DECISIONS = ['ALLOW', 'MAKE_SAFE', 'BLOCK'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Restrictiveness order used by the precedence rule: BLOCK > MAKE_SAFE > ALLOW. */
const DECISION_RANK: Record<Decision, number> = { ALLOW: 0, MAKE_SAFE: 1, BLOCK: 2 };

export function decisionRank(decision: Decision): number {
  return DECISION_RANK[decision];
}

export function mostRestrictive(decisions: readonly Decision[]): Decision {
  let worst: Decision = 'ALLOW';
  for (const decision of decisions) {
    if (DECISION_RANK[decision] > DECISION_RANK[worst]) worst = decision;
  }
  return worst;
}

export const DETECTION_CATEGORIES = [
  'PERSON_NAME',
  'EMAIL',
  'PHONE',
  'IBAN',
  'CREDENTIAL',
  'SPECIAL_CATEGORY',
] as const;
export type DetectionCategory = (typeof DETECTION_CATEGORIES)[number];

/**
 * Categories that can be replaced by a placeholder without changing what the
 * request means. CREDENTIAL is deliberately absent: a redacted secret is still
 * evidence that a secret was about to leave. SPECIAL_CATEGORY is absent because
 * removing the identifier leaves the sensitive fact in the text.
 */
export const SANITISABLE_CATEGORIES: readonly DetectionCategory[] = [
  'PERSON_NAME',
  'EMAIL',
  'PHONE',
  'IBAN',
];

export const PERSONAL_DATA_CATEGORIES: readonly DetectionCategory[] = [
  'PERSON_NAME',
  'EMAIL',
  'PHONE',
  'IBAN',
  'SPECIAL_CATEGORY',
];

export const APPROVAL_STATUSES = ['APPROVED', 'RESTRICTED', 'NOT_APPROVED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const HOSTING_REGIONS = ['CH', 'EU', 'OTHER'] as const;
export type HostingRegion = (typeof HOSTING_REGIONS)[number];

export const ACCESS_CONTROLS = ['RBAC', 'TENANT_ISOLATION', 'NONE'] as const;
export type AccessControl = (typeof ACCESS_CONTROLS)[number];

export const POLICY_STATES = ['ACTIVE', 'SHADOW', 'RETIRED'] as const;
export type PolicyState = (typeof POLICY_STATES)[number];

/**
 * The closed set of inputs a rule may read. Anything outside this set is
 * rejected by `validatePolicy`, which is what keeps the rule editor structured
 * rather than a small programming language.
 */
export const POLICY_INPUTS = [
  'classification',
  'detectedCategories',
  'sanitisability',
  'toolApprovalStatus',
  'toolAllowedData',
  'toolPermitsPersonalData',
  'toolHostingRegion',
  'toolTrainsOnCustomerData',
] as const;
export type PolicyInput = (typeof POLICY_INPUTS)[number];

export type Condition =
  | { input: 'classification'; operator: 'in'; values: Classification[] }
  | { input: 'detectedCategories'; operator: 'includesAny' | 'includesNone'; values: DetectionCategory[] }
  | { input: 'sanitisability'; operator: 'allSanitisable' | 'anyNotSanitisable' }
  | { input: 'toolApprovalStatus'; operator: 'in'; values: ApprovalStatus[] }
  | { input: 'toolAllowedData'; operator: 'contains' | 'notContains'; value: Classification }
  | { input: 'toolPermitsPersonalData'; operator: 'is'; value: boolean }
  | { input: 'toolHostingRegion'; operator: 'in'; values: HostingRegion[] }
  | { input: 'toolTrainsOnCustomerData'; operator: 'is'; value: boolean };

export interface Policy {
  id: string;
  name: string;
  /** Conditions are combined with AND. Disjunction is expressed as two policies. */
  conditions: Condition[];
  outcome: Decision;
  state: PolicyState;
  rationale: string;
}

/**
 * These two policies can never be named in an exception. The list lives in code
 * rather than as a flag on the policy, because a flag that governance can edit
 * is not a control — it is a setting.
 *
 * CH-AI-CRED-01: a leaked credential is an incident, not a policy preference.
 * CH-AI-CONF-02: strictly confidential data leaves Finnova by a visible policy
 * decision or not at all, never through a per-user exception dialogue.
 */
export const NON_SUPPRESSIBLE_POLICY_IDS: readonly string[] = ['CH-AI-CRED-01', 'CH-AI-CONF-02'];

export function isSuppressible(policyId: string): boolean {
  return !NON_SUPPRESSIBLE_POLICY_IDS.includes(policyId);
}

/** An immutable snapshot. Publishing appends a version; it never mutates one. */
export interface PolicySetVersion {
  version: string;
  createdAt: string;
  createdBy: string;
  reason: string;
  basedOn: string | null;
  policies: Policy[];
}

export interface Tool {
  id: string;
  name: string;
  /** Hostnames the enforcement point recognises this tool by. */
  hosts: string[];
  approvalStatus: ApprovalStatus;
  hostingRegion: HostingRegion;
  trainsOnCustomerData: boolean;
  accessControl: AccessControl;
  /** Result of the ARB assessment, not re-derived at runtime. */
  allowedData: Classification[];
  permitsPersonalData: boolean;
  assessedBy: string;
  assessedAt: string;
}

export interface RegistryVersion {
  version: string;
  createdAt: string;
  createdBy: string;
  reason: string;
  basedOn: string | null;
  tools: Tool[];
}

export type SubjectKind = 'USER' | 'GROUP';

export interface ExceptionSubject {
  kind: SubjectKind;
  id: string;
}

export interface ExceptionScope {
  toolId: string;
  classifications: Classification[];
}

export interface GovernanceException {
  id: string;
  subject: ExceptionSubject;
  scope: ExceptionScope;
  suppressedPolicyIds: string[];
  justification: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  sourceRequestId: string | null;
}

export const REQUEST_STATES = [
  'SUBMITTED',
  'INFORMATION_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export interface RequestTransition {
  at: string;
  actorId: string;
  from: RequestState | null;
  to: RequestState;
  reason: string | null;
}

export interface AccessRequest {
  id: string;
  requesterId: string;
  /** Set when the requested tool is not in the registry; governance must assess it first. */
  toolId: string | null;
  toolLabel: string;
  classification: Classification;
  blockingPolicyIds: string[];
  justification: string;
  state: RequestState;
  createdAt: string;
  transitions: RequestTransition[];
  resultingExceptionId: string | null;
}

export const GOVERNANCE_ACTIONS = [
  'POLICY_PUBLISHED',
  'POLICY_ROLLED_BACK',
  'REGISTRY_PUBLISHED',
  'EXCEPTION_GRANTED',
  'EXCEPTION_REVOKED',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_INFORMATION_REQUESTED',
  'UNAUTHORISED_ATTEMPT',
  'REJECTED_ATTEMPT',
] as const;
export type GovernanceAction = (typeof GOVERNANCE_ACTIONS)[number];

/**
 * Actions that grant or widen access, and therefore require a free-text reason.
 * Revocation and rejection narrow access, so they are defensible without one —
 * though the request flow demands a reason for rejection separately, because a
 * person is waiting for that answer.
 */
export const ACCESS_WIDENING_ACTIONS: readonly GovernanceAction[] = [
  'EXCEPTION_GRANTED',
  'REQUEST_APPROVED',
  'POLICY_PUBLISHED',
  'POLICY_ROLLED_BACK',
  'REGISTRY_PUBLISHED',
];

/**
 * Attribution of a governance change. Kept in its own store, never joined with
 * audit events: these are actions by governance actors, not a record of anyone's
 * AI usage.
 */
export interface GovernanceRecord {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: GovernanceAction;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/**
 * The only record of an interaction that reaches a server. Pseudonymous by
 * construction: there is no user id field to populate.
 */
export interface AuditEvent {
  id: string;
  at: string;
  pseudonymId: string;
  toolId: string;
  classification: Classification;
  decision: Decision;
  matchedPolicyIds: string[];
  suppressedPolicyIds: string[];
  exceptionIds: string[];
  detectedCategories: DetectionCategory[];
  policySetVersion: string;
  registryVersion: string;
  shadowOutcomes: ShadowOutcome[];
}

export interface ShadowOutcome {
  policyId: string;
  wouldHaveBeen: Decision;
}

/**
 * The employee's own history entry. Same shape as the audit event minus the
 * pseudonym, and it never leaves the device it was written on.
 */
export interface LocalHistoryEntry {
  id: string;
  at: string;
  toolId: string;
  toolLabel: string;
  classification: Classification;
  decision: Decision;
  policyIds: string[];
  suppressedPolicyIds: string[];
  detectedCategories: DetectionCategory[];
  policySetVersion: string;
}

export interface Identity {
  id: string;
  displayName: string;
  groups: string[];
  /** Stable per-user pseudonym used in audit events. Not reversible here. */
  pseudonymId: string;
}

export const GOVERNANCE_GROUP = 'ai-governance';

export function isGovernanceMember(identity: Identity): boolean {
  return identity.groups.includes(GOVERNANCE_GROUP);
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

export interface ValidationError {
  code: string;
  field: string;
  message: string;
}

export function invalid(errors: ValidationError[]): Result<never> {
  return { ok: false, errors };
}

export function valid<T>(value: T): Result<T> {
  return { ok: true, value };
}
