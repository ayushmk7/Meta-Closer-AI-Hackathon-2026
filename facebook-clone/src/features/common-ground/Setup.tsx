// Setup flow (PRD-1 §8.5): intro -> connect apps -> what Muse picked up -> preferences.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';
import { Button, Icon, Label, Muted, Page, useColors } from '../../ui/native';
import { api } from './api';
import CalendarPreview from './CalendarPreview';
import Connectors from './Connectors';
import { MuseAvatar } from './MuseBar';
import { GroupSizeSetting, MusePermissions, PillRow, SignalRow, TravelPicker } from './Settings';
import { act, load, optIn, refreshAll, setState, useCg } from './store';
import type {
  AvailabilitySlot,
  GroupSize,
  ModeInfo,
  MyInterest,
  ProfileVisibility,
  TravelPrefs,
  Visibility,
} from './types';
import { AvailabilityGrid, Banners, InterestEditor, MuseThinking, Section, enter } from './ui';

const NO_MODES: ModeInfo[] = []; // stable fallback outside useCg (useSyncExternalStore)

// Tertiary action (UX 2.6): blue text, 44pt target.
function TextLink({ title, onPress }: { title: string; onPress(): void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Label style={{ color: c.blue, fontWeight: '600' }}>{title}</Label>
    </Pressable>
  );
}

function Intro({ onNext }: { onNext(): void }) {
  const c = useColors();
  const modes = useCg((s) => s.config?.modes) ?? NO_MODES;
  const lastMode = useCg((s) => s.lastMode);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // optIn is out: no dead second tap
  const mode =
    modes.find((m) => m.mode === (picked ?? lastMode) && m.available) ??
    modes.find((m) => m.available);
  return (
    <Section title="How it works">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <MuseAvatar />
        <View
          style={{
            flex: 1,
            backgroundColor: c.input,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Label>
            Tell me what you want to do. I&apos;ll find the meetup and the people and handle the
            rest. You just show up.
          </Label>
        </View>
      </View>
      <Muted>People only see what you have in common, and only after a group forms.</Muted>
      <Label style={{ fontWeight: '700' }}>Where should Muse look?</Label>
      {modes
        .filter((m) => m.available)
        .map((m) => {
          const on = m.mode === mode?.mode;
          return (
            <Pressable
              key={m.mode}
              accessibilityRole="radio"
              accessibilityLabel={m.label}
              accessibilityState={{ checked: on }}
              onPress={() => setPicked(m.mode)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 52,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: on ? c.blue : c.divider,
              }}
            >
              <Icon
                name={on ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={on ? c.blue : c.secondary}
              />
              <View style={{ flex: 1 }}>
                <Label style={{ fontWeight: '600' }}>{m.label}</Label>
                <Muted>{m.description}</Muted>
              </View>
            </Pressable>
          );
        })}
      {/* One line, not a disabled row each: keeps Continue above the fold. */}
      {modes.some((m) => !m.available) && (
        <Muted>{`Coming soon: ${modes
          .filter((m) => !m.available)
          .map((m) => m.label)
          .join(', ')}`}</Muted>
      )}
      <Button
        title="Continue"
        disabled={!mode || busy}
        onPress={async () => {
          if (!mode) return;
          setBusy(true);
          const ok = await optIn(mode.mode, mode.poolId);
          setBusy(false);
          if (ok) onNext();
        }}
      />
    </Section>
  );
}

const PICKING = [
  'Looking at the apps you connected',
  'Noticing what you’re into',
  'Keeping anything sensitive just for you',
];

// Interest edits live here, overlaid on the fetched proposal, so a refetch of getSetup
// (remount, connect, signal toggle) never undoes them.
type Edits = Record<string, Visibility | 'removed'>;
const applyEdits = (interests: MyInterest[], edits: Edits): MyInterest[] =>
  interests
    .filter((i) => edits[i.interest.id] !== 'removed')
    .map((i) => {
      const e = edits[i.interest.id];
      return e && e !== 'removed' ? { ...i, visibility: e } : i;
    });

function PickedUp({ edits, onEdit }: { edits: Edits; onEdit(id: string, e: Edits[string]): void }) {
  const c = useColors();
  const setup = useCg((s) => s.setup);
  const me = useCg((s) => s.me);
  const [evidence, setEvidence] = useState(false);
  const gcal = useCg((s) =>
    s.connectors.some((x) => x.provider === 'google_calendar' && x.status === 'connected'),
  );
  useEffect(() => void load.setup(), []);
  if (!setup || !me)
    return (
      <Section title="What Muse picked up">
        <MuseThinking lines={PICKING} done={false} />
      </Section>
    );
  const interests = applyEdits(setup.proposedInterests, edits);
  return (
    <>
      <Section title="What Muse picked up">
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <MuseAvatar />
          <View
            style={{
              flex: 1,
              backgroundColor: c.input,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Label>{setup.museText}</Label>
          </View>
        </View>
      </Section>
      {gcal && (
        <Section title="Your week">
          <CalendarPreview />
        </Section>
      )}
      <Section title="Your interests">
        <InterestEditor
          interests={interests}
          onToggle={(id) =>
            onEdit(
              id,
              interests.find((i) => i.interest.id === id)?.visibility === 'shown'
                ? 'hidden'
                : 'shown',
            )
          }
          onRemove={(id) => onEdit(id, 'removed')}
        />
        <Button
          title={evidence ? 'Hide why' : 'Why Muse thinks this'}
          secondary
          onPress={() => setEvidence(!evidence)}
        />
        {evidence &&
          interests
            .filter((i) => i.evidence)
            .map((i) => (
              <Muted key={i.interest.id}>
                {i.interest.label}: {i.evidence}
              </Muted>
            ))}
      </Section>
      {setup.signals.length > 0 && (
        <Section title="What Muse noticed">
          {setup.signals.map((s) => (
            <SignalRow key={s.signalId} signal={s} />
          ))}
        </Section>
      )}
    </>
  );
}

function Preferences({ edits, onDone }: { edits: Edits; onDone(): void }) {
  const setup = useCg((s) => s.setup);
  const me = useCg((s) => s.me);
  const calendar = useCg((s) =>
    s.connectors.some((c) => c.provider === 'device_calendar' && c.status === 'connected'),
  );
  const [visibility, setVisibility] = useState<ProfileVisibility | null>(null);
  const [size, setSize] = useState<GroupSize | null>(null);
  const [travel, setTravel] = useState<TravelPrefs | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[] | null>(null);
  const [saving, setSaving] = useState(false);
  if (!me) return null;
  const v = visibility ?? me.profileVisibility;
  const g = size ?? setup?.proposedGroupSize ?? me.groupSize;
  const t = travel ?? setup?.proposedTravel ?? me.travel;
  const a = availability ?? me.availability;
  const done = async () => {
    const interests = applyEdits(setup?.proposedInterests ?? [], edits);
    setSaving(true);
    const next = await act(() =>
      api.completeSetup({
        acceptedInterestIds: interests
          .filter((i) => i.visibility === 'shown')
          .map((i) => i.interest.id),
        hiddenInterestIds: interests
          .filter((i) => i.visibility === 'hidden')
          .map((i) => i.interest.id),
        groupSize: g,
        travel: t,
        profileVisibility: v,
        ...(calendar ? {} : { availability: a }),
      }),
    );
    setSaving(false);
    if (!next) return;
    setState({ me: next });
    await refreshAll();
    onDone();
  };
  return (
    <>
      <Section title="Your profile">
        <PillRow
          items={['Public', 'Private']}
          value={v === 'public' ? 'Public' : 'Private'}
          onChange={(x) => setVisibility(x === 'Public' ? 'public' : 'private')}
        />
        <Muted>Public shows your name and photo to your group.</Muted>
      </Section>
      <Section title="Group size">
        <GroupSizeSetting value={g} onChange={setSize} />
      </Section>
      <Section title="How far you'll travel">
        <TravelPicker value={t} onChange={setTravel} />
      </Section>
      {!calendar && (
        <Section title="When you're usually free">
          <AvailabilityGrid value={a} onChange={setAvailability} />
        </Section>
      )}
      <MusePermissions />
      <View style={{ paddingHorizontal: 16 }}>
        <Button title="Find meetups" disabled={saving} onPress={() => void done()} />
      </View>
    </>
  );
}

export default function SetupScreen() {
  const ready = useCg((s) => s.ready);
  const optedIn = useCg((s) => !!s.me?.optedIn);
  const connectorsOn = useCg((s) => !!s.config?.features.connectors);
  const [page, setPage] = useState<number | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  // Pages: 0 intro, 1 connect apps (features.connectors), 2 picked up, 3 preferences.
  const first = optedIn ? (connectorsOn ? 1 : 2) : 0;
  const p = page ?? first;
  const next = () => setPage(p === 0 && !connectorsOn ? 2 : p + 1);
  const back = () => {
    const prev = p === 2 && !connectorsOn ? 0 : p - 1;
    if (p === first || prev < 0) {
      if (router.canGoBack()) router.back();
    } else setPage(prev);
  };
  if (!ready)
    return (
      <Page>
        <Banners />
      </Page>
    );
  return (
    // key: a new step remounts the ScrollView, so each step opens at the top.
    <Page key={p} style={{ paddingTop: 8 }}>
      <Banners />
      <Muted style={{ paddingHorizontal: 16 }}>
        Step {connectorsOn || p < 2 ? p + 1 : p} of {connectorsOn ? 4 : 3}
      </Muted>
      {/* Each step slides in (the key above remounts it). */}
      <Animated.View entering={enter()} style={{ gap: 8 }}>
        {p === 0 && <Intro onNext={next} />}
        {p === 1 && (
          <Section title="Connect your apps">
            <Muted>
              Muse uses these to notice what you&apos;re into. Turn any of them off later.
            </Muted>
            <Connectors />
            <Button title="Continue" onPress={next} />
          </Section>
        )}
        {p === 2 && (
          <>
            <PickedUp edits={edits} onEdit={(id, e) => setEdits({ ...edits, [id]: e })} />
            <View style={{ paddingHorizontal: 16 }}>
              <Button title="Continue" onPress={next} />
            </View>
          </>
        )}
        {p === 3 && <Preferences edits={edits} onDone={() => router.replace('/common-ground')} />}
      </Animated.View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16 }}>
        {p > 0 && (p !== first || router.canGoBack()) && <TextLink title="Back" onPress={back} />}
        <View style={{ flex: 1 }} />
        {p === 1 && <TextLink title="Skip for now" onPress={next} />}
      </View>
    </Page>
  );
}
