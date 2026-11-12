// Meetup (PRD-1 §7.4). Visual reference: the Events branch of src/features/secondary/Screen.tsx.
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from './maps';
import { Button, Card, Empty, go, Input, Label, Muted, Page, useColors } from '../../ui/native';
import { api, getUser } from './api';
import { act, currentLocation, getState, load, setState, useCg } from './store';
import type { Attendee, Meetup, MeetupOption, PersonCard } from './types';
import { Banners, NotFound, PersonAvatar, personName, usePoll, when } from './ui';

const backToMap = () => router.replace('/common-ground');
const CHECKIN_REASONS: Record<string, string> = {
  outside_geofence: "You're not close enough yet.",
  outside_window: "Check-in isn't open yet.",
};

function YesNo({
  value,
  onVote,
  label,
}: {
  value?: boolean | null;
  onVote(yes: boolean): void;
  label: string;
}) {
  // ponytail: Button has no accessibilityState prop, so selection is carried in the label instead.
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([true, false] as const).map((yes) => (
        <Button
          key={String(yes)}
          title={yes ? 'Yes' : 'No'}
          secondary={value !== yes}
          accessibilityLabel={`${label}: ${yes ? 'Yes' : 'No'}${value === yes ? ', selected' : ''}`}
          onPress={() => onVote(yes)}
          style={{ flex: 1 }}
        />
      ))}
    </View>
  );
}

export function VotingCard({
  option,
  onVote,
}: {
  option: MeetupOption;
  onVote(vote: 'yes' | 'no'): void;
}) {
  const c = useColors();
  const venue = [option.venue?.name, option.venue?.neighborhood].filter(Boolean).join(' · ');
  return (
    <Card>
      <View style={{ padding: 16, gap: 7 }}>
        <Label style={{ fontSize: 17, fontWeight: '700' }}>{option.activity}</Label>
        <Label style={{ color: c.badge, fontSize: 13, fontWeight: '700' }}>
          {when(option.startsAt)}
        </Label>
        <Muted>{venue}</Muted>
        <Label>{option.reason}</Label>
        <YesNo
          label={option.activity}
          value={option.myVote ? option.myVote === 'yes' : null}
          onVote={(yes) => onVote(yes ? 'yes' : 'no')}
        />
        <Muted>
          {option.votes?.yes ?? 0} yes · {option.votes?.no ?? 0} no
        </Muted>
      </View>
    </Card>
  );
}

// C5/C6: never show another person's decline; unknown values render nothing.
const attendeeLine = (a: Attendee) =>
  a.checkedIn
    ? 'Checked in'
    : a.status === 'arrived'
      ? 'Arrived'
      : a.status === 'on_my_way'
        ? 'On my way'
        : a.rsvp === 'yes'
          ? 'Going'
          : a.rsvp === 'pending'
            ? 'Invited'
            : '';

export default function MeetupScreen() {
  const c = useColors();
  const { meetupId = '' } = useLocalSearchParams<{ meetupId: string }>();
  const meetup = useCg((s) => s.meetups[meetupId]);
  const threads = useCg((s) => s.threads);
  const me = useCg((s) => s.me);
  const config = useCg((s) => s.config);
  const [loaded, setLoaded] = useState(false);
  const [checkinNote, setCheckinNote] = useState('');
  const [answers, setAnswers] = useState<
    Record<string, { showedUp?: boolean; meetAgain?: boolean }>
  >({});
  const [note, setNote] = useState('');
  const [reportIds, setReportIds] = useState<string[]>([]);
  usePoll(() => void load.meetup(meetupId).then(() => setLoaded(true)));

  if (!meetup) return <Page>{loaded ? <NotFound title="Plan not found" /> : <Banners />}</Page>;

  const myId = getUser();
  const thread = threads.find((t) => t.threadId === meetup.threadId);
  const person = (userId: string): PersonCard =>
    userId === myId
      ? {
          userId,
          displayName: 'You',
          initials: me?.displayName?.[0] ?? 'Y',
          avatarUrl: me?.avatarUrl ?? null,
          profileVisibility: 'public',
        }
      : (thread?.participants.find((p) => p.userId === userId) ?? {
          userId,
          initials: '?',
          profileVisibility: 'private',
        });
  const others = meetup.attendees.filter((a) => a.userId !== myId);
  const save = (m?: Meetup) =>
    m && setState({ meetups: { ...getState().meetups, [m.meetupId]: m } });
  const now = Date.now();
  const start = Date.parse(meetup.startsAt ?? '');
  const end = Date.parse(meetup.endsAt ?? '');
  const beforeMs = (config?.limits.meetupStatusBeforeMin ?? 60) * 60_000;
  const statusOpen = now >= start - beforeMs && now <= end;
  const win = meetup.checkinWindow;
  const checkinOpen =
    !!config?.features.checkin &&
    !!win &&
    now >= Date.parse(win.opensAt) &&
    now <= Date.parse(win.closesAt);
  const refresh = () => Promise.all([load.meetup(meetupId), load.map()]);

  const checkIn = async () => {
    const location = await currentLocation();
    if (!location) return setCheckinNote("We couldn't find your location. Try again.");
    const res = await act(() => api.checkIn(meetupId, location));
    if (res && !res.accepted)
      setCheckinNote(CHECKIN_REASONS[res.reason ?? ''] ?? "Check-in didn't go through. Try again.");
    await refresh();
  };
  const report = () =>
    Alert.alert('Report someone', 'Who do you want to report?', [
      ...others.map((a) => ({
        text: personName(person(a.userId)),
        onPress: () => setReportIds((ids) => [...new Set([...ids, a.userId])]),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  const allAnswered = others.every(
    (a) => answers[a.userId]?.showedUp != null && answers[a.userId]?.meetAgain != null,
  );
  const sendFeedback = async () => {
    await act(() =>
      api.sendFeedback(meetupId, {
        answers: others.map((a) => ({
          userId: a.userId,
          showedUp: !!answers[a.userId]?.showedUp,
          meetAgain: !!answers[a.userId]?.meetAgain,
        })),
        note: note.trim() || undefined,
        reportUserIds: reportIds.length ? reportIds : undefined,
      }),
    );
    await Promise.all([refresh(), load.connections()]);
  };
  const answer = (userId: string, key: 'showedUp' | 'meetAgain', yes: boolean) =>
    setAnswers((a) => ({ ...a, [userId]: { ...a[userId], [key]: yes } }));

  return (
    <Page>
      <Banners />
      {meetup.status === 'proposing' && (
        <Card>
          <View style={{ padding: 16, gap: 7, alignItems: 'center' }}>
            <ActivityIndicator color={c.blue} />
            <Muted>Muse is finding options…</Muted>
          </View>
        </Card>
      )}
      {meetup.status === 'voting' && (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Label accessibilityRole="header" style={{ fontSize: 19, fontWeight: '700' }}>
              Muse found {meetup.options.length} options
            </Label>
            <Muted>Vote yes on any that work for you.</Muted>
          </View>
          {meetup.options.map((option) => (
            <VotingCard
              key={option.optionId}
              option={option}
              onVote={async (vote) =>
                save(
                  await act(() => api.voteMeetup(meetupId, [{ optionId: option.optionId, vote }])),
                )
              }
            />
          ))}
        </>
      )}
      {meetup.status === 'confirmed' && (
        <Card>
          {meetup.venue && (
            <MapView
              style={{ width: '100%', height: 200 }}
              scrollEnabled={false}
              pointerEvents="none"
              initialRegion={{
                latitude: meetup.venue.location.lat,
                longitude: meetup.venue.location.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: meetup.venue.location.lat,
                  longitude: meetup.venue.location.lng,
                }}
                title={meetup.venue.name}
              />
            </MapView>
          )}
          <View style={{ padding: 16, gap: 7 }}>
            {!!meetup.startsAt && (
              <Label style={{ color: c.badge, fontSize: 13, fontWeight: '700' }}>
                {when(meetup.startsAt)}
              </Label>
            )}
            <Label style={{ fontSize: 21, lineHeight: 27, fontWeight: '700' }}>
              {meetup.title ?? 'Your plan'}
            </Label>
            {!!meetup.venue && (
              <Muted>
                {[meetup.venue.name, meetup.venue.neighborhood].filter(Boolean).join(' · ')}
              </Muted>
            )}
            {!!meetup.eventLabel && <Muted>{meetup.eventLabel}</Muted>}
            {meetup.attendees.map((a) => (
              <View key={a.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PersonAvatar person={person(a.userId)} />
                <View style={{ flex: 1 }}>
                  <Label style={{ fontSize: 16, fontWeight: '600' }}>
                    {personName(person(a.userId))}
                  </Label>
                  {!!attendeeLine(a) && <Muted>{attendeeLine(a)}</Muted>}
                </View>
              </View>
            ))}
            {statusOpen && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="On my way"
                  style={{ flex: 1 }}
                  onPress={async () =>
                    save(await act(() => api.setMeetupStatus(meetupId, 'on_my_way')))
                  }
                />
                <Button
                  title="Arrived"
                  secondary
                  style={{ flex: 1 }}
                  onPress={async () =>
                    save(await act(() => api.setMeetupStatus(meetupId, 'arrived')))
                  }
                />
              </View>
            )}
            {checkinOpen && <Button title="Check in" onPress={() => void checkIn()} />}
            {!!checkinNote && <Muted>{checkinNote}</Muted>}
            <Button
              title="Open chat"
              secondary
              onPress={() => go(`/common-ground/chat/${meetup.threadId}`)}
            />
          </View>
        </Card>
      )}
      {meetup.status === 'completed' && meetup.feedbackDue && (
        <>
          {others.map((a) => {
            const name = personName(person(a.userId));
            return (
              <Card key={a.userId}>
                <View style={{ padding: 16, gap: 7 }}>
                  <Label style={{ fontSize: 16, fontWeight: '700' }}>Did {name} show up?</Label>
                  <YesNo
                    label={`Did ${name} show up`}
                    value={answers[a.userId]?.showedUp}
                    onVote={(yes) => answer(a.userId, 'showedUp', yes)}
                  />
                  <Label style={{ fontSize: 16, fontWeight: '700' }}>Would you meet again?</Label>
                  <YesNo
                    label={`Would you meet ${name} again`}
                    value={answers[a.userId]?.meetAgain}
                    onVote={(yes) => answer(a.userId, 'meetAgain', yes)}
                  />
                </View>
              </Card>
            );
          })}
          <Card>
            <View style={{ padding: 16, gap: 7 }}>
              <Input
                multiline
                placeholder="Anything we should know?"
                accessibilityLabel="Anything we should know?"
                value={note}
                onChangeText={setNote}
              />
              <Button title="Report someone" secondary onPress={report} />
              {reportIds.length > 0 && (
                <Muted>Reporting {reportIds.map((id) => personName(person(id))).join(', ')}</Muted>
              )}
              <Button title="Send" disabled={!allAnswered} onPress={() => void sendFeedback()} />
            </View>
          </Card>
        </>
      )}
      {meetup.status === 'completed' && !meetup.feedbackDue && (
        <Card>
          <View style={{ padding: 16, gap: 7 }}>
            <Muted>Thanks. See your new friends on the map.</Muted>
            <Button title="Back to Map" onPress={backToMap} />
          </View>
        </Card>
      )}
      {!['proposing', 'voting', 'confirmed', 'completed'].includes(meetup.status) && (
        <Card>
          <Empty
            title="This plan isn't active"
            message="Muse can help you plan another one from the chat."
          />
        </Card>
      )}
    </Page>
  );
}
