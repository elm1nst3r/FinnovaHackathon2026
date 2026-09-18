import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { startServer } from '../src/service/server.ts';
import { setGroups } from '../src/service/identity.ts';
import type { GovernanceStore } from '../src/service/store.ts';
import { decide } from '../src/core/engine.ts';

let baseUrl: string;
let store: GovernanceStore;
let close: () => Promise<void>;

before(async () => {
  const started = startServer(0);
  store = started.store;
  await new Promise<void>((resolve) => started.server.once('listening', resolve));
  const address = started.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  close = () => new Promise<void>((resolve) => started.server.close(() => resolve()));
});

after(async () => {
  await close();
});

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  options: { as?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.as ? { 'x-aig-user': options.as } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

// ------------------------------------------------------------ authorisation

test('an unauthenticated request returns no cockpit data', async () => {
  const response = await call('GET', '/api/policy-set');
  assert.equal(response.status, 401);
  assert.equal(response.body['version'], undefined);
});

test('an employee outside the governance group cannot call a governance write endpoint', async () => {
  const before = store.exceptions().length;

  const response = await call('POST', '/api/governance/exceptions', {
    as: 'u-anna',
    body: {
      subject: { kind: 'USER', id: 'u-anna' },
      scope: { toolId: 'chatgpt', classifications: ['CONFIDENTIAL'] },
      suppressedPolicyIds: ['CH-AI-CONF-01'],
      justification: 'Granting myself access.',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  assert.equal(response.status, 403);
  assert.equal(store.exceptions().length, before, 'no state changed');
  assert.ok(
    store
      .governanceRecords()
      .some((record) => record.action === 'UNAUTHORISED_ATTEMPT' && record.actorId === 'u-anna'),
    'the attempt is recorded',
  );
});

test('an employee outside the governance group cannot read the governance views', async () => {
  for (const path of [
    '/api/governance/monitoring',
    '/api/governance/policies',
    '/api/governance/requests',
    '/api/governance/exceptions',
    '/api/governance/records',
  ]) {
    const response = await call('GET', path, { as: 'u-anna' });
    assert.equal(response.status, 403, `${path} must not be readable by an employee`);
  }
});

test('the session tells each identity which views it has', async () => {
  const employee = await call('GET', '/api/session', { as: 'u-anna' });
  assert.deepEqual(employee.body['views'], ['employee']);

  const governance = await call('GET', '/api/session', { as: 'u-sara' });
  assert.deepEqual(governance.body['views'], ['employee', 'governance']);
});

test('revoking governance membership takes effect on the next write', async () => {
  const original = ['finnova-all', 'ai-governance'];
  setGroups('u-sara', ['finnova-all']);
  try {
    const response = await call('POST', '/api/governance/policy-sets/rollback', {
      as: 'u-sara',
      body: { version: 'ps-2026.1', reason: 'Testing.' },
    });
    assert.equal(response.status, 403);
  } finally {
    setGroups('u-sara', original);
  }
});

// -------------------------------------------------------------- suppression

test('the API refuses an exception naming a non-suppressible policy and records the attempt', async () => {
  const response = await call('POST', '/api/governance/exceptions', {
    as: 'u-sara',
    body: {
      subject: { kind: 'USER', id: 'u-anna' },
      scope: { toolId: 'chatgpt', classifications: ['INTERNAL'] },
      suppressedPolicyIds: ['CH-AI-CONF-01', 'CH-AI-CRED-01'],
      justification: 'Developer needs to debug an auth problem.',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  assert.equal(response.status, 422);
  const errors = response.body['errors'] as { code: string }[];
  assert.ok(errors.some((error) => error.code === 'NON_SUPPRESSIBLE_POLICY'));
  assert.ok(
    store.governanceRecords().some((record) => record.action === 'REJECTED_ATTEMPT'),
    'the refused attempt is recorded',
  );
});

// ---------------------------------------------------------------- the loop

test('a block becomes a request, a decision and changed enforcement', async () => {
  const context = {
    policySet: store.activePolicySet(),
    registry: store.activeRegistry(),
    exceptions: store.exceptionsFor(
      { id: 'u-anna', displayName: 'Anna', groups: ['finnova-all'], pseudonymId: 'p-3f9a21' },
      new Date(),
    ),
  };
  const attempt = {
    userId: 'u-anna',
    groups: ['finnova-all'],
    pseudonymId: 'p-3f9a21',
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL' as const,
    detectedCategories: [],
    now: new Date(),
  };

  const blocked = decide(attempt, context);
  assert.equal(blocked.decision, 'BLOCK');
  assert.equal(blocked.canRequestAccess, true);

  const raised = await call('POST', '/api/requests', {
    as: 'u-anna',
    body: {
      toolId: 'chatgpt',
      toolLabel: 'ChatGPT Enterprise',
      classification: 'CONFIDENTIAL',
      blockingPolicyIds: blocked.blockingPolicyIds,
      justification: 'Migration notes are confidential and there is no approved alternative yet.',
    },
  });
  assert.equal(raised.status, 201);
  const requestId = raised.body['id'] as string;

  const ownRequests = await call('GET', '/api/my/requests', { as: 'u-anna' });
  assert.equal((ownRequests.body['requests'] as unknown[]).length >= 1, true);

  const selfApproval = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-anna',
    body: { decision: 'APPROVE', reason: 'I approve of myself.' },
  });
  assert.equal(selfApproval.status, 403, 'an employee cannot approve anything');

  const approved = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: {
      decision: 'APPROVE',
      reason: 'Time-boxed for the migration; Copilot rollout closes the gap in October.',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  assert.equal(approved.status, 200);

  const exception = (approved.body['exception'] as Record<string, unknown>) ?? {};
  assert.equal(exception['sourceRequestId'], requestId);
  assert.deepEqual(exception['suppressedPolicyIds'], ['CH-AI-CONF-01']);

  const retried = decide(attempt, {
    policySet: store.activePolicySet(),
    registry: store.activeRegistry(),
    exceptions: store.exceptionsFor(
      { id: 'u-anna', displayName: 'Anna', groups: ['finnova-all'], pseudonymId: 'p-3f9a21' },
      new Date(),
    ),
  });
  assert.equal(retried.decision, 'ALLOW', 'the loop closed: the same prompt now passes');
  assert.deepEqual(retried.suppressedPolicyIds, ['CH-AI-CONF-01']);

  const employeeView = await call('GET', '/api/my/requests', { as: 'u-anna' });
  const mine = (employeeView.body['requests'] as Record<string, unknown>[]).find(
    (request) => request['id'] === requestId,
  );
  assert.equal(mine?.['state'], 'APPROVED');
  assert.equal((mine?.['grant'] as Record<string, unknown>)['id'], exception['id']);
});

test('a governance member cannot decide their own request', async () => {
  const raised = await call('POST', '/api/requests', {
    as: 'u-sara',
    body: {
      toolId: 'chatgpt',
      toolLabel: 'ChatGPT Enterprise',
      classification: 'CONFIDENTIAL',
      blockingPolicyIds: ['CH-AI-CONF-01'],
      justification: 'I need this too.',
    },
  });
  const requestId = raised.body['id'] as string;

  const response = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: { decision: 'APPROVE', reason: 'Seems fine to me.' },
  });

  assert.equal(response.status, 403);
  assert.equal(store.request(requestId)?.state, 'SUBMITTED', 'it stays open for another approver');
});

test('a rejection without a reason is not accepted', async () => {
  const raised = await call('POST', '/api/requests', {
    as: 'u-luca',
    body: {
      toolId: 'chatgpt',
      toolLabel: 'ChatGPT Enterprise',
      classification: 'CONFIDENTIAL',
      blockingPolicyIds: ['CH-AI-CONF-01'],
      justification: 'Convenience.',
    },
  });
  const requestId = raised.body['id'] as string;

  const noReason = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: { decision: 'REJECT' },
  });
  assert.equal(noReason.status, 422);
  assert.equal(store.request(requestId)?.state, 'SUBMITTED');

  const withReason = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: { decision: 'REJECT', reason: 'Microsoft 365 Copilot is approved for this data class.' },
  });
  assert.equal(withReason.status, 200);

  const employeeView = await call('GET', '/api/my/requests', { as: 'u-luca' });
  const mine = (employeeView.body['requests'] as Record<string, unknown>[]).find(
    (request) => request['id'] === requestId,
  );
  const transitions = mine?.['transitions'] as { to: string; reason: string | null }[];
  assert.equal(transitions.at(-1)?.reason, 'Microsoft 365 Copilot is approved for this data class.');
});

test('a request for a tool nobody has assessed cannot be approved until it is registered', async () => {
  const raised = await call('POST', '/api/requests', {
    as: 'u-anna',
    body: {
      toolLabel: 'DeepSeek',
      classification: 'INTERNAL',
      blockingPolicyIds: ['CH-AI-TOOL-01'],
      justification: 'It is better at reading our PDFs.',
    },
  });
  const requestId = raised.body['id'] as string;

  const response = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: { decision: 'APPROVE', reason: 'Fine by me.' },
  });

  assert.equal(response.status, 422);
  const errors = response.body['errors'] as { code: string }[];
  assert.ok(errors.some((error) => error.code === 'TOOL_NOT_REGISTERED'));
});

test('an approval cannot be a personal route around the tool approval process', async () => {
  const raised = await call('POST', '/api/requests', {
    as: 'u-anna',
    body: {
      toolId: 'gemini',
      toolLabel: 'Google Gemini (consumer)',
      classification: 'INTERNAL',
      blockingPolicyIds: ['CH-AI-TOOL-01'],
      justification: 'It reads our PDFs better.',
    },
  });
  const requestId = raised.body['id'] as string;

  const before = store.exceptions().length;
  const response = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: { decision: 'APPROVE', reason: 'Seems useful.' },
  });

  assert.equal(response.status, 422);
  const errors = response.body['errors'] as { code: string }[];
  assert.ok(errors.some((error) => error.code === 'TOOL_NOT_APPROVED'));
  assert.equal(store.exceptions().length, before, 'no exception suppressing CH-AI-TOOL-01 was created');
  assert.equal(store.request(requestId)?.state, 'SUBMITTED');

  const queue = await call('GET', '/api/governance/requests', { as: 'u-sara' });
  const queued = (queue.body['requests'] as Record<string, unknown>[]).find(
    (entry) => entry['id'] === requestId,
  );
  assert.equal(queued?.['toolRegistered'], true);
  assert.equal(queued?.['toolApprovable'], false, 'the queue says so before anyone clicks approve');
});

// ------------------------------------------------------- policy versioning

test('publishing creates a new version and leaves the previous one readable', async () => {
  const before = await call('GET', '/api/governance/policy-sets', { as: 'u-sara' });
  const previousVersion = before.body['activeVersion'] as string;

  const active = store.activePolicySet();
  const edited = active.policies.map((policy) =>
    policy.id === 'CH-AI-PII-01' ? { ...policy, name: 'Personal data, sanitisable (revised)' } : policy,
  );

  const diff = await call('POST', '/api/governance/policy-sets/diff', {
    as: 'u-sara',
    body: { policies: edited },
  });
  assert.equal((diff.body['diff'] as unknown[]).length, 1);

  const published = await call('POST', '/api/governance/policy-sets', {
    as: 'u-sara',
    body: { policies: edited, reason: 'Clarified the rule name after the ARB review.' },
  });
  assert.equal(published.status, 201);
  assert.notEqual(published.body['version'], previousVersion);

  const previous = store.policySet(previousVersion);
  assert.equal(
    previous?.policies.find((policy) => policy.id === 'CH-AI-PII-01')?.name,
    'Personal data, sanitisable',
    'the old version still resolves to the rules that produced its audit events',
  );
});

test('publishing an unpublishable rule changes nothing', async () => {
  const before = store.activePolicySet().version;
  const response = await call('POST', '/api/governance/policy-sets', {
    as: 'u-sara',
    body: {
      policies: [
        {
          id: 'CH-AI-ROLE-01',
          name: 'Role rule',
          outcome: 'BLOCK',
          state: 'ACTIVE',
          rationale: 'Testing.',
          conditions: [{ input: 'userRole', operator: 'in', values: ['developer'] }],
        },
      ],
      reason: 'Testing.',
    },
  });

  assert.equal(response.status, 422);
  assert.equal(store.activePolicySet().version, before);
});

test('a rollback restores a version and is itself a new version', async () => {
  const target = 'ps-2026.1';
  const response = await call('POST', '/api/governance/policy-sets/rollback', {
    as: 'u-sara',
    body: { version: target, reason: 'The revised name confused people.' },
  });

  assert.equal(response.status, 201);
  assert.notEqual(response.body['version'], target, 'rollback creates history, it does not delete it');
  assert.equal(
    store.activePolicySet().policies.find((policy) => policy.id === 'CH-AI-PII-01')?.name,
    'Personal data, sanitisable',
  );
  assert.ok(
    store.governanceRecords().some((record) => record.action === 'POLICY_ROLLED_BACK'),
  );
});

// -------------------------------------------------------------- monitoring

test('monitoring reports aggregates with no route back to a person', async () => {
  const response = await call('GET', '/api/governance/monitoring', { as: 'u-sara' });
  assert.equal(response.status, 200);

  const serialised = JSON.stringify(response.body);
  assert.ok(!serialised.includes('pseudonym'), 'no pseudonyms in an aggregate response');
  assert.ok(!/p-[0-9a-f]{6}/.test(serialised), 'no pseudonym values either');
  assert.ok((response.body['total'] as number) > 0);
  assert.ok((response.body['shadowIt'] as unknown[]).length > 0, 'unregistered tools are surfaced');
});

test('no endpoint returns another employee usage history', async () => {
  for (const path of ['/api/my/history', '/api/governance/history', '/api/users/u-anna/history']) {
    const response = await call('GET', path, { as: 'u-sara' });
    assert.equal(response.status, 404, `${path} must not exist`);
  }
});

test('an audit event is stored under the caller pseudonym, not one they chose', async () => {
  const response = await call('POST', '/api/audit-events', {
    as: 'u-anna',
    body: {
      toolId: 'chatgpt',
      classification: 'INTERNAL',
      decision: 'MAKE_SAFE',
      matchedPolicyIds: ['CH-AI-PII-01'],
      detectedCategories: ['PERSON_NAME'],
      pseudonymId: 'p-someone-else',
      prompt: 'Max Muster lives at Bahnhofstrasse 1',
    },
  });
  assert.equal(response.status, 201);

  const stored = store.auditEvents().find((event) => event.id === response.body['id']);
  assert.equal(stored?.pseudonymId, 'p-3f9a21');
  assert.ok(!JSON.stringify(stored).includes('Max Muster'));
});

test('an ALLOW event carries no detection list', async () => {
  const response = await call('POST', '/api/audit-events', {
    as: 'u-anna',
    body: {
      toolId: 'chatgpt',
      classification: 'INTERNAL',
      decision: 'ALLOW',
      detectedCategories: ['PERSON_NAME'],
    },
  });
  const stored = store.auditEvents().find((event) => event.id === response.body['id']);
  assert.deepEqual(stored?.detectedCategories, []);
});

test('the permissions view explains what an employee may not use, and why', async () => {
  const response = await call('GET', '/api/my/permissions', { as: 'u-luca' });
  const permissions = response.body['permissions'] as {
    tool: { id: string };
    cells: { classification: string; permitted: boolean; reason: string }[];
  }[];

  const gemini = permissions.find((entry) => entry.tool.id === 'gemini');
  assert.ok(gemini, 'an unusable tool is shown rather than hidden');
  assert.ok(gemini.cells.every((cell) => !cell.permitted));
  assert.match(gemini.cells[0]?.reason ?? '', /not approved/i);

  const chatgpt = permissions.find((entry) => entry.tool.id === 'chatgpt');
  const confidential = chatgpt?.cells.find((cell) => cell.classification === 'CONFIDENTIAL');
  assert.equal(confidential?.permitted, true, 'Luca has a seeded exception for this');
  assert.match(confidential?.reason ?? '', /exception EX-101/);
});

// ------------------------------------------------------------ audit follow-ups

test('a refused approval leaves its reason on the request for the requester to see', async () => {
  const raised = await call('POST', '/api/requests', {
    as: 'u-anna',
    body: {
      toolId: 'chatgpt',
      toolLabel: 'ChatGPT Enterprise',
      classification: 'CONFIDENTIAL',
      blockingPolicyIds: ['CH-AI-CRED-01'],
      justification: 'I need to paste a token to debug it.',
    },
  });
  const requestId = raised.body['id'] as string;

  const response = await call('POST', `/api/governance/requests/${requestId}/decision`, {
    as: 'u-sara',
    body: {
      decision: 'APPROVE',
      reason: 'Short-lived, for debugging.',
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  assert.equal(response.status, 422);
  assert.ok((response.body['errors'] as { code: string }[]).some((error) => error.code === 'NON_SUPPRESSIBLE_POLICY'));

  const mine = await call('GET', '/api/my/requests', { as: 'u-anna' });
  const request = (mine.body['requests'] as { id: string; state: string; transitions: { reason: string | null; actorId: string }[] }[]).find(
    (entry) => entry.id === requestId,
  );
  assert.equal(request?.state, 'SUBMITTED', 'the request stays open for another route');
  const last = request?.transitions.at(-1);
  assert.equal(last?.actorId, 'u-sara');
  assert.match(last?.reason ?? '', /Approval refused/);
});

test('shadow outcomes reach the audit log, and only as policy id plus would-be outcome', async () => {
  const response = await call('POST', '/api/audit-events', {
    as: 'u-anna',
    body: {
      toolId: 'chatgpt',
      classification: 'INTERNAL',
      decision: 'ALLOW',
      shadowOutcomes: [
        { policyId: 'CH-AI-SHADOW-01', wouldHaveBeen: 'BLOCK', prompt: 'not this' },
        { policyId: 42, wouldHaveBeen: 'BLOCK' },
        { policyId: 'CH-AI-SHADOW-02', wouldHaveBeen: 'MAYBE' },
      ],
    },
  });
  assert.equal(response.status, 201);
  const stored = store.auditEvents().find((event) => event.id === response.body['id']);
  assert.deepEqual(stored?.shadowOutcomes, [{ policyId: 'CH-AI-SHADOW-01', wouldHaveBeen: 'BLOCK' }]);

  const monitoring = await call('GET', '/api/governance/monitoring', { as: 'u-sara' });
  assert.equal((monitoring.body['shadowOutcomes'] as Record<string, number>)['CH-AI-SHADOW-01'], 1);
});

test('the queue offers Approve only where the grant would succeed', async () => {
  const current = store.activeRegistry();
  const published = await call('POST', '/api/governance/registry', {
    as: 'u-sara',
    body: {
      tools: current.tools.map((tool) => (tool.id === 'gemini' ? { ...tool, approvalStatus: 'RESTRICTED' } : tool)),
      reason: 'Gemini is under assessment.',
    },
  });
  assert.equal(published.status, 201);

  const raised = await call('POST', '/api/requests', {
    as: 'u-anna',
    body: {
      toolId: 'gemini',
      toolLabel: 'Google Gemini (consumer)',
      classification: 'INTERNAL',
      blockingPolicyIds: ['CH-AI-TOOL-01'],
      justification: 'Trying it out.',
    },
  });
  const queue = await call('GET', '/api/governance/requests', { as: 'u-sara' });
  const queued = (queue.body['requests'] as Record<string, unknown>[]).find((entry) => entry['id'] === raised.body['id']);
  assert.equal(queued?.['toolApprovable'], false, 'a RESTRICTED tool is not approvable, matching the grant');
});

test('removing a tool from the registry flags the exceptions granted on it', async () => {
  const current = store.activeRegistry();
  const active = store.exceptions().filter((exception) => exception.revokedAt === null && exception.scope.toolId === 'chatgpt');
  assert.ok(active.length > 0, 'the seed grants at least one exception on chatgpt');

  const published = await call('POST', '/api/governance/registry', {
    as: 'u-sara',
    body: { tools: current.tools.filter((tool) => tool.id !== 'chatgpt'), reason: 'Contract ended.' },
  });
  assert.equal(published.status, 201);
  const flagged = published.body['exceptionsToReview'] as string[];
  for (const exception of active) assert.ok(flagged.includes(exception.id), `${exception.id} is flagged for review`);
});
