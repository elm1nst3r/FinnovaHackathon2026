import {
  CLASSIFICATIONS,
  DECISIONS,
  DETECTION_CATEGORIES,
  APPROVAL_STATUSES,
  HOSTING_REGIONS,
  PERSONAL_DATA_CATEGORIES,
  POLICY_INPUTS,
  POLICY_STATES,
  SANITISABLE_CATEGORIES,
  invalid,
  valid,
} from './model.ts';
import type {
  Classification,
  Condition,
  DetectionCategory,
  Policy,
  Result,
  Tool,
  ValidationError,
} from './model.ts';

export interface EvaluationInputs {
  classification: Classification;
  detectedCategories: DetectionCategory[];
  tool: Tool;
}

/**
 * Scoped to personal data on purpose. Credentials are never sanitised, but they
 * are CH-AI-CRED-01's business; letting them drag the personal-data rules into
 * "not sanitisable" would make the audit trail name the wrong reason.
 */
function allSanitisable(categories: readonly DetectionCategory[]): boolean {
  return categories
    .filter((category) => PERSONAL_DATA_CATEGORIES.includes(category))
    .every((category) => SANITISABLE_CATEGORIES.includes(category));
}

export function evaluateCondition(condition: Condition, inputs: EvaluationInputs): boolean {
  switch (condition.input) {
    case 'classification':
      return condition.values.includes(inputs.classification);
    case 'detectedCategories': {
      const hit = condition.values.some((category) => inputs.detectedCategories.includes(category));
      return condition.operator === 'includesAny' ? hit : !hit;
    }
    case 'sanitisability':
      return condition.operator === 'allSanitisable'
        ? allSanitisable(inputs.detectedCategories)
        : !allSanitisable(inputs.detectedCategories);
    case 'toolApprovalStatus':
      return condition.values.includes(inputs.tool.approvalStatus);
    case 'toolAllowedData': {
      const contains = inputs.tool.allowedData.includes(condition.value);
      return condition.operator === 'contains' ? contains : !contains;
    }
    case 'toolPermitsPersonalData':
      return inputs.tool.permitsPersonalData === condition.value;
    case 'toolHostingRegion':
      return condition.values.includes(inputs.tool.hostingRegion);
    case 'toolTrainsOnCustomerData':
      return inputs.tool.trainsOnCustomerData === condition.value;
  }
}

/** Conditions are combined with AND. A policy with no conditions never matches. */
export function policyMatches(policy: Policy, inputs: EvaluationInputs): boolean {
  if (policy.conditions.length === 0) return false;
  return policy.conditions.every((condition) => evaluateCondition(condition, inputs));
}

/**
 * The domains and operators below are the whole vocabulary of a rule. They are
 * exported so the cockpit's editor can be built from them: an editor driven by
 * the same tables that validate cannot offer a rule the engine will not run.
 */
export const VALUE_DOMAINS: Record<string, readonly string[]> = {
  classification: CLASSIFICATIONS,
  detectedCategories: DETECTION_CATEGORIES,
  toolApprovalStatus: APPROVAL_STATUSES,
  toolAllowedData: CLASSIFICATIONS,
  toolHostingRegion: HOSTING_REGIONS,
};

export const SUPPORTED_OPERATORS: Record<string, readonly string[]> = {
  classification: ['in'],
  detectedCategories: ['includesAny', 'includesNone'],
  sanitisability: ['allSanitisable', 'anyNotSanitisable'],
  toolApprovalStatus: ['in'],
  toolAllowedData: ['contains', 'notContains'],
  toolPermitsPersonalData: ['is'],
  toolHostingRegion: ['in'],
  toolTrainsOnCustomerData: ['is'],
};

function validateCondition(raw: unknown, index: number): ValidationError[] {
  const field = `conditions[${index}]`;
  if (typeof raw !== 'object' || raw === null) {
    return [{ code: 'CONDITION_MALFORMED', field, message: 'Condition must be an object.' }];
  }
  const candidate = raw as Record<string, unknown>;
  const input = candidate['input'];

  if (typeof input !== 'string' || !(POLICY_INPUTS as readonly string[]).includes(input)) {
    return [
      {
        code: 'UNSUPPORTED_INPUT',
        field: `${field}.input`,
        message: `The enforcement layer does not evaluate the input "${String(input)}". Supported inputs: ${POLICY_INPUTS.join(', ')}.`,
      },
    ];
  }

  const operator = candidate['operator'];
  const allowedOperators = SUPPORTED_OPERATORS[input] ?? [];
  if (typeof operator !== 'string' || !allowedOperators.includes(operator)) {
    return [
      {
        code: 'UNSUPPORTED_OPERATOR',
        field: `${field}.operator`,
        message: `Operator "${String(operator)}" is not supported for input "${input}". Supported: ${allowedOperators.join(', ')}.`,
      },
    ];
  }

  const domain = VALUE_DOMAINS[input];
  if (allowedOperators.includes('in') && operator === 'in') {
    const values = candidate['values'];
    if (!Array.isArray(values) || values.length === 0) {
      return [
        { code: 'VALUES_REQUIRED', field: `${field}.values`, message: 'At least one value is required.' },
      ];
    }
    const unknown = values.filter((value) => !domain?.includes(value as string));
    if (unknown.length > 0) {
      return [
        {
          code: 'UNKNOWN_VALUE',
          field: `${field}.values`,
          message: `Unknown value(s): ${unknown.join(', ')}.`,
        },
      ];
    }
  }

  if (input === 'detectedCategories') {
    const values = candidate['values'];
    if (!Array.isArray(values) || values.length === 0) {
      return [
        { code: 'VALUES_REQUIRED', field: `${field}.values`, message: 'At least one category is required.' },
      ];
    }
    const unknown = values.filter((value) => !domain?.includes(value as string));
    if (unknown.length > 0) {
      return [
        {
          code: 'UNKNOWN_VALUE',
          field: `${field}.values`,
          message: `Unknown detection category/categories: ${unknown.join(', ')}.`,
        },
      ];
    }
  }

  if (input === 'toolAllowedData') {
    const value = candidate['value'];
    if (typeof value !== 'string' || !domain?.includes(value)) {
      return [
        {
          code: 'UNKNOWN_VALUE',
          field: `${field}.value`,
          message: `Unknown classification: ${String(value)}.`,
        },
      ];
    }
  }

  if (input === 'toolPermitsPersonalData' || input === 'toolTrainsOnCustomerData') {
    if (typeof candidate['value'] !== 'boolean') {
      return [
        { code: 'BOOLEAN_REQUIRED', field: `${field}.value`, message: 'Value must be true or false.' },
      ];
    }
  }

  return [];
}

const POLICY_ID_PATTERN = /^CH-AI-[A-Z]{2,6}-\d{2}$/;

/**
 * Rejects anything the enforcement layer could not evaluate, so an unpublishable
 * rule is caught in the editor rather than at the next employee's prompt.
 */
export function validatePolicy(raw: unknown): Result<Policy> {
  const errors: ValidationError[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return invalid([{ code: 'POLICY_MALFORMED', field: 'policy', message: 'Policy must be an object.' }]);
  }
  const candidate = raw as Record<string, unknown>;

  const id = candidate['id'];
  if (typeof id !== 'string' || !POLICY_ID_PATTERN.test(id)) {
    errors.push({
      code: 'INVALID_POLICY_ID',
      field: 'id',
      message: 'Policy ID must follow the shared scheme, for example CH-AI-PII-01.',
    });
  }

  const name = candidate['name'];
  if (typeof name !== 'string' || name.trim() === '') {
    errors.push({ code: 'NAME_REQUIRED', field: 'name', message: 'A human-readable name is required.' });
  }

  const outcome = candidate['outcome'];
  if (typeof outcome !== 'string' || !(DECISIONS as readonly string[]).includes(outcome)) {
    errors.push({
      code: 'INVALID_OUTCOME',
      field: 'outcome',
      message: `Outcome must be one of ${DECISIONS.join(', ')}.`,
    });
  }

  const state = candidate['state'];
  if (typeof state !== 'string' || !(POLICY_STATES as readonly string[]).includes(state)) {
    errors.push({
      code: 'INVALID_STATE',
      field: 'state',
      message: `State must be one of ${POLICY_STATES.join(', ')}.`,
    });
  }

  const conditions = candidate['conditions'];
  if (!Array.isArray(conditions) || conditions.length === 0) {
    errors.push({
      code: 'CONDITIONS_REQUIRED',
      field: 'conditions',
      message: 'A rule needs at least one condition; a rule that matches everything is not a rule.',
    });
  } else {
    conditions.forEach((condition, index) => errors.push(...validateCondition(condition, index)));
  }

  const rationale = candidate['rationale'];
  if (typeof rationale !== 'string' || rationale.trim() === '') {
    errors.push({
      code: 'RATIONALE_REQUIRED',
      field: 'rationale',
      message: 'State why this rule exists; a rule nobody can explain is a rule nobody can review.',
    });
  }

  if (errors.length > 0) return invalid(errors);

  return valid({
    id: id as string,
    name: (name as string).trim(),
    outcome: outcome as Policy['outcome'],
    state: state as Policy['state'],
    conditions: conditions as Condition[],
    rationale: (rationale as string).trim(),
  });
}

export function describeCondition(condition: Condition): string {
  switch (condition.input) {
    case 'classification':
      return `classification is one of ${condition.values.join(', ')}`;
    case 'detectedCategories':
      return `${condition.operator === 'includesAny' ? 'detected' : 'not detected'}: ${condition.values.join(', ')}`;
    case 'sanitisability':
      return condition.operator === 'allSanitisable'
        ? 'all detected items are sanitisable'
        : 'at least one detected item is not sanitisable';
    case 'toolApprovalStatus':
      return `tool approval status is one of ${condition.values.join(', ')}`;
    case 'toolAllowedData':
      return `tool ${condition.operator === 'contains' ? 'permits' : 'does not permit'} ${condition.value}`;
    case 'toolPermitsPersonalData':
      return `tool ${condition.value ? 'permits' : 'does not permit'} personal data`;
    case 'toolHostingRegion':
      return `tool hosting region is one of ${condition.values.join(', ')}`;
    case 'toolTrainsOnCustomerData':
      return `tool ${condition.value ? 'trains' : 'does not train'} on customer data`;
  }
}

export function describePolicy(policy: Policy): string {
  return `IF ${policy.conditions.map(describeCondition).join('\nAND ')}\nTHEN ${policy.outcome}`;
}

export type PolicyChangeKind = 'ADDED' | 'REMOVED' | 'MODIFIED';

export interface PolicyDiffEntry {
  kind: PolicyChangeKind;
  policyId: string;
  before: Policy | null;
  after: Policy | null;
}

/** Feeds the "show me what changes before I publish it" confirmation. */
export function diffPolicies(before: readonly Policy[], after: readonly Policy[]): PolicyDiffEntry[] {
  const beforeById = new Map(before.map((policy) => [policy.id, policy]));
  const afterById = new Map(after.map((policy) => [policy.id, policy]));
  const entries: PolicyDiffEntry[] = [];

  for (const [id, afterPolicy] of afterById) {
    const beforePolicy = beforeById.get(id);
    if (!beforePolicy) {
      entries.push({ kind: 'ADDED', policyId: id, before: null, after: afterPolicy });
    } else if (JSON.stringify(beforePolicy) !== JSON.stringify(afterPolicy)) {
      entries.push({ kind: 'MODIFIED', policyId: id, before: beforePolicy, after: afterPolicy });
    }
  }
  for (const [id, beforePolicy] of beforeById) {
    if (!afterById.has(id)) {
      entries.push({ kind: 'REMOVED', policyId: id, before: beforePolicy, after: null });
    }
  }
  return entries.sort((a, b) => a.policyId.localeCompare(b.policyId));
}
