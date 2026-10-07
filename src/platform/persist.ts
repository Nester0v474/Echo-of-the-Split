/** Key-value backend used by progress and settings (Yandex storage or localStorage). */
export interface PersistStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function localFallback(): PersistStore {
  return {
    getItem(key) {
      try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

let store: PersistStore = localFallback();

export function bindStore(next: PersistStore): void {
  store = next;
}

export function persistGet(key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function persistSet(key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}
