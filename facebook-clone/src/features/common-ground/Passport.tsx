// Passport: a stamp per distinct activity, neighborhood and place I've met at. Private to the user.
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Platform, Share, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  Button,
  Card,
  Empty,
  Icon,
  IconButton,
  Label,
  Muted,
  Page,
  Title,
  useColors,
} from '../../ui/native';
import { activityIcon } from './PlanCard';
import { shareText, stamps, type Stamp, type StampKind } from './stamps';
import { getState, load, setState, useCg } from './store';
import { Banners, Pop, enter, selectedBg } from './ui';

type IconName = ComponentProps<typeof Icon>['name'];
const SECTIONS: { kind: StampKind; title: string }[] = [
  { kind: 'activity', title: 'Activities' },
  { kind: 'neighborhood', title: 'Neighborhoods' },
  { kind: 'venue', title: 'Places' },
];
const PLACE: Record<string, IconName> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  bar: 'wine',
  karaoke_lounge: 'wine',
  studio: 'color-palette',
  art_studio: 'color-palette',
  game_cafe: 'dice',
  climbing_gym: 'trending-up',
  park: 'leaf',
  community_garden: 'leaf',
  trail: 'trail-sign',
  beach: 'water',
  museum: 'business',
  market: 'basket',
  library: 'library',
  music_venue: 'musical-notes',
  cinema: 'film',
};
const art = (x: Stamp): IconName =>
  x.kind === 'activity' ? activityIcon(x.key) : (PLACE[x.venueKind ?? ''] ?? 'location');
// "Hayes Valley" -> "HV", "Mission" -> "MI"
const monogram = (s: string) => {
  const w = s.trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
};
// Stable -8..+8 degree tilt per stamp, so the grid looks hand-stamped.
const tilt = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 17) - 8;
};

const stampId = (x: Stamp) => `${x.kind}:${x.key}`;

function StampTile({ stamp, i, fresh }: { stamp: Stamp; i: number; fresh: boolean }) {
  const c = useColors();
  const on = stamp.earned;
  const ring = on ? c.blue : c.divider;
  const ink = on ? c.blue : c.secondary;
  const stampArt = (
    <View
      style={{
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 2,
        borderColor: ring,
        borderStyle: on ? 'solid' : 'dashed',
        backgroundColor: on ? selectedBg(c) : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${tilt(stamp.key)}deg` }],
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 1,
          borderColor: ring,
          borderStyle: 'dashed',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: on ? 1 : 0.45,
        }}
      >
        {stamp.kind === 'neighborhood' ? (
          <>
            <Label style={{ fontSize: 20, lineHeight: 24, fontWeight: '800', color: ink }}>
              {monogram(stamp.label)}
            </Label>
            <View style={{ position: 'absolute', bottom: 3 }}>
              <Icon name={on ? 'location' : 'location-outline'} size={12} color={ink} />
            </View>
          </>
        ) : (
          <Icon
            name={(on ? art(stamp) : `${art(stamp)}-outline`) as IconName}
            size={28}
            color={ink}
          />
        )}
      </View>
    </View>
  );
  return (
    <Animated.View
      entering={enter(Math.min(i, 8))}
      accessible
      accessibilityLabel={`${stamp.label}, ${on ? `collected ${stamp.earnedOn ?? ''}`.trim() : 'not collected yet'}`}
      style={{ width: '33.33%', alignItems: 'center', gap: 6 }}
    >
      {fresh ? <Pop>{stampArt}</Pop> : stampArt}
      <Label
        numberOfLines={2}
        style={{
          fontSize: 13,
          lineHeight: 18,
          textAlign: 'center',
          fontWeight: on ? '600' : '400',
          color: on ? c.text : c.secondary,
        }}
      >
        {stamp.label}
      </Label>
      {on && !!stamp.earnedOn && <Muted style={{ fontSize: 12, lineHeight: 16 }}>{stamp.earnedOn}</Muted>}
    </Animated.View>
  );
}

export default function PassportScreen() {
  const c = useColors();
  const meetups = useCg((s) => s.meetups);
  const feed = useCg((s) => s.feed);
  const plans = useCg((s) => s.plans);
  const setUp = useCg((s) => !!s.me?.optedIn && !!s.me.setupComplete);
  const sharing = useCg((s) => !!s.config?.features.sharing);
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
  // Stamps earned since my last visit pop once. Seen ids are read at open so the pop survives the save.
  const [seenAtOpen] = useState(() => new Set(getState().passportSeen));
  const fresh = all
    .filter((x) => x.earned && !seenAtOpen.has(stampId(x)))
    .map(stampId)
    .join('\n');
  useEffect(() => {
    if (!fresh) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setState({ passportSeen: [...new Set([...getState().passportSeen, ...fresh.split('\n')])] });
  }, [fresh]);
  // Own stamps only, on the user's tap (CONTRACTS Decisions: Quests and Passport stay client-side).
  const share = () =>
    void Share.share({
      message: shareText(all, Linking.createURL('/common-ground/welcome')),
    }).catch(() => {});
  return (
    <Page>
      <Banners />
      {/* Web: the back row (#84) already shows the title. */}
      {/* ponytail: native only; web has no share entry (lead: native-only batch). */}
      {Platform.OS !== 'web' && (
        <Title
          aside={
            sharing &&
            earned > 0 && (
              <IconButton name="share-outline" label="Share your passport" onPress={share} />
            )
          }
        >
          Your passport
        </Title>
      )}
      <Card
        style={{
          padding: 16,
          gap: 12,
          backgroundColor: c.brand,
        }}
      >
        <View
          accessible
          accessibilityLabel={`Passport. ${earned} of ${all.length} stamps collected.`}
          style={{ gap: 12 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: '#ffffff22',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="ribbon" size={28} color="#fff" />
            </View>
            <Label
              style={{ flex: 1, fontSize: 20, lineHeight: 25, fontWeight: '800', color: '#fff' }}
            >
              {`${earned} of ${all.length} stamps`}
            </Label>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#ffffff44' }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: '#fff',
                width: `${all.length ? (earned / all.length) * 100 : 0}%`,
              }}
            />
          </View>
          <Label style={{ fontSize: 13, lineHeight: 18, color: '#fff', opacity: 0.9 }}>
            {earned
              ? 'Check in at a meetup to collect more.'
              : 'Check in at a meetup to get your first stamp.'}
          </Label>
        </View>
      </Card>
      <Muted style={{ paddingHorizontal: 16 }}>Only you can see this.</Muted>
      {!all.length && (
        <Card style={{ paddingBottom: 16, alignItems: 'center' }}>
          <Empty title="No stamps yet" message="Join a meetup to see what you can collect." />
          <Button title="See meetups" secondary onPress={() => router.push('/common-ground')} />
        </Card>
      )}
      {SECTIONS.map(({ kind, title }) => {
        const items = all.filter((x) => x.kind === kind);
        if (!items.length) return null;
        return (
          <Card key={kind} style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Label
                accessibilityRole="header"
                style={{ flex: 1, fontSize: 17, fontWeight: '700' }}
              >
                {title}
              </Label>
              <Muted>{`${items.filter((x) => x.earned).length} of ${items.length}`}</Muted>
            </View>
            {/* Three equal columns across the card; partial last rows stay aligned. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
              {items.map((x, i) => (
                <StampTile
                  key={x.key}
                  stamp={x}
                  i={i}
                  fresh={x.earned && !seenAtOpen.has(stampId(x))}
                />
              ))}
            </View>
          </Card>
        );
      })}
    </Page>
  );
}
