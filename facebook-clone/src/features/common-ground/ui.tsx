// Shared Common Ground pieces, built only from the clone's tokens and primitives.
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { imageSource } from '../../data/media';
import { Button, Card, Empty, Icon, IconButton, Label, Muted, useColors } from '../../ui/native';
import { setIdentity, setState, start, useCg } from './store';
import type { AvailabilitySlot, GroupSize, InterestRef, MyInterest, PersonCard } from './types';

type Colors = ReturnType<typeof useColors>;
// Same selected-pill pair as the clone's Chips.
const selectedBg = (c: Colors) => (c.canvas === '#18191A' ? '#263951' : '#e7f3ff');
const pill = { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22 } as const;

export const personName = (p: PersonCard): string => p.displayName ?? 'Someone nearby';

export function PersonAvatar({ person, size = 40 }: { person: PersonCard; size?: number }) {
  const c = useColors();
  const box = { width: size, height: size, borderRadius: size / 2, backgroundColor: c.input };
  const url = person.avatarUrl;
  if (url)
    return (
      <Image
        accessibilityLabel={personName(person)}
        source={url.startsWith('asset:') ? imageSource(url.slice(6)) : { uri: url }}
        cachePolicy="memory" // C1: other people's photos never reach disk
        style={box}
      />
    );
  return (
    <View
      accessible
      accessibilityLabel={personName(person)}
      style={[box, { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}
    >
      <Label style={{ fontWeight: '700', fontSize: Math.round(size * 0.36) }}>
        {person.initials}
      </Label>
      {person.profileVisibility === 'private' && (
        <BlurView intensity={12} tint="default" style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

export function InterestChips({ interests }: { interests: InterestRef[] }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {interests.map((i) => (
        <View key={i.id} style={[pill, { backgroundColor: c.input }]}>
          <Label style={{ fontWeight: '600', fontSize: 14 }}>{i.label}</Label>
        </View>
      ))}
    </View>
  );
}

export function InterestEditor({
  interests,
  onToggle,
  onRemove,
}: {
  interests: MyInterest[];
  onToggle(id: string): void;
  onRemove(id: string): void;
}) {
  const c = useColors();
  const groups = [...new Set(interests.map((i) => i.interest.path[0] ?? 'Other'))];
  return (
    <View style={{ gap: 14 }}>
      {groups.map((group) => {
        const items = interests.filter((i) => (i.interest.path[0] ?? 'Other') === group);
        return (
          <View key={group} style={{ gap: 8 }}>
            <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 16 }}>
              {group}
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {items.map(({ interest, visibility, sensitive }) => {
                const shown = visibility === 'shown';
                const color = shown ? c.blue : c.secondary;
                return (
                  <View
                    key={interest.id}
                    style={[
                      pill,
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingVertical: 0,
                        minHeight: 44,
                        backgroundColor: shown ? selectedBg(c) : c.input,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${interest.label}, ${shown ? 'shown' : 'hidden'}`}
                      accessibilityState={{ selected: shown }}
                      onPress={() => onToggle(interest.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
                    >
                      {sensitive && <Icon name="lock-closed" size={15} color={color} />}
                      {!shown && !sensitive && (
                        <Icon name="eye-off-outline" size={15} color={color} />
                      )}
                      <Label style={{ color, fontWeight: '600', fontSize: 14 }}>
                        {interest.label}
                      </Label>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${interest.label}`}
                      hitSlop={12}
                      onPress={() => onRemove(interest.id)}
                    >
                      <Icon name="close" size={17} color={color} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {items.some((i) => i.sensitive) && <Muted>Only you can see this.</Muted>}
          </View>
        );
      })}
    </View>
  );
}

export function GroupSizePicker({
  value,
  min,
  max,
  onChange,
}: {
  value: GroupSize;
  min: number;
  max: number;
  onChange(v: GroupSize): void;
}) {
  const step = (key: 'min' | 'max', by: number) => {
    const next = { ...value, [key]: value[key] + by };
    if (next.min >= min && next.max <= max && next.min <= next.max) onChange(next);
  };
  return (
    <View>
      {(
        [
          ['min', 'At least'],
          ['max', 'At most'],
        ] as const
      ).map(([key, label]) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label style={{ flex: 1 }}>{label}</Label>
          <IconButton
            name="remove-circle-outline"
            label={`Fewer people, ${label.toLowerCase()}`}
            onPress={() => step(key, -1)}
          />
          <Label style={{ fontWeight: '700', fontSize: 16, minWidth: 24, textAlign: 'center' }}>
            {value[key]}
          </Label>
          <IconButton
            name="add-circle-outline"
            label={`More people, ${label.toLowerCase()}`}
            onPress={() => step(key, 1)}
          />
        </View>
      ))}
    </View>
  );
}

const DAYS = [
  ['mon', 'Mon', 'Monday'],
  ['tue', 'Tue', 'Tuesday'],
  ['wed', 'Wed', 'Wednesday'],
  ['thu', 'Thu', 'Thursday'],
  ['fri', 'Fri', 'Friday'],
  ['sat', 'Sat', 'Saturday'],
  ['sun', 'Sun', 'Sunday'],
] as const;
const PARTS = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
] as const;
export function AvailabilityGrid({
  value,
  onChange,
}: {
  value: AvailabilitySlot[];
  onChange(v: AvailabilitySlot[]): void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {DAYS.map(([day, short, long]) => (
        <View key={day} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Muted style={{ width: 36 }}>{short}</Muted>
          {PARTS.map(([part, label]) => {
            const on = value.some((v) => v.day === day && v.part === part);
            return (
              <Pressable
                key={part}
                accessibilityRole="button"
                accessibilityLabel={`${long} ${part}`}
                accessibilityState={{ selected: on }}
                onPress={() =>
                  onChange(
                    on
                      ? value.filter((v) => !(v.day === day && v.part === part))
                      : [...value, { day, part }],
                  )
                }
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? selectedBg(c) : c.input,
                }}
              >
                <Label style={{ fontSize: 13, fontWeight: '600', color: on ? c.blue : c.text }}>
                  {label}
                </Label>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Shell-style error banner plus the second-phone identity banner.
export function Banners() {
  const c = useColors();
  // ponytail: every CG screen renders Banners, so this is where cold deep links boot the store (start() is idempotent)
  useEffect(() => void start(), []);
  const error = useCg((s) => s.error);
  const override = useCg((s) => s.userOverride);
  const name = useCg((s) => s.me?.displayName);
  if (!error && !override) return null;
  return (
    <View>
      {error && (
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: '#fff2d2',
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Label style={{ color: '#634100', flex: 1, fontSize: 13 }}>{error.message}</Label>
          {error.retry && (
            <IconButton
              name="refresh"
              label="Retry"
              color="#634100"
              onPress={() => {
                setState({ error: null });
                error.retry?.();
              }}
            />
          )}
          <IconButton
            name="close"
            label="Dismiss"
            color="#634100"
            onPress={() => setState({ error: null })}
          />
        </View>
      )}
      {override && (
        <View
          style={{
            backgroundColor: c.card,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Muted style={{ flex: 1 }}>Demo · signed in as {name?.split(' ')[0] ?? override}</Muted>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Maya"
            onPress={() => void setIdentity(null)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Label style={{ color: c.blue, fontWeight: '600', fontSize: 13 }}>Back to Maya</Label>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function NotFound({ title }: { title: string }) {
  return (
    <Card>
      <Empty title={title} message="It may no longer be available. Head back to the Map." />
      <View style={{ padding: 16 }}>
        <Button title="Back to Map" secondary onPress={() => router.replace('/common-ground')} />
      </View>
    </Card>
  );
}

// Runs on focus and every N seconds while focused (default: config.limits.pollIntervalS).
export function usePoll(fn: () => void, seconds?: number): void {
  const every = useCg((s) => seconds ?? s.config?.limits.pollIntervalS ?? 0);
  const latest = useRef(fn);
  latest.current = fn;
  useFocusEffect(
    useCallback(() => {
      latest.current();
      if (!every) return;
      const timer = setInterval(() => latest.current(), every * 1000);
      return () => clearInterval(timer);
    }, [every]),
  );
}

const BANDS: Record<string, string> = {
  under_1km: 'Less than 1 km away',
  '1_3km': '1 to 3 km away',
  '3_10km': '3 to 10 km away',
  over_10km: 'More than 10 km away',
};
export const distanceWords = (band: string): string => BANDS[band] ?? 'Nearby';

// "Sat, Nov 15 · 7:30 AM"
export const when = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
// "in 5 hours" / "3 minutes ago". ponytail: hand-rolled; Hermes lacks Intl.RelativeTimeFormat.
export const fromNow = (iso: string): string => {
  const secs = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(secs);
  const [n, unit] =
    abs < 3600
      ? [Math.round(abs / 60), 'minute']
      : abs < 86_400
        ? [Math.round(abs / 3600), 'hour']
        : [Math.round(abs / 86_400), 'day'];
  if (!n) return 'just now';
  const text = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return secs > 0 ? `in ${text}` : `${text} ago`;
};
