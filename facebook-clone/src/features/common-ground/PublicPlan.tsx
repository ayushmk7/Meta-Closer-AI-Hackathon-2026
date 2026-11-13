// Public plan page (/common-ground/shared/<planId>): what anyone with a share link sees.
// Same logged-out frame as Welcome (full-screen Modal over the shell). Anonymous calls only
// (the plan, plus Welcome's gallery); the plan is kept in component state only (C1). Counts only, no people (P1/P2).
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Empty, Label, Muted, useColors } from '../../ui/native';
import { api } from './api';
import { PlanPhoto } from './PlanCard';
import { planMessage, shareOut } from './share';
import { load, useCg } from './store';
import { clock, when } from './time';
import type { PlanCard, PublicPlan } from './types';
import { Skeleton, enter } from './ui';
import { Gallery, TopBar } from './Welcome';

const welcome = () => router.replace('/common-ground/welcome');

// "Sun, Nov 15 · 7–8:30 PM"; the start keeps its AM/PM when the two differ.
export const timeRange = (startsAt: string, endsAt: string): string => {
  const s = when(startsAt);
  const e = clock(endsAt);
  return s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)}–${e}` : `${s}–${e}`;
};
const people = (n: number, verb: [string, string]) =>
  `${n} ${n === 1 ? `person ${verb[0]}` : `people ${verb[1]}`}`;

function Body({ plan }: { plan: PublicPlan }) {
  const { size } = plan;
  const count = [
    people(plan.interestedCount, ['is in', 'are in']),
    `${plan.spotsLeft} spot${plan.spotsLeft === 1 ? '' : 's'} left`,
  ].join(' · ');
  return (
    <Animated.View entering={enter(0)}>
      <Card style={{ overflow: 'hidden' }}>
        <View accessible accessibilityLabel={`Photo of ${plan.venue.name}`}>
          {/* ponytail: PlanPhoto reads only venue.photoUrl + activityType. */}
          <PlanPhoto plan={plan as unknown as PlanCard} height={220} />
        </View>
        <View style={{ padding: 16, gap: 4 }}>
          <Label
            accessibilityRole="header"
            style={{ fontSize: 25, lineHeight: 31, fontWeight: '800' }}
          >
            {plan.title}
          </Label>
          <Label>{timeRange(plan.startsAt, plan.endsAt)}</Label>
          <Muted>{`${plan.venue.name} · ${plan.venue.neighborhood}`}</Muted>
          <Muted>
            {`${plan.cost.label} · ${size.min === size.max ? size.max : `${size.min}–${size.max}`} people`}
          </Muted>
          {plan.interestedCount > 0 && (
            <Label accessible style={{ fontWeight: '600' }}>
              {count}
            </Label>
          )}
          {!!plan.description && <Label style={{ paddingTop: 6 }}>{plan.description}</Label>}
          <Muted style={{ paddingTop: 6 }}>Muse finds the group and books it.</Muted>
          <Muted>You only see who&apos;s in after the group forms.</Muted>
        </View>
      </Card>
    </Animated.View>
  );
}

function Loading() {
  return (
    <Card style={{ overflow: 'hidden' }}>
      <Skeleton width="100%" height={220} radius={0} />
      <View style={{ padding: 16, gap: 8 }}>
        <Skeleton width="80%" height={22} />
        <Skeleton width="50%" height={16} />
      </View>
    </Card>
  );
}

export default function PublicPlanScreen() {
  const c = useColors();
  const { planId = '' } = useLocalSearchParams<{ planId: string }>();
  // undefined loading, null not available (404, any error, or sharing off).
  const [plan, setPlan] = useState<PublicPlan | null | undefined>(undefined);
  // Config comes from the signed-in store if it ran; this page makes no identified call.
  const off = useCg((s) => !!s.config && !s.config.features.sharing);
  const sharing = useCg((s) => !!s.config?.features.sharing);
  useEffect(() => {
    let live = true;
    void load.shares({}, { anonymous: true });
    api.getPublicPlan(planId).then(
      (p) => live && setPlan(p),
      () => live && setPlan(null),
    );
    return () => void (live = false);
  }, [planId]);
  const shown = off ? null : plan;
  const open = shown?.status === 'open';
  return (
    <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={welcome}>
      {/* A Modal is its own native root: without a provider here the insets are 0 on iOS. */}
      <SafeAreaProvider>
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
          <TopBar />
          {shown === null ? (
            <Card style={{ marginVertical: 16 }}>
              <Empty
                title="This meetup isn't available"
                message="See what people are doing instead."
              />
              <View style={{ padding: 16 }}>
                <Button title="See meetups" onPress={welcome} />
              </View>
            </Card>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 170 }}
              >
                {shown ? <Body plan={shown} /> : <Loading />}
                <Gallery max={3} />
              </ScrollView>
              {shown && (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: 16,
                    paddingBottom: 28,
                    gap: 8,
                    backgroundColor: c.card,
                    borderTopWidth: 1,
                    borderTopColor: c.divider,
                  }}
                >
                  {!open && (
                    <Muted style={{ textAlign: 'center' }}>
                      {shown.status === 'full' ? 'This meetup is full.' : 'This meetup has closed.'}
                    </Muted>
                  )}
                  {open ? (
                    <Button
                      title="Log in to join"
                      onPress={() => router.replace(`/common-ground/plan/${shown.planId}`)}
                    />
                  ) : (
                    <Button title="See more meetups" onPress={welcome} />
                  )}
                  {sharing && (
                    <Button
                      title="Share"
                      icon="share-outline"
                      secondary
                      onPress={() => void shareOut(planMessage(shown))}
                    />
                  )}
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
