// Muse's step timeline (PRD-1 §8.3.1). Unknown kinds and statuses render label + status (CONTRACTS §3).
import type { ComponentProps } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import ApprovalSheet from './ApprovalSheet';
import { useCg } from './store';
import { enter, PopOn, WARN } from './ui';
import type { Approval, MuseStep } from './types';

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
      return <Icon name="warning" size={22} color={c.canvas === '#18191A' ? c.badge : WARN.fg} />;
    case 'skipped':
      return <Icon name="remove" size={22} color={c.secondary} />;
    default: // queued and unknown statuses
      return <Icon name="ellipse-outline" size={22} color={c.secondary} />;
  }
}

export default function StepTimeline({ meetupId, steps }: { meetupId: string; steps: MuseStep[] }) {
  const c = useColors();
  // listApprovals and meetup.approvals only carry my own approvals.
  const approvals = useCg((s) => s.meetups[meetupId]?.approvals ?? NONE);
  return (
    <View style={{ gap: 4 }}>
      {steps.map((s) => {
        const approval =
          s.status === 'needs_you' && s.approvalId
            ? approvals.find((a) => a.approvalId === s.approvalId && a.status === 'pending')
            : undefined;
        const muted = s.status === 'skipped' || s.status === 'queued';
        return (
          // enter() honours the system reduce-motion setting (Reanimated default).
          <Animated.View key={s.stepId} entering={enter()} style={{ gap: 8 }}>
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
                  <Label style={{ color: c.blue, fontWeight: '600', fontSize: 13 }}>
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
