export type PersistedState = {
  version: 1;
  prompt: string;
  code: string;
  cases: { id: string; args: string; expected: string }[];
  apiKey: string;
};

export type PersistenceAdapter = {
  load: () => PersistedState | null;
  save: (state: PersistedState) => void;
  subscribe?: (onChange: (state: PersistedState) => void) => () => void;
};

const STORAGE_KEY = "vibe-coding:workspace:v1";

export const localStorageAdapter: PersistenceAdapter = {
  load() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as PersistedState;
      if (!data || data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  },
  save(state) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore write errors (quota, privacy mode, etc.).
    }
  },
  subscribe(onChange) {
    if (typeof window === "undefined") return () => {};
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue) as PersistedState;
        if (!data || data.version !== 1) return;
        onChange(data);
      } catch {
        // Ignore malformed payloads.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};
