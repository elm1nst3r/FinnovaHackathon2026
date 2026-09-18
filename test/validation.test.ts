import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, diffPolicies } from '../src/core/policy.ts';
import { validateExceptionDraft, MAX_EXCEPTION_DAYS, expiresWithin } from '../src/core/exceptions.ts';
import { validateRequestDraft, canTransition, recurringScopes } from '../src/core/requests.ts';
import type { AccessRequest, GovernanceException, Policy } from '../src/core/model.ts';
import { SEED_POLICIES } from '../src/fixtures/seed.ts';

const NOW = new Date('2026-09-18T10:00:00.000Z');

function errorCodes(result: { ok: boolean; errors?: { code: string }[] }): string[] {
  return (result.errors ?? []).map((error) => error.code);
}

// ------------------------------------------------------------ policy editing

test('a rule referencing an input the engine does not evaluate is rejected by name', () => {
  const result = validatePolicy({
    id: 'CH-AI-ROLE-01',
    name: 'Developers only',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    rationale: 'Testing an unsupported input.',
    conditions: [{ input: 'userRole', operator: 'in', values: ['developer'] }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(errorCodes(result), ['UNSUPPORTED_INPUT']);
  assert.match(result.ok ? '' : (result.errors[0]?.message ?? ''), /userRole/);
});

test('free-form expressions are not a rule', () => {
  const result = validatePolicy({
    id: 'CH-AI-EXPR-01',
    name: 'Scripted rule',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    rationale: 'Testing.',
    conditions: [{ expression: "prompt.includes('secret')" }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(errorCodes(result), ['UNSUPPORTED_INPUT']);
});

test('a rule with no conditions is rejected', () => {
  const result = validatePolicy({
    id: 'CH-AI-ALL-01',
    name: 'Everything',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    rationale: 'Testing.',
    conditions: [],
  });

  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('CONDITIONS_REQUIRED'));
});

test('the seeded rules all validate', () => {
  for (const policy of SEED_POLICIES) {
    assert.equal(validatePolicy(policy).ok, true, `${policy.id} should validate`);
  }
});

test('the diff names what changes before it is published', () => {
  const before = SEED_POLICIES;
  const sanitisable = before.find((policy) => policy.id === 'CH-AI-PII-01') as Policy;
  const after: Policy[] = [
    ...before.filter((policy) => policy.id !== 'CH-AI-TOOL-01' && policy.id !== 'CH-AI-PII-01'),
    { ...sanitisable, outcome: 'BLOCK' },
    {
      id: 'CH-AI-NEW-01',
      name: 'New rule',
      outcome: 'BLOCK',
      state: 'SHADOW',
      rationale: 'Testing.',
      conditions: [{ input: 'toolTrainsOnCustomerData', operator: 'is', value: true }],
    },
  ];

  const diff = diffPolicies(before, after);
  const byId = new Map(diff.map((entry) => [entry.policyId, entry.kind]));

  assert.equal(byId.get('CH-AI-NEW-01'), 'ADDED');
  assert.equal(byId.get('CH-AI-TOOL-01'), 'REMOVED');
  assert.equal(byId.get('CH-AI-PII-01'), 'MODIFIED');
  assert.equal(byId.get('CH-AI-CRED-01'), undefined, 'unchanged rules are not in the diff');
});

// ---------------------------------------------------------------- exceptions

const validationContext = {
  now: NOW,
  knownPolicyIds: SEED_POLICIES.map((policy) => policy.id),
  tools: [
    { id: 'chatgpt', name: 'ChatGPT Enterprise', approved: true },
    { id: 'm365-copilot', name: 'Microsoft 365 Copilot', approved: true },
    { id: 'gemini', name: 'Google Gemini (consumer)', approved: false },
  ],
  knownUserIds: ['u-anna', 'u-luca', 'u-sara'],
  knownGroupIds: ['finnova-all', 'operations'],
};

test('an exception cannot licence a tool nobody approved', () => {
  const result = validateExceptionDraft(
    draft({ scope: { toolId: 'gemini', classifications: ['INTERNAL'] } }),
    validationContext,
  );
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('TOOL_NOT_APPROVED'));
});

function draft(overrides: Record<string, unknown> = {}) {
  return {
    subject: { kind: 'USER', id: 'u-anna' },
    scope: { toolId: 'chatgpt', classifications: ['CONFIDENTIAL'] },
    suppressedPolicyIds: ['CH-AI-CONF-01'],
    justification: 'Client migration review, no approved alternative until Q4.',
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

test('a complete exception is accepted', () => {
  assert.equal(validateExceptionDraft(draft(), validationContext).ok, true);
});

test('an exception without an expiry is refused', () => {
  const result = validateExceptionDraft(draft({ expiresAt: '' }), validationContext);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('EXPIRY_REQUIRED'));
});

test('an expiry beyond the maximum is refused', () => {
  const tooFar = new Date(NOW.getTime() + (MAX_EXCEPTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  const result = validateExceptionDraft(draft({ expiresAt: tooFar }), validationContext);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('EXPIRY_TOO_FAR'));
});

test('the credential policy cannot be named in an exception', () => {
  const result = validateExceptionDraft(
    draft({ suppressedPolicyIds: ['CH-AI-CRED-01'] }),
    validationContext,
  );
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('NON_SUPPRESSIBLE_POLICY'));
});

test('the strictly-confidential policy cannot be named in an exception', () => {
  const result = validateExceptionDraft(
    draft({ suppressedPolicyIds: ['CH-AI-CONF-02'] }),
    validationContext,
  );
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('NON_SUPPRESSIBLE_POLICY'));
});

test('a mixed submission is rejected whole rather than partially applied', () => {
  const result = validateExceptionDraft(
    draft({ suppressedPolicyIds: ['CH-AI-CONF-01', 'CH-AI-CRED-01'] }),
    validationContext,
  );
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('NON_SUPPRESSIBLE_POLICY'));
});

test('an exception without a justification is refused', () => {
  const result = validateExceptionDraft(draft({ justification: '   ' }), validationContext);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('JUSTIFICATION_REQUIRED'));
});

test('an exception for an unregistered tool is refused', () => {
  const result = validateExceptionDraft(
    draft({ scope: { toolId: 'deepseek', classifications: ['INTERNAL'] } }),
    validationContext,
  );
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('UNKNOWN_TOOL'));
});

test('exceptions close to expiry are distinguishable', () => {
  const soon: GovernanceException = {
    id: 'EX-1',
    subject: { kind: 'USER', id: 'u-anna' },
    scope: { toolId: 'chatgpt', classifications: ['CONFIDENTIAL'] },
    suppressedPolicyIds: ['CH-AI-CONF-01'],
    justification: 'x',
    grantedBy: 'u-sara',
    grantedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    revokedBy: null,
    sourceRequestId: null,
  };
  const later = { ...soon, id: 'EX-2', expiresAt: new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString() };

  assert.equal(expiresWithin(soon, NOW, 14), true);
  assert.equal(expiresWithin(later, NOW, 14), false);
});

// ------------------------------------------------------------------ requests

test('a request carries no prompt content, whatever the client sends', () => {
  const result = validateRequestDraft({
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL',
    blockingPolicyIds: ['CH-AI-CONF-01'],
    justification: 'Need to summarise the migration notes.',
    // A careless client sends the world; none of it must survive.
    prompt: 'Max Muster, IBAN CH93 0076 2011 6238 5295 7',
    detectedValues: ['Max Muster'],
    userId: 'u-somebody-else',
  } as never);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const serialised = JSON.stringify(result.value);
  assert.ok(!serialised.includes('Max Muster'));
  assert.ok(!serialised.includes('CH93'));
  assert.ok(!serialised.includes('u-somebody-else'));
  assert.deepEqual(Object.keys(result.value).sort(), [
    'blockingPolicyIds',
    'classification',
    'justification',
    'toolId',
    'toolLabel',
  ]);
});

test('a request without a justification is rejected', () => {
  const result = validateRequestDraft({
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL',
    blockingPolicyIds: ['CH-AI-CONF-01'],
    justification: '  ',
  });
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('JUSTIFICATION_REQUIRED'));
});

test('a request must name the policy that blocked', () => {
  const result = validateRequestDraft({
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL',
    blockingPolicyIds: [],
    justification: 'Because I want to.',
  });
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes('BLOCKING_POLICY_REQUIRED'));
});

test('an unknown tool leaves toolId null so governance has to assess it', () => {
  const result = validateRequestDraft({
    toolLabel: 'DeepSeek',
    classification: 'INTERNAL',
    blockingPolicyIds: ['CH-AI-TOOL-01'],
    justification: 'Better at PDFs.',
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.toolId, null);
});

test('terminal states are terminal', () => {
  assert.equal(canTransition('SUBMITTED', 'APPROVED'), true);
  assert.equal(canTransition('INFORMATION_REQUESTED', 'REJECTED'), true);
  assert.equal(canTransition('APPROVED', 'REJECTED'), false);
  assert.equal(canTransition('REJECTED', 'SUBMITTED'), false);
});

test('requests for the same scope are visible as a pattern', () => {
  const base: AccessRequest = {
    id: 'REQ-1',
    requesterId: 'u-anna',
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL',
    blockingPolicyIds: ['CH-AI-CONF-01'],
    justification: 'x',
    state: 'SUBMITTED',
    createdAt: NOW.toISOString(),
    transitions: [],
    resultingExceptionId: null,
  };

  const recurring = recurringScopes([
    base,
    { ...base, id: 'REQ-2', requesterId: 'u-luca' },
    { ...base, id: 'REQ-3', toolId: 'gemini', toolLabel: 'Gemini' },
  ]);

  assert.equal(recurring.length, 1);
  assert.deepEqual(recurring[0]?.requestIds, ['REQ-1', 'REQ-2']);
});
