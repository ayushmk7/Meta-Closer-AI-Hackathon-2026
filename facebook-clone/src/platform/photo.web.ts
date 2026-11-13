const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_CHARS = 480_000;

export async function compressPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose a photo smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const photo = new window.Image();
      photo.onload = () => resolve(photo);
      photo.onerror = () =>
        reject(new Error('That photo could not be opened. Please choose another image.'));
      photo.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the photo.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/jpeg', 0.78);
    if (result.length > MAX_PHOTO_CHARS) result = canvas.toDataURL('image/jpeg', 0.5);
    if (result.length > MAX_PHOTO_CHARS)
      throw new Error('This image is too detailed for the local demo. Choose a smaller photo.');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pickPhoto(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.hidden = true;
    document.body.append(input);
    input.addEventListener(
      'cancel',
      () => {
        input.remove();
        resolve(null);
      },
      { once: true },
    );
    input.addEventListener(
      'change',
      async () => {
        try {
          resolve(input.files?.[0] ? await compressPhoto(input.files[0]) : null);
        } catch (error) {
          reject(error);
        } finally {
          input.remove();
        }
      },
      { once: true },
    );
    input.click();
  });
}
// ponytail: web runs on the mock, which only has media keys.
export async function importPhoto(_url: string): Promise<string | null> {
  return null;
}
export async function clearOwnedPhotos(): Promise<void> {
  /* Photos live inside the namespaced web state. */
}

export function isPhotoAvailable(_ref: string): boolean {
  return true;
}
export async function reconcileOwnedPhotos(
  _refs: readonly string[],
): Promise<{ missing: number; cleanupFailed: boolean }> {
  return { missing: 0, cleanupFailed: false };
}
