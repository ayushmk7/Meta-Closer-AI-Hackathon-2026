// Plan pop-up (PRD-1 §8.2). Who's in is counts only (C5).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Switch, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Icon, Label, Muted, Page, Sheet, go, useColors } from '../../ui/native';
import { MuseAvatar } from './MuseBar';
import { PlanPhoto, checkText, dayTime, duration, whosIn } from './PlanCard';
import { join, load, useCg, withdraw } from './store';
import type { GroupSize, PlanDetail } from './types';
import { Banners, GroupSizePicker, NotFound, usePoll } from './ui';
import VenueMap from './VenueMap';

// "google_maps" -> "Google Maps" when no connector label is known.
export const sourceName = (source: string, labels: Record<string, string>) =>
  labels[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

// Not opted in (e.g. a cold deep link after a reset): offer setup instead of the API's 403.
export function SetupPrompt() {
  return (
    <Card style={{ margin: 16, padding: 16, gap: 8 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Plans with Muse
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 16 }}>
        {title}
      </Label>
      {children}
    </View>
  );
}

export function BottomBar({ plan }: { plan: PlanDetail }) {
  const c = useColors();
  const myJoin = plan.myJoin && plan.myJoin.status !== 'withdrawn' ? plan.myJoin : null;
  const joinRow = useCg((s) => s.joins.find((j) => j.planId === plan.planId));
  const limits = useCg((s) => s.config?.limits);
  const plusOneOn = useCg((s) => !!s.config?.features.plusOne);
  const cap = useCg((s) => s.me?.capabilities.maxGroupSize);
  const bounds = sizeBounds(limits, cap);
  const [size, setSize] = useState<GroupSize | null>(null);
  const [sizing, setSizing] = useState(false);
  const [plusOne, setPlusOne] = useState(false);

  if (myJoin?.status === 'matched') {
    const meetupId = joinRow?.meetupId;
    return (
      <Button
        title="Open plan"
        disabled={!meetupId}
        onPress={() => meetupId && go(`/common-ground/meetup/${meetupId}`)}
      />
    );
  }
  if (myJoin?.status === 'interested') {
    const p = joinRow?.progress;
    return (
      <View style={{ gap: 8 }}>
        <Label accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
          {`You're in · Muse is gathering people${p ? ` · ${p.joined} of ${p.needed}` : ''}`}
        </Label>
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
  if (myJoin?.status === 'not_filled')
    return <Muted style={{ textAlign: 'center' }}>This one didn&apos;t fill</Muted>;
  if (plan.status !== 'open')
    return <Muted style={{ textAlign: 'center' }}>{`This plan is ${plan.status}`}</Muted>;

  const current = size ?? clamp(plan.size, bounds);
  return (
    <View style={{ gap: 8 }}>
      <Button
        title="I'm in"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          // ponytail: Join.calendar hold is applied by A2's calendar reconciler, not here.
          void join(plan.planId, {
            ...(size ? { size } : {}),
            ...(plusOneOn && plusOne ? { plusOne } : {}),
          });
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Group size, ${current.min} to ${current.max} people`}
          onPress={() => setSizing(true)}
          style={{ minHeight: 44, justifyContent: 'center', flex: 1 }}
        >
          <Label style={{ color: c.blue, fontWeight: '600' }}>
            Group size · {current.min}–{current.max}
          </Label>
        </Pressable>
        {plusOneOn && (
          <>
            <Label>+1 a friend</Label>
            <Switch
              accessibilityLabel="+1 a friend"
              value={plusOne}
              onValueChange={setPlusOne}
              trackColor={{ false: c.divider, true: c.blue }}
              thumbColor="#fff"
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
  const { planId = '' } = useLocalSearchParams<{ planId: string }>();
  const plan = useCg((s) => s.plans[planId]);
  const ready = useCg((s) => s.ready);
  const error = useCg((s) => !!s.error);
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
        {ready && error ? (
          <NotFound title="This plan isn't available" />
        ) : (
          <ActivityIndicator color={c.blue} style={{ marginTop: 40 }} />
        )}
      </Page>
    );
  const labels = Object.fromEntries(connectors.map((x) => [x.provider, x.label]));
  const meta = [dayTime(plan.startsAt), duration(plan.durationMin), plan.cost.label].join(' · ');
  return (
    <View style={{ flex: 1, backgroundColor: c.card }}>
      <Banners />
      <Page>
        <PlanPhoto plan={plan} height={200} />
        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Label
              accessibilityRole="header"
              style={{ fontSize: 24, lineHeight: 30, fontWeight: '800' }}
            >
              {plan.title}
            </Label>
            <Label>{plan.venue.name}</Label>
            {!!plan.venue.address && <Muted>{plan.venue.address}</Muted>}
            <Label>{meta}</Label>
            {!!plan.description && <Muted>{plan.description}</Muted>}
          </View>
          <VenueMap venue={plan.venue} style={{ height: 140, borderRadius: 8 }} />
          <View style={{ gap: 2 }}>
            {plan.travel && !plan.checks.some((k) => k.label === plan.travel?.label) && (
              <Label>{plan.travel.label}</Label>
            )}
            {plan.checks.map((k) => (
              <Label key={k.kind + k.label} style={{ color: k.ok ? c.text : c.secondary }}>
                {checkText(k)}
              </Label>
            ))}
            <Muted>{plan.reason}</Muted>
          </View>
          {plan.because.length > 0 && (
            <Section title="Because">
              {plan.because.map((b) => (
                <Muted key={b.label}>
                  {b.label} · {sourceName(b.source, labels)}
                </Muted>
              ))}
            </Section>
          )}
          <Section title="Who's in">
            <Label>{whosIn(plan.crowd)}</Label>
          </Section>
          {plan.museWillHandle.length > 0 && (
            <Card style={{ padding: 12, gap: 8, backgroundColor: c.input }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MuseAvatar size={28} />
                <Label accessibilityRole="header" style={{ fontWeight: '700' }}>
                  Muse will handle
                </Label>
              </View>
              {plan.museWillHandle.map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                  <Icon name="checkmark" size={18} color={c.secondary} />
                  <Label style={{ flex: 1 }}>{t}</Label>
                </View>
              ))}
            </Card>
          )}
          {plan.safety.length > 0 && (
            <Section title="Safety">
              {plan.safety.map((t) => (
                <Muted key={t}>{t}</Muted>
              ))}
            </Section>
          )}
          {plan.alternatives.length > 0 && (
            <Section title="Other times">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {plan.alternatives.map((a) => (
                  <Button
                    key={a.planId}
                    title={dayTime(a.startsAt)}
                    accessibilityLabel={`${a.title}, ${dayTime(a.startsAt)}`}
                    secondary
                    onPress={() => go(`/common-ground/plan/${a.planId}`)}
                  />
                ))}
              </View>
            </Section>
          )}
          {!!plan.directions?.apple && (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(plan.directions.apple).catch(() => {})}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Label style={{ color: c.blue, fontWeight: '600' }}>Directions</Label>
            </Pressable>
          )}
        </View>
      </Page>
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: c.divider,
          backgroundColor: c.card,
        }}
      >
        <BottomBar plan={plan} />
      </View>
    </View>
  );
}
