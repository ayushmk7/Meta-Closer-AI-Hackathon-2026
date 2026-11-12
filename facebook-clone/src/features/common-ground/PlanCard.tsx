// STUB (A1). Owned by slice B: replace freely, keep the default export and props.
import { Pressable } from 'react-native';
import { Label, Muted } from '../../ui/native';
import type { PlanCard as Plan } from './types';

export default function PlanCard({
  plan,
  onPress,
}: {
  plan: Plan;
  onPress?: () => void;
  badge?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={plan.title} onPress={onPress}>
      <Label style={{ fontWeight: '600' }}>{plan.title}</Label>
      <Muted>{plan.venue.name}</Muted>
    </Pressable>
  );
}
