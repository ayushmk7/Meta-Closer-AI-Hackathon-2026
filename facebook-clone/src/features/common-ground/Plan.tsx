// Plan pop-up (PRD-1 §8.2). Who's in is counts only (C5).
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  Icon,
  IconButton,
  Label,
  Muted,
  Page,
  Sheet,
  go,
  useColors,
} from '../../ui/native';
import { CheckRow, PlanPhoto, Progress, dayTime, duration, whosIn } from './PlanCard';
import { getState, join, load, useCg, withdraw } from './store';
import { planMessage, shareOut } from './share';
import { pickSurprise } from './SurpriseButton';
import type { GroupSize, PlanDetail } from './types';
import {
  Banners,
  enter,
  GroupSizePicker,
  NotFound,
  PersonAvatar,
  Pill,
  Pop,
  Section,
  usePoll,
} from './ui';
import { when } from './time';
import VenueMap from './VenueMap';

// "google_maps" -> "Google Maps" when no connector label is known.
export const sourceName = (source: string, labels: Record<string, string>) =>
  labels[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

// Not opted in (e.g. a cold deep link after a reset): offer setup instead of the API's 403.
export function SetupPrompt() {
  return (
    <Card style={{ marginVertical: 16, padding: 16, gap: 8 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Meetups
      </Label>
      <Muted>Muse can find things to do with people who are into what you&apos;re into.</Muted>
      <Button title="Get started" onPress={() => router.replace('/common-ground/setup')} />
    </Card>
  );
}

// Salvaged from the v1 Plan something form: the size range is bounded by config limits and my cap.
export function sizeBounds(
  limits: { groupSizeMin: number; groupSizeMax: number } | undefined,
  maxGroupSize: number | undefined,
): { min: number; max: number } {
  const min = limits?.groupSizeMin ?? 2;
  const max = Math.max(min, Math.min(limits?.groupSizeMax ?? 8, maxGroupSize ?? Infinity));
  return { min, max };
}
const clamp = (v: GroupSize, b: { min: number; max: number }): GroupSize => {
  const min = Math.min(Math.max(v.min, b.min), b.max);
  return { min, max: Math.min(Math.max(v.max, min), b.max) };
};

// Shared Section header (UX 2.2) over a body at the same 16 gutter.
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Section title={title} />
      <View style={{ paddingHorizontal: 16, gap: 6 }}>{children}</View>
    </View>
  );
}

// "Share meetup" on the header photo (plan pop-up, meetup). Hidden unless features.sharing; the
// caller hides it for invite plans (the public page 404s them). The message never names people.
export function SharePlanButton({ plan }: { plan: Parameters<typeof planMessage>[0] }) {
  const sharing = useCg((s) => !!s.config?.features.sharing);
  if (!sharing) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}
    >
      <IconButton
        name="share-outline"
        label="Share meetup"
        color="#fff"
        onPress={() => void shareOut(planMessage(plan))}
      />
    </View>
  );
}

// "Try another" on a Surprise me plan: a fresh pick from the feed, never this plan again.
function tryAnother(planId: string) {
  const s = getState();
  const p =
    s.feed &&
    pickSurprise(
      s.feed.plans.filter((x) => x.planId !== planId),
      s.joins,
    );
  if (p) router.replace(`/common-ground/plan/${p.planId}?surprise=1`);
}

export function BottomBar({ plan, surprise = false }: { plan: PlanDetail; surprise?: boolean }) {
  const c = useColors();
  const myJoin = plan.myJoin && plan.myJoin.status !== 'withdrawn' ? plan.myJoin : null;
  const joinRow = useCg((s) => s.joins.find((j) => j.planId === plan.planId));
  const meetup = useCg((s) => (joinRow?.meetupId ? s.meetups[joinRow.meetupId] : undefined));
  const limits = useCg((s) => s.config?.limits);
  const plusOneOn = useCg((s) => !!s.config?.features.plusOne);
  const cap = useCg((s) => s.me?.capabilities.maxGroupSize);
  const bounds = sizeBounds(limits, cap);
  const [size, setSize] = useState<GroupSize | null>(null);
  const [sizing, setSizing] = useState(false);
  const [plusOne, setPlusOne] = useState(false);
  const [tapped, setTapped] = useState(false); // pop on a fresh join only, not on reopening
  // The group forming animates (plus one haptic) only if I watched it happen, not on reopen.
  const waited = useRef(false);
  const [formed, setFormed] = useState(false);
  // joins is polled fast while Muse gathers people; plan.myJoin only on the slow feed refresh,
  // so the newer join row decides (else the pop-up sits on "forming your group").
  const status = joinRow
    ? joinRow.status === 'withdrawn'
      ? undefined
      : joinRow.status
    : myJoin?.status;
  useEffect(() => {
    if (status === 'interested') waited.current = true;
    if (status === 'matched' && waited.current) {
      waited.current = false;
      setFormed(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [status]);

  if (status === 'matched') {
    const meetupId = joinRow?.meetupId;
    const going = meetup?.attendees.filter((a) => a.rsvp === 'going') ?? [];
    return (
      <Animated.View entering={formed ? enter() : undefined} style={{ gap: 12 }}>
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Icon name="checkmark-circle" size={22} color={c.online} />
          <Label style={{ flex: 1, fontWeight: '700' }}>
            {`Your group is set · ${going.length || plan.crowd.interestedCount} going`}
          </Label>
          <View style={{ flexDirection: 'row' }}>
            {going.slice(0, 4).map((a, i) => (
              <Animated.View
                key={a.person.userId}
                entering={formed ? enter(i + 1) : undefined}
                style={{ marginLeft: i ? -8 : 0 }}
              >
                <PersonAvatar person={a.person} size={28} />
              </Animated.View>
            ))}
          </View>
        </View>
        <Button
          title="See meetup"
          disabled={!meetupId}
          onPress={() => meetupId && go(`/common-ground/meetup/${meetupId}`)}
        />
      </Animated.View>
    );
  }
  if (status === 'interested') {
    const p = joinRow?.progress;
    const more = p ? p.needed - p.joined : 0;
    const line = (
      <Label accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
        {!p
          ? "You're in."
          : more > 0
            ? `You're in. Muse needs ${more} more.`
            : "You're in. Muse is forming your group."}
      </Label>
    );
    return (
      <View style={{ gap: 8 }}>
        {tapped ? <Pop key={status}>{line}</Pop> : line}
        {p && <Progress {...p} />}
        <Button
          title="Can't make it"
          secondary
          onPress={() =>
            Alert.alert("Can't make it?", 'Muse will free your spot.', [
              { text: 'Keep me in', style: 'cancel' },
              {
                text: "Can't make it",
                style: 'destructive',
                onPress: () => void withdraw(plan.planId),
              },
            ])
          }
        />
      </View>
    );
  }
  if (status === 'not_filled')
    return (
      <View style={{ gap: 8 }}>
        <Muted style={{ textAlign: 'center' }}>This one didn&apos;t fill</Muted>
        <Button title="See other meetups" secondary onPress={() => go('/common-ground')} />
      </View>
    );
  if (plan.status !== 'open')
    return <Muted style={{ textAlign: 'center' }}>{`This meetup is ${plan.status}`}</Muted>;

  const current = size ?? clamp(plan.size, bounds);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Button
          title="I'm in"
          style={{ flex: 1 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setTapped(true);
            // ponytail: Join.calendar hold is applied by A2's calendar reconciler, not here.
            void join(plan.planId, {
              ...(size ? { size } : {}),
              ...(plusOneOn && plusOne ? { plusOne } : {}),
            });
          }}
        />
        {surprise && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try another"
            onPress={() => tryAnother(plan.planId)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Label style={{ color: c.blue, fontWeight: '600' }}>Try another</Label>
          </Pressable>
        )}
        {/* One footer row: the size link sits beside the primary action, not under it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Group size, ${current.min} to ${current.max} people`}
          onPress={() => setSizing(true)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Label style={{ color: c.blue, fontWeight: '600' }}>
            {current.min === current.max ? current.min : `${current.min}–${current.max}`} people
          </Label>
        </Pressable>
        {plusOneOn && (
          <>
            <Label>+1 a friend</Label>
            <Switch
              accessibilityLabel="+1 a friend"
              value={plusOne}
              onValueChange={setPlusOne}
              trackColor={{ false: c.secondary, true: c.blue }}
              ios_backgroundColor={c.divider} // iOS ignores trackColor.false
              thumbColor="#fff"
              {...{ activeThumbColor: '#fff' }} // RN-web ignores thumbColor when on (default teal)
            />
          </>
        )}
      </View>
      <Sheet visible={sizing} title="Group size" onClose={() => setSizing(false)}>
        <View style={{ padding: 16, gap: 12 }}>
          <Muted>How many people, including you?</Muted>
          <GroupSizePicker value={current} min={bounds.min} max={bounds.max} onChange={setSize} />
          <Button title="Done" onPress={() => setSizing(false)} />
        </View>
      </Sheet>
    </View>
  );
}

export default function PlanScreen() {
  const c = useColors();
  const { planId = '', surprise: picked } = useLocalSearchParams<{
    planId: string;
    surprise?: string;
  }>();
  const surprise = picked === '1'; // opened by Surprise me
  const plan = useCg((s) => s.plans[planId]);
  const missing = useCg((s) => !!s.missingPlans[planId]);
  const connectors = useCg((s) => s.connectors);
  const optedIn = useCg((s) => !!s.me?.optedIn);
  const notOptedIn = useCg((s) => s.ready && !!s.me && !s.me.optedIn);
  const every = useCg((s) => s.config?.limits.feedRefreshS);
  useEffect(() => void (optedIn && load.plan(planId)), [optedIn, planId]);
  usePoll(() => void (optedIn && load.plan(planId)), every);

  if (notOptedIn)
    return (
      <Page>
        <Banners />
        <SetupPrompt />
      </Page>
    );
  if (!plan)
    return (
      <Page>
        <Banners />
        {missing ? (
          <NotFound title="This meetup isn't available" />
        ) : (
          <ActivityIndicator color={c.blue} style={{ marginTop: 40 }} />
        )}
      </Page>
    );
  const labels = Object.fromEntries(connectors.map((x) => [x.provider, x.label]));
  const meta = [duration(plan.durationMin), plan.cost.label].join(' · ');
  return (
    <View style={{ flex: 1, backgroundColor: c.card }}>
      <Banners />
      <Page>
        <View>
          <PlanPhoto plan={plan} height={200} />
          {plan.origin !== 'invite' && <SharePlanButton plan={plan} />}
        </View>
        <View style={{ paddingVertical: 16, gap: 16 }}>
          <View style={{ gap: 4, paddingHorizontal: 16 }}>
            {surprise && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="sparkles" size={16} color={c.blue} />
                <Label style={{ color: c.blue, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>
                  Muse picked this for you
                </Label>
              </View>
            )}
            {/* Same anatomy as the Meetup header: date line, title, venue, address link. */}
            <Label style={{ color: c.badge, fontWeight: '700', fontSize: 13, lineHeight: 18 }}>
              {when(plan.startsAt).toUpperCase()}
            </Label>
            <Label
              accessibilityRole="header"
              style={{ fontSize: 25, lineHeight: 31, fontWeight: '800' }}
            >
              {plan.title}
            </Label>
            <Muted>{[plan.venue.name, plan.venue.neighborhood].filter(Boolean).join(' · ')}</Muted>
            {!!plan.venue.address &&
              (plan.directions?.apple ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Directions"
                  accessibilityHint={plan.venue.address}
                  onPress={() => void Linking.openURL(plan.directions.apple).catch(() => {})}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="navigate-outline" size={16} color={c.blue} />
                  <Label style={{ color: c.blue, fontWeight: '600', flexShrink: 1 }}>
                    {plan.venue.address}
                  </Label>
                </Pressable>
              ) : (
                <Muted>{plan.venue.address}</Muted>
              ))}
            <Label>{meta}</Label>
            {!!plan.description && <Muted>{plan.description}</Muted>}
          </View>
          {/* Web has no live map: the tile only repeated the venue and pushed the reasons down. */}
          {Platform.OS !== 'web' && (
            <VenueMap
              venue={plan.venue}
              style={{ height: 140, borderRadius: 8, marginHorizontal: 16 }}
            />
          )}
          <View style={{ gap: 2, paddingHorizontal: 16 }}>
            {plan.travel && !plan.checks.some((k) => k.label === plan.travel?.label) && (
              <Label>{plan.travel.label}</Label>
            )}
            {plan.checks.map((k) => (
              <CheckRow key={k.kind + k.label} check={k} />
            ))}
            <Muted>{plan.reason}</Muted>
          </View>
          {plan.because.length > 0 && (
            <Block title="Because">
              {plan.because.map((b) => (
                <Muted key={b.label}>
                  {b.label} · {sourceName(b.source, labels)}
                </Muted>
              ))}
            </Block>
          )}
          <Block title="Who's in">
            <Label>{whosIn(plan.crowd)}</Label>
          </Block>
          {plan.museWillHandle.length > 0 && (
            <Block title="Muse will handle">
              {plan.museWillHandle.map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                  <Icon name="checkmark-circle" size={16} color={c.secondary} />
                  <Label style={{ flex: 1 }}>{t}</Label>
                </View>
              ))}
            </Block>
          )}
          {plan.safety.length > 0 && (
            <Block title="Safety">
              {plan.safety.map((t) => (
                <Muted key={t}>{t}</Muted>
              ))}
            </Block>
          )}
          {plan.alternatives.length > 0 && (
            <Block title="Other times">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {plan.alternatives.map((a) => (
                  <Pill
                    key={a.planId}
                    label={dayTime(a.startsAt)}
                    accessibilityLabel={`${a.title}, ${dayTime(a.startsAt)}`}
                    onPress={() => go(`/common-ground/plan/${a.planId}`)}
                  />
                ))}
              </View>
            </Block>
          )}
        </View>
      </Page>
      <View
        style={{
          padding: 16,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.divider,
          backgroundColor: c.card,
        }}
      >
        <BottomBar plan={plan} surprise={surprise} />
      </View>
    </View>
  );
}
