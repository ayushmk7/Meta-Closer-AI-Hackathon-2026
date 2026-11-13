// Post to the viewer's own story (CONTRACTS §11, v2.1.3). Kept out of registry.ts so the
// registry graph stays free of expo modules.
import { useDemo } from '../core/store';
import { validMedia } from '../core/model';
import { importPhoto } from '../platform/photo';

export function usePostStory(): (input: {
  image: string;
  text?: string;
}) => Promise<string | null> {
  const { actions } = useDemo();
  return async ({ image, text }) => {
    const ref = /^https?:\/\//.test(image) ? await importPhoto(image) : image;
    if (!ref || !validMedia(ref)) return null;
    return actions.createStory({ image: ref, text: text?.trim().slice(0, 500) }) || null;
  };
}
