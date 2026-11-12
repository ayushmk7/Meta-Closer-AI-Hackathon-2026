import type { ReactNode } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import {
  Busy,
  Button,
  Card,
  Chips,
  Divider,
  Empty,
  go,
  Icon,
  Label,
  Muted,
  Page,
  Title,
  useColors,
} from '../../ui/native';
import { api } from './api';
import { act, load, refreshAll, setState, useCg } from './store';
import type { Me, SharePrecision } from './types';
import {
  AvailabilityGrid,
  Banners,
  GroupSizePicker,
  InterestEditor,
  PersonAvatar,
  personName,
} from './ui';

const SHARES: [SharePrecision, string][] = [
  ['off', 'Off'],
  ['neighborhood', 'Neighborhood'],
  ['exact', 'Exact'],
];

// Same section header as the clone's Settings: Label 19/700 plus Muted, padding 16.
function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <>
      <View style={{ padding: 16, paddingTop: 28 }}>
        <Label accessibilityRole="header" style={{ fontSize: 19, fontWeight: '700' }}>
          {title}
        </Label>
        <Muted>{detail}</Muted>
      </View>
      {children}
    </>
  );
}

export default function Settings() {
  const c = useColors();
  const ready = useCg((s) => s.ready);
  const config = useCg((s) => s.config);
  const me = useCg((s) => s.me);
  const connections = useCg((s) => s.connections);

  if (!ready) return <Busy />;
  if (!me?.optedIn)
    return (
      <Page>
        <Banners />
        <Card style={{ borderRadius: 0 }}>
          <Title>Common Ground settings</Title>
          <Empty
            title="You haven't joined yet"
            message="Join Common Ground to choose a mode, your interests and who sees you."
          />
          <View style={{ padding: 16 }}>
            <Button title="Get started" onPress={() => go('/common-ground?find=1')} />
          </View>
        </Card>
      </Page>
    );

  const update = async (fn: () => Promise<Me>) => {
    const next = await act(fn);
    if (next) setState({ me: next });
  };
  const leave = () =>
    Alert.alert(
      'Leave Common Ground?',
      "You'll be hidden from everyone and your interests will be cleared. You can join again later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              if ((await act(() => api.optOut().then(() => true))) !== true) return;
              await refreshAll();
              await load.me();
              router.replace('/common-ground');
            })(),
        },
      ],
    );
  const maxSize = Math.min(
    config?.limits.groupSizeMax ?? me.capabilities?.maxGroupSize ?? 4,
    me.capabilities?.maxGroupSize ?? config?.limits.groupSizeMax ?? 4,
  );

  return (
    <Page>
      <Banners />
      <Card style={{ borderRadius: 0 }}>
        <Title>Common Ground settings</Title>

        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Label accessibilityRole="header" style={{ fontSize: 19, fontWeight: '700' }}>
            Mode
          </Label>
          <Muted>Choose where you want to meet people.</Muted>
        </View>
        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {(config?.modes ?? []).map((m) => {
            const on = me.mode === m.mode;
            return (
              <Pressable
                key={m.mode}
                accessibilityRole="radio"
                accessibilityLabel={m.available ? m.label : `${m.label}, coming soon`}
                accessibilityState={{ checked: on, disabled: !m.available }}
                disabled={!m.available}
                onPress={() =>
                  void (async () => {
                    const next = await act(() => api.optIn(m.mode, m.poolId));
                    if (next) setState({ me: next, lastMode: m.mode });
                  })()
                }
                style={{
                  minHeight: 76,
                  borderWidth: 1,
                  borderColor: on ? c.blue : c.divider,
                  borderRadius: 10,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                  opacity: m.available ? 1 : 0.6,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Label style={{ fontSize: 17 }}>{m.label}</Label>
                  <Muted>{m.available ? (m.description ?? '') : 'Coming soon'}</Muted>
                </View>
                <Icon
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  color={on ? c.blue : c.secondary}
                />
              </Pressable>
            );
          })}
        </View>

        <Section title="Profile" detail="Private hides your photo and name until you connect.">
          <Chips
            items={['Public', 'Private']}
            value={me.profileVisibility === 'private' ? 'Private' : 'Public'}
            onChange={(v) =>
              void update(() =>
                api.updateMe({ profileVisibility: v === 'Private' ? 'private' : 'public' }),
              )
            }
          />
        </Section>

        <Section
          title="Your interests"
          detail="Tap to show or hide an interest. Hidden ones are never shown to anyone."
        >
          <View style={{ paddingHorizontal: 16 }}>
            {me.interests.length ? (
              <InterestEditor
                interests={me.interests}
                onToggle={(id) => {
                  const shown =
                    me.interests.find((i) => i.interest.id === id)?.visibility === 'shown';
                  void act(() => api.setInterestVisibility(id, shown ? 'hidden' : 'shown')).then(
                    () => load.me(),
                  );
                }}
                onRemove={(id) => void act(() => api.removeInterest(id)).then(() => load.me())}
              />
            ) : (
              <Muted>No interests yet.</Muted>
            )}
          </View>
        </Section>

        <Section title="Group size" detail="How many people you'd like to meet at once.">
          <View style={{ paddingHorizontal: 16 }}>
            <GroupSizePicker
              value={me.groupSize}
              min={config?.limits.groupSizeMin ?? 1}
              max={maxSize}
              onChange={(groupSize) => void update(() => api.updateMe({ groupSize }))}
            />
          </View>
        </Section>

        <Section title="Availability" detail="When you're usually free to meet.">
          <View style={{ paddingHorizontal: 16 }}>
            <AvailabilityGrid
              value={me.availability}
              onChange={(availability) => void update(() => api.updateMe({ availability }))}
            />
          </View>
        </Section>

        <Section title="Visibility" detail="Control who can see you on the map.">
          <View
            style={{
              minHeight: 74,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <Icon name="eye-off-outline" size={25} />
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '600' }}>Ghost mode</Label>
              <Muted>Hide me from everyone&apos;s map</Muted>
            </View>
            <Switch
              accessibilityLabel="Ghost mode"
              value={me.ghostMode}
              onValueChange={(enabled) =>
                void act(() => api.setGhostMode(enabled)).then(() =>
                  Promise.all([load.me(), load.map()]),
                )
              }
              trackColor={{ true: c.blue, false: c.divider }}
            />
          </View>
        </Section>

        {config?.features.locationSharing !== false && (
          <Section title="Location sharing" detail="Choose how precisely each person sees you.">
            {connections.length === 0 && (
              <View style={{ paddingHorizontal: 16 }}>
                <Muted>No connections yet.</Muted>
              </View>
            )}
            {connections.map((conn) => (
              <View key={conn.connectionId}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <PersonAvatar person={conn.person} size={40} />
                  <Label style={{ fontWeight: '600', flex: 1 }}>{personName(conn.person)}</Label>
                </View>
                <Chips
                  items={SHARES.map(([, label]) => label)}
                  value={SHARES.find(([v]) => v === conn.location?.iShare)?.[1] ?? 'Off'}
                  onChange={(label) => {
                    const value = SHARES.find(([, l]) => l === label)?.[0] ?? 'off';
                    void act(() => api.setLocationShare(conn.person.userId, value)).then(() =>
                      load.connections(),
                    );
                  }}
                />
              </View>
            ))}
          </Section>
        )}

        <View style={{ height: 16 }} />
        <Divider />
        <View style={{ padding: 16, gap: 14 }}>
          <Button title="Leave Common Ground" secondary icon="exit-outline" onPress={leave} />
          <Muted>Unofficial hackathon demo. Everything runs on this device.</Muted>
        </View>
      </Card>
    </Page>
  );
}
