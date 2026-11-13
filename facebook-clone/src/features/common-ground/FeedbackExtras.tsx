// STUB (B1). Owned by slice 4: replace freely, keep the default export and props.
import type { Feedback } from './types';

export type Extras = Pick<Feedback, 'rating' | 'tags'>;

export default function FeedbackExtras(_props: { value: Extras; onChange(next: Extras): void }) {
  return null;
}
