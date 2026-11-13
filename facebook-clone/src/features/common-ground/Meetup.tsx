// Meetup (PRD-1 §8.3): header, Muse's steps, approvals, who's coming, details, day of, feedback.
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  Divider,
  Icon,
  Input,
  Label,
  Muted,
  Page,
  go,
  useColors,
} from '../../ui/native';
import ApprovalSheet, { money } from './ApprovalSheet';
import { SameTimeNextWeek } from './Rewards';
import FeedbackExtras, { type Extras } from './FeedbackExtras';
import ShareMeetup from './ShareMeetup';
import VerifyButton from './VerifyButton';
import StepTimeline from './StepTimeline';
import VenueMap from './VenueMap';
import { api } from './api';
import { act, currentLocation, leaveMeetup, load, setState, getState, useCg } from './store';
import { TZ, type Attendee, type Feedback, type Meetup } from './types';
import {
  Banners,
  clock,
  InterestChips,
  NotFound,
  PersonAvatar,
  personName,
  Section,
  usePoll,
  when,
} from './ui';

// Day in the plan's timezone (CONTRACTS Decisions), not the phone's.
const day = (d: Date | string, opts: Intl.DateTimeFormatOptions = {}) =>
  new Date(d).toLocaleDateString('en-US', { ...opts, timeZone: TZ });
// First names everywhere ("You and Daniel are verified."); full names only in Who's coming.
const firstName = (a: Attendee) => personName(a.person).split(' ')[0]!;
const listName = (a: Attendee) =>
  a.person.profileVisibility === 'private' ? firstName(a) : personName(a.person);
const PAYMENT: Record<string, string> = {
  not_needed: 'Nothing to pay',
  pending_approval: 'Waiting for your OK',
  paid: 'Paid',
  pay_at_venue: 'Pay at the venue',
  declined: 'You chose not to pay ahead',
};
const REASON: Record<string, string> = {
  outside_geofence: "You don't seem to be at the venue yet.",
  outside_window: "Check-in isn't open yet.",
  not_attendee: "You're not on this plan.",
};
const put = (m: Meetup) => setState({ meetups: { ...getState().meetups, [m.meetupId]: m } });
// iOS calshow takes seconds since 2001-01-01.
const calshow = (iso: string) => `calshow:${Math.round(Date.parse(iso) / 1000 - 978307200)}`;

function Row({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <Icon name={icon} size={20} color={c.secondary} />
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
    </View>
  );
}
function Link({ title, onPress }: { title: string; onPress(): void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Label style={{ color: c.blue, fontWeight: '600' }}>{title}</Label>
    </Pressable>
  );
}

function openDirections(m: Meetup) {
  const d = m.travel?.directions;
  if (!d) return;
  // C4: open only the server's Directions URL, only on tap.
  Alert.alert('Directions', m.venue.name, [
    { text: 'Apple Maps', onPress: () => void Linking.openURL(d.apple) },
    { text: 'Google Maps', onPress: () => void Linking.openURL(d.google) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

function Feedback({ m }: { m: Meetup }) {
  const others = m.attendees.filter((a) => !a.isMe);
  const [answers, setAnswers] = useState<
    Record<string, { showedUp?: boolean; meetAgain?: boolean }>
  >({});
  const [reports, setReports] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [extras, setExtras] = useState<Extras>({});
  const [sending, setSending] = useState(false);
  const complete = others.every(
    (a) =>
      answers[a.person.userId]?.showedUp != null && answers[a.person.userId]?.meetAgain != null,
  );
  const set = (id: string, key: 'showedUp' | 'meetAgain', v: boolean) =>
    setAnswers((x) => ({ ...x, [id]: { ...x[id], [key]: v } }));
  const send = async () => {
    setSending(true);
    const body: Feedback = {
      answers: others.map((a) => ({
        userId: a.person.userId,
        showedUp: !!answers[a.person.userId]?.showedUp,
        meetAgain: !!answers[a.person.userId]?.meetAgain,
      })),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(reports.length ? { reportUserIds: reports } : {}),
      ...extras,
    };
    const ok = await act(() => api.sendFeedback(m.meetupId, body).then(() => true));
    setSending(false);
    if (ok) put({ ...m, feedbackDue: false });
  };
  return (
    <Section title="How did it go?">
      {others.map((a) => {
        const name = firstName(a);
        const v = answers[a.person.userId] ?? {};
        return (
          <View key={a.person.userId} style={{ gap: 6 }}>
            <Label style={{ fontWeight: '600' }}>{name}</Label>
            {(
              [
                ['showedUp', `Did ${name} show up?`],
                ['meetAgain', `Would you meet ${name} again?`],
              ] as const
            ).map(([key, q]) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Muted style={{ flex: 1 }}>{q}</Muted>
                {([true, false] as const).map((yes) => (
                  <Button
                    key={String(yes)}
                    title={yes ? 'Yes' : 'No'}
                    accessibilityLabel={`${q} ${yes ? 'Yes' : 'No'}`}
                    secondary={v[key] !== yes}
                    onPress={() => set(a.person.userId, key, yes)}
                    style={{ minHeight: 44 }}
                  />
                ))}
              </View>
            ))}
          </View>
        );
      })}
      <Input
        accessibilityLabel="Anything we should know?"
        placeholder="Anything we should know?"
        value={note}
        onChangeText={setNote}
        multiline
      />
      {note.length > 0 &&
        others.map((a) => {
          const on = reports.includes(a.person.userId);
          return (
            <Button
              key={a.person.userId}
              title={on ? `Reporting ${firstName(a)}` : `Report ${firstName(a)}`}
              secondary={!on}
              icon="flag-outline"
              onPress={() =>
                setReports((r) =>
                  on ? r.filter((x) => x !== a.person.userId) : [...r, a.person.userId],
                )
              }
            />
          );
        })}
      <FeedbackExtras value={extras} onChange={setExtras} />
      <Button title="Send feedback" disabled={!complete || sending} onPress={() => void send()} />
    </Section>
  );
}

export default function MeetupScreen() {
  const c = useColors();
  const { meetupId = '' } = useLocalSearchParams<{ meetupId: string }>();
  const m = useCg((s) => s.meetups[meetupId]);
  const config = useCg((s) => s.config);
  const ready = useCg((s) => s.ready);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [checkin, setCheckin] = useState<string | null>(null);
  // Steps that arrive after confirmation (a reschedule) re-open the collapsed timeline.
  const seenSteps = useRef<number | null>(null);
  const status = m?.status;
  const stepCount = m?.museSteps.length ?? 0;
  useEffect(() => {
    if (status !== 'confirmed') return void (seenSteps.current = null);
    if (seenSteps.current != null && stepCount > seenSteps.current) setStepsOpen(true);
    seenSteps.current = stepCount;
  }, [status, stepCount]);
  // Poll only while Muse is still setting up; one load on focus otherwise.
  usePoll(() => void load.meetup(meetupId), m && m.status !== 'setting_up' ? 0 : undefined);

  if (!m)
    return (
      <Page>
        <Banners />
        {ready && <NotFound title="This plan isn't available" />}
      </Page>
    );

  const now = Date.now();
  const start = Date.parse(m.startsAt);
  const end = Date.parse(m.endsAt);
  const me = m.attendees.find((a) => a.isMe);
  const going = m.attendees.filter((a) => a.rsvp === 'going');
  const left = me?.rsvp === 'left';
  const live = !left && m.status !== 'cancelled';
  const dayOf =
    live && now >= start - (config?.limits.meetupStatusBeforeMin ?? 60) * 60_000 && now <= end;
  const w = m.checkinWindow;
  const windowOpen = !!w && now >= Date.parse(w.opensAt) && now <= Date.parse(w.closesAt);
  const canCheckIn =
    !!config?.features.checkin &&
    live &&
    !me?.checkedIn &&
    (windowOpen || (!!config.demo.relaxCheckin && m.status === 'confirmed'));
  // A step waiting on me keeps the timeline open, or its linked approval would show nowhere.
  const showSteps =
    m.status !== 'confirmed' || stepsOpen || m.museSteps.some((s) => s.status === 'needs_you');
  const linked = new Set(m.museSteps.map((s) => s.approvalId).filter(Boolean));
  const loose = m.approvals.filter((a) => a.status === 'pending' && !linked.has(a.approvalId));
  const web = Platform.OS === 'web'; // no calendar, maps or directions on web (D5)

  const setStatus = async (status: 'on_my_way' | 'arrived') => {
    const next = await act(() => api.setMeetupStatus(m.meetupId, status));
    if (next) put(next);
  };
  const doCheckIn = async () => {
    setCheckin(null);
    const loc = await currentLocation(); // C2: the only location read
    if (!loc) return setCheckin('Location is off. Turn it on in Settings to check in.');
    const r = await act(() => api.checkIn(m.meetupId, loc));
    if (!r) return;
    setCheckin(
      r.accepted ? "You're checked in." : (REASON[r.reason ?? ''] ?? "Couldn't check you in."),
    );
    if (r.accepted) void load.meetup(m.meetupId);
  };
  const askMuse = () => {
    setState({ drafts: { ...getState().drafts, [m.threadId]: 'Muse, ' } });
    go(`/common-ground/chat/${m.threadId}`);
  };
  const cantMakeIt = () =>
    Alert.alert("Can't make it?", 'Muse will let the group know and free your spot.', [
      { text: 'Stay in', style: 'cancel' },
      {
        text: "I can't make it",
        style: 'destructive',
        onPress: () => void leaveMeetup(m.meetupId),
      },
    ]);

  return (
    <Page>
      <Banners />
      <Card>
        <VenueMap venue={m.venue} />
        <View style={{ padding: 16, gap: 6 }}>
          <Label style={{ color: c.badge, fontWeight: '700', fontSize: 13 }}>
            {when(m.startsAt).toUpperCase()}
          </Label>
          <Label
            accessibilityRole="header"
            style={{ fontSize: 24, lineHeight: 30, fontWeight: '800' }}
          >
            {m.title}
          </Label>
          <Muted>{[m.venue.name, m.venue.neighborhood].filter(Boolean).join(' · ')}</Muted>
          {!!m.eventLabel && <Muted>{m.eventLabel}</Muted>}
          {m.status === 'cancelled' && (
            <Label style={{ fontWeight: '700' }}>This plan was cancelled</Label>
          )}
          {left && <Label style={{ fontWeight: '700' }}>You left this plan</Label>}
          <View
            accessible
            accessibilityLabel={`${going.length} going`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
          >
            {going.map((a) => (
              <PersonAvatar key={a.person.userId} person={a.person} size={32} />
            ))}
            {/* eventLabel already carries the count ("Private event · 3 going") */}
            {!m.eventLabel && <Muted style={{ marginLeft: 6 }}>{going.length} going</Muted>}
          </View>
        </View>
      </Card>

      <Section title={m.status === 'confirmed' ? 'Muse set this up' : 'Muse is setting this up'}>
        {m.status === 'confirmed' && (
          <Link
            title={stepsOpen ? 'Hide steps' : `See all ${m.museSteps.length} steps`}
            onPress={() => setStepsOpen((x) => !x)}
          />
        )}
        {showSteps && <StepTimeline meetupId={m.meetupId} steps={m.museSteps} />}
        {loose.map((a) => (
          <ApprovalSheet key={a.approvalId} approval={a} />
        ))}
      </Section>

      <Section title="Who's coming">
        {going.map((a) => {
          const canOpen = !a.isMe && a.person.profileVisibility === 'public';
          const status =
            a.status === 'arrived' ? 'Arrived' : a.status === 'on_my_way' ? 'On my way' : null;
          const name = a.isMe ? 'You' : listName(a);
          return (
            <Pressable
              key={a.person.userId}
              disabled={!canOpen}
              accessibilityRole={canOpen ? 'button' : undefined}
              accessibilityLabel={[name, status].filter(Boolean).join(', ')}
              onPress={() => go(`/common-ground/person/${a.person.userId}`)}
              style={{ flexDirection: 'row', gap: 12, minHeight: 44 }}
            >
              <PersonAvatar person={a.person} />
              <View style={{ flex: 1, gap: 6 }}>
                <Label style={{ fontWeight: '600' }}>
                  {name}
                  {status ? <Muted> · {status}</Muted> : null}
                </Label>
                {a.sharedInterests.length > 0 && <InterestChips interests={a.sharedInterests} />}
              </View>
            </Pressable>
          );
        })}
      </Section>

      <Section title="Details">
        <Row icon="ticket-outline">
          <Label>{m.booking.label}</Label>
          {!!m.booking.confirmationCode && <Muted>Confirmation {m.booking.confirmationCode}</Muted>}
          <Muted>{m.booking.provider}</Muted>
        </Row>
        <Row icon="card-outline">
          <Label>
            {m.cost.perPersonCents ? money(m.cost.perPersonCents, m.cost.currency) : m.cost.label}
          </Label>
          <Muted>{PAYMENT[m.cost.myPayment] ?? m.cost.myPayment}</Muted>
        </Row>
        {m.calendar && m.calendar.desired !== 'none' && (
          <Row icon="calendar-outline">
            {/* NEEDS(A2): calendar applied state; until then "on your calendar" follows the directive. */}
            <Label>
              {m.calendar.desired === 'event' ? 'Added to your calendar' : 'Held on your calendar'}
            </Label>
            {!web && Platform.OS === 'ios' && (
              <Link
                title="Open Calendar"
                onPress={() => void Linking.openURL(calshow(m.startsAt))}
              />
            )}
          </Row>
        )}
        {m.travel && (
          <Row icon="navigate-outline">
            <Label>{m.travel.label}</Label>
            <Muted>Leave by {clock(m.travel.leaveBy)}</Muted>
          </Row>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!web && m.travel && (
            <Button
              title="Directions"
              icon="navigate"
              style={{ flex: 1 }}
              onPress={() => openDirections(m)}
            />
          )}
          <Button
            title="Share"
            icon="share-outline"
            secondary
            style={{ flex: 1 }}
            onPress={() =>
              void Share.share({
                message: `${m.title} · ${when(m.startsAt)} · ${m.venue.name}`,
              }).catch(() => {})
            }
          />
        </View>
      </Section>

      {(dayOf || canCheckIn) && (
        <Section
          title={
            day(m.startsAt) === day(new Date()) ? 'Today' : day(m.startsAt, { weekday: 'long' })
          }
        >
          {dayOf && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="On my way"
                secondary={me?.status !== 'on_my_way'}
                style={{ flex: 1 }}
                onPress={() => void setStatus('on_my_way')}
              />
              <Button
                title="Arrived"
                secondary={me?.status !== 'arrived'}
                style={{ flex: 1 }}
                onPress={() => void setStatus('arrived')}
              />
            </View>
          )}
          {me?.checkedIn ? (
            <Muted>You're checked in.</Muted>
          ) : (
            canCheckIn && (
              <Button title="Check in" icon="location" onPress={() => void doCheckIn()} />
            )
          )}
          {!!checkin && <Muted accessibilityLiveRegion="polite">{checkin}</Muted>}
        </Section>
      )}

      <VerifyButton m={m} />
      {m.feedbackDue && <Feedback m={m} />}
      <ShareMeetup m={m} />
      <SameTimeNextWeek m={m} />

      <Card style={{ padding: 16, gap: 8 }}>
        <Button
          title="Open group chat"
          icon="chatbubbles-outline"
          secondary={canCheckIn} // one primary: Check in on the day, the chat otherwise
          onPress={() => go(`/common-ground/chat/${m.threadId}`)}
        />
        {!left && m.status !== 'cancelled' && m.status !== 'completed' && (
          <>
            <Button
              title="Ask Muse to change it"
              icon="sparkles-outline"
              secondary
              onPress={askMuse}
            />
            <Divider />
            <Button title="Can't make it" secondary onPress={cantMakeIt} />
          </>
        )}
      </Card>
    </Page>
  );
}
