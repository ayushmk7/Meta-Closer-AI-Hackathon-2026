// Plan card (PRD-1 §8.1 item 3). Used by the For you carousel, Muse's reply row and alternatives.
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { imageSource } from '../../data/media';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import { clock } from './time';
import { TZ } from './types';
import { selectedBg } from './ui';
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
export function CheckRow({ check: k, fontSize = 15 }: { check: PlanCheck; fontSize?: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {k.ok ? (
        <Icon name="checkmark-circle" size={16} color={c.secondary} />
      ) : (
        <View style={{ width: 16 }} />
      )}
      <Label style={{ flex: 1, fontSize, color: k.ok ? c.text : c.secondary }}>{k.label}</Label>
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
        backgroundColor: c.blue,
        borderRadius: 9,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Label style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{text}</Label>
    </View>
  );
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
  return (
    <Pressable
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
      style={({ pressed }) => ({
        width,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.divider,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <PlanPhoto plan={plan} height={130} />
      <View style={{ padding: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {badge && <Badge text={badge} />}
          {joined && <Badge text="In" />}
        </View>
        <Label style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={2}>
          {plan.title}
        </Label>
        <Muted numberOfLines={1}>
          {[plan.venue.name, plan.venue.neighborhood].filter(Boolean).join(' · ')}
        </Muted>
        <Label style={{ fontSize: 14 }}>{meta}</Label>
        {checks.map((k) => (
          <CheckRow key={k.kind + k.label} check={k} fontSize={14} />
        ))}
        <Label style={{ fontSize: 14, fontWeight: '600' }}>{crowdLine(plan.crowd)}</Label>
        <Muted numberOfLines={2}>{plan.reason}</Muted>
      </View>
    </Pressable>
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
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
    >
      {plans.map((p) => (
        <PlanCard key={p.planId} plan={p} badge={badgeFor?.(p)} onPress={() => onOpen(p)} />
      ))}
    </ScrollView>
  );
}
