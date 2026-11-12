import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

const photosDirectory = () => new Directory(Paths.document, 'facebook-clone-demo', 'photos');
let photoSequence = 0;
export async function pickPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.fileSize ?? 0) > 10 * 1024 * 1024)
    throw new Error('Choose a photo smaller than 10 MB.');
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > 1280)
      context.resize(asset.width >= asset.height ? { width: 1280 } : { height: 1280 });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.78, format: SaveFormat.JPEG });
    const directory = photosDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const source = new File(saved.uri);
    const destination = new File(directory, `photo-${Date.now()}-${++photoSequence}.jpg`);
    source.copy(destination);
    return destination.uri;
  } catch {
    throw new Error(
      'This photo could not be saved on your device. Your draft is still here; try another image or check available storage.',
    );
  }
}
export async function clearOwnedPhotos(): Promise<void> {
  const directory = photosDirectory();
  if (directory.exists) directory.delete();
}

export function isPhotoAvailable(ref: string): boolean {
  if (!ref.startsWith('file://')) return true;
  try {
    return new File(ref).exists;
  } catch {
    return false;
  }
}
export async function reconcileOwnedPhotos(
  refs: readonly string[],
): Promise<{ missing: number; cleanupFailed: boolean }> {
  const retained = new Set(refs);
  const missing = refs.filter((ref) => !isPhotoAvailable(ref)).length;
  let cleanupFailed = false;
  try {
    const directory = photosDirectory();
    if (directory.exists) {
      for (const file of directory.list()) {
        if (file instanceof File && !retained.has(file.uri)) {
          try {
            file.delete();
          } catch {
            cleanupFailed = true;
          }
        }
      }
    }
  } catch {
    cleanupFailed = true;
  }
  return { missing, cleanupFailed };
}
