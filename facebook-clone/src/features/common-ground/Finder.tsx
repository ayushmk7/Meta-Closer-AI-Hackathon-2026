// Finder overlay (PRD-1 §7.2): intro → onboarding chat → review → People.
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useDemo } from '../../core/store';
import {
  Button,
  Card,
  Chips,
  Icon,
  IconButton,
  Input,
  Label,
  Muted,
  Title,
  useColors,
  useKeyboardOffset,
} from '../../ui/native';
import { api } from './api';
import People from './People';
import { act, refreshAll, setState, useCg } from './store';
import type { GroupSize, Mode, MyInterest, OnboardingSession } from './types';
import { AvailabilityGrid, Banners, GroupSizePicker, InterestEditor } from './ui';

export default function Finder({ onClose }: { onClose(): void }) {
  const theme = useDemo().state.settings.theme;
  const offset = useKeyboardOffset();
  const me = useCg((s) => s.me);
  const config = useCg((s) => s.config);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const begin = async () => {
    const next = await act(() => api.startOnboarding());
    if (next) setSession(next);
  };
  const needsOnboarding = !!me?.optedIn && me.interests.length === 0;
  useEffect(() => {
    if (needsOnboarding && !session) void begin();
  }, [needsOnboarding, session]);

  const body =
    !me || !config ? (
      <Card style={{ padding: 16 }}>
        <Muted>Loading…</Muted>
      </Card>
    ) : !me.optedIn ? (
      <Intro onDone={begin} />
    ) : session && session.status === 'review' ? (
      <Review session={session} onDone={() => setSession(null)} />
    ) : session && session.status !== 'complete' ? (
      <Onboarding session={session} onChange={setSession} />
    ) : needsOnboarding ? null : (
      <People />
    );
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={60} tint={theme} style={StyleSheet.absoluteFill} />
      <Card style={{ borderRadius: 0 }}>
        <Title aside={<IconButton name="close" label="Close Find people" onPress={onClose} />}>
          Find people
        </Title>
      </Card>
      <Banners />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={offset}
        style={{ flex: 1 }}
      >
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

const scroll = { padding: 12, gap: 8 } as const;

function Intro({ onDone }: { onDone(): void }) {
  const c = useColors();
  const modes = useCg((s) => s.config?.modes ?? []);
  const lastMode = useCg((s) => s.lastMode);
  const [mode, setMode] = useState<Mode | undefined>(
    modes.find((m) => m.mode === lastMode && m.available)?.mode ??
      modes.find((m) => m.available)?.mode,
  );
  const go = async () => {
    const info = modes.find((m) => m.mode === mode);
    if (!info) return;
    const me = await act(() => api.optIn(info.mode, info.poolId));
    if (!me) return;
    setState({ me, lastMode: info.mode });
    // ponytail: the seeded Maya already has interests, so opting in from here always starts the chat.
    onDone();
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={scroll}>
      <Card style={{ padding: 16, gap: 12 }}>
        <MuseRow />
        <Label>I'll introduce you to a few people nearby who are into what you're into.</Label>
        <Label>People only ever see what you have in common.</Label>
        {modes.map((m) => {
          const on = m.mode === mode;
          return (
            <Pressable
              key={m.mode}
              accessibilityRole="radio"
              accessibilityLabel={m.label}
              accessibilityState={{ checked: on, disabled: !m.available }}
              disabled={!m.available}
              onPress={() => setMode(m.mode)}
              style={{
                padding: 16,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: on ? c.blue : c.divider,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: m.available ? 1 : 0.5,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Label style={{ fontWeight: '600' }}>{m.label}</Label>
                <Muted>{m.available ? (m.description ?? '') : 'Coming soon'}</Muted>
              </View>
              <Icon
                name={on ? 'radio-button-on' : 'radio-button-off'}
                color={on ? c.blue : c.secondary}
              />
            </Pressable>
          );
        })}
        <Button title="Continue" disabled={!mode} onPress={() => void go()} />
      </Card>
    </ScrollView>
  );
}

function MuseRow() {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: c.input,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="sparkles" size={20} color={c.blue} />
      </View>
      <Label style={{ fontWeight: '700' }}>Muse</Label>
    </View>
  );
}

function Onboarding({
  session,
  onChange,
}: {
  session: OnboardingSession;
  onChange(s: OnboardingSession): void;
}) {
  const c = useColors();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const sent = text.trim();
    if (!sent || busy) return;
    setBusy(true);
    setText('');
    const next = await act(() => api.sendOnboardingMessage(session.sessionId, sent));
    setBusy(false);
    if (!next) return setText(sent); // failed send keeps the text
    // A send returns only the new messages.
    onChange({ ...next, messages: [...session.messages, ...next.messages] });
  };
  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={scroll}>
        <Card style={{ padding: 14, gap: 12 }}>
          <MuseRow />
          {session.messages.map((m) => {
            const own = m.role === 'user';
            return (
              <View key={m.messageId} style={{ alignItems: own ? 'flex-end' : 'flex-start' }}>
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
              </View>
            );
          })}
          {busy && <Muted>Muse is typing…</Muted>}
        </Card>
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          alignItems: 'flex-end',
          padding: 10,
          borderTopWidth: 1,
          borderTopColor: c.divider,
          backgroundColor: c.card,
        }}
      >
        <Input
          multiline
          maxLength={2000}
          accessibilityLabel="Message Muse"
          value={text}
          onChangeText={setText}
          placeholder="Aa"
          style={{ flex: 1, maxHeight: 120 }}
        />
        <IconButton
          name="send"
          label="Send message"
          color={text.trim() ? c.blue : c.secondary}
          onPress={() => void send()}
        />
      </View>
    </>
  );
}

function Review({ session, onDone }: { session: OnboardingSession; onDone(): void }) {
  const me = useCg((s) => s.me);
  const limits = useCg((s) => s.config?.limits);
  const [interests, setInterests] = useState<MyInterest[]>(session.proposedInterests);
  const [size, setSize] = useState<GroupSize>(
    session.proposedGroupSize ?? me?.groupSize ?? { min: 2, max: 4 },
  );
  const [availability, setAvailability] = useState(
    session.proposedAvailability ?? me?.availability ?? [],
  );
  const [visibility, setVisibility] = useState(
    me?.profileVisibility === 'private' ? 'Private' : 'Public',
  );
  const save = async () => {
    const next = await act(() =>
      api.completeOnboarding(session.sessionId, {
        acceptedInterestIds: interests.map((i) => i.interest.id),
        hiddenInterestIds: interests
          .filter((i) => i.visibility === 'hidden')
          .map((i) => i.interest.id),
        groupSize: size,
        availability,
        profileVisibility: visibility === 'Private' ? 'private' : 'public',
      }),
    );
    if (!next) return;
    setState({ me: next });
    onDone();
    void refreshAll();
  };
  const heading = { fontSize: 19, fontWeight: '700' } as const;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={scroll}>
      <Card style={{ padding: 16, gap: 12 }}>
        <MuseRow />
        <Label>Here's what I picked up. Tap to hide anything, or remove it.</Label>
        <InterestEditor
          interests={interests}
          // ponytail: sensitive interests stay hidden and locked; only removal is allowed.
          onToggle={(id) =>
            setInterests(
              interests.map((i) =>
                i.interest.id === id && !i.sensitive
                  ? { ...i, visibility: i.visibility === 'shown' ? 'hidden' : 'shown' }
                  : i,
              ),
            )
          }
          onRemove={(id) => setInterests(interests.filter((i) => i.interest.id !== id))}
        />
      </Card>
      <Card style={{ padding: 16, gap: 8 }}>
        <Label accessibilityRole="header" style={heading}>
          Group size
        </Label>
        <Muted>How many people you like to meet at once.</Muted>
        <GroupSizePicker
          value={size}
          min={limits?.groupSizeMin ?? 2}
          max={limits?.groupSizeMax ?? 8}
          onChange={setSize}
        />
      </Card>
      <Card style={{ padding: 16, gap: 8 }}>
        <Label accessibilityRole="header" style={heading}>
          When you're free
        </Label>
        <Muted>I'll only suggest plans in these times.</Muted>
        <AvailabilityGrid value={availability} onChange={setAvailability} />
      </Card>
      <Card style={{ paddingTop: 16, gap: 8 }}>
        <View style={{ paddingHorizontal: 16, gap: 2 }}>
          <Label accessibilityRole="header" style={heading}>
            Profile
          </Label>
          <Muted>Private hides your name and photo until you both connect.</Muted>
        </View>
        <Chips items={['Public', 'Private']} value={visibility} onChange={setVisibility} />
      </Card>
      <Button title="Looks good" onPress={() => void save()} />
    </ScrollView>
  );
}
