import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polygon } from './maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import {
  Avatar,
  Busy,
  Button,
  Card,
  Icon,
  IconButton,
  Label,
  Muted,
  go,
  useColors,
} from '../../ui/native';
import Finder from './Finder';
import FriendSheet from './FriendSheet';
import { getState, load, sendLocation, start, useBadge, useCg } from './store';
import { Banners, PersonAvatar, personName, usePoll } from './ui';
import type { InterestRef, LatLng, PersonCard } from './types';

const REASONS: Record<string, string> = {
  not_sharing: 'Not sharing location',
  not_met: "Haven't met yet",
};
const first = (p: PersonCard) => personName(p).split(' ')[0];
const point = (l: LatLng) => ({ latitude: l.lat, longitude: l.lng });
const shares = (p: PersonCard, interests: InterestRef[]) =>
  interests.length ? `${first(p)}, shares ${interests.map((i) => i.label).join(', ')}` : first(p);
// Menu tile shadow.
const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
} as const;

export default function CommonGroundMap() {
  const c = useColors();
  const demo = useDemo();
  const ready = useCg((s) => s.ready);
  const config = useCg((s) => s.config);
  const me = useCg((s) => s.me);
  const map = useCg((s) => s.map);
  const density = useCg((s) => s.density);
  const badge = useBadge();
  const { find } = useLocalSearchParams<{ find?: string }>();
  const [selected, setSelected] = useState<string | null>(null);
  const ref = useRef<MapView>(null);
  const finderOpen = find === '1';

  useEffect(() => {
    void start();
  }, []);
  // Auto-open the Finder once, on the first ready render, for people not yet opted in.
  useEffect(() => {
    if (ready && !getState().me?.optedIn) router.setParams({ find: '1' });
  }, [ready]);
  usePoll(() => {
    if (!getState().ready) return;
    void load.map();
    void sendLocation();
  }, config?.limits.mapRefreshS);
  const showDensity = !!config?.features.density && (!me?.optedIn || finderOpen);
  useEffect(() => {
    if (showDensity && !getState().density) void load.density();
  }, [showDensity]);

  if (!ready) return <Busy />;
  const mode = config?.modes.find((m) => m.mode === me?.mode) ?? config?.modes[0];
  const here = map?.me.location ?? config?.demo.fakeLocation ?? mode?.center;
  const region = here && { ...point(here), latitudeDelta: 0.05, longitudeDelta: 0.05 };
  const bins = showDensity ? (density?.bins ?? []) : [];
  const max = Math.max(1, ...bins.map((b) => b.count));
  const ring = (status?: string | null) =>
    status === 'arrived' ? c.online : status === 'on_my_way' ? c.blue : c.card;
  const circle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Banners />
      <View style={{ flex: 1 }}>
        <MapView ref={ref} style={{ flex: 1 }} initialRegion={region || undefined}>
          {bins.map((b) => (
            <Polygon
              key={b.binId}
              coordinates={b.polygon.map(point)}
              strokeWidth={0}
              // ponytail: opacity rides on the hex alpha of c.blue (10% to 50%).
              fillColor={
                c.blue +
                Math.round(255 * (0.1 + (0.4 * b.count) / max))
                  .toString(16)
                  .padStart(2, '0')
              }
            />
          ))}
          {(map?.friends ?? []).map((f) =>
            f.precision === 'neighborhood' ? (
              <Circle
                key={`area-${f.userId}`}
                center={point(f.location)}
                radius={f.radiusM}
                fillColor={c.blue + '22'}
                strokeColor={c.blue}
              />
            ) : null,
          )}
          {(map?.friends ?? []).map((f) => (
            <Marker
              key={f.userId}
              coordinate={point(f.location)}
              accessibilityRole="button"
              accessibilityLabel={shares(f.person, f.sharedInterests)}
              onPress={() => setSelected(f.userId)}
            >
              <View
                style={{
                  borderWidth: 3,
                  borderColor: ring(f.meetupStatus),
                  borderRadius: 23,
                  backgroundColor: c.card,
                }}
              >
                <PersonAvatar person={f.person} size={40} />
              </View>
            </Marker>
          ))}
          {(map?.meetups ?? []).map((m) => (
            <Marker
              key={m.meetupId}
              coordinate={point(m.venue.location)}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}, ${m.venue.name}`}
              onPress={() => go('/common-ground/meetup/' + m.meetupId)}
            >
              <View style={[circle, { width: 40, height: 40, borderRadius: 20 }]}>
                <Icon name="calendar" size={20} color={c.blue} />
              </View>
            </Marker>
          ))}
          {map?.me.location && (
            <Marker coordinate={point(map.me.location)} accessibilityLabel="You">
              <Avatar image={demo.person(demo.seed.viewerId).avatar} size={40} label="You" />
            </Marker>
          )}
        </MapView>

        {showDensity && bins.length > 0 && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}
          >
            <Card style={{ borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10 }}>
              <Label style={{ fontWeight: '600', fontSize: 14 }}>
                {density?.totalLooking ?? 0} people near you are looking
              </Label>
            </Card>
          </View>
        )}

        <View style={{ position: 'absolute', top: 12, right: 12, gap: 10 }}>
          <View style={circle}>
            <IconButton
              name="locate"
              label="Recenter map"
              onPress={() => region && ref.current?.animateToRegion(region)}
            />
          </View>
          <View style={circle}>
            <IconButton
              name="settings-outline"
              label="Common Ground settings"
              onPress={() => go('/common-ground/settings')}
            />
          </View>
        </View>

        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <View style={{ alignSelf: 'center', marginBottom: 12, ...shadow }}>
            <Button
              title="Find people"
              icon="people"
              accessibilityLabel={badge ? `Find people, ${badge} new` : 'Find people'}
              onPress={() => router.setParams({ find: '1' })}
            />
            {badge > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -9,
                  borderRadius: 10,
                  backgroundColor: c.badge,
                  paddingHorizontal: 5,
                }}
              >
                <Label style={{ color: '#fff', fontSize: 10, lineHeight: 16, fontWeight: '700' }}>
                  {badge}
                </Label>
              </View>
            )}
          </View>
          {(map?.tray.length ?? 0) > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ backgroundColor: c.card }}
              contentContainerStyle={{ padding: 12, gap: 14 }}
            >
              {map!.tray.map((t) => (
                <Pressable
                  key={t.userId}
                  accessibilityRole="button"
                  accessibilityLabel={shares(t.person, t.sharedInterests)}
                  onPress={() => setSelected(t.userId)}
                  style={{ alignItems: 'center', width: 84, gap: 4 }}
                >
                  <PersonAvatar person={t.person} size={54} />
                  <Label numberOfLines={1} style={{ fontWeight: '600', fontSize: 13 }}>
                    {first(t.person)}
                  </Label>
                  {!!REASONS[t.reason] && (
                    <Muted numberOfLines={2} style={{ fontSize: 11, textAlign: 'center' }}>
                      {REASONS[t.reason]}
                    </Muted>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {finderOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Finder onClose={() => router.setParams({ find: undefined })} />
        </View>
      )}
      <FriendSheet userId={selected} onClose={() => setSelected(null)} />
    </View>
  );
}
