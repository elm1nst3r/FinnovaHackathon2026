import { CLASSIFICATIONS } from './model.ts';
import type { Classification, GovernanceException, Tool } from './model.ts';
import { decide } from './engine.ts';
import type { EnforcementContext } from './engine.ts';
import { exceptionApplies } from './exceptions.ts';

export interface PermissionCell {
  classification: Classification;
  permitted: boolean;
  /** Why, in the employee's words rather than the rule engine's. */
  reason: string;
  wideningExceptionIds: string[];
}

export interface ToolPermissions {
  tool: Tool;
  approvalStatus: Tool['approvalStatus'];
  cells: PermissionCell[];
}

export interface PermissionsSubject {
  userId: string;
  groups: string[];
  pseudonymId: string;
}

/**
 * Answers "what may I use this for" by asking the same engine the enforcement
 * point asks, with nothing detected. Deriving the matrix from the engine rather
 * than from a parallel reading of the rules is what stops the two drifting
 * apart and telling the employee something the extension then contradicts.
 */
export function effectivePermissions(
  subject: PermissionsSubject,
  context: EnforcementContext,
  now: Date,
): ToolPermissions[] {
  return context.registry.tools.map((tool) => ({
    tool,
    approvalStatus: tool.approvalStatus,
    cells: CLASSIFICATIONS.map((classification) => {
      const result = decide(
        {
          userId: subject.userId,
          groups: subject.groups,
          pseudonymId: subject.pseudonymId,
          toolId: tool.id,
          toolLabel: tool.name,
          classification,
          detectedCategories: [],
          now,
        },
        context,
      );

      const wideningExceptionIds = result.exceptionIds;
      const permitted = result.decision !== 'BLOCK';

      return {
        classification,
        permitted,
        reason: explain(result.decision, result.reasons, tool, wideningExceptionIds, context, now),
        wideningExceptionIds,
      };
    }),
  }));
}

function explain(
  decision: string,
  reasons: { policyId: string; name: string }[],
  tool: Tool,
  wideningExceptionIds: string[],
  context: EnforcementContext,
  now: Date,
): string {
  if (decision === 'BLOCK') {
    if (tool.approvalStatus === 'NOT_APPROVED') return 'This tool is not approved for Finnova use.';
    const names = reasons.map((reason) => `${reason.name} (${reason.policyId})`);
    return names.length > 0 ? `Blocked by ${names.join(' and ')}.` : 'Blocked.';
  }

  if (wideningExceptionIds.length > 0) {
    // The expiry is deliberately not formatted here: this runs on the server,
    // whose clock and zone are not the employee's. The view that shows the
    // cell has the exception itself and formats the day like everything else.
    return `Permitted under exception ${wideningExceptionIds.join(', ')}`;
  }

  if (decision === 'MAKE_SAFE') {
    return 'Permitted; sensitive items are removed before sending.';
  }
  return 'Permitted.';
}

/** The exceptions a person is entitled to see: their own, and only their own. */
export function ownExceptions(
  exceptions: readonly GovernanceException[],
  subject: PermissionsSubject,
  now: Date,
): GovernanceException[] {
  return exceptions.filter((exception) =>
    CLASSIFICATIONS.some((classification) =>
      exceptionApplies(exception, {
        now,
        userId: subject.userId,
        groups: subject.groups,
        toolId: exception.scope.toolId,
        classification,
      }),
    ),
  );
}
