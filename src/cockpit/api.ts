import type {
  AccessRequest,
  Classification,
  GovernanceException,
  GovernanceRecord,
  Policy,
  PolicySetVersion,
  RegistryVersion,
  Tool,
} from '../core/model.ts';
import type { ToolPermissions } from '../core/permissions.ts';
import type { PolicyDiffEntry } from '../core/policy.ts';

export interface ApiError {
  code: string;
  field: string;
  message: string;
}

export class ApiFailure extends Error {
  readonly status: number;
  readonly errors: ApiError[];

  constructor(status: number, errors: ApiError[]) {
    super(errors[0]?.message ?? `Request failed with status ${status}.`);
    this.name = 'ApiFailure';
    this.status = status;
    this.errors = errors;
  }
}

/**
 * The demo persona. A real deployment resolves identity from the SSO session and
 * this whole mechanism disappears, which is why it is confined to one place.
 */
const IDENTITY_KEY = 'aig.demo.identity';

export function currentIdentityId(): string {
  return sessionStorage.getItem(IDENTITY_KEY) ?? 'u-anna';
}

export function setIdentityId(id: string): void {
  sessionStorage.setItem(IDENTITY_KEY, id);
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      'x-aig-user': currentIdentityId(),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiFailure(response.status, (payload['errors'] as ApiError[]) ?? []);
  }
  return payload as T;
}

export interface SessionResponse {
  identity: { id: string; displayName: string; groups: string[] };
  views: ('employee' | 'governance')[];
  availableIdentities: { id: string; displayName: string; governance: boolean }[];
}

export interface MonitoringResponse {
  periodDays: number;
  total: number;
  byDecision: Record<string, number>;
  byTool: Record<string, number>;
  byPolicy: Record<string, number>;
  byClassification: Record<string, number>;
  trend: { day: string; count: number }[];
  shadowIt: { toolId: string; attempts: number }[];
  shadowOutcomes: Record<string, number>;
}

export interface CatalogueResponse {
  version: string;
  periodDays: number;
  policies: (Policy & { hits: number; suppressions: number })[];
}

export interface QueueResponse {
  requests: (AccessRequest & {
    requesterName: string;
    ageDays: number;
    toolRegistered: boolean;
    toolApprovable: boolean;
  })[];
  recurring: { toolLabel: string; classification: Classification; requestIds: string[] }[];
}

export interface ExceptionsResponse {
  warningDays: number;
  exceptions: (GovernanceException & { active: boolean; expiringSoon: boolean })[];
}

export const api = {
  session: () => request<SessionResponse>('GET', '/api/session'),
  policySet: () => request<PolicySetVersion>('GET', '/api/policy-set'),
  registry: () => request<RegistryVersion>('GET', '/api/registry'),
  myExceptions: () => request<{ exceptions: GovernanceException[] }>('GET', '/api/my/exceptions'),
  myPermissions: () => request<{ permissions: ToolPermissions[] }>('GET', '/api/my/permissions'),
  myRequests: () =>
    request<{
      requests: (AccessRequest & {
        grant: { id: string; toolId: string; classifications: Classification[]; expiresAt: string } | null;
      })[];
    }>('GET', '/api/my/requests'),
  createRequest: (body: {
    toolId: string | null;
    toolLabel: string;
    classification: Classification;
    blockingPolicyIds: string[];
    justification: string;
  }) => request<AccessRequest>('POST', '/api/requests', body),

  catalogue: (days: number) => request<CatalogueResponse>('GET', `/api/governance/policies?days=${days}`),
  policyVersions: () =>
    request<{
      activeVersion: string;
      versions: {
        version: string;
        createdAt: string;
        createdBy: string;
        reason: string;
        basedOn: string | null;
        policyCount: number;
      }[];
    }>('GET', '/api/governance/policy-sets'),
  diff: (policies: Policy[]) =>
    request<{ diff: PolicyDiffEntry[] }>('POST', '/api/governance/policy-sets/diff', { policies }),
  publish: (policies: Policy[], reason: string) =>
    request<PolicySetVersion>('POST', '/api/governance/policy-sets', { policies, reason }),
  rollback: (version: string, reason: string) =>
    request<PolicySetVersion>('POST', '/api/governance/policy-sets/rollback', { version, reason }),
  publishRegistry: (tools: Tool[], reason: string) =>
    request<{ version: RegistryVersion; exceptionsToReview: string[] }>('POST', '/api/governance/registry', {
      tools,
      reason,
    }),
  monitoring: (days: number) => request<MonitoringResponse>('GET', `/api/governance/monitoring?days=${days}`),
  exceptions: () => request<ExceptionsResponse>('GET', '/api/governance/exceptions'),
  grantException: (body: {
    subject: { kind: 'USER' | 'GROUP'; id: string };
    scope: { toolId: string; classifications: Classification[] };
    suppressedPolicyIds: string[];
    justification: string;
    expiresAt: string;
  }) => request<GovernanceException>('POST', '/api/governance/exceptions', body),
  revokeException: (id: string, reason: string) =>
    request<GovernanceException>('POST', `/api/governance/exceptions/${id}/revoke`, { reason }),
  queue: () => request<QueueResponse>('GET', '/api/governance/requests'),
  decide: (
    id: string,
    body: { decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFORMATION'; reason: string; expiresAt?: string },
  ) => request<{ request: AccessRequest; exception?: GovernanceException }>(
    'POST',
    `/api/governance/requests/${id}/decision`,
    body,
  ),
  records: () => request<{ records: GovernanceRecord[] }>('GET', '/api/governance/records'),
};
