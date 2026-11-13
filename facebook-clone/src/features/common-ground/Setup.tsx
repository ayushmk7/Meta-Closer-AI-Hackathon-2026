// Setup flow (PRD-1 §8.5): intro -> connect apps -> what Muse picked up -> preferences.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chips, Icon, Label, Muted, Page, useColors } from '../../ui/native';
import { api } from './api';
import Connectors from './Connectors';
import { MuseAvatar } from './MuseBar';
import { GroupSizeSetting, MusePermissions, Section, SignalRow, TravelPicker } from './Settings';
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
import { AvailabilityGrid, Banners, InterestEditor } from './ui';

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
  const mode =
    modes.find((m) => m.mode === (picked ?? lastMode) && m.available) ??
    modes.find((m) => m.available);
  return (
    <Section title="Plans with Muse">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <MuseAvatar />
        <View
          style={{
            flex: 1,
            backgroundColor: c.input,
            borderRadius: 18,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Label>
            Tell me what you want to do. I&apos;ll find the plan and the people and handle the rest.
            You just show up.
          </Label>
        </View>
      </View>
      <Muted>People only see what you have in common, and only after a group forms.</Muted>
      <Label style={{ fontWeight: '700' }}>Where should Muse look?</Label>
      {modes.map((m) => {
        const on = m.mode === mode?.mode;
        return (
          <Pressable
            key={m.mode}
            accessibilityRole="radio"
            accessibilityLabel={m.available ? m.label : `${m.label}, coming soon`}
            accessibilityState={{ checked: on, disabled: !m.available }}
            disabled={!m.available}
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
              opacity: m.available ? 1 : 0.5,
            }}
          >
            <Icon
              name={on ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={on ? c.blue : c.secondary}
            />
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '600' }}>{m.label}</Label>
              <Muted>{m.available ? m.description : 'Coming soon'}</Muted>
            </View>
          </Pressable>
        );
      })}
      <Button
        title="Continue"
        disabled={!mode}
        onPress={async () => {
          if (mode && (await optIn(mode.mode, mode.poolId))) onNext();
        }}
      />
    </Section>
  );
}

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
  useEffect(() => void load.setup(), []);
  if (!setup || !me) return <ActivityIndicator color={c.blue} style={{ marginTop: 40 }} />;
  const interests = applyEdits(setup.proposedInterests, edits);
  return (
    <>
      <Section title="What Muse picked up">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <MuseAvatar />
          <Label style={{ flex: 1 }}>{setup.museText}</Label>
        </View>
      </Section>
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
        <View style={{ marginHorizontal: -16, marginBottom: -12 }}>
          <Chips
            items={['Public', 'Private']}
            value={v === 'public' ? 'Public' : 'Private'}
            onChange={(x) => setVisibility(x === 'Public' ? 'public' : 'private')}
          />
        </View>
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
        <Button title="Done" disabled={saving} onPress={() => void done()} />
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
    <Page style={{ paddingTop: 8 }}>
      <Banners />
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
      <View style={{ flexDirection: 'row', paddingHorizontal: 16 }}>
        {p > 0 && (p !== first || router.canGoBack()) && <TextLink title="Back" onPress={back} />}
        <View style={{ flex: 1 }} />
        {p === 1 && <TextLink title="Skip for now" onPress={next} />}
      </View>
    </Page>
  );
}
