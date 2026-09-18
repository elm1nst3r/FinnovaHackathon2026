import {
  PERSONAL_DATA_CATEGORIES,
  SANITISABLE_CATEGORIES,
  isSuppressible,
  mostRestrictive,
} from './model.ts';
import type {
  AuditEvent,
  Classification,
  Decision,
  DetectionCategory,
  GovernanceException,
  Policy,
  PolicySetVersion,
  RegistryVersion,
  ShadowOutcome,
  Tool,
} from './model.ts';
import { policyMatches } from './policy.ts';
import { resolveSuppression } from './exceptions.ts';

export interface DecisionRequest {
  userId: string;
  groups: string[];
  pseudonymId: string;
  /** Tool the interaction is happening in; may be absent from the registry. */
  toolId: string;
  toolLabel: string;
  classification: Classification;
  detectedCategories: DetectionCategory[];
  now: Date;
}

export interface EnforcementContext {
  policySet: PolicySetVersion;
  registry: RegistryVersion;
  /** Only the calling user's own exceptions. The engine never sees anyone else's. */
  exceptions: readonly GovernanceException[];
}

export interface DecisionResult {
  decision: Decision;
  tool: Tool | null;
  toolKnown: boolean;
  matchedPolicyIds: string[];
  blockingPolicyIds: string[];
  suppressedPolicyIds: string[];
  exceptionIds: string[];
  shadowOutcomes: ShadowOutcome[];
  reasons: PolicyReason[];
  sanitiseCategories: DetectionCategory[];
  alternatives: Tool[];
  canRequestAccess: boolean;
  requestBlockedBy: string[];
  policySetVersion: string;
  registryVersion: string;
}

export interface PolicyReason {
  policyId: string;
  name: string;
  outcome: Decision;
  rationale: string;
}

/**
 * A tool the registry has never heard of is treated as not approved rather than
 * as an error. Shadow IT is the case this product exists for, so it has to have
 * a decision, not an exception path.
 */
function unregisteredTool(toolId: string, toolLabel: string): Tool {
  return {
    id: toolId,
    name: toolLabel,
    hosts: [],
    approvalStatus: 'NOT_APPROVED',
    hostingRegion: 'OTHER',
    trainsOnCustomerData: true,
    accessControl: 'NONE',
    allowedData: [],
    permitsPersonalData: false,
    assessedBy: '',
    assessedAt: '',
  };
}

export function findTool(registry: RegistryVersion, toolId: string): Tool | null {
  return registry.tools.find((tool) => tool.id === toolId) ?? null;
}

export function findToolByHost(registry: RegistryVersion, host: string): Tool | null {
  const needle = host.toLowerCase();
  return (
    registry.tools.find((tool) =>
      tool.hosts.some((candidate) => needle === candidate || needle.endsWith(`.${candidate}`)),
    ) ?? null
  );
}

function containsPersonalData(categories: readonly DetectionCategory[]): boolean {
  return categories.some((category) => PERSONAL_DATA_CATEGORIES.includes(category));
}

function safeAlternatives(
  registry: RegistryVersion,
  currentToolId: string,
  classification: Classification,
  categories: readonly DetectionCategory[],
): Tool[] {
  const needsPersonalData = containsPersonalData(categories);
  return registry.tools.filter(
    (tool) =>
      tool.id !== currentToolId &&
      tool.approvalStatus === 'APPROVED' &&
      tool.allowedData.includes(classification) &&
      (!needsPersonalData || tool.permitsPersonalData),
  );
}

/**
 * The whole decision, in one pure function. Suppression is applied before
 * precedence so the remaining rules still run and the audit event can say
 * exactly what was set aside and under which exception.
 */
export function decide(request: DecisionRequest, context: EnforcementContext): DecisionResult {
  const registeredTool = findTool(context.registry, request.toolId);
  const tool = registeredTool ?? unregisteredTool(request.toolId, request.toolLabel);

  const suppression = resolveSuppression(context.exceptions, {
    now: request.now,
    userId: request.userId,
    groups: request.groups,
    toolId: request.toolId,
    classification: request.classification,
  });

  const inputs = {
    classification: request.classification,
    detectedCategories: request.detectedCategories,
    tool,
  };

  const matched: Policy[] = [];
  const shadowOutcomes: ShadowOutcome[] = [];

  for (const policy of context.policySet.policies) {
    if (policy.state === 'RETIRED') continue;
    if (!policyMatches(policy, inputs)) continue;

    if (policy.state === 'SHADOW') {
      shadowOutcomes.push({ policyId: policy.id, wouldHaveBeen: policy.outcome });
      continue;
    }
    if (suppression.policyIds.includes(policy.id)) continue;

    matched.push(policy);
  }

  const decision = mostRestrictive(matched.map((policy) => policy.outcome));
  const blockingPolicyIds = matched
    .filter((policy) => policy.outcome === 'BLOCK')
    .map((policy) => policy.id);

  const requestBlockedBy = blockingPolicyIds.filter((id) => !isSuppressible(id));

  return {
    decision,
    tool: registeredTool,
    toolKnown: registeredTool !== null,
    matchedPolicyIds: matched.map((policy) => policy.id),
    blockingPolicyIds,
    suppressedPolicyIds: suppression.policyIds,
    exceptionIds: suppression.exceptionIds,
    shadowOutcomes,
    reasons: matched.map((policy) => ({
      policyId: policy.id,
      name: policy.name,
      outcome: policy.outcome,
      rationale: policy.rationale,
    })),
    sanitiseCategories:
      decision === 'MAKE_SAFE'
        ? request.detectedCategories.filter((category) => SANITISABLE_CATEGORIES.includes(category))
        : [],
    alternatives: safeAlternatives(
      context.registry,
      request.toolId,
      request.classification,
      request.detectedCategories,
    ),
    canRequestAccess: blockingPolicyIds.length > 0 && requestBlockedBy.length === 0,
    requestBlockedBy,
    policySetVersion: context.policySet.version,
    registryVersion: context.registry.version,
  };
}

/**
 * Derives the audit event from a decision. There is no user id parameter, so
 * there is no way to accidentally write one.
 */
export function toAuditEvent(
  id: string,
  request: DecisionRequest,
  result: DecisionResult,
): AuditEvent {
  return {
    id,
    at: request.now.toISOString(),
    pseudonymId: request.pseudonymId,
    toolId: request.toolId,
    classification: request.classification,
    decision: result.decision,
    matchedPolicyIds: result.matchedPolicyIds,
    suppressedPolicyIds: result.suppressedPolicyIds,
    exceptionIds: result.exceptionIds,
    detectedCategories: request.detectedCategories,
    policySetVersion: result.policySetVersion,
    registryVersion: result.registryVersion,
    shadowOutcomes: result.shadowOutcomes,
  };
}
