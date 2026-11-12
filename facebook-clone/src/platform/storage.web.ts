import { STORAGE_KEY } from '../core/model';
import type { StorageAdapter } from '../core/persistence';
export const storage: StorageAdapter = {
  async read() {
    return window.localStorage.getItem(STORAGE_KEY);
  },
  async write(value) {
    window.localStorage.setItem(STORAGE_KEY, value);
  },
  async remove() {
    window.localStorage.removeItem(STORAGE_KEY);
  },
};
