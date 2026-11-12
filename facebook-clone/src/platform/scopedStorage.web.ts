import { STORAGE_KEY } from '../core/model';
import type { StorageAdapter } from '../core/persistence';
export function createScopedStorage(key: string): StorageAdapter {
  if (!/^[a-z0-9-]+:v\d+$/.test(key) || key === STORAGE_KEY) {
    throw new Error(`Invalid scoped storage key: ${key}`);
  }
  return {
    async read() {
      return window.localStorage.getItem(key);
    },
    async write(value) {
      window.localStorage.setItem(key, value);
    },
    async remove() {
      window.localStorage.removeItem(key);
    },
  };
}
