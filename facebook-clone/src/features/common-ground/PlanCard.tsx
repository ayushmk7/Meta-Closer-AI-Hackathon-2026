// Plan card (PRD-1 §8.1 item 3). Used by the For you carousel, Muse's reply row and alternatives.
import type { ComponentProps } from 'react';
import { PixelRatio, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { imageSource } from '../../data/media';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import { clock } from './time';
import { TZ } from './types';
import { PressScale, Skeleton, enter, selectedBg } from './ui';
import type { Crowd, PlanCard as Plan, PlanCheck } from './types';

// "Sat 10 AM" / "Sat 9:30 AM", always in TZ (Pacific), never the device zone.
export const dayTime = (iso: string): string => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ });
  return `${day} ${clock(iso)}`;
};
// "45 min", "2 hr", "2 hr 30 min"
export const duration = (min: number): string =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}`;
const spots = (n: number) => `${n} spot${n === 1 ? '' : 's'} left`;
// C5: the crowd is counts only; there is no field that could carry a name.
export const crowdLine = (c: Crowd): string => `${c.interestedCount} in · ${spots(c.spotsLeft)}`;
export const whosIn = (c: Crowd): string =>
  [
    `${c.interestedCount} in`,
    ...c.sharedWithYou.map((s) => `${s.count} also into ${s.interest.label.toLowerCase()}`),
    spots(c.spotsLeft),
  ].join(' · ');
// A plan reason: met checks get Meetup's checkmark icon (muted); unmet ones are muted text, aligned.
export function CheckRow({
  check: k,
  fontSize = 15,
  card = false,
}: {
  check: PlanCheck;
  fontSize?: number;
  card?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {k.ok ? (
        <Icon name="checkmark-circle" size={16} color={c.secondary} />
      ) : (
        <View style={{ width: 16 }} />
      )}
      <Label
        numberOfLines={card ? 1 : undefined}
        maxFontSizeMultiplier={card ? MAX_FONT : undefined}
        style={[
          { flex: 1, fontSize, color: k.ok ? c.text : c.secondary },
          card && { lineHeight: 18 },
        ]}
      >
        {k.label}
      </Label>
    </View>
  );
}

type IconName = ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, IconName> = {
  walk: 'walk',
  hike: 'walk',
  climbing: 'trending-up',
  pottery: 'color-palette',
  ceramics: 'color-palette',
  board_game_night: 'dice',
  run: 'fitness',
  music: 'musical-notes',
  brunch: 'restaurant',
  lunch: 'restaurant',
  food_crawl: 'restaurant',
};
export const activityIcon = (type: string): IconName => ICONS[type] ?? 'sparkles';
export const photoSource = (url: string) =>
  url.startsWith('asset:') ? imageSource(url.slice(6)) : { uri: url };

export function PlanPhoto({ plan, height }: { plan: Plan; height: number }) {
  const c = useColors();
  const url = plan.venue.photoUrl;
  return (
    <View
      style={{
        height,
        backgroundColor: selectedBg(c),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={activityIcon(plan.activityType)} size={36} color={c.blue} />
      {url && (
        <Image
          source={photoSource(url)}
          cachePolicy="memory"
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
    </View>
  );
}

export function Badge({ text }: { text: string }) {
  const c = useColors();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.brand,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Label
        maxFontSizeMultiplier={MAX_FONT}
        style={{ color: '#fff', fontSize: 12, lineHeight: 16, fontWeight: '700' }}
      >
        {text}
      </Label>
    </View>
  );
}

// Every card is the same size: fixed photo, and each text slot reserves its height even when
// empty. Text grows with Dynamic Type only up to MAX_FONT, and slot heights grow with it, so
// cards in one row always match (measure-free).
const MAX_FONT = 1.3;
const PHOTO = 130;
const PAD = 12;
const GAP = 4;
// Line heights at 1x: badge row (Badge = 21 line + 4 padding), title 2 lines, venue, meta,
// 3 check rows, crowd line, reason 2 lines.
const SLOTS = { badge: 25, title: 40, venue: 18, meta: 18, checks: 62, crowd: 18, reason: 36 };
type Slot = keyof typeof SLOTS;
export function cardSlots() {
  const s = Math.min(PixelRatio.getFontScale(), MAX_FONT);
  const h = Object.fromEntries(
    Object.entries(SLOTS).map(([k, v]) => [k, Math.ceil(v * s)]),
  ) as Record<Slot, number>;
  const body = Object.values(h).reduce((a, b) => a + b, 0) + GAP * 6 + PAD * 2;
  return { h, height: PHOTO + body + 2 }; // + 2: top/bottom border
}

export default function PlanCard({
  plan,
  onPress,
  badge,
  width = 280,
}: {
  plan: Plan;
  onPress?: () => void;
  badge?: string;
  width?: number;
}) {
  const c = useColors();
  // Spots are already in the crowd line below; don't repeat them as a check.
  const checks = plan.checks.filter((k) => k.kind !== 'spots').slice(0, 3);
  const meta = [dayTime(plan.startsAt), duration(plan.durationMin), plan.cost.label].join(' · ');
  const joined = !!plan.myJoin && plan.myJoin.status !== 'withdrawn';
  const { h, height } = cardSlots();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={[
        plan.title,
        badge,
        joined && "You're in",
        plan.venue.name,
        meta,
        ...checks.map((k) => (k.ok ? k.label : `${k.label}, not met`)),
        crowdLine(plan.crowd),
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={{
        width,
        height,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.divider,
      }}
    >
      <PlanPhoto plan={plan} height={PHOTO} />
      <View style={{ padding: PAD, gap: GAP }}>
        <View style={{ height: h.badge, flexDirection: 'row', gap: 6, overflow: 'hidden' }}>
          {badge && <Badge text={badge} />}
          {joined && <Badge text="In" />}
        </View>
        <Label
          {...fit(2)}
          style={{ height: h.title, fontWeight: '700', fontSize: 16, lineHeight: 20 }}
        >
          {plan.title}
        </Label>
        <Muted {...fit(1)} style={{ height: h.venue }}>
          {[plan.venue.name, plan.venue.neighborhood].filter(Boolean).join(' · ')}
        </Muted>
        <Label {...fit(1)} style={{ height: h.meta, fontSize: 14, lineHeight: 18 }}>
          {meta}
        </Label>
        <View style={{ height: h.checks, gap: GAP, overflow: 'hidden' }}>
          {checks.map((k) => (
            <CheckRow key={k.kind + k.label} check={k} fontSize={14} card />
          ))}
        </View>
        <Label
          {...fit(1)}
          style={{ height: h.crowd, fontSize: 14, lineHeight: 18, fontWeight: '600' }}
        >
          {crowdLine(plan.crowd)}
        </Label>
        <Muted {...fit(2)} style={{ height: h.reason }}>
          {plan.reason}
        </Muted>
      </View>
    </PressScale>
  );
}

const fit = (lines: number) => ({ numberOfLines: lines, maxFontSizeMultiplier: MAX_FONT });

// A placeholder exactly the real card's size: same photo and slot heights, one bar per slot.
const BARS: [Slot, `${number}%`][] = [
  ['badge', '20%'],
  ['title', '70%'],
  ['venue', '50%'],
  ['meta', '60%'],
  ['checks', '45%'],
  ['crowd', '35%'],
  ['reason', '90%'],
];
export function PlanCardSkeleton({ width = 280 }: { width?: number }) {
  const c = useColors();
  const { h, height } = cardSlots();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.divider,
      }}
    >
      <Skeleton width="100%" height={PHOTO} radius={0} />
      <View style={{ padding: PAD, gap: GAP }}>
        {BARS.map(([slot, w]) => (
          <View key={slot} style={{ height: h[slot], justifyContent: 'center' }}>
            <Skeleton width={w} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

// Horizontal, snap-to-card row (For you, Muse's answer).
export function PlanCarousel({
  plans,
  badgeFor,
  onOpen,
}: {
  plans: Plan[];
  badgeFor?: (p: Plan) => string | undefined;
  onOpen(p: Plan): void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={292}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12, alignItems: 'flex-start' }}
    >
      {plans.map((p, i) => (
        <Animated.View key={p.planId} entering={enter(i)}>
          <PlanCard plan={p} badge={badgeFor?.(p)} onPress={() => onOpen(p)} />
        </Animated.View>
      ))}
    </ScrollView>
  );
}
