import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, decideAcrossRegistry, toAuditEvent } from '../src/core/engine.ts';
import type { DecisionRequest, EnforcementContext } from '../src/core/engine.ts';
import type { GovernanceException } from '../src/core/model.ts';
import { SEED_POLICY_SET, SEED_REGISTRY } from '../src/fixtures/seed.ts';

const NOW = new Date('2026-09-18T10:00:00.000Z');

function context(exceptions: GovernanceException[] = []): EnforcementContext {
  return { policySet: SEED_POLICY_SET, registry: SEED_REGISTRY, exceptions };
}

function request(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    userId: 'u-anna',
    groups: ['finnova-all'],
    pseudonymId: 'p-3f9a21',
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'INTERNAL',
    detectedCategories: [],
    now: NOW,
    ...overrides,
  };
}

function exception(overrides: Partial<GovernanceException> = {}): GovernanceException {
  return {
    id: 'EX-test',
    subject: { kind: 'USER', id: 'u-anna' },
    scope: { toolId: 'chatgpt', classifications: ['CONFIDENTIAL'] },
    suppressedPolicyIds: ['CH-AI-CONF-01'],
    justification: 'Because.',
    grantedBy: 'u-sara',
    grantedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-10-01T00:00:00.000Z',
    revokedAt: null,
    revokedBy: null,
    sourceRequestId: null,
    ...overrides,
  };
}

test('a prompt matching nothing is allowed', () => {
  const result = decide(request(), context());
  assert.equal(result.decision, 'ALLOW');
  assert.deepEqual(result.matchedPolicyIds, []);
});

test('sanitisable personal data in a tool that does not permit it is made safe', () => {
  const result = decide(request({ detectedCategories: ['PERSON_NAME', 'IBAN'] }), context());
  assert.equal(result.decision, 'MAKE_SAFE');
  assert.deepEqual(result.matchedPolicyIds, ['CH-AI-PII-01']);
  assert.deepEqual(result.sanitiseCategories, ['PERSON_NAME', 'IBAN']);
});

test('a tool that permits personal data does not trigger the personal-data rules', () => {
  const result = decide(
    request({ toolId: 'm365-copilot', detectedCategories: ['PERSON_NAME', 'IBAN'] }),
    context(),
  );
  assert.equal(result.decision, 'ALLOW');
});

test('special-category data cannot be sanitised away', () => {
  const result = decide(request({ detectedCategories: ['PERSON_NAME', 'SPECIAL_CATEGORY'] }), context());
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.matchedPolicyIds, ['CH-AI-PII-02']);
});

test('precedence takes the most restrictive matching outcome', () => {
  const result = decide(request({ detectedCategories: ['PERSON_NAME', 'CREDENTIAL'] }), context());
  assert.equal(result.decision, 'BLOCK');
  assert.ok(result.matchedPolicyIds.includes('CH-AI-CRED-01'));
  assert.ok(result.matchedPolicyIds.includes('CH-AI-PII-01'));
});

test('a credential does not make personal data count as unsanitisable', () => {
  const result = decide(request({ detectedCategories: ['PERSON_NAME', 'CREDENTIAL'] }), context());
  assert.ok(!result.matchedPolicyIds.includes('CH-AI-PII-02'));
});

test('an unregistered tool is treated as not approved', () => {
  const result = decide(request({ toolId: 'deepseek', toolLabel: 'DeepSeek' }), context());
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.toolKnown, false);
  assert.deepEqual(result.blockingPolicyIds, ['CH-AI-TOOL-01']);
});

test('a block offers an approved alternative for the same data', () => {
  const result = decide(
    request({ toolId: 'gemini', classification: 'CONFIDENTIAL' }),
    context(),
  );
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.alternatives.map((tool) => tool.id), ['m365-copilot']);
});

test('an alternative must also permit personal data when personal data was detected', () => {
  const result = decide(
    request({ toolId: 'gemini', classification: 'CONFIDENTIAL', detectedCategories: ['PERSON_NAME'] }),
    context(),
  );
  assert.deepEqual(result.alternatives.map((tool) => tool.id), ['m365-copilot']);
});

test('an in-scope exception suppresses the policy it names', () => {
  const blocked = decide(request({ classification: 'CONFIDENTIAL' }), context());
  assert.equal(blocked.decision, 'BLOCK', 'precondition: the rule actually fires without the exception');
  assert.deepEqual(blocked.matchedPolicyIds, ['CH-AI-CONF-01']);

  const allowed = decide(request({ classification: 'CONFIDENTIAL' }), context([exception()]));
  assert.equal(allowed.decision, 'ALLOW');
  assert.deepEqual(allowed.suppressedPolicyIds, ['CH-AI-CONF-01']);
  assert.deepEqual(allowed.exceptionIds, ['EX-test']);
});

test('the remaining policies still apply when one is suppressed', () => {
  const result = decide(
    request({ classification: 'CONFIDENTIAL', detectedCategories: ['CREDENTIAL'] }),
    context([exception()]),
  );
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.matchedPolicyIds, ['CH-AI-CRED-01']);
});

test('an exception never suppresses a non-suppressible policy, even if the store contains one', () => {
  const result = decide(
    request({ classification: 'STRICTLY_CONFIDENTIAL' }),
    context([
      exception({
        scope: { toolId: 'chatgpt', classifications: ['STRICTLY_CONFIDENTIAL'] },
        suppressedPolicyIds: ['CH-AI-CONF-02'],
      }),
    ]),
  );
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.suppressedPolicyIds, []);
  assert.deepEqual(result.exceptionIds, []);
});

test('an exception for another tool does not apply', () => {
  const result = decide(
    request({ classification: 'CONFIDENTIAL', toolId: 'gemini' }),
    context([exception()]),
  );
  assert.equal(result.decision, 'BLOCK');
});

test('an expired exception has no effect without anyone cleaning it up', () => {
  const result = decide(
    request({ classification: 'CONFIDENTIAL' }),
    context([exception({ expiresAt: '2026-09-17T00:00:00.000Z' })]),
  );
  assert.equal(result.decision, 'BLOCK');
});

test('a revoked exception has no effect', () => {
  const result = decide(
    request({ classification: 'CONFIDENTIAL' }),
    context([exception({ revokedAt: '2026-09-17T00:00:00.000Z', revokedBy: 'u-sara' })]),
  );
  assert.equal(result.decision, 'BLOCK');
});

test('a group exception applies to members of that group', () => {
  const result = decide(
    request({ classification: 'CONFIDENTIAL', groups: ['finnova-all', 'operations'] }),
    context([exception({ subject: { kind: 'GROUP', id: 'operations' } })]),
  );
  assert.equal(result.decision, 'ALLOW');
  assert.deepEqual(result.exceptionIds, ['EX-test']);
});

test('access can be requested only when every blocking policy is suppressible', () => {
  const suppressible = decide(request({ toolId: 'gemini' }), context());
  assert.equal(suppressible.canRequestAccess, true);

  const notSuppressible = decide(request({ classification: 'STRICTLY_CONFIDENTIAL' }), context());
  assert.equal(notSuppressible.canRequestAccess, false);
  assert.deepEqual(notSuppressible.requestBlockedBy, ['CH-AI-CONF-02']);
});

test('a shadow policy records what it would have done without intervening', () => {
  const shadowSet = {
    ...SEED_POLICY_SET,
    policies: SEED_POLICY_SET.policies.map((policy) =>
      policy.id === 'CH-AI-PII-01' ? { ...policy, state: 'SHADOW' as const, outcome: 'BLOCK' as const } : policy,
    ),
  };
  const result = decide(request({ detectedCategories: ['PERSON_NAME'] }), {
    policySet: shadowSet,
    registry: SEED_REGISTRY,
    exceptions: [],
  });
  assert.equal(result.decision, 'ALLOW');
  assert.deepEqual(result.shadowOutcomes, [{ policyId: 'CH-AI-PII-01', wouldHaveBeen: 'BLOCK' }]);
});

test('a retired policy is not evaluated at all', () => {
  const retired = {
    ...SEED_POLICY_SET,
    policies: SEED_POLICY_SET.policies.map((policy) =>
      policy.id === 'CH-AI-CRED-01' ? { ...policy, state: 'RETIRED' as const } : policy,
    ),
  };
  const result = decide(request({ detectedCategories: ['CREDENTIAL'] }), {
    policySet: retired,
    registry: SEED_REGISTRY,
    exceptions: [],
  });
  assert.deepEqual(result.matchedPolicyIds, []);
  assert.deepEqual(result.shadowOutcomes, []);
});

test('the audit event is pseudonymous and carries no content', () => {
  const decisionRequest = request({ detectedCategories: ['PERSON_NAME', 'IBAN'] });
  const event = toAuditEvent('ae-1', decisionRequest, decide(decisionRequest, context()));

  assert.equal(event.pseudonymId, 'p-3f9a21');
  const serialised = JSON.stringify(event);
  assert.ok(!serialised.includes('u-anna'), 'no user id in the audit event');
  assert.ok(!Object.keys(event).includes('prompt'));
  assert.ok(!Object.keys(event).includes('content'));
  assert.deepEqual(event.detectedCategories, ['PERSON_NAME', 'IBAN']);
});

test('a decision under an exception is auditable', () => {
  const decisionRequest = request({ classification: 'CONFIDENTIAL' });
  const result = decide(decisionRequest, context([exception()]));
  const event = toAuditEvent('ae-2', decisionRequest, result);

  assert.deepEqual(event.suppressedPolicyIds, ['CH-AI-CONF-01']);
  assert.deepEqual(event.exceptionIds, ['EX-test']);
});

test('a survey asks every registered tool the same question, most permissive first', () => {
  const verdicts = decideAcrossRegistry(
    {
      userId: 'u-anna',
      groups: ['finnova-all'],
      pseudonymId: 'p-3f9a21',
      classification: 'CONFIDENTIAL',
      detectedCategories: ['PERSON_NAME', 'IBAN'],
      now: NOW,
    },
    context(),
  );
  assert.deepEqual(
    verdicts.map((verdict) => verdict.tool.id).sort(),
    SEED_REGISTRY.tools.map((tool) => tool.id).sort(),
  );
  const ranks = verdicts.map((verdict) => ['ALLOW', 'MAKE_SAFE', 'BLOCK'].indexOf(verdict.result.decision));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));

  const byTool = Object.fromEntries(verdicts.map((verdict) => [verdict.tool.id, verdict.result.decision]));
  // Copilot is approved for confidential data and permits personal data.
  assert.equal(byTool['m365-copilot'], 'ALLOW');
  // ChatGPT is approved for internal work only; Gemini is not approved at all.
  assert.equal(byTool['chatgpt'], 'BLOCK');
  assert.equal(byTool['gemini'], 'BLOCK');
});
