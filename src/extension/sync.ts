import type { GovernanceException, PolicySetVersion, RegistryVersion } from '../core/model.ts';
import type { KeyValueStore } from './storage.ts';

const CACHE_KEY = 'aig.policy.cache';

/** Beyond this the cached policy set is still used, but the user is told it is old. */
export const STALE_AFTER_HOURS = 24;

export interface PolicySnapshot {
  policySet: PolicySetVersion;
  registry: RegistryVersion;
  exceptions: GovernanceException[];
  fetchedAt: string;
}

export interface SyncStatus {
  snapshot: PolicySnapshot | null;
  /** True when the last refresh attempt failed and we are running on cache. */
  usingCache: boolean;
  stale: boolean;
  ageHours: number | null;
  lastError: string | null;
}

export interface SyncOptions {
  baseUrl: string;
  identityId: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * Enforcement must not depend on the policy service being reachable. A network
 * failure keeps the last version that was successfully fetched and says so; it
 * never fails open, and it never blocks everything either. Both of those would
 * be the enforcement point deciding policy on its own.
 */
export class PolicySync {
  readonly #store: KeyValueStore;
  readonly #options: Required<Pick<SyncOptions, 'baseUrl' | 'identityId'>> & {
    fetchImpl: typeof fetch;
    now: () => Date;
  };
  #lastError: string | null = null;
  #usingCache = false;

  constructor(store: KeyValueStore, options: SyncOptions) {
    this.#store = store;
    this.#options = {
      baseUrl: options.baseUrl,
      identityId: options.identityId,
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      now: options.now ?? (() => new Date()),
    };
  }

  async refresh(): Promise<SyncStatus> {
    try {
      const [policySet, registry, exceptions] = await Promise.all([
        this.#get<PolicySetVersion>('/api/policy-set'),
        this.#get<RegistryVersion>('/api/registry'),
        this.#get<{ exceptions: GovernanceException[] }>('/api/my/exceptions'),
      ]);

      const snapshot: PolicySnapshot = {
        policySet,
        registry,
        exceptions: exceptions.exceptions,
        fetchedAt: this.#options.now().toISOString(),
      };
      await this.#store.set(CACHE_KEY, snapshot);
      this.#lastError = null;
      this.#usingCache = false;
      return this.#status(snapshot);
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : 'Policy service unreachable.';
      this.#usingCache = true;
      return this.#status(await this.#store.get<PolicySnapshot>(CACHE_KEY));
    }
  }

  async status(): Promise<SyncStatus> {
    return this.#status(await this.#store.get<PolicySnapshot>(CACHE_KEY));
  }

  #status(snapshot: PolicySnapshot | null): SyncStatus {
    if (!snapshot) {
      return { snapshot: null, usingCache: this.#usingCache, stale: false, ageHours: null, lastError: this.#lastError };
    }
    const ageHours = (this.#options.now().getTime() - new Date(snapshot.fetchedAt).getTime()) / 3_600_000;
    return {
      snapshot,
      usingCache: this.#usingCache,
      stale: ageHours > STALE_AFTER_HOURS,
      ageHours,
      lastError: this.#lastError,
    };
  }

  async #get<T>(path: string): Promise<T> {
    const response = await this.#options.fetchImpl(`${this.#options.baseUrl}${path}`, {
      headers: { 'x-aig-user': this.#options.identityId },
    });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
  }
}

export function describeStaleness(status: SyncStatus): string | null {
  if (!status.snapshot) return 'No policy set has been fetched yet, so nothing can be enforced.';
  if (!status.usingCache && !status.stale) return null;
  const age = status.ageHours === null ? 'some time' : `${Math.round(status.ageHours)}h`;
  return `Using the policy set fetched ${age} ago — the policy service is not reachable right now.`;
}
