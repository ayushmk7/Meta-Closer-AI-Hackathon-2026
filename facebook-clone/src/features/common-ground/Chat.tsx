// Group chat (PRD-1 §8.4): Messenger look, Muse cards, attachments, Ask Muse toggle.
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Card,
  Icon,
  IconButton,
  Input,
  Label,
  Muted,
  go,
  useColors,
  useKeyboardOffset,
} from '../../ui/native';
import ApprovalSheet from './ApprovalSheet';
import PlanCard from './PlanCard';
import { StatusMark, stepLabel } from './StepTimeline';
import { api, getUser } from './api';
import { act, getState, load, sendMessage, setState, useCg } from './store';
import type { Message, MessageAttachment, Thread } from './types';
import { Banners, NotFound, PersonAvatar, personName, usePoll, when } from './ui';

const NONE: Message[] = []; // stable selector default (fresh [] loops useSyncExternalStore)

function MuseAvatar({ size = 32 }: { size?: number }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.blue,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="sparkles" size={size * 0.55} color="#fff" />
    </View>
  );
}

function MeetupAttachment({ meetupId }: { meetupId: string }) {
  const c = useColors();
  const m = useCg((s) => s.meetups[meetupId]);
  useEffect(() => {
    if (!getState().meetups[meetupId]) void load.meetup(meetupId);
  }, [meetupId]);
  if (!m) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${m.title}, ${when(m.startsAt)}, ${m.venue.name}`}
      onPress={() => go(`/common-ground/meetup/${meetupId}`)}
      style={{ backgroundColor: c.input, borderRadius: 8, padding: 12, gap: 2, minHeight: 44 }}
    >
      <Label style={{ fontWeight: '700' }}>{m.title}</Label>
      <Muted>
        {when(m.startsAt)} · {m.venue.name}
      </Muted>
    </Pressable>
  );
}

function StepsAttachment({ meetupId, stepIds }: { meetupId: string; stepIds: string[] }) {
  const c = useColors();
  const m = useCg((s) => s.meetups[meetupId]);
  useEffect(() => {
    // The message may name steps the cached meetup has not seen yet.
    void load.meetup(meetupId);
  }, [meetupId, stepIds.length]);
  const steps = (m?.museSteps ?? []).filter((s) => stepIds.includes(s.stepId));
  if (!steps.length) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the plan"
      onPress={() => go(`/common-ground/meetup/${meetupId}`)}
      style={{ backgroundColor: c.input, borderRadius: 8, padding: 12, gap: 6 }}
    >
      {steps.map((s) => (
        <View
          key={s.stepId}
          accessible
          accessibilityLabel={stepLabel(s)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <StatusMark status={s.status} />
          <Label style={{ flex: 1, fontSize: 14 }}>{s.label}</Label>
        </View>
      ))}
    </Pressable>
  );
}

function ApprovalAttachment({ approvalId }: { approvalId: string }) {
  // Only my own approvals are ever in the store (listApprovals / meetup.approvals are mine).
  const a = useCg(
    (s) =>
      s.approvals.find((x) => x.approvalId === approvalId) ??
      Object.values(s.meetups)
        .flatMap((m) => m.approvals)
        .find((x) => x.approvalId === approvalId),
  );
  return a ? <ApprovalSheet approval={a} /> : null;
}

function PlanAttachment({ planId }: { planId: string }) {
  const p = useCg((s) => s.plans[planId] ?? s.feed?.plans.find((x) => x.planId === planId));
  useEffect(() => {
    if (!getState().plans[planId]) void load.plan(planId);
  }, [planId]);
  return p ? <PlanCard plan={p} onPress={() => go(`/common-ground/plan/${planId}`)} /> : null;
}

function Starters({ items, onPick }: { items: string[]; onPick(text: string): void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((t) => (
        <Pressable
          key={t}
          accessibilityRole="button"
          accessibilityHint="Puts this in your message"
          onPress={() => onPick(t)}
          style={{
            minHeight: 44,
            maxWidth: '100%',
            justifyContent: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: c.divider,
          }}
        >
          <Label style={{ fontSize: 14, color: c.blue }}>{t}</Label>
        </Pressable>
      ))}
    </View>
  );
}

// Unknown attachment kinds render nothing (CONTRACTS §3 rule 4).
function Attachment({ a, onStarter }: { a: MessageAttachment; onStarter(t: string): void }) {
  switch (a.kind) {
    case 'starters':
      return a.starters?.length ? <Starters items={a.starters} onPick={onStarter} /> : null;
    case 'meetup':
      return a.meetupId ? <MeetupAttachment meetupId={a.meetupId} /> : null;
    case 'muse_steps':
      return a.meetupId ? (
        <StepsAttachment meetupId={a.meetupId} stepIds={a.stepIds ?? []} />
      ) : null;
    case 'approval':
      return a.approvalId ? <ApprovalAttachment approvalId={a.approvalId} /> : null;
    case 'plan':
      return a.planId ? <PlanAttachment planId={a.planId} /> : null;
    default:
      return null;
  }
}

function Bubble({
  m,
  thread,
  first,
  onStarter,
}: {
  m: Message;
  thread?: Thread;
  first: boolean; // first bubble of a run from this sender
  onStarter(t: string): void;
}) {
  const c = useColors();
  const attachments = m.attachments.map((a, i) => (
    <Attachment key={`${a.kind}:${i}`} a={a} onStarter={onStarter} />
  ));
  if (m.sender.kind === 'muse')
    return (
      <Card style={{ borderWidth: 1, borderColor: c.divider, padding: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MuseAvatar />
          <Label style={{ fontWeight: '700' }}>Muse</Label>
        </View>
        <Label>{m.text}</Label>
        {attachments}
      </Card>
    );
  if (m.sender.kind !== 'user')
    return <Muted style={{ textAlign: 'center', marginVertical: 4 }}>{m.text}</Muted>;
  const own = m.sender.userId === getUser();
  const person = thread?.participants.find((p) => p.userId === m.sender.userId);
  const pending = m.messageId.startsWith('pending:');
  return (
    <View style={{ alignItems: own ? 'flex-end' : 'flex-start', gap: 4 }}>
      {!own && first && person && (
        <Muted style={{ marginLeft: 48 }}>{personName(person).split(' ')[0]}</Muted>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' }}>
        {!own && (
          <View style={{ width: 32 }}>
            {first && person && <PersonAvatar person={person} size={32} />}
          </View>
        )}
        <View
          style={{
            flexShrink: 1,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: own ? c.blue : c.input,
            opacity: pending ? 0.7 : 1,
          }}
        >
          {m.toMuse && (
            <Label style={{ color: own ? '#fff' : c.blue, fontSize: 12, fontWeight: '700' }}>
              To Muse
            </Label>
          )}
          <Label style={{ color: own ? '#fff' : c.text }}>{m.text}</Label>
        </View>
      </View>
      {attachments}
    </View>
  );
}

// "Muse is on it…" from a toMuse message until the next Muse message.
export const museBusy = (list: Message[]) => {
  const lastAsk = list.findLastIndex((m) => m.toMuse);
  return lastAsk >= 0 && lastAsk > list.findLastIndex((m) => m.sender.kind === 'muse');
};

export default function ChatScreen() {
  const c = useColors();
  const keyboardOffset = useKeyboardOffset();
  const { threadId = '' } = useLocalSearchParams<{ threadId: string }>();
  const listed = useCg((s) => s.threads.find((t) => t.threadId === threadId));
  // Deep links and "Open group chat" can arrive before listThreads has this thread.
  const [fetched, setFetched] = useState<Thread>();
  useEffect(() => {
    if (!listed) void act(() => api.getThread(threadId)).then((t) => t && setFetched(t));
  }, [listed, threadId]);
  const thread = listed ?? (fetched?.threadId === threadId ? fetched : undefined);
  const messages = useCg((s) => s.messages[threadId] ?? NONE);
  const draft = useCg((s) => s.drafts[threadId] ?? '');
  const maxChars = useCg((s) => s.config?.limits.messageMaxChars ?? 2000);
  const ready = useCg((s) => s.ready);
  const [toMuse, setToMuse] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const setDraft = (text: string) =>
    setState({ drafts: { ...getState().drafts, [threadId]: text } });

  usePoll(() => void load.messages(threadId));
  useFocusEffect(
    useCallback(() => {
      void load.threads();
      void act(() => api.markThreadRead(threadId)).then(() =>
        setState({
          threads: getState().threads.map((t) =>
            t.threadId === threadId ? { ...t, unreadCount: 0 } : t,
          ),
        }),
      );
    }, [threadId]),
  );

  if (!thread && !messages.length)
    return (
      <View style={{ flex: 1 }}>
        <Banners />
        {ready && <NotFound title="This chat isn't available" />}
      </View>
    );

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    void sendMessage(threadId, text, { toMuse });
    setToMuse(false);
  };
  const header = thread && (
    <Pressable
      disabled={!thread.meetupId}
      accessibilityRole="button"
      accessibilityLabel={`${thread.title}, open the plan`}
      onPress={() => go(`/common-ground/meetup/${thread.meetupId}`)}
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
        {thread.participants.slice(0, 4).map((p, i) => (
          <View
            key={p.userId}
            style={{
              marginLeft: i ? -8 : 0,
              borderWidth: 2,
              borderColor: c.card,
              borderRadius: 16,
            }}
          >
            <PersonAvatar person={p} size={28} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Label style={{ fontWeight: '700' }} numberOfLines={1}>
          {thread.title}
        </Label>
        {!!thread.meetupId && <Muted>See plan</Muted>}
      </View>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1, backgroundColor: c.card }}
    >
      <Banners />
      {header}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
      >
        {messages.map((m, i) => (
          <Bubble
            key={m.messageId}
            m={m}
            thread={thread}
            first={
              messages[i - 1]?.sender.kind !== 'user' ||
              messages[i - 1]?.sender.userId !== m.sender.userId
            }
            onStarter={setDraft}
          />
        ))}
        {museBusy(messages) && (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <MuseAvatar size={24} />
            <Muted>Muse is on it…</Muted>
          </View>
        )}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: c.divider, padding: 10, gap: 8 }}>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Ask Muse"
          accessibilityState={{ checked: toMuse }}
          onPress={() => setToMuse((x) => !x)}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 22,
            backgroundColor: toMuse ? c.blue : c.input,
          }}
        >
          <Icon name="sparkles" size={16} color={toMuse ? '#fff' : c.blue} />
          <Label style={{ fontWeight: '600', fontSize: 14, color: toMuse ? '#fff' : c.text }}>
            Ask Muse
          </Label>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
          <Input
            multiline
            maxLength={maxChars}
            accessibilityLabel={toMuse ? 'Message to Muse' : 'Message'}
            value={draft}
            onChangeText={setDraft}
            placeholder={toMuse ? 'To Muse' : 'Aa'}
            style={{ flex: 1, maxHeight: 120 }}
          />
          <IconButton
            name="send"
            label="Send message"
            color={draft.trim() ? c.blue : c.secondary}
            onPress={send}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
