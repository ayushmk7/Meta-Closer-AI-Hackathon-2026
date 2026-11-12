import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from '../core/model';
import type { StorageAdapter } from '../core/persistence';
export function createScopedStorage(key: string): StorageAdapter {
  if (!/^[a-z0-9-]+:v\d+$/.test(key) || key === STORAGE_KEY) {
    throw new Error(`Invalid scoped storage key: ${key}`);
  }
  return {
    read: () => AsyncStorage.getItem(key),
    write: (value) => AsyncStorage.setItem(key, value),
    remove: () => AsyncStorage.removeItem(key),
  };
}
