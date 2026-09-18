import type {
  AccessRequest,
  AuditEvent,
  Classification,
  Decision,
  DetectionCategory,
  GovernanceException,
  Identity,
  Policy,
  PolicySetVersion,
  RegistryVersion,
  Tool,
} from '../core/model.ts';

export const SEED_NOW = new Date();

function daysFromNow(days: number): string {
  return new Date(SEED_NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** The six PRD rules, expressed in the structured condition set. */
export const SEED_POLICIES: Policy[] = [
  {
    id: 'CH-AI-CRED-01',
    name: 'Credentials',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    conditions: [{ input: 'detectedCategories', operator: 'includesAny', values: ['CREDENTIAL'] }],
    rationale:
      'Credentials are never sanitised. A redacted secret is still evidence that a secret was about to leave the company, and the holder should rotate it.',
  },
  {
    id: 'CH-AI-PII-01',
    name: 'Personal data, sanitisable',
    outcome: 'MAKE_SAFE',
    state: 'ACTIVE',
    conditions: [
      {
        input: 'detectedCategories',
        operator: 'includesAny',
        values: ['PERSON_NAME', 'EMAIL', 'PHONE', 'IBAN', 'SPECIAL_CATEGORY'],
      },
      { input: 'toolPermitsPersonalData', operator: 'is', value: false },
      { input: 'sanitisability', operator: 'allSanitisable' },
    ],
    rationale:
      'Do not block what can be transformed. The employee keeps working and the personal data never reaches the provider.',
  },
  {
    id: 'CH-AI-PII-02',
    name: 'Personal data, not sanitisable',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    conditions: [
      {
        input: 'detectedCategories',
        operator: 'includesAny',
        values: ['PERSON_NAME', 'EMAIL', 'PHONE', 'IBAN', 'SPECIAL_CATEGORY'],
      },
      { input: 'toolPermitsPersonalData', operator: 'is', value: false },
      { input: 'sanitisability', operator: 'anyNotSanitisable' },
    ],
    rationale:
      'Special-category data survives redaction: removing the name leaves the sensitive fact in the text.',
  },
  {
    id: 'CH-AI-CONF-01',
    name: 'Confidential data in an unapproved tool',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    conditions: [
      { input: 'classification', operator: 'in', values: ['CONFIDENTIAL'] },
      { input: 'toolAllowedData', operator: 'notContains', value: 'CONFIDENTIAL' },
    ],
    rationale:
      'Hosting region, training behaviour and tenant isolation are assessed by ARB at approval time; the runtime rule reads the resulting permission rather than re-deriving it.',
  },
  {
    id: 'CH-AI-CONF-02',
    name: 'Strictly confidential data',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    conditions: [{ input: 'classification', operator: 'in', values: ['STRICTLY_CONFIDENTIAL'] }],
    rationale:
      'No external AI service is approved for strictly confidential data. If that changes it changes visibly, as a policy decision.',
  },
  {
    id: 'CH-AI-TOOL-01',
    name: 'Unapproved tool',
    outcome: 'BLOCK',
    state: 'ACTIVE',
    conditions: [{ input: 'toolApprovalStatus', operator: 'in', values: ['NOT_APPROVED'] }],
    rationale: 'A tool nobody assessed offers no guarantees to read the other rules against.',
  },
];

export const SEED_TOOLS: Tool[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT Enterprise',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    approvalStatus: 'APPROVED',
    hostingRegion: 'EU',
    trainsOnCustomerData: false,
    accessControl: 'TENANT_ISOLATION',
    // Approved for internal work only. The FR-12 example in the PRD shows
    // CONFIDENTIAL as well; narrowing it here is what gives CH-AI-CONF-01
    // something to do and gives the request loop a realistic starting point.
    allowedData: ['INTERNAL'],
    permitsPersonalData: false,
    assessedBy: 'u-sara',
    assessedAt: daysFromNow(-120),
  },
  {
    id: 'm365-copilot',
    name: 'Microsoft 365 Copilot',
    hosts: ['copilot.microsoft.com', 'm365.cloud.microsoft'],
    approvalStatus: 'APPROVED',
    hostingRegion: 'CH',
    trainsOnCustomerData: false,
    accessControl: 'RBAC',
    allowedData: ['INTERNAL', 'CONFIDENTIAL'],
    permitsPersonalData: true,
    assessedBy: 'u-sara',
    assessedAt: daysFromNow(-90),
  },
  {
    id: 'gemini',
    name: 'Google Gemini (consumer)',
    hosts: ['gemini.google.com'],
    approvalStatus: 'NOT_APPROVED',
    hostingRegion: 'OTHER',
    trainsOnCustomerData: true,
    accessControl: 'NONE',
    allowedData: [],
    permitsPersonalData: false,
    assessedBy: 'u-sara',
    assessedAt: daysFromNow(-60),
  },
];

export const SEED_POLICY_SET: PolicySetVersion = {
  version: 'ps-2026.1',
  createdAt: daysFromNow(-30),
  createdBy: 'u-sara',
  reason: 'Initial rule set derived from Finnova AI Governance 2026.1.',
  basedOn: null,
  policies: SEED_POLICIES,
};

export const SEED_REGISTRY: RegistryVersion = {
  version: 'reg-2026.1',
  createdAt: daysFromNow(-30),
  createdBy: 'u-sara',
  reason: 'Initial tool registry.',
  basedOn: null,
  tools: SEED_TOOLS,
};

export const SEED_IDENTITIES: Identity[] = [
  {
    id: 'u-anna',
    displayName: 'Anna Berger',
    groups: ['finnova-all', 'client-advisory'],
    pseudonymId: 'p-3f9a21',
  },
  {
    id: 'u-luca',
    displayName: 'Luca Moretti',
    groups: ['finnova-all', 'operations'],
    pseudonymId: 'p-8c1d44',
  },
  {
    id: 'u-sara',
    displayName: 'Sara Keller',
    groups: ['finnova-all', 'ai-governance'],
    pseudonymId: 'p-b27e05',
  },
];

export const SEED_GROUPS = ['finnova-all', 'client-advisory', 'operations', 'ai-governance'];

export const SEED_EXCEPTIONS: GovernanceException[] = [
  {
    id: 'EX-101',
    subject: { kind: 'USER', id: 'u-luca' },
    scope: { toolId: 'chatgpt', classifications: ['CONFIDENTIAL'] },
    suppressedPolicyIds: ['CH-AI-CONF-01'],
    justification:
      'Migration project needs confidential architecture notes summarised; no approved alternative until the Copilot rollout completes.',
    grantedBy: 'u-sara',
    grantedAt: daysFromNow(-12),
    expiresAt: daysFromNow(10),
    revokedAt: null,
    revokedBy: null,
    sourceRequestId: null,
  },
];

export const SEED_REQUESTS: AccessRequest[] = [
  {
    id: 'REQ-101',
    requesterId: 'u-luca',
    toolId: 'gemini',
    toolLabel: 'Google Gemini (consumer)',
    classification: 'INTERNAL',
    blockingPolicyIds: ['CH-AI-TOOL-01'],
    justification:
      'Gemini handles our PDF layout analysis better than the approved tools. Asking whether it can be assessed.',
    state: 'SUBMITTED',
    createdAt: daysFromNow(-4),
    transitions: [
      { at: daysFromNow(-4), actorId: 'u-luca', from: null, to: 'SUBMITTED', reason: null },
    ],
    resultingExceptionId: null,
  },
  /*
   * Two requests, because the two answers are different and both are worth
   * showing. REQ-101 asks for a tool nobody assessed and cannot be approved as
   * a personal exception at all. REQ-102 asks for a data class on a tool the
   * bank has already assessed, which is exactly what an exception is for.
   */
  {
    id: 'REQ-102',
    requesterId: 'u-anna',
    toolId: 'chatgpt',
    toolLabel: 'ChatGPT Enterprise',
    classification: 'CONFIDENTIAL',
    blockingPolicyIds: ['CH-AI-CONF-01'],
    justification:
      'Drafting the client migration letter from confidential account notes. M365 Copilot is not yet rolled out to client advisory.',
    state: 'SUBMITTED',
    createdAt: daysFromNow(-1),
    transitions: [
      { at: daysFromNow(-1), actorId: 'u-anna', from: null, to: 'SUBMITTED', reason: null },
    ],
    resultingExceptionId: null,
  },
];

/**
 * Synthetic audit events so monitoring has something to aggregate. Pseudonyms
 * are drawn from a pool wider than the fixture identities, because the audit log
 * is not supposed to be joinable back to the three people in this file.
 */
export function seedAuditEvents(): AuditEvent[] {
  const events: AuditEvent[] = [];
  const pseudonyms = Array.from({ length: 24 }, (_, index) => `p-${(index * 7919).toString(16).padStart(6, '0')}`);

  const shapes: {
    toolId: string;
    classification: Classification;
    decision: Decision;
    policies: string[];
    detected: DetectionCategory[];
    weight: number;
  }[] = [
    { toolId: 'chatgpt', classification: 'INTERNAL', decision: 'ALLOW', policies: [], detected: [], weight: 46 },
    { toolId: 'm365-copilot', classification: 'INTERNAL', decision: 'ALLOW', policies: [], detected: [], weight: 22 },
    { toolId: 'm365-copilot', classification: 'CONFIDENTIAL', decision: 'ALLOW', policies: [], detected: [], weight: 9 },
    {
      toolId: 'chatgpt',
      classification: 'INTERNAL',
      decision: 'MAKE_SAFE',
      policies: ['CH-AI-PII-01'],
      detected: ['PERSON_NAME', 'IBAN'],
      weight: 18,
    },
    {
      toolId: 'chatgpt',
      classification: 'INTERNAL',
      decision: 'BLOCK',
      policies: ['CH-AI-CRED-01'],
      detected: ['CREDENTIAL'],
      weight: 4,
    },
    {
      toolId: 'chatgpt',
      classification: 'CONFIDENTIAL',
      decision: 'BLOCK',
      policies: ['CH-AI-CONF-01'],
      detected: [],
      weight: 11,
    },
    {
      toolId: 'chatgpt',
      classification: 'CONFIDENTIAL',
      decision: 'BLOCK',
      policies: ['CH-AI-PII-02'],
      detected: ['SPECIAL_CATEGORY'],
      weight: 3,
    },
    {
      toolId: 'chatgpt',
      classification: 'STRICTLY_CONFIDENTIAL',
      decision: 'BLOCK',
      policies: ['CH-AI-CONF-02'],
      detected: [],
      weight: 5,
    },
    {
      toolId: 'gemini',
      classification: 'INTERNAL',
      decision: 'BLOCK',
      policies: ['CH-AI-TOOL-01'],
      detected: [],
      weight: 7,
    },
    {
      toolId: 'deepseek',
      classification: 'INTERNAL',
      decision: 'BLOCK',
      policies: ['CH-AI-TOOL-01'],
      detected: [],
      weight: 4,
    },
    {
      toolId: 'perplexity',
      classification: 'INTERNAL',
      decision: 'BLOCK',
      policies: ['CH-AI-TOOL-01'],
      detected: [],
      weight: 2,
    },
  ];

  let counter = 0;
  for (const shape of shapes) {
    for (let index = 0; index < shape.weight; index += 1) {
      counter += 1;
      const ageMinutes = (counter * 97) % (14 * 24 * 60);
      events.push({
        id: `ae-${counter.toString().padStart(4, '0')}`,
        at: new Date(SEED_NOW.getTime() - ageMinutes * 60 * 1000).toISOString(),
        pseudonymId: pseudonyms[counter % pseudonyms.length] as string,
        toolId: shape.toolId,
        classification: shape.classification,
        decision: shape.decision,
        matchedPolicyIds: shape.policies,
        suppressedPolicyIds: [],
        exceptionIds: [],
        detectedCategories: shape.decision === 'ALLOW' ? [] : shape.detected,
        policySetVersion: SEED_POLICY_SET.version,
        registryVersion: SEED_REGISTRY.version,
        shadowOutcomes: [],
      });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}
