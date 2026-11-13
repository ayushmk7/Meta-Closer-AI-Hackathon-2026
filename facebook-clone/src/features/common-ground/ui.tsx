// Shared Common Ground pieces, built only from the clone's tokens and primitives.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { imageSource } from '../../data/media';
import {
  Button,
  Card,
  Empty,
  Icon,
  IconButton,
  Label,
  Muted,
  Page,
  useColors,
} from '../../ui/native';
import { themes } from '../../ui/tokens';
import { getUser } from './api';
import { setIdentity, setState, start, useCg } from './store';
import type { AvailabilitySlot, GroupSize, InterestRef, MyInterest, PersonCard } from './types';

type Colors = ReturnType<typeof useColors>;
// Same selected-pill pair as the clone's Chips.
export const selectedBg = (c: Colors) => (c === themes.dark ? '#263951' : '#e7f3ff');
const pill = { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22 } as const;
// The clone Shell's warning banner pair (error banner, failed step icon).
export const WARN = { bg: '#fff2d2', fg: '#634100' } as const;

// Section header (17/700). With children it is a titled Card (padding 16); without, an
// on-canvas header row with the 16 gutter.
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const header = (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: aside || !children ? 44 : 0 }}
    >
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', flex: 1 }}>
        {title}
      </Label>
      {aside}
    </View>
  );
  if (children === undefined) return <View style={{ paddingHorizontal: 16 }}>{header}</View>;
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      {header}
      {children}
    </Card>
  );
}

// The one chip: 44 tall, radius 22, 14/600. `c.input` inside a card, `c.card` on the canvas;
// selected uses the clone Chips pair; `outlined` is the chat quick reply.
export function Pill({
  label,
  selected = false,
  outlined = false,
  onCanvas = false,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  outlined?: boolean;
  onCanvas?: boolean;
  onPress?: () => void;
  icon?: Parameters<typeof Icon>[0]['name'];
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const color = selected || outlined ? c.blue : c.text;
  return (
    <PressScale
      // A display chip (no onPress) reads as text, not a dimmed button.
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={onPress ? { selected } : undefined}
      onPress={onPress}
      style={{
        minHeight: 44,
        maxWidth: '100%',
        paddingHorizontal: 15,
        borderRadius: 22,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: outlined
          ? 'transparent'
          : selected
            ? selectedBg(c)
            : onCanvas
              ? c.card
              : c.input,
        ...(outlined ? { borderWidth: 1, borderColor: c.divider } : null),
      }}
    >
      {icon && <Icon name={icon} size={16} color={color} />}
      <Label style={{ fontSize: 14, fontWeight: '600', color, flexShrink: 1 }}>{label}</Label>
    </PressScale>
  );
}

// Motion. Layout animations (enter) honour system reduce motion by themselves; the
// hand-driven ones below check useReducedMotion. Only Skeleton loops.
// ponytail: none on web: Reanimated 4.5 web pins custom-keyframe entering views to
// position:absolute, so they overlap what follows. Demo runs on iPhone.
export const enter = (i = 0) =>
  Platform.OS === 'web'
    ? undefined
    : FadeInDown.duration(220)
        .easing(Easing.out(Easing.quad))
        .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })
        .delay(Math.min(i, 4) * 60);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Pressable whose whole box dips to 0.97 while held (cards, pills).
export function PressScale({
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const to = (v: number) => {
    if (!reduce) scale.value = withTiming(v, { duration: 100 });
  };
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => (to(0.97), onPressIn?.(e))}
      onPressOut={(e) => (to(1), onPressOut?.(e))}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Skeleton({
  width,
  height,
  radius = 8,
  style,
}: {
  width: ViewStyle['width'];
  height: ViewStyle['height'];
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    opacity.value = withRepeat(withTiming(0.5, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reduce, opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: c.input }, style, anim]}
    />
  );
}

// Springs 0.6 -> 1 once on mount; change `key` to replay.
export function Pop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.6);
  useEffect(() => {
    scale.value = withSpring(1, { duration: 250, dampingRatio: 1 });
  }, [scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

// Pops its child (plus one success haptic unless `quiet`) when `on` turns truthy or changes
// after mount; items already done on load stay still.
export function PopOn({
  on,
  quiet,
  children,
}: {
  on: unknown;
  quiet?: boolean;
  children: ReactNode;
}) {
  const prev = useRef(on);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (on && on !== prev.current) {
      setN((k) => k + 1);
      if (!quiet)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    prev.current = on;
  }, [on]);
  return n ? <Pop key={n}>{children}</Pop> : children;
}

// Line i shows at 0, 1.2, 3 s, then every 1.8 s.
const lineAt = (i: number) => (i < 3 ? [0, 1200, 3000][i] : 3000 + (i - 2) * 1800);

// Muse's checklist while it works. Earlier lines tick once a later one shows; the last
// line spins until `done`.
export function MuseThinking({ lines, done }: { lines: string[]; done: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const timers = lines.slice(1).map((_, k) => setTimeout(() => setShown(k + 2), lineAt(k + 1)));
    return () => timers.forEach(clearTimeout);
  }, [lines.length]);
  const visible = lines.slice(0, shown);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={visible[visible.length - 1]}
      style={{ gap: 8 }}
    >
      {visible.map((line, i) => (
        <Animated.View
          key={i}
          entering={reduce ? undefined : enter()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View style={{ width: 20, alignItems: 'center' }}>
            {done || i < shown - 1 ? (
              <Pop>
                <Icon name="checkmark-circle" size={18} color={c.blue} />
              </Pop>
            ) : (
              <ActivityIndicator size="small" color={c.secondary} />
            )}
          </View>
          <Muted style={{ flex: 1 }}>{line}</Muted>
        </Animated.View>
      ))}
    </View>
  );
}

export const personName = (p: PersonCard): string => p.displayName ?? 'Someone nearby';

export function PersonAvatar({ person, size = 40 }: { person: PersonCard; size?: number }) {
  const c = useColors();
  const box = { width: size, height: size, borderRadius: size / 2, backgroundColor: c.input };
  // Only my own avatar may fall back to the clone's photo of Maya (the viewer is u_maya,
  // CONTRACTS §2). Anyone else's null stays null: the server nulls private photos (P3).
  const self = person.userId === 'u_maya' && person.userId === getUser();
  const url = person.avatarUrl ?? (self ? 'asset:maya' : null);
  if (url)
    return (
      <Image
        accessibilityLabel={personName(person)}
        source={url.startsWith('asset:') ? imageSource(url.slice(6)) : { uri: url }}
        cachePolicy="memory" // C1: other people's photos never reach disk
        style={box}
      />
    );
  const lock = Math.max(14, Math.round(size * 0.38));
  return (
    <View
      accessible
      accessibilityLabel={personName(person)}
      style={[box, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <Label style={{ fontWeight: '700', fontSize: Math.round(size * 0.36) }}>
        {person.initials}
      </Label>
      {person.profileVisibility === 'private' && (
        // Private profile: initials on the usual circle plus a small lock badge.
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: lock,
            height: lock,
            borderRadius: lock / 2,
            backgroundColor: c.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="lock-closed" size={Math.round(lock * 0.62)} color={c.secondary} />
        </View>
      )}
    </View>
  );
}

export function InterestChips({ interests }: { interests: InterestRef[] }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {interests.map((i) => (
        <View key={i.id} style={[pill, { paddingVertical: 4, backgroundColor: c.input }]}>
          <Label style={{ fontWeight: '600', fontSize: 13 }}>{i.label}</Label>
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
                      hitSlop={14}
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
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? selectedBg(c) : c.input,
                }}
              >
                <Label style={{ fontSize: 14, fontWeight: '600', color: on ? c.blue : c.text }}>
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
// quiet: the screen already says what went wrong (NotFound), so skip the error row (P2-18).
export function Banners({ quiet = false }: { quiet?: boolean }) {
  const c = useColors();
  // ponytail: every CG screen renders Banners, so this is where cold deep links boot the store (start() is idempotent)
  useEffect(() => void start(), []);
  const stored = useCg((s) => s.error);
  const error = quiet ? null : stored;
  const override = useCg((s) => s.userOverride);
  const name = useCg((s) => s.me?.displayName);
  if (!error && !override) return null;
  return (
    <View>
      {error && (
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: WARN.bg,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Label style={{ color: WARN.fg, flex: 1, fontSize: 13 }}>{error.message}</Label>
          {error.retry && (
            <IconButton
              name="refresh"
              label="Retry"
              color={WARN.fg}
              onPress={() => {
                setState({ error: null });
                error.retry?.();
              }}
            />
          )}
          <IconButton
            name="close"
            label="Dismiss"
            color={WARN.fg}
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
          <Muted style={{ flex: 1 }}>Signed in as {name?.split(' ')[0] ?? override}</Muted>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Maya"
            onPress={() => void setIdentity(null)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Label style={{ color: c.blue, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>Back to Maya</Label>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function NotFound({ title }: { title: string }) {
  return (
    <Card>
      <Empty title={title} message="It may have been removed. Go back to Meetups." />
      <View style={{ padding: 16 }}>
        <Button
          title="Back to Meetups"
          secondary
          onPress={() => router.replace('/common-ground')}
        />
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

export { clock, when } from './time';
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

// A1 placeholder for screens slices B and C own; they replace the file, keeping its exports.
export function Stub({ title }: { title: string }) {
  return (
    <Page>
      <Banners />
      <Card>
        <Empty title={title} message="Coming soon" />
      </Card>
    </Page>
  );
}
