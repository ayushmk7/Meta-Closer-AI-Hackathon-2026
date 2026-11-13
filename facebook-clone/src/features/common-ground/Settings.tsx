// Settings (PRD-1 §8.6) plus the preference pieces the setup flow reuses.
import { useEffect } from 'react';
import { Alert, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, Label, Muted, Page, Title, useColors } from '../../ui/native';
import { api } from './api';
import Connectors from './Connectors';
import Rewards from './Rewards';
import { SetupPrompt, sizeBounds, sourceName } from './Plan';
import { act, load, optIn, setState, useCg } from './store';
import type {
  MeUpdate,
  ModeInfo,
  MuseSettings,
  Signal,
  TravelMode,
  TravelPrefs,
  Visibility,
} from './types';
import { Banners, GroupSizePicker, InterestEditor, Pill, Section } from './ui';

// NEEDS(ioscore): store actions for updateMe, interest/signal visibility, delete and optOut.
// Until then these call the api through the store's act() (same error banner) and reload.
const NONE: ModeInfo[] = []; // stable fallback outside useCg (useSyncExternalStore)

export async function saveMe(patch: MeUpdate): Promise<boolean> {
  const me = await act(
    () => api.updateMe(patch),
    () => saveMe(patch),
  );
  if (me) setState({ me });
  return !!me;
}
export async function setSignal(signalId: string, visibility: Visibility | 'delete') {
  const ok = await act(
    () =>
      visibility === 'delete'
        ? api.deleteSignal(signalId).then(() => true)
        : api.setSignalVisibility(signalId, visibility).then(() => true),
    () => setSignal(signalId, visibility),
  );
  if (ok) await Promise.all([load.signals(), load.setup()]);
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange(v: boolean): void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 12 }}>
      <Label style={{ flex: 1 }}>{label}</Label>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.secondary, true: c.blue }}
        thumbColor="#fff"
      />
    </View>
  );
}

// Chips-shaped row of shared Pills (44pt, wraps): CG settings and setup use this, not Chips.
export function PillRow({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange(v: string): void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((x) => (
        <Pill key={x} label={x} selected={x === value} onPress={() => onChange(x)} />
      ))}
    </View>
  );
}

export function GroupSizeSetting({
  value,
  onChange,
}: {
  value: { min: number; max: number };
  onChange(v: { min: number; max: number }): void;
}) {
  const limits = useCg((s) => s.config?.limits);
  const cap = useCg((s) => s.me?.capabilities.maxGroupSize);
  const b = sizeBounds(limits, cap);
  return <GroupSizePicker value={value} min={b.min} max={b.max} onChange={onChange} />;
}

const MINUTES = ['15', '25', '35', '45', '60'];
const MODES: TravelMode[] = ['transit', 'walk', 'bike', 'drive'];
export function TravelPicker({
  value,
  onChange,
}: {
  value: TravelPrefs;
  onChange(v: TravelPrefs): void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Muted>Up to {value.maxMinutes} minutes</Muted>
      <PillRow
        items={MINUTES}
        value={String(value.maxMinutes)}
        onChange={(m) => onChange({ ...value, maxMinutes: Number(m) })}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MODES.map((m) => {
          const on = value.modes.includes(m);
          return (
            <Pill
              key={m}
              label={m[0]!.toUpperCase() + m.slice(1)}
              accessibilityLabel={`Travel by ${m}`}
              selected={on}
              onPress={() =>
                onChange({
                  ...value,
                  modes: on ? value.modes.filter((x) => x !== m) : [...value.modes, m],
                })
              }
            />
          );
        })}
      </View>
    </View>
  );
}

const SPEND = [
  ['$0', 0],
  ['$10', 1000],
  ['$25', 2500],
  ['$50', 5000],
] as const;
// "What Muse can do without asking" (features.autonomySettings only); saved with updateMe.
export function MusePermissions() {
  const on = useCg((s) => !!s.config?.features.autonomySettings);
  const settings = useCg((s) => s.me?.museSettings);
  if (!on || !settings) return null;
  const save = (patch: Partial<MuseSettings>) =>
    void saveMe({ museSettings: { ...settings, ...patch } });
  // Any other server value shows as its own selected chip, never as a misleading "$0".
  const cents = settings.spendWithoutAskingCents;
  const spend =
    SPEND.find(([, v]) => v === cents)?.[0] ?? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  const items: string[] = SPEND.map(([l]) => l);
  return (
    <Section title="What Muse can do without asking">
      <Muted>Spend up to</Muted>
      <PillRow
        items={items.includes(spend) ? items : [...items, spend]}
        value={spend}
        onChange={(l) => {
          const v = SPEND.find(([x]) => x === l)?.[1];
          if (v !== undefined) save({ spendWithoutAskingCents: v });
        }}
      />
      <Toggle
        label="Reschedule when plans change"
        value={settings.autoReschedule}
        onChange={(v) => save({ autoReschedule: v })}
      />
      <Toggle
        label="Fill spots when someone drops"
        value={settings.autoBackfill}
        onChange={(v) => save({ autoBackfill: v })}
      />
      <Toggle
        label="Hold time on my calendar"
        value={settings.calendarHolds}
        onChange={(v) => save({ calendarHolds: v })}
      />
    </Section>
  );
}

export function SignalRow({ signal, onDelete }: { signal: Signal; onDelete?: () => void }) {
  const c = useColors();
  const shown = signal.visibility === 'shown';
  const labels = useCg((s) => s.connectors);
  const source = sourceName(
    signal.provider,
    Object.fromEntries(labels.map((x) => [x.provider, x.label])),
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
      {signal.sensitive && <Icon name="lock-closed" size={16} color={c.secondary} />}
      <View style={{ flex: 1 }}>
        <Label style={{ color: shown ? c.text : c.secondary }}>{signal.label}</Label>
        <Muted>{signal.sensitive ? 'Only you can see this.' : source}</Muted>
      </View>
      <Button
        title={shown ? 'Hide' : 'Show'}
        accessibilityLabel={`${shown ? 'Hide' : 'Show'} ${signal.label}`}
        secondary
        onPress={() => void setSignal(signal.signalId, shown ? 'hidden' : 'shown')}
      />
      {onDelete && (
        <Button
          title="Delete"
          accessibilityLabel={`Delete ${signal.label}`}
          secondary
          onPress={onDelete}
        />
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const me = useCg((s) => s.me);
  const modes = useCg((s) => s.config?.modes) ?? NONE;
  const connectorsOn = useCg((s) => !!s.config?.features.connectors);
  const signals = useCg((s) => s.signals);
  const optedIn = !!me?.optedIn;
  useEffect(() => void load.me(), []);
  useEffect(() => void (optedIn && (load.signals(), load.connectors())), [optedIn]);
  if (me && !optedIn)
    return (
      <Page>
        <Banners />
        <SetupPrompt />
      </Page>
    );
  if (!me)
    return (
      <Page>
        <Banners />
      </Page>
    );
  const available = modes.filter((m) => m.available);
  const reloadMe = (ok: unknown) => void (ok && load.me());
  return (
    <Page style={{ paddingHorizontal: 0 }}>
      <Banners />
      <Title>Settings</Title>
      {available.length > 1 && (
        <Section title="Mode">
          <PillRow
            items={available.map((m) => m.label)}
            value={modes.find((m) => m.mode === me.mode)?.label ?? ''}
            onChange={(label) => {
              const m = available.find((x) => x.label === label);
              if (m) void optIn(m.mode, m.poolId);
            }}
          />
        </Section>
      )}
      {connectorsOn && (
        <Section title="Connected apps">
          <Connectors />
        </Section>
      )}
      <Section title="What Muse knows">
        {signals.map((s) => (
          <SignalRow
            key={s.signalId}
            signal={s}
            onDelete={() => void setSignal(s.signalId, 'delete')}
          />
        ))}
        <InterestEditor
          interests={me.interests}
          onToggle={(id) => {
            const i = me.interests.find((x) => x.interest.id === id);
            const next = i?.visibility === 'shown' ? 'hidden' : 'shown';
            void act(() => api.setInterestVisibility(id, next)).then(reloadMe);
          }}
          onRemove={(id) => void act(() => api.removeInterest(id).then(() => true)).then(reloadMe)}
        />
      </Section>
      <Section title="Profile">
        <PillRow
          items={['Public', 'Private']}
          value={me.profileVisibility === 'public' ? 'Public' : 'Private'}
          onChange={(v) =>
            void saveMe({ profileVisibility: v === 'Public' ? 'public' : 'private' })
          }
        />
        <Muted>
          {me.profileVisibility === 'public'
            ? 'People in your groups can see your profile.'
            : 'People in your groups see your first name and initials only.'}
        </Muted>
      </Section>
      <Section title="Group size">
        <GroupSizeSetting
          value={me.groupSize}
          onChange={(groupSize) => void saveMe({ groupSize })}
        />
      </Section>
      <Section title="How far you'll travel">
        <TravelPicker value={me.travel} onChange={(travel) => void saveMe({ travel })} />
      </Section>
      <MusePermissions />
      <Section title="Notifications">
        <Toggle
          label="Remind me when to leave"
          value={me.museSettings.leaveByReminders}
          onChange={(v) =>
            void saveMe({ museSettings: { ...me.museSettings, leaveByReminders: v } })
          }
        />
      </Section>
      <Rewards />
      <Section title="Common Ground">
        <Button title="Edit setup" secondary onPress={() => router.push('/common-ground/setup')} />
        <Button
          title="Leave Common Ground"
          secondary
          onPress={() =>
            Alert.alert(
              'Leave Common Ground?',
              'Muse stops finding plans for you. You can come back any time.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Leave',
                  style: 'destructive',
                  onPress: async () => {
                    if (await act(() => api.optOut().then(() => true))) {
                      await load.me();
                      router.replace('/common-ground');
                    }
                  },
                },
              ],
            )
          }
        />
      </Section>
    </Page>
  );
}
