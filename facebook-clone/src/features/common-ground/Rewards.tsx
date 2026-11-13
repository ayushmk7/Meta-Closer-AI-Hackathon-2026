// Private progress (DESIGN Rewards): only the user sees it; never shown to others or used in ranking.
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Card, Icon, Label, Muted, go, useColors } from '../../ui/native';
import { createPlan, load, useCg } from './store';
import { TZ, type Meetup } from './types';
import { when } from './ui';

const s = (n: number) => (n === 1 ? '' : 's');
const goalText = (next: { unlockId: string; label: string; remaining: number }) =>
  `${next.remaining} more meetup${s(next.remaining)} to ${
    next.unlockId === 'create_plans' ? 'create your own plans' : `unlock ${next.label}`
  }`;
// ms the TZ wall clock is ahead of UTC at instant t (negative in LA).
const wall = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  ...Object.fromEntries(['year', 'month', 'day', 'hour', 'minute'].map((k) => [k, 'numeric'])),
});
const offset = (t: number) => {
  const p = Object.fromEntries(wall.formatToParts(t).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60_000) * 60_000;
};
// Same LA wall-clock time 7 calendar days later, across DST.
export const nextWeek = (iso: string): string => {
  const t = Date.parse(iso);
  const naive = t + 7 * 86_400_000;
  return new Date(naive + offset(t) - offset(naive)).toISOString();
};

// Under the Quests card: the latest unlock earned (the goal stays on the Rewards card).
export function RewardRow() {
  const c = useColors();
  const unlocks = useCg((st) => st.me?.unlocks);
  const canCreate = useCg((st) => !!st.me?.capabilities.canCreatePlans);
  // A completed meetup can unlock something; Me isn't pushed, so refetch it when one completes.
  const completed = useCg(
    (st) => Object.values(st.meetups).filter((m) => m.status === 'completed').length,
  );
  useEffect(() => {
    if (completed) void load.me();
  }, [completed]);
  const latest = unlocks?.length
    ? [...unlocks].sort((a, b) => a.earnedAt.localeCompare(b.earnedAt)).at(-1)!.label
    : canCreate // the mock flips this without adding an Unlock
      ? 'Create your own plans'
      : null;
  if (!latest) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Unlocked: ${latest}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
    >
      <Icon name="ribbon" size={22} color={c.blue} />
      <Label style={{ flex: 1, fontWeight: '600' }}>{`Unlocked: ${latest}`}</Label>
    </View>
  );
}

export default function Rewards({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const r = useCg((st) => st.me?.rewards);
  const regular = useCg((st) => !!st.me?.unlocks.some((u) => u.unlockId === 'regular'));
  const next = r?.nextUnlock;
  if (!r || (!next && !r.streakWeeks && !regular)) return null;
  const goal = next && goalText(next);
  const total = next ? r.confirmedMeetups + next.remaining : 0;
  return (
    <Card style={[{ padding: 16, gap: 10 }, style]}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Your progress
      </Label>
      {goal && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={goal}
          accessibilityValue={{ min: 0, max: total, now: r.confirmedMeetups }}
          style={{ gap: 8 }}
        >
          <Label>{goal}</Label>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: total }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  // Unfilled: a ring in secondary text color (divider is ~1.2:1, WCAG 1.4.11 wants 3:1).
                  borderWidth: 1.5,
                  borderColor: i < r.confirmedMeetups ? c.blue : c.secondary,
                  backgroundColor: i < r.confirmedMeetups ? c.blue : 'transparent',
                }}
              />
            ))}
          </View>
        </View>
      )}
      {r.streakWeeks > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="calendar-outline" size={17} color={c.secondary} />
          <Label>{`${r.streakWeeks}-week streak`}</Label>
        </View>
      )}
      {regular && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="ribbon-outline" size={17} color={c.blue} />
          <Label style={{ fontWeight: '600' }}>Regular</Label>
        </View>
      )}
      <Muted>Only you can see this.</Muted>
    </Card>
  );
}

// Completed meetup, feedback sent: plan the same thing a week later via createPlan's text.
export function SameTimeNextWeek({ m }: { m: Meetup }) {
  const can = useCg(
    (st) => !!st.config?.features.userPlans && !!st.me?.capabilities.canCreatePlans,
  );
  const [busy, setBusy] = useState(false);
  if (!can || m.status !== 'completed' || m.feedbackDue) return null;
  const next = nextWeek(m.startsAt);
  const onPress = async () => {
    setBusy(true);
    const p = await createPlan(`${m.title} at ${m.venue.name}, ${when(next)}`);
    setBusy(false);
    if (p) go(`/common-ground/plan/${p.planId}`);
  };
  return (
    <Button
      title="Plan it again next week"
      icon="repeat-outline"
      disabled={busy}
      onPress={() => void onPress()}
    />
  );
}
