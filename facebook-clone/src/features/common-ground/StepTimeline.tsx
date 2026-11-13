// Muse's step timeline (PRD-1 §8.3.1). Unknown kinds and statuses render label + status (CONTRACTS §3).
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import { themes } from '../../ui/tokens';
import ApprovalSheet from './ApprovalSheet';
import { calledMeetups, useCg } from './store';
import { clock } from './time';
import { enter, PopOn, WARN } from './ui';
import { TZ, type Approval, type Meetup, type MuseStep } from './types';

const NONE: Approval[] = []; // stable default: a fresh [] in a useCg selector loops useSyncExternalStore

type IconName = ComponentProps<typeof Ionicons>['name'];
const KIND_ICON: Record<string, IconName> = {
  group_chat: 'chatbubbles-outline',
  find_time: 'time-outline',
  choose_venue: 'location-outline',
  check_availability: 'search-outline',
  payment: 'card-outline',
  book: 'ticket-outline',
  calendar: 'calendar-outline',
  event: 'star-outline',
  reminder: 'alarm-outline',
  reschedule: 'swap-horizontal-outline',
  backfill: 'person-add-outline',
  cancel: 'close-circle-outline',
  refund: 'cash-outline',
};
const STATUS_WORD: Record<string, string> = {
  queued: 'queued',
  running: 'in progress',
  done: 'done',
  needs_you: 'needs you',
  failed: 'failed',
  skipped: 'skipped',
};
export const stepLabel = (s: MuseStep) =>
  `${s.label}, ${STATUS_WORD[s.status] ?? s.status.replace(/_/g, ' ')}`;

export function StatusMark({ status }: { status: string }) {
  const c = useColors();
  switch (status) {
    case 'running':
      return <ActivityIndicator size="small" color={c.blue} />;
    case 'done':
      // Callers wrap in PopOn so only a live flip to done pops.
      return <Icon name="checkmark-circle" size={22} color={c.online} />;
    case 'needs_you':
      return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.blue }} />;
    case 'failed':
      // WARN fg on light; on dark that brown is too dark on c.card, so the alert red (guide 2.1).
      return <Icon name="warning" size={22} color={c === themes.dark ? c.badge : WARN.fg} />;
    case 'skipped':
      return <Icon name="remove" size={22} color={c.secondary} />;
    default: // queued and unknown statuses
      return <Icon name="ellipse-outline" size={22} color={c.secondary} />;
  }
}

// A restaurant booking step (backend copy "Reserved a table for 4 at Little Fern Kitchen · 7 PM").
export const isTableStep = (s: MuseStep) => s.label.startsWith('Reserved a table');

// Faux call script, built only from the step label and the meetup. Muse says it is an AI (R12).
export function callScript(s: MuseStep, m?: Meetup) {
  const venue = / at (.+?)(?: · |$)/.exec(s.label)?.[1] ?? m?.venue.name ?? 'the restaurant';
  const n =
    / for (\d+)/.exec(s.label)?.[1] ??
    String(m?.attendees.filter((a) => a.rsvp === 'going').length || 'everyone');
  const time = m ? clock(m.startsAt) : (/ · (.+)$/.exec(s.label)?.[1] ?? 'tonight');
  const day = m
    ? ` on ${new Date(m.startsAt).toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ })}`
    : '';
  return {
    venue,
    done: `Reserved · table for ${n} · ${time}`,
    lines: [
      { muse: false, text: `${venue}, how can I help?` },
      {
        muse: true,
        text: `Hi, I'm Muse, an AI assistant. Could I book a table for ${n}${day} at ${time}?`,
      },
      { muse: false, text: `Yes, a table for ${n} at ${time} is set.` },
      { muse: true, text: 'Thank you!' },
    ],
  };
}

const RING_MS = 1200;
const LINE_MS = 900;

// Muse calls the venue (UI only): ringing, transcript lines, then the reserved check.
function CallCard({ step, meetup, onDone }: { step: MuseStep; meetup?: Meetup; onDone(): void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const { venue, lines, done } = callScript(step, meetup);
  const end = lines.length + 1;
  const [phase, setPhase] = useState(reduce ? end : 0); // 0 ringing, 1..n lines shown, n+1 done
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    const timers = Array.from({ length: end }, (_, i) =>
      setTimeout(() => setPhase(i + 1), RING_MS + i * LINE_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduce, end]);
  const ended = phase >= end;
  useEffect(() => {
    if (ended) onDone();
  }, [ended]); // onDone is a fresh closure each render; fire once per call
  const ringing = phase === 0 && !reduce;
  useEffect(() => {
    if (!ringing) return;
    pulse.value = withRepeat(withTiming(0.4, { duration: 600 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [ringing, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={{ gap: 8, backgroundColor: c.canvas, borderRadius: 8, padding: 12 }}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          phase >= end ? `Muse called ${venue}. ${done}` : `Muse is calling ${venue}`
        }
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 }}
      >
        <Animated.View style={ringing ? ring : undefined}>
          <Icon name="call-outline" size={20} color={c.blue} />
        </Animated.View>
        <Label style={{ flex: 1, fontWeight: '600' }}>
          {phase >= end ? `Muse called ${venue}` : `Calling ${venue}…`}
        </Label>
      </View>
      {lines.slice(0, Math.max(0, Math.min(phase, lines.length))).map((l, i) => (
        <Animated.View
          key={i}
          entering={reduce ? undefined : enter()}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            maxWidth: '85%',
            alignSelf: l.muse ? 'flex-end' : 'flex-start',
          }}
        >
          <View
            style={{
              flexShrink: 1,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: l.muse ? c.brand : c.input,
            }}
          >
            <Label style={{ color: l.muse ? '#fff' : c.text }}>{l.text}</Label>
          </View>
          {l.muse && (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: c.blue,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="sparkles" size={13} color="#fff" />
            </View>
          )}
        </Animated.View>
      ))}
      {phase >= end && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="checkmark-circle" size={20} color={c.online} />
          <Label style={{ fontWeight: '600' }}>{done}</Label>
        </View>
      )}
    </View>
  );
}

export default function StepTimeline({
  meetupId,
  steps,
  onCall,
}: {
  meetupId: string;
  steps: MuseStep[];
  onCall?(y: number): void; // the call card started at y (in this timeline): scroll it into view
}) {
  const c = useColors();
  // listApprovals and meetup.approvals only carry my own approvals.
  const approvals = useCg((s) => s.meetups[meetupId]?.approvals ?? NONE);
  const meetup = useCg((s) => s.meetups[meetupId]);
  // Play the call once per meetup per session; later opens show just the step row.
  const table = steps.find(isTableStep)?.stepId;
  const [callId, setCallId] = useState<string>();
  const [calling, setCalling] = useState(false);
  const shown = useRef(false); // scroll to the call once; later layouts (lines growing) don't
  useEffect(() => {
    if (!table || calledMeetups.has(meetupId)) return;
    calledMeetups.add(meetupId);
    setCallId(table);
    setCalling(true);
  }, [table, meetupId]);
  return (
    <View style={{ gap: 4 }}>
      {steps.map((step) => {
        // The booking row reads as running while Muse is still on the call; the check pops after.
        const s =
          calling && step.stepId === callId
            ? { ...step, status: 'running', detail: undefined }
            : step;
        const approval =
          s.status === 'needs_you' && s.approvalId
            ? approvals.find((a) => a.approvalId === s.approvalId && a.status === 'pending')
            : undefined;
        const muted = s.status === 'skipped' || s.status === 'queued';
        return (
          // enter() honours the system reduce-motion setting (Reanimated default).
          <Animated.View
            key={s.stepId}
            entering={enter()}
            style={{ gap: 8 }}
            onLayout={
              s.stepId === callId && calling
                ? (e) => {
                    if (shown.current) return;
                    shown.current = true;
                    onCall?.(e.nativeEvent.layout.y);
                  }
                : undefined
            }
          >
            {s.stepId === callId && (
              <CallCard step={step} meetup={meetup} onDone={() => setCalling(false)} />
            )}
            <View
              accessible
              accessibilityLabel={stepLabel(s)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
            >
              <Icon name={KIND_ICON[s.kind] ?? 'sparkles-outline'} size={20} color={c.secondary} />
              <View style={{ flex: 1 }}>
                <Label style={{ color: muted ? c.secondary : c.text }}>{s.label}</Label>
                {!!s.detail && <Muted>{s.detail}</Muted>}
                {s.status === 'needs_you' && (
                  <Label style={{ color: c.blue, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>
                    Needs you
                  </Label>
                )}
              </View>
              <View style={{ width: 24, alignItems: 'center' }}>
                <PopOn on={s.status === 'done'} quiet>
                  <StatusMark status={s.status} />
                </PopOn>
              </View>
            </View>
            {approval && <ApprovalSheet approval={approval} />}
          </Animated.View>
        );
      })}
    </View>
  );
}
