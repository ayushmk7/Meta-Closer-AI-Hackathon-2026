// Plans home, the tab root (PRD-1 §8.1). Not set up -> the setup flow.
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  IconButton,
  Label,
  Muted,
  Sheet,
  Title,
  go,
  useColors,
} from '../../ui/native';
import MuseBar from './MuseBar';
import PlanCard, { PlanCarousel, dayTime } from './PlanCard';
import SetupScreen from './Setup';
import SurpriseButton from './SurpriseButton';
import { dismissNudge, nudgesFor, pendingApprovals, refreshAll, useCg } from './store';
import type { Connection, Join, Meetup, Nudge, PlanCard as Plan } from './types';
import { Banners, InterestChips, PersonAvatar } from './ui';

// Selectors must return stable references (useSyncExternalStore): never `?? []` inside useCg.
const NONE: Plan[] = [];
const firstName = (c: Connection) => c.person.displayName?.split(' ')[0] ?? c.person.initials;
const openPlan = (p: { planId: string }) => go(`/common-ground/plan/${p.planId}`);

export function NudgeCard({ nudge }: { nudge: Nudge }) {
  const because = nudge.because[0];
  return (
    <Card style={{ marginHorizontal: 16, padding: 16, gap: 8 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        {nudge.title}
      </Label>
      <Label>{nudge.text}</Label>
      {because && <Muted>Because: {because.label}</Muted>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Open plan" onPress={() => openPlan(nudge)} style={{ flex: 1 }} />
        <Button
          title="Not now"
          secondary
          onPress={() => void dismissNudge(nudge.nudgeId)}
          style={{ flex: 1 }}
        />
      </View>
      {because?.signalId && (
        <Button
          title="Not interested in this place"
          secondary
          onPress={() => void dismissNudge(nudge.nudgeId, 'signal')}
        />
      )}
    </Card>
  );
}

function Row({
  title,
  lines,
  badge,
  onPress,
  children,
}: {
  title: string;
  lines: string[];
  badge?: string;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, badge, ...lines].filter(Boolean).join(', ')}
      onPress={onPress}
      disabled={!onPress}
      style={{ padding: 12, gap: 4, minHeight: 44, borderRadius: 8, backgroundColor: c.input }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Label style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {title}
        </Label>
        {badge && (
          <View style={{ backgroundColor: c.badge, borderRadius: 10, paddingHorizontal: 8 }}>
            <Label style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{badge}</Label>
          </View>
        )}
      </View>
      {lines.map((l) => (
        <Muted key={l}>{l}</Muted>
      ))}
      {children}
    </Pressable>
  );
}

function Progress({ joined, needed }: { joined: number; needed: number }) {
  const c = useColors();
  const pct = needed ? Math.min(1, joined / needed) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: needed, now: joined }}
      style={{ height: 6, borderRadius: 3, backgroundColor: c.divider, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: c.blue }} />
    </View>
  );
}

function YourPlanRow({ join, meetup }: { join?: Join; meetup?: Meetup }) {
  const needsYou = useCg((s) =>
    pendingApprovals(s).some((a) => !!meetup && a.meetupId === meetup.meetupId),
  );
  const plans = useCg((s) => s.plans);
  const feed = useCg((s) => s.feed?.plans) ?? NONE;
  // A fresh Join from joinPlan has no `plan`; fall back to the cached detail or feed card.
  const title =
    meetup?.title ??
    join?.plan?.title ??
    (join && (plans[join.planId] ?? feed.find((p) => p.planId === join.planId))?.title) ??
    'Your plan';
  const openMeetup = meetup && (() => go(`/common-ground/meetup/${meetup.meetupId}`));
  if (meetup?.status === 'completed' && meetup.feedbackDue)
    return <Row title={title} lines={['How was it?']} onPress={openMeetup} />;
  if (meetup?.status === 'confirmed')
    return (
      <Row
        title={title}
        lines={[`${dayTime(meetup.startsAt)} · ${meetup.venue.name}`]}
        onPress={openMeetup}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {meetup.attendees.slice(0, 5).map((a) => (
            <PersonAvatar key={a.person.userId} person={a.person} size={28} />
          ))}
          <View style={{ flex: 1 }} />
          <Button
            title="Open chat"
            secondary
            onPress={() => go(`/common-ground/chat/${meetup.threadId}`)}
          />
        </View>
      </Row>
    );
  if (meetup?.status === 'setting_up') {
    const step = meetup.museSteps.findLast((s) => s.status !== 'queued') ?? meetup.museSteps[0];
    return (
      <Row
        title={title}
        lines={['Muse is setting it up', ...(step ? [step.label] : [])]}
        badge={needsYou ? 'Needs you' : undefined}
        onPress={openMeetup}
      />
    );
  }
  if (!join || meetup) return null;
  if (join.status === 'not_filled') {
    // C5: nothing about why it didn't fill.
    const alts = join.alternatives
      .map((id): Plan | undefined => plans[id] ?? feed.find((p) => p.planId === id))
      .filter((p): p is Plan => !!p);
    return (
      <Row title={title} lines={["This one didn't fill"]}>
        {alts.map((p) => (
          <PlanCard key={p.planId} plan={p} width={260} onPress={() => openPlan(p)} />
        ))}
      </Row>
    );
  }
  if (join.status === 'interested')
    return (
      <Row
        title={title}
        lines={[`Muse is gathering people · ${join.progress.joined} of ${join.progress.needed}`]}
        onPress={() => openPlan(join)}
      >
        <Progress {...join.progress} />
      </Row>
    );
  return null;
}

function Section({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 44 }}
    >
      <Label accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', flex: 1 }}>
        {title}
      </Label>
      {aside}
    </View>
  );
}

export default function PlansScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ with?: string }>();
  const ready = useCg((s) => s.ready);
  const setUp = useCg((s) => !!s.me?.optedIn && !!s.me.setupComplete);
  const feed = useCg((s) => s.feed?.plans) ?? NONE;
  const replying = useCg((s) => !!s.muse.reply);
  const nudge = useCg((s) => nudgesFor(s, 'plans')[0]);
  const joins = useCg((s) => s.joins);
  const meetups = useCg((s) => s.meetups);
  const connections = useCg((s) => s.connections);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<Connection | null>(null);
  const [again, setAgain] = useState<Connection | null>(null);
  const invite = again ?? connections.find((x) => x.person.userId === params.with) ?? null;
  // Invite mode ends on a created plan or "Ask Muse instead"; drop the sticky ?with= too.
  const endInvite = () => {
    setAgain(null);
    if (params.with) router.setParams({ with: undefined });
  };

  if (!ready)
    return (
      <View style={{ flex: 1 }}>
        <Banners />
        <ActivityIndicator style={{ marginTop: 40 }} color={c.blue} />
      </View>
    );
  if (!setUp) return <SetupScreen />;

  // Newest first: joins by createdAt, then meetups no join points at.
  const sorted = [...joins].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const linked = new Set(sorted.map((j) => j.meetupId).filter(Boolean));
  const orphans = Object.values(meetups)
    .filter((m) => !linked.has(m.meetupId) && m.status !== 'cancelled')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <View style={{ flex: 1 }}>
      <Banners />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshAll();
              setRefreshing(false);
            }}
          />
        }
      >
        <Title
          aside={
            <IconButton
              name="settings-outline"
              label="Common Ground settings"
              onPress={() => go('/common-ground/settings')}
            />
          }
        >
          Plans
        </Title>
        <MuseBar
          key={invite?.connectionId ?? 'ask'}
          prefill={invite ? `Plan something with ${firstName(invite)}…` : undefined}
          inviteUserIds={invite ? [invite.person.userId] : undefined}
          onEndInvite={endInvite}
        />
        {!invite && <SurpriseButton />}
        {nudge && <NudgeCard nudge={nudge} />}
        {!replying && feed.length > 0 && (
          <>
            <Section title="For you" />
            <PlanCarousel plans={feed} onOpen={openPlan} />
          </>
        )}
        {(sorted.length > 0 || orphans.length > 0) && (
          <>
            <Section title="Your plans" />
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {sorted.map((j) => (
                <YourPlanRow
                  key={j.joinId}
                  join={j}
                  meetup={j.meetupId ? meetups[j.meetupId] : undefined}
                />
              ))}
              {orphans.map((m) => (
                <YourPlanRow key={m.meetupId} meetup={m} />
              ))}
            </View>
          </>
        )}
        {connections.length > 0 && (
          <>
            <Section title="People you've met" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
            >
              {connections.map((x) => (
                <Pressable
                  key={x.connectionId}
                  accessibilityRole="button"
                  accessibilityLabel={firstName(x)}
                  onPress={() =>
                    x.canViewProfile && x.person.profileVisibility === 'public'
                      ? go(`/common-ground/person/${x.person.userId}`)
                      : setSheet(x)
                  }
                  style={{ alignItems: 'center', gap: 4, minWidth: 56 }}
                >
                  <PersonAvatar person={x.person} size={56} />
                  <Label style={{ fontSize: 13 }}>{firstName(x)}</Label>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
      <Sheet visible={!!sheet} title={sheet ? firstName(sheet) : ''} onClose={() => setSheet(null)}>
        {sheet && (
          <View style={{ padding: 16, gap: 12 }}>
            <Muted>You both like</Muted>
            <InterestChips interests={sheet.sharedInterests} />
            {sheet.canPlanAgain && (
              <Button
                title="Plan something again"
                onPress={() => {
                  setAgain(sheet);
                  setSheet(null);
                }}
              />
            )}
          </View>
        )}
      </Sheet>
    </View>
  );
}
