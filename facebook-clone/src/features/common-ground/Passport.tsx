// Passport: a stamp per distinct activity, neighborhood and place I've met at. Private to the user.
import { useEffect, useMemo, type ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Card, Empty, Icon, Label, Muted, Page, Title, go, useColors } from '../../ui/native';
import { noteVerified } from './Quests';
import { human, stamps, type Stamp, type StampKind } from './stamps';
import { getState, load, useCg } from './store';
import { Banners } from './ui';

type IconName = ComponentProps<typeof Icon>['name'];
const SECTIONS: { kind: StampKind; title: string; icon: IconName }[] = [
  { kind: 'activity', title: 'Activities', icon: 'ribbon-outline' },
  { kind: 'neighborhood', title: 'Neighborhoods', icon: 'map-outline' },
  { kind: 'venue', title: 'Places', icon: 'location-outline' },
];

function StampTile({ stamp, icon }: { stamp: Stamp; icon: IconName }) {
  const c = useColors();
  const on = stamp.earned;
  return (
    <View
      accessible
      accessibilityLabel={`${stamp.label}, ${on ? 'collected' : 'locked'}`}
      style={{ width: 96, alignItems: 'center', gap: 6 }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? c.blue : c.input,
        }}
      >
        <Icon
          name={on ? icon : 'lock-closed-outline'}
          size={26}
          color={on ? '#fff' : c.secondary}
        />
      </View>
      <Label
        numberOfLines={2}
        style={{
          fontSize: 13,
          lineHeight: 17,
          textAlign: 'center',
          fontWeight: on ? '600' : '400',
          color: on ? c.text : c.secondary,
        }}
      >
        {stamp.label}
      </Label>
    </View>
  );
}

// After a successful verify (Scan): the stamp it earned, and the "Verify in person" quest ticks.
export function StampEarned({ meetupId }: { meetupId: string }) {
  const c = useColors();
  const activity = useCg((s) => s.meetups[meetupId]?.activityType);
  useEffect(() => void noteVerified(), []);
  if (!activity) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="ribbon" size={22} color={c.blue} />
      <Label style={{ flex: 1, fontWeight: '600' }}>{`Stamp earned: ${human(activity)}`}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See passport"
        onPress={() => go('/common-ground/passport')}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Label style={{ color: c.blue, fontWeight: '600' }}>See passport</Label>
      </Pressable>
    </View>
  );
}

export default function PassportScreen() {
  const meetups = useCg((s) => s.meetups);
  const feed = useCg((s) => s.feed);
  const plans = useCg((s) => s.plans);
  const setUp = useCg((s) => !!s.me?.optedIn && !!s.me.setupComplete);
  useEffect(() => {
    // Cold deep link: Plans normally loaded these already.
    if (!setUp) return;
    void load.meetups();
    if (!getState().feed) void load.feed();
  }, [setUp]);
  const all = useMemo(
    () => stamps(Object.values(meetups), [...(feed?.plans ?? []), ...Object.values(plans)]),
    [meetups, feed, plans],
  );
  const earned = all.filter((x) => x.earned).length;
  return (
    <Page>
      <Banners />
      <Title>Your passport</Title>
      <View style={{ paddingHorizontal: 16, gap: 2 }}>
        <Label style={{ fontWeight: '600' }}>{`${earned} of ${all.length} stamps`}</Label>
        <Muted>
          {earned
            ? 'Check in at a meetup to collect more.'
            : 'Check in at a meetup to get your first stamp.'}
        </Muted>
        <Muted>Only you can see this.</Muted>
      </View>
      {!all.length && (
        <Card style={{ marginHorizontal: 16 }}>
          <Empty title="No stamps yet" message="Join a plan to see what you can collect." />
        </Card>
      )}
      {SECTIONS.map(({ kind, title, icon }) => {
        const items = all.filter((x) => x.kind === kind);
        if (!items.length) return null;
        return (
          <Card key={kind} style={{ marginHorizontal: 16, padding: 16, gap: 12 }}>
            <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
              {title}
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {items.map((x) => (
                <StampTile key={x.key} stamp={x} icon={icon} />
              ))}
            </View>
          </Card>
        );
      })}
    </Page>
  );
}
