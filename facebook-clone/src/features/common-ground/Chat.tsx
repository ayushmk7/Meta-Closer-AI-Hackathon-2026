// Group chat (PRD-1 §8.4): Messenger look, Muse cards, attachments, Ask Muse toggle.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  IconButton,
  Input,
  Label,
  Muted,
  go,
  useColors,
  useKeyboardOffset,
} from '../../ui/native';
import ApprovalSheet from './ApprovalSheet';
import { MuseAvatar } from './MuseBar';
import PlanCard from './PlanCard';
import { StatusMark, stepLabel } from './StepTimeline';
import { api, getUser } from './api';
import { act, getState, load, sendMessage, setState, useCg } from './store';
import type { Message, MessageAttachment, Thread } from './types';
import {
  Banners,
  enter,
  NotFound,
  PersonAvatar,
  personName,
  Pill,
  PopOn,
  usePoll,
  when,
} from './ui';

const NONE: Message[] = []; // stable selector default (fresh [] loops useSyncExternalStore)

// One typing dot; pulses after `i * 160` ms (solid under reduce motion).
function TypingDot({ i }: { i: number }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(reduce ? 1 : 0.35);
  useEffect(() => {
    if (reduce) return;
    opacity.value = withDelay(i * 160, withRepeat(withTiming(1, { duration: 420 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [reduce, opacity, i]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.secondary }, anim]}
    />
  );
}

// Messenger typing bubble while Muse works: solid bubble, dots pulse in sequence.
function MuseTyping() {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Muse is on it…"
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}
    >
      <MuseAvatar size={32} />
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 14,
          backgroundColor: c.input,
        }}
      >
        {[0, 1, 2].map((i) => (
          <TypingDot key={i} i={i} />
        ))}
      </View>
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
      accessibilityHint="Opens the meetup"
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
          <PopOn on={s.status === 'done'} quiet>
            <StatusMark status={s.status} />
          </PopOn>
          <Label style={{ flex: 1, fontSize: 14, lineHeight: 18 }}>{s.label}</Label>
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
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((t) => (
        <Pill key={t} label={t} outlined onPress={() => onPick(t)} />
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
      // Messenger-style: gray bubble with the Muse avatar, attachments under it.
      <View style={{ gap: 4 }}>
        <Muted style={{ marginLeft: 48 }}>Muse</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' }}>
          <MuseAvatar size={32} />
          <View
            style={{
              flexShrink: 1,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: c.input,
            }}
          >
            <Label>{m.text}</Label>
          </View>
        </View>
        {m.attachments.length > 0 && <View style={{ marginLeft: 40, gap: 8 }}>{attachments}</View>}
      </View>
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
            backgroundColor: own ? c.brand : c.input,
            opacity: pending ? 0.7 : 1,
          }}
        >
          {m.toMuse && (
            <Label
              style={{
                color: own ? '#fff' : c.blue,
                fontSize: 12,
                lineHeight: 16,
                fontWeight: '700',
              }}
            >
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
  // Messages already here when the chat first fills don't animate; later ones enter.
  const [base, setBase] = useState<number>();
  useEffect(() => {
    if (base === undefined && messages.length) setBase(messages.length);
  }, [base, messages.length]);
  const setDraft = (text: string) =>
    setState({ drafts: { ...getState().drafts, [threadId]: text } });

  usePoll(() => void load.messages(threadId));
  useFocusEffect(
    useCallback(() => {
      // Read first, then list: a list sent alongside could answer last with the old unread count.
      void act(() => api.markThreadRead(threadId)).then(() => load.threads());
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
  // Thread header: (web) back arrow, avatar stack, title, "See meetup". On web it is the
  // back row; on native it is the first item of the thread, under the shell's back bar.
  const header = thread && (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.OS === 'web' ? 4 : 0,
        paddingVertical: Platform.OS === 'web' ? 8 : 0,
        borderBottomWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: c.divider,
      }}
    >
      {Platform.OS === 'web' && (
        <IconButton
          name="arrow-back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/common-ground'))}
        />
      )}
      <Pressable
        disabled={!thread.meetupId}
        accessibilityRole="button"
        accessibilityLabel={`${thread.title}, see meetup`}
        onPress={() => go(`/common-ground/meetup/${thread.meetupId}`)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
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
          {!!thread.meetupId && <Muted>See meetup</Muted>}
        </View>
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1, backgroundColor: c.card }}
    >
      <Banners />
      {Platform.OS === 'web' && header}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
      >
        {/* Native: the shell bar is the only bar (N-P1-1); the thread intro scrolls with the
            messages, as Messenger does. */}
        {Platform.OS !== 'web' && header}
        {messages.map((m, i) => (
          // clientId keeps the key stable when the server echoes an optimistic message.
          <Animated.View
            key={m.clientId ?? m.messageId}
            entering={base !== undefined && i >= base ? enter() : undefined}
          >
            <Bubble
              m={m}
              thread={thread}
              first={
                messages[i - 1]?.sender.kind !== 'user' ||
                messages[i - 1]?.sender.userId !== m.sender.userId
              }
              onStarter={setDraft}
            />
          </Animated.View>
        ))}
        {museBusy(messages) && <MuseTyping />}
      </ScrollView>
      <View
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.divider,
          padding: 10,
        }}
      >
        {/* One composer row, Messenger-style: the Muse toggle sits left of the field. */}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
          <Pill
            label="Muse"
            accessibilityLabel="Ask Muse"
            icon="sparkles"
            selected={toMuse}
            onPress={() => setToMuse((x) => !x)}
          />
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
