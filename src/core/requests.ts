import { CLASSIFICATIONS, invalid, valid } from './model.ts';
import type {
  AccessRequest,
  Classification,
  RequestState,
  Result,
  ValidationError,
} from './model.ts';

export interface RequestDraft {
  toolId?: string | null;
  toolLabel?: string;
  classification?: string;
  blockingPolicyIds?: string[];
  justification?: string;
}

export type ValidatedRequest = Pick<
  AccessRequest,
  'toolId' | 'toolLabel' | 'classification' | 'blockingPolicyIds' | 'justification'
>;

const MAX_JUSTIFICATION = 2000;

/**
 * Builds the request from an allow-list of fields. Anything else the caller
 * sends — prompt text above all — is not copied, so a careless client cannot
 * turn the request queue into a place where prompts are readable.
 */
export function validateRequestDraft(draft: RequestDraft): Result<ValidatedRequest> {
  const errors: ValidationError[] = [];

  const toolLabel = draft.toolLabel;
  if (typeof toolLabel !== 'string' || toolLabel.trim() === '') {
    errors.push({ code: 'TOOL_REQUIRED', field: 'toolLabel', message: 'A tool is required.' });
  }

  const classification = draft.classification;
  if (
    typeof classification !== 'string' ||
    !(CLASSIFICATIONS as readonly string[]).includes(classification)
  ) {
    errors.push({
      code: 'INVALID_CLASSIFICATION',
      field: 'classification',
      message: `Classification must be one of ${CLASSIFICATIONS.join(', ')}.`,
    });
  }

  const blockingPolicyIds = draft.blockingPolicyIds;
  if (!Array.isArray(blockingPolicyIds) || blockingPolicyIds.length === 0) {
    errors.push({
      code: 'BLOCKING_POLICY_REQUIRED',
      field: 'blockingPolicyIds',
      message: 'A request starts from an intervention and must name the policy that blocked.',
    });
  } else if (blockingPolicyIds.some((id) => typeof id !== 'string')) {
    errors.push({
      code: 'BLOCKING_POLICY_REQUIRED',
      field: 'blockingPolicyIds',
      message: 'Policy IDs must be strings.',
    });
  }

  const justification = draft.justification;
  if (typeof justification !== 'string' || justification.trim() === '') {
    errors.push({
      code: 'JUSTIFICATION_REQUIRED',
      field: 'justification',
      message: 'Say why you need this. It is the one field only you can fill in.',
    });
  } else if (justification.length > MAX_JUSTIFICATION) {
    errors.push({
      code: 'JUSTIFICATION_TOO_LONG',
      field: 'justification',
      message: `Keep the justification under ${MAX_JUSTIFICATION} characters.`,
    });
  }

  if (errors.length > 0) return invalid(errors);

  return valid({
    toolId: typeof draft.toolId === 'string' && draft.toolId.trim() !== '' ? draft.toolId : null,
    toolLabel: (toolLabel as string).trim(),
    classification: classification as Classification,
    blockingPolicyIds: blockingPolicyIds as string[],
    justification: (justification as string).trim(),
  });
}

const ALLOWED_TRANSITIONS: Record<RequestState, readonly RequestState[]> = {
  SUBMITTED: ['INFORMATION_REQUESTED', 'APPROVED', 'REJECTED'],
  INFORMATION_REQUESTED: ['SUBMITTED', 'APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

export function canTransition(from: RequestState, to: RequestState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: RequestState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

export function isOpen(request: AccessRequest): boolean {
  return !isTerminal(request.state);
}

export function ageInDays(request: AccessRequest, now: Date): number {
  return Math.floor((now.getTime() - new Date(request.createdAt).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Groups open requests by tool and classification. Three people asking for the
 * same thing is a signal about the rule, not about the three people.
 */
export function recurringScopes(
  requests: readonly AccessRequest[],
): { toolLabel: string; classification: Classification; requestIds: string[] }[] {
  const groups = new Map<string, { toolLabel: string; classification: Classification; requestIds: string[] }>();

  for (const request of requests) {
    // Unregistered tools have no id, only whatever the requester typed, so the
    // label is normalised: "DeepSeek" and "deepseek " are the same pattern.
    const key = `${request.toolId ?? request.toolLabel.trim().toLowerCase()}|${request.classification}`;
    const existing = groups.get(key);
    if (existing) {
      existing.requestIds.push(request.id);
    } else {
      groups.set(key, {
        toolLabel: request.toolLabel,
        classification: request.classification,
        requestIds: [request.id],
      });
    }
  }

  return [...groups.values()].filter((group) => group.requestIds.length > 1);
}
