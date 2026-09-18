/**
 * The enforcement point's dependencies on the browser are confined to this
 * interface. Everything above it is ordinary code that can be tested in Node,
 * which is what makes the last-known-good behaviour testable at all.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get: async <T>(key: string) => (data.has(key) ? (structuredClone(data.get(key)) as T) : null),
    set: async (key, value) => void data.set(key, structuredClone(value)),
    remove: async (key) => void data.delete(key),
  };
}

export function chromeStore(): KeyValueStore {
  return {
    get: async <T>(key: string) => {
      const result = await chrome.storage.local.get(key);
      return (result[key] as T | undefined) ?? null;
    },
    set: async (key, value) => chrome.storage.local.set({ [key]: value }),
    remove: async (key) => chrome.storage.local.remove(key),
  };
}
