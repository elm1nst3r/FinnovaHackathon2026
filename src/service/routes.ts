import { isGovernanceMember } from '../core/model.ts';
import type { AuditEvent, Classification, Decision, DetectionCategory, Tool } from '../core/model.ts';
import { DECISIONS, CLASSIFICATIONS, DETECTION_CATEGORIES } from '../core/model.ts';
import { diffPolicies } from '../core/policy.ts';
import { EXPIRY_WARNING_DAYS, expiresWithin, isActive } from '../core/exceptions.ts';
import { ageInDays, isOpen, recurringScopes } from '../core/requests.ts';
import { effectivePermissions } from '../core/permissions.ts';
import { badRequest, created, forbidden, notFound, ok } from './http.ts';
import type { Route, RouteContext } from './http.ts';
import { listIdentities } from './identity.ts';

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function enforcementContext(context: RouteContext) {
  return {
    policySet: context.store.activePolicySet(),
    registry: context.store.activeRegistry(),
    exceptions: context.store.exceptionsFor(context.identity, context.now),
  };
}

// ------------------------------------------------------------------ session

const session: Route = {
  method: 'GET',
  pattern: '/api/session',
  auth: 'authenticated',
  handler: ({ identity }) => {
    const governance = isGovernanceMember(identity);
    return ok({
      identity: { id: identity.id, displayName: identity.displayName, groups: identity.groups },
      views: governance ? ['employee', 'governance'] : ['employee'],
      // Offered so the demo can switch personas; a real deployment resolves
      // identity from the SSO assertion and this list does not exist.
      availableIdentities: listIdentities().map((candidate) => ({
        id: candidate.id,
        displayName: candidate.displayName,
        governance: isGovernanceMember(candidate),
      })),
    });
  },
};

// ------------------------------------------------- enforcement point reads

const policySet: Route = {
  method: 'GET',
  pattern: '/api/policy-set',
  auth: 'authenticated',
  handler: ({ store }) => ok(store.activePolicySet()),
};

const registry: Route = {
  method: 'GET',
  pattern: '/api/registry',
  auth: 'authenticated',
  handler: ({ store }) => ok(store.activeRegistry()),
};

const myExceptions: Route = {
  method: 'GET',
  pattern: '/api/my/exceptions',
  auth: 'authenticated',
  handler: ({ store, identity, now }) => ok({ exceptions: store.exceptionsFor(identity, now) }),
};

const myPermissions: Route = {
  method: 'GET',
  pattern: '/api/my/permissions',
  auth: 'authenticated',
  handler: (context) =>
    ok({
      permissions: effectivePermissions(
        {
          userId: context.identity.id,
          groups: context.identity.groups,
          pseudonymId: context.identity.pseudonymId,
        },
        enforcementContext(context),
        context.now,
      ),
    }),
};

const myRequests: Route = {
  method: 'GET',
  pattern: '/api/my/requests',
  auth: 'authenticated',
  handler: ({ store, identity }) => {
    const exceptions = store.exceptions();
    return ok({
      requests: store.requestsFor(identity.id).map((request) => ({
        ...request,
        grant:
          request.resultingExceptionId === null
            ? null
            : exceptions
                .filter((exception) => exception.id === request.resultingExceptionId)
                .map((exception) => ({
                  id: exception.id,
                  toolId: exception.scope.toolId,
                  classifications: exception.scope.classifications,
                  expiresAt: exception.expiresAt,
                }))[0] ?? null,
      })),
    });
  },
};

/*
 * There is deliberately no GET /api/my/history. Personal usage history lives in
 * the enforcement point on the employee's device; adding a server-side copy
 * would turn the privacy model from an architectural property into a setting.
 */

// -------------------------------------------------------------- audit write

const postAuditEvent: Route = {
  method: 'POST',
  pattern: '/api/audit-events',
  auth: 'authenticated',
  handler: ({ body, store, identity, now }) => {
    const raw = asRecord(body);

    const decision = text(raw['decision']) as Decision;
    const classification = text(raw['classification']) as Classification;
    if (!(DECISIONS as readonly string[]).includes(decision)) {
      return badRequest([{ code: 'INVALID_DECISION', field: 'decision', message: 'Unknown decision.' }]);
    }
    if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) {
      return badRequest([
        { code: 'INVALID_CLASSIFICATION', field: 'classification', message: 'Unknown classification.' },
      ]);
    }
    const toolId = text(raw['toolId']);
    if (toolId === '') {
      return badRequest([{ code: 'TOOL_REQUIRED', field: 'toolId', message: 'A tool is required.' }]);
    }

    const stringList = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

    // Rebuilt field by field. The client cannot add a field that is not on this
    // list, so prompt text has no route into the audit log even if a future
    // enforcement point sends it by mistake.
    const event: AuditEvent = {
      id: `ae-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: now.toISOString(),
      // Taken from the identity, never from the body: a client cannot write an
      // event under somebody else's pseudonym.
      pseudonymId: identity.pseudonymId,
      toolId,
      classification,
      decision,
      matchedPolicyIds: stringList(raw['matchedPolicyIds']),
      suppressedPolicyIds: stringList(raw['suppressedPolicyIds']),
      exceptionIds: stringList(raw['exceptionIds']),
      detectedCategories:
        decision === 'ALLOW'
          ? []
          : stringList(raw['detectedCategories']).filter((category): category is DetectionCategory =>
              (DETECTION_CATEGORIES as readonly string[]).includes(category),
            ),
      policySetVersion: text(raw['policySetVersion']) || store.activePolicySet().version,
      registryVersion: text(raw['registryVersion']) || store.activeRegistry().version,
      shadowOutcomes: [],
    };

    store.appendAuditEvent(event);
    return created({ id: event.id });
  },
};

// --------------------------------------------------------------- requests

const createRequest: Route = {
  method: 'POST',
  pattern: '/api/requests',
  auth: 'authenticated',
  handler: ({ body, store, identity }) => {
    const raw = asRecord(body);
    const result = store.createRequest(identity, {
      toolId: typeof raw['toolId'] === 'string' ? raw['toolId'] : null,
      toolLabel: typeof raw['toolLabel'] === 'string' ? raw['toolLabel'] : '',
      classification: typeof raw['classification'] === 'string' ? raw['classification'] : '',
      blockingPolicyIds: Array.isArray(raw['blockingPolicyIds'])
        ? (raw['blockingPolicyIds'] as string[])
        : [],
      justification: typeof raw['justification'] === 'string' ? raw['justification'] : '',
    });
    return result.ok ? created(result.value) : badRequest(result.errors);
  },
};

// ------------------------------------------------------ governance: policies

const policyCatalogue: Route = {
  method: 'GET',
  pattern: '/api/governance/policies',
  auth: 'governance',
  handler: ({ store, query, now }) => {
    const days = Number.parseInt(query.get('days') ?? '14', 10);
    const since = new Date(now.getTime() - (Number.isFinite(days) ? days : 14) * 24 * 60 * 60 * 1000);
    const events = store.auditEvents().filter((event) => new Date(event.at) >= since);
    const active = store.activePolicySet();

    return ok({
      version: active.version,
      periodDays: Number.isFinite(days) ? days : 14,
      policies: active.policies.map((policy) => ({
        ...policy,
        hits: events.filter((event) => event.matchedPolicyIds.includes(policy.id)).length,
        suppressions: events.filter((event) => event.suppressedPolicyIds.includes(policy.id)).length,
      })),
    });
  },
};

const policyVersions: Route = {
  method: 'GET',
  pattern: '/api/governance/policy-sets',
  auth: 'governance',
  handler: ({ store }) => {
    const versions = store.policySetVersions();
    const active = store.activePolicySet();
    return ok({
      activeVersion: active.version,
      versions: versions.map((version) => ({
        version: version.version,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        reason: version.reason,
        basedOn: version.basedOn,
        policyCount: version.policies.length,
      })),
    });
  },
};

const policyDiff: Route = {
  method: 'POST',
  pattern: '/api/governance/policy-sets/diff',
  auth: 'governance',
  handler: ({ body, store }) => {
    const raw = asRecord(body);
    const candidate = Array.isArray(raw['policies']) ? raw['policies'] : [];
    return ok({ diff: diffPolicies(store.activePolicySet().policies, candidate as never) });
  },
};

const publishPolicySet: Route = {
  method: 'POST',
  pattern: '/api/governance/policy-sets',
  auth: 'governance',
  handler: ({ body, store, identity }) => {
    const raw = asRecord(body);
    const result = store.publishPolicySet(identity, raw['policies'], text(raw['reason']));
    return result.ok ? created(result.value) : badRequest(result.errors);
  },
};

const rollbackPolicySet: Route = {
  method: 'POST',
  pattern: '/api/governance/policy-sets/rollback',
  auth: 'governance',
  handler: ({ body, store, identity }) => {
    const raw = asRecord(body);
    const result = store.rollbackPolicySet(identity, text(raw['version']), text(raw['reason']));
    return result.ok ? created(result.value) : badRequest(result.errors);
  },
};

const publishRegistry: Route = {
  method: 'POST',
  pattern: '/api/governance/registry',
  auth: 'governance',
  handler: ({ body, store, identity, now }) => {
    const raw = asRecord(body);
    if (!Array.isArray(raw['tools'])) {
      return badRequest([{ code: 'TOOLS_REQUIRED', field: 'tools', message: 'A tool list is required.' }]);
    }
    const previous = store.activeRegistry();
    const result = store.publishRegistry(identity, raw['tools'] as Tool[], text(raw['reason']));
    if (!result.ok) return badRequest(result.errors);

    // Narrowing a tool's permitted data classes can strand exceptions that were
    // granted on the assumption they existed. Surfaced rather than silently
    // repaired: which of them still make sense is a governance judgement.
    const stranded = store
      .exceptions()
      .filter((exception) => isActive(exception, now))
      .filter((exception) => {
        const before = previous.tools.find((tool) => tool.id === exception.scope.toolId);
        const after = result.value.tools.find((tool) => tool.id === exception.scope.toolId);
        if (!before || !after) return false;
        return exception.scope.classifications.some(
          (classification) =>
            before.allowedData.includes(classification) && !after.allowedData.includes(classification),
        );
      })
      .map((exception) => exception.id);

    return created({ version: result.value, exceptionsToReview: stranded });
  },
};

// ---------------------------------------------------- governance: monitoring

const monitoring: Route = {
  method: 'GET',
  pattern: '/api/governance/monitoring',
  auth: 'governance',
  handler: ({ store, query, now }) => {
    const days = Number.parseInt(query.get('days') ?? '14', 10);
    const window = Number.isFinite(days) && days > 0 ? days : 14;
    const since = new Date(now.getTime() - window * 24 * 60 * 60 * 1000);
    const events = store.auditEvents().filter((event) => new Date(event.at) >= since);
    const registeredToolIds = store.activeRegistry().tools.map((tool) => tool.id);

    const countBy = <T extends string>(values: T[]): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    };

    const trend: Record<string, number> = {};
    for (const event of events) {
      const day = event.at.slice(0, 10);
      trend[day] = (trend[day] ?? 0) + 1;
    }

    // Every figure below is a count. There is no pseudonym in this response, so
    // there is nothing here to drill down into.
    return ok({
      periodDays: window,
      total: events.length,
      byDecision: countBy(events.map((event) => event.decision)),
      byTool: countBy(events.map((event) => event.toolId)),
      byPolicy: countBy(events.flatMap((event) => event.matchedPolicyIds)),
      byClassification: countBy(events.map((event) => event.classification)),
      trend: Object.entries(trend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day, count })),
      shadowIt: Object.entries(
        countBy(
          events
            .filter((event) => event.decision === 'BLOCK' && !registeredToolIds.includes(event.toolId))
            .map((event) => event.toolId),
        ),
      )
        .sort(([, a], [, b]) => b - a)
        .map(([toolId, attempts]) => ({ toolId, attempts })),
      shadowOutcomes: countBy(events.flatMap((event) => event.shadowOutcomes.map((outcome) => outcome.policyId))),
    });
  },
};

const governanceRecords: Route = {
  method: 'GET',
  pattern: '/api/governance/records',
  auth: 'governance',
  handler: ({ store }) => ok({ records: store.governanceRecords().slice().reverse() }),
};

// ---------------------------------------------------- governance: exceptions

const listExceptions: Route = {
  method: 'GET',
  pattern: '/api/governance/exceptions',
  auth: 'governance',
  handler: ({ store, now }) =>
    ok({
      warningDays: EXPIRY_WARNING_DAYS,
      exceptions: store.exceptions().map((exception) => ({
        ...exception,
        active: isActive(exception, now),
        expiringSoon: expiresWithin(exception, now, EXPIRY_WARNING_DAYS),
      })),
    }),
};

const grantException: Route = {
  method: 'POST',
  pattern: '/api/governance/exceptions',
  auth: 'governance',
  handler: ({ body, store, identity, now }) => {
    const raw = asRecord(body);
    const result = store.grantException(
      identity,
      {
        subject: asRecord(raw['subject']) as { kind?: string; id?: string },
        scope: asRecord(raw['scope']) as { toolId?: string; classifications?: string[] },
        suppressedPolicyIds: Array.isArray(raw['suppressedPolicyIds'])
          ? (raw['suppressedPolicyIds'] as string[])
          : [],
        justification: typeof raw['justification'] === 'string' ? raw['justification'] : '',
        expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : '',
      },
      now,
    );
    return result.ok ? created(result.value) : badRequest(result.errors);
  },
};

const revokeException: Route = {
  method: 'POST',
  pattern: '/api/governance/exceptions/:id/revoke',
  auth: 'governance',
  handler: ({ params, body, store, identity }) => {
    const result = store.revokeException(identity, params['id'] ?? '', text(asRecord(body)['reason']));
    return result.ok ? ok(result.value) : badRequest(result.errors);
  },
};

// ------------------------------------------------------ governance: requests

const requestQueue: Route = {
  method: 'GET',
  pattern: '/api/governance/requests',
  auth: 'governance',
  handler: ({ store, now }) => {
    const requests = store.requests();
    const open = requests.filter(isOpen);
    const identities = new Map(listIdentities().map((identity) => [identity.id, identity.displayName]));
    const tools = new Map(store.activeRegistry().tools.map((tool) => [tool.id, tool]));

    return ok({
      requests: requests.map((request) => {
        const tool = request.toolId === null ? undefined : tools.get(request.toolId);
        return {
          ...request,
          requesterName: identities.get(request.requesterId) ?? request.requesterId,
          ageDays: ageInDays(request, now),
          toolRegistered: tool !== undefined,
          // Approving is only meaningful for a tool the bank has assessed and
          // approved; anything else has to go back to the assessment.
          toolApprovable: tool !== undefined && tool.approvalStatus !== 'NOT_APPROVED',
        };
      }),
      recurring: recurringScopes(open),
    });
  },
};

const decideRequest: Route = {
  method: 'POST',
  pattern: '/api/governance/requests/:id/decision',
  auth: 'governance',
  handler: ({ params, body, store, identity, now }) => {
    const raw = asRecord(body);
    const request = store.request(params['id'] ?? '');
    if (!request) return notFound('Unknown request.');

    // Four eyes. Being in the governance group does not make you the exception
    // to the rule that nobody decides their own request.
    if (request.requesterId === identity.id) {
      return forbidden('You cannot decide your own request. Another governance member must review it.');
    }

    const decision = text(raw['decision']).toUpperCase();
    const reason = text(raw['reason']);

    if (decision === 'REQUEST_INFORMATION') {
      if (reason === '') {
        return badRequest([
          { code: 'REASON_REQUIRED', field: 'reason', message: 'Say what information you need.' },
        ]);
      }
      const result = store.transitionRequest(identity, request.id, 'INFORMATION_REQUESTED', reason, null);
      if (!result.ok) return badRequest(result.errors);
      store.record(identity, 'REQUEST_INFORMATION_REQUESTED', 'request', request.id, request.state, 'INFORMATION_REQUESTED', reason);
      return ok(result.value);
    }

    if (decision === 'REJECT') {
      if (reason === '') {
        return badRequest([
          {
            code: 'REASON_REQUIRED',
            field: 'reason',
            message: 'A rejection needs a reason; somebody is waiting for that answer.',
          },
        ]);
      }
      const result = store.transitionRequest(identity, request.id, 'REJECTED', reason, null);
      if (!result.ok) return badRequest(result.errors);
      store.record(identity, 'REQUEST_REJECTED', 'request', request.id, request.state, 'REJECTED', reason);
      return ok(result.value);
    }

    if (decision !== 'APPROVE') {
      return badRequest([
        {
          code: 'INVALID_DECISION',
          field: 'decision',
          message: 'Decision must be APPROVE, REJECT or REQUEST_INFORMATION.',
        },
      ]);
    }

    if (reason === '') {
      return badRequest([
        { code: 'REASON_REQUIRED', field: 'reason', message: 'An approval widens access and needs a reason.' },
      ]);
    }
    if (request.toolId === null) {
      return badRequest([
        {
          code: 'TOOL_NOT_REGISTERED',
          field: 'toolId',
          message: `"${request.toolLabel}" is not in the registry. Assess and register the tool before approving.`,
        },
      ]);
    }

    // An exception is a licence to send particular data to a tool the bank has
    // already assessed. It is not a licence to use a tool nobody has approved:
    // that would make the request queue a self-service route around the ARB, one
    // person at a time. The answer to this case is to assess the tool.
    const requestedTool = store.activeRegistry().tools.find((tool) => tool.id === request.toolId);
    if (requestedTool?.approvalStatus === 'NOT_APPROVED') {
      return badRequest([
        {
          code: 'TOOL_NOT_APPROVED',
          field: 'toolId',
          message: `"${requestedTool.name}" is registered but not approved for Finnova use. Assess the tool and change its status; a personal exception cannot stand in for that.`,
        },
      ]);
    }

    const expiresAt = text(raw['expiresAt']);
    const suppressedPolicyIds = Array.isArray(raw['suppressedPolicyIds'])
      ? (raw['suppressedPolicyIds'] as string[])
      : request.blockingPolicyIds;

    // Granted first, so a refusal to suppress a non-suppressible policy leaves
    // the request open rather than approved-without-effect.
    const grant = store.grantException(
      identity,
      {
        subject: { kind: 'USER', id: request.requesterId },
        scope: { toolId: request.toolId, classifications: [request.classification] },
        suppressedPolicyIds,
        justification: reason,
        expiresAt,
        sourceRequestId: request.id,
      },
      now,
    );
    if (!grant.ok) return badRequest(grant.errors);

    const result = store.transitionRequest(identity, request.id, 'APPROVED', reason, grant.value.id);
    if (!result.ok) return badRequest(result.errors);
    store.record(identity, 'REQUEST_APPROVED', 'request', request.id, request.state, 'APPROVED', reason);
    return ok({ request: result.value, exception: grant.value });
  },
};

export const routes: Route[] = [
  session,
  policySet,
  registry,
  myExceptions,
  myPermissions,
  myRequests,
  postAuditEvent,
  createRequest,
  policyCatalogue,
  policyVersions,
  policyDiff,
  publishPolicySet,
  rollbackPolicySet,
  publishRegistry,
  monitoring,
  governanceRecords,
  listExceptions,
  grantException,
  revokeException,
  requestQueue,
  decideRequest,
];
