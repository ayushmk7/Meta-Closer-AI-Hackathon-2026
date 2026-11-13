// Stars + tag chips under the three feedback questions. Both optional; unknown tags in `value` are kept.
import { Pressable, View } from 'react-native';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import type { Feedback } from './types';
import { Pill } from './ui';

export type Extras = Pick<Feedback, 'rating' | 'tags'>;
type Tag = NonNullable<Feedback['tags']>[number];

const TAGS: [Tag, string][] = [
  ['great_venue', 'Great venue'],
  ['good_group', 'Good group'],
  ['too_far', 'Too far'],
  ['too_long', 'Too long'],
];

export default function FeedbackExtras({
  value,
  onChange,
}: {
  value: Extras;
  onChange(next: Extras): void;
}) {
  const c = useColors();
  const tags = value.tags ?? [];
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ fontWeight: '600' }}>
        Rate it <Muted>· optional</Muted>
      </Label>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = (value.rating ?? 0) >= n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
              accessibilityState={{ checked: value.rating === n }}
              // Tapping the current rating again clears it.
              onPress={() => onChange({ ...value, rating: value.rating === n ? undefined : n })}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon
                name={on ? 'star' : 'star-outline'}
                size={28}
                color={on ? c.blue : c.secondary}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TAGS.map(([tag, label]) => {
          const on = tags.includes(tag);
          return (
            <Pill
              key={tag}
              label={label}
              selected={on}
              onPress={() =>
                onChange({ ...value, tags: on ? tags.filter((t) => t !== tag) : [...tags, tag] })
              }
            />
          );
        })}
      </View>
    </View>
  );
}
