import type { DemoState } from './types';
import { decodeState, encodeState } from './model';
export interface StorageAdapter {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export function createPersistence(storage: StorageAdapter, onError: (message: string) => void) {
  let pending = Promise.resolve();
  let preserveUnreadableData = false;
  return {
    async load(): Promise<DemoState> {
      try {
        return decodeState(await storage.read());
      } catch {
        preserveUnreadableData = true;
        throw new Error(
          'Saved demo data could not be read. Existing saved data is preserved. Changes in this session will not be saved until you reset the demo in Settings.',
        );
      }
    },
    save(state: DemoState) {
      if (preserveUnreadableData) {
        onError(
          'Changes are visible in this session only. Existing unreadable saved data is preserved; reset the demo in Settings to enable saving again.',
        );
        return;
      }
      let serialized: string;
      try {
        serialized = encodeState(state);
      } catch (error) {
        onError((error as Error).message);
        return;
      }
      pending = pending
        .then(() => storage.write(serialized))
        .catch(() => {
          onError(
            'Could not save your latest changes on this device. They remain visible in this session. Check available storage before closing the app.',
          );
        });
    },
    async reset() {
      await pending;
      await storage.remove();
      preserveUnreadableData = false;
    },
    flush() {
      return pending;
    },
  };
}
