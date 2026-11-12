// Chat: one-for-one copy of the Messenger detail branch (src/features/messenger/Screen.tsx).
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  go,
  Icon,
  IconButton,
  Input,
  Label,
  Muted,
  useColors,
  useKeyboardOffset,
} from '../../ui/native';
import { api } from './api';
import { act, getState, load, sendMessage, setState, useCg } from './store';
import type { GroupSize, Meetup, Message } from './types';
import { Banners, GroupSizePicker, NotFound, PersonAvatar, personName, usePoll, when } from './ui';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const STATUS: Record<string, string> = {
  proposing: 'Muse is finding options…',
  voting: 'Vote on the options',
  completed: 'Done',
  cancelled: 'Cancelled',
};
const meetupStatus = (m?: Meetup) =>
  m?.status === 'confirmed'
    ? m.startsAt
      ? when(m.startsAt)
      : 'Confirmed'
    : (STATUS[m?.status ?? ''] ?? '');

// openapi.yaml planMeetup: `note` maxLength. A schema bound, not a params.yaml tunable.
const NOTE_MAX = 280;

// "Plan something": an optional note for Muse, plus a size range in group threads.
export function PlanForm({ threadId, group }: { threadId: string; group: boolean }) {
  const c = useColors();
  const limits = useCg((s) => s.config?.limits);
  const me = useCg((s) => s.me);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const min = limits?.groupSizeMin ?? 2;
  const max = Math.min(
    limits?.groupSizeMax ?? 8,
    me?.capabilities?.maxGroupSize ?? limits?.groupSizeMax ?? 8,
  );
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const [size, setSize] = useState<GroupSize>(() => ({
    min: clamp(me?.groupSize.min ?? min),
    max: clamp(me?.groupSize.max ?? max),
  }));

  if (!open)
    return (
      <View style={{ paddingHorizontal: 10, paddingTop: 10 }}>
        <Button
          title="Plan something"
          icon="calendar-outline"
          secondary
          onPress={() => setOpen(true)}
        />
      </View>
    );
  const ask = async () => {
    setBusy(true);
    const body = { note: note.trim() || undefined, size: group ? size : undefined };
    // The note stays in the form if the call fails, so nothing typed is lost.
    if (await act(() => api.planMeetup(threadId, body))) {
      setOpen(false);
      setNote('');
    }
    setBusy(false);
    await load.threads();
  };
  return (
    <View
      style={{
        margin: 10,
        marginBottom: 0,
        padding: 12,
        gap: 10,
        borderRadius: 8,
        backgroundColor: c.input,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Label accessibilityRole="header" style={{ flex: 1, fontWeight: '700' }}>
          Plan something with Muse
        </Label>
        <IconButton name="close" label="Close planning" onPress={() => setOpen(false)} />
      </View>
      <Input
        multiline
        maxLength={NOTE_MAX}
        accessibilityLabel="Anything in mind?"
        placeholder="Anything in mind? Something outdoors on Saturday…"
        value={note}
        onChangeText={setNote}
        editable={!busy}
        style={{ maxHeight: 96, backgroundColor: c.card }}
      />
      {group && (
        <View>
          <Muted>How many people?</Muted>
          <GroupSizePicker value={size} min={min} max={max} onChange={setSize} />
        </View>
      )}
      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <ActivityIndicator color={c.blue} />
          <Muted>Muse is finding options…</Muted>
        </View>
      ) : (
        <Button title="Ask Muse" icon="sparkles" onPress={() => void ask()} />
      )}
    </View>
  );
}

export default function ChatScreen() {
  const c = useColors();
  const keyboardOffset = useKeyboardOffset();
  const { threadId = '' } = useLocalSearchParams<{ threadId?: string }>();
  const scroll = useRef<ScrollView>(null);
  const ready = useCg((s) => s.ready);
  const threads = useCg((s) => s.threads);
  const connections = useCg((s) => s.connections);
  const meetups = useCg((s) => s.meetups);
  const myId = useCg((s) => s.me?.userId);
  const limits = useCg((s) => s.config?.limits);
  const messages = useCg((s) => s.messages[threadId]);
  const text = useCg((s) => s.drafts[threadId]) ?? '';
  const thread = threads.find((t) => t.threadId === threadId);
  const activeId = thread?.activeMeetupId;

  usePoll(() => {
    if (!threadId) return;
    void load.messages(threadId);
    // ponytail: mark read on every poll (covers focus too) so replies seen here never badge.
    void api
      .markThreadRead(threadId)
      .catch(() => {})
      .then(() => load.threads());
    if (activeId) void load.meetup(activeId);
  }, limits?.pollIntervalS);

  if (!thread)
    return ready ? (
      <View style={{ flex: 1 }}>
        <Banners />
        <NotFound title="Conversation not found" />
      </View>
    ) : null;

  const direct = thread.kind === 'direct' ? thread.participants[0] : undefined;
  // ponytail: Thread carries no shared interests; take them from the matching connection.
  const connection = connections.find((x) => x.threadId === threadId);
  const profileHref =
    direct && connection?.canViewProfile ? `/common-ground/person/${direct.userId}` : undefined;
  const shared = (connection?.sharedInterests ?? []).map((i) => i.label).join(' · ');
  const setText = (value: string) =>
    setState({ drafts: { ...getState().drafts, [threadId]: value } });
  const send = () => {
    if (!text.trim()) return;
    void sendMessage(threadId, text.trim());
  };

  const attachments = (m: Message) =>
    m.attachments.map((a, i) => {
      if (a.kind === 'starters')
        return (
          <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {(a.starters ?? []).map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`Use starter: ${s}`}
                onPress={() => setText(s)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 15,
                  paddingVertical: 10,
                  borderRadius: 22,
                  justifyContent: 'center',
                  backgroundColor: c.card,
                }}
              >
                <Label style={{ fontWeight: '600', fontSize: 14 }}>{s}</Label>
              </Pressable>
            ))}
          </View>
        );
      if (a.kind === 'meetup' && a.meetupId) {
        const meetup = meetups[a.meetupId];
        return (
          <Card
            key={i}
            style={{ borderWidth: 1, borderColor: c.divider, padding: 16, gap: 10, marginTop: 10 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="calendar-outline" color={c.blue} />
              <View style={{ flex: 1 }}>
                <Label style={{ fontWeight: '700', fontSize: 16 }}>
                  {meetup?.title ?? 'Muse found options'}
                </Label>
                {!!meetupStatus(meetup) && <Muted>{meetupStatus(meetup)}</Muted>}
              </View>
            </View>
            <Button
              title="View plan"
              secondary
              onPress={() => go(`/common-ground/meetup/${a.meetupId}`)}
            />
          </Card>
        );
      }
      return null; // unknown kinds are skipped
    });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1, backgroundColor: c.card }}
    >
      <Banners />
      <Pressable
        disabled={!profileHref}
        onPress={() => profileHref && go(profileHref)}
        accessibilityRole={profileHref ? 'button' : undefined}
        accessibilityLabel={profileHref ? `${thread.title}'s profile` : thread.title}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.divider,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {thread.participants.slice(0, 3).map((p, i) => (
            <View
              key={p.userId}
              style={{
                marginLeft: i ? -14 : 0,
                borderRadius: 22,
                borderWidth: 2,
                borderColor: c.card,
              }}
            >
              <PersonAvatar person={p} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Label style={{ fontWeight: '700' }}>
            {thread.title || (direct ? personName(direct) : 'Group')}
          </Label>
          {!!shared && <Muted numberOfLines={1}>{shared}</Muted>}
        </View>
      </Pressable>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
      >
        {(messages ?? []).map((m) => {
          const kind = m.sender.kind;
          if (kind === 'system')
            return (
              <Muted key={m.messageId} style={{ textAlign: 'center' }}>
                {m.text}
              </Muted>
            );
          if (kind === 'muse')
            return (
              <View
                key={m.messageId}
                style={{ backgroundColor: c.input, borderRadius: 8, padding: 14 }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: c.blue,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="sparkles" size={15} color="#fff" />
                  </View>
                  <Label style={{ fontWeight: '700' }}>Muse</Label>
                </View>
                <Label>{m.text}</Label>
                {attachments(m)}
                <Muted style={{ marginTop: 6, fontSize: 10 }}>{time(m.createdAt)}</Muted>
              </View>
            );
          if (kind !== 'user') return null;
          const own = m.sender.userId === myId;
          return (
            <View
              key={m.messageId}
              style={{
                alignItems: own ? 'flex-end' : 'flex-start',
                opacity: m.messageId.startsWith('pending:') ? 0.6 : 1,
              }}
            >
              <View
                style={{
                  maxWidth: '85%',
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: own ? c.blue : c.input,
                }}
              >
                <Label style={{ color: own ? '#fff' : c.text }}>{m.text}</Label>
              </View>
              <Muted style={{ marginTop: 3, marginHorizontal: 8, fontSize: 10 }}>
                {time(m.createdAt)}
              </Muted>
            </View>
          );
        })}
      </ScrollView>
      {!activeId ? (
        <PlanForm threadId={threadId} group={thread.kind !== 'direct'} />
      ) : meetups[activeId]?.status === 'proposing' ? (
        <Muted style={{ paddingHorizontal: 16, paddingTop: 10 }}>Muse is finding options…</Muted>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          alignItems: 'flex-end',
          padding: 10,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        <Input
          multiline
          maxLength={limits?.messageMaxChars ?? 2000}
          accessibilityLabel="Message"
          value={text}
          onChangeText={setText}
          placeholder="Aa"
          style={{ flex: 1, maxHeight: 120 }}
        />
        <IconButton
          name="send"
          label="Send message"
          color={text.trim() ? c.blue : c.secondary}
          onPress={send}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
