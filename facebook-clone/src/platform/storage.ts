import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from '../core/model';
import type { StorageAdapter } from '../core/persistence';
export const storage: StorageAdapter = {
  read: () => AsyncStorage.getItem(STORAGE_KEY),
  write: (value) => AsyncStorage.setItem(STORAGE_KEY, value),
  remove: () => AsyncStorage.removeItem(STORAGE_KEY),
};
