import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import {
  Button,
  Chips,
  Divider,
  Empty,
  IconButton,
  Input,
  Label,
  Muted,
  Sheet,
  go,
  useColors,
} from '../../ui/native';
import { api } from './api';
import { act, load, refreshAll, sendMessage, useCg } from './store';
import { InterestChips, PersonAvatar, personName } from './ui';
import type { ReportRequest } from './types';

const SHARE = { Off: 'off', Neighborhood: 'neighborhood', Exact: 'exact' } as const;
const label = (v: string) =>
  (Object.keys(SHARE) as (keyof typeof SHARE)[]).find((k) => SHARE[k] === v) ?? 'Off';
const REPORT: [ReportRequest['reason'], string][] = [
  ['threat', 'Threat or safety concern'],
  ['harassment', 'Harassment'],
  ['fake_account', 'Fake account'],
  ['other', 'Something else'],
];

export default function FriendSheet({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose(): void;
}) {
  const c = useColors();
  const connection = useCg((s) => s.connections.find((x) => x.person.userId === userId));
  const pin = useCg(
    (s) =>
      s.map?.friends.find((x) => x.userId === userId) ??
      s.map?.tray.find((x) => x.userId === userId),
  );
  const myId = useCg((s) => s.me?.userId);
  const maxChars = useCg((s) => s.config?.limits.messageMaxChars ?? 1000);
  const threadId = connection?.threadId ?? pin?.threadId;
  const messages = useCg((s) => (threadId ? s.messages[threadId] : undefined));
  const [text, setText] = useState('');
  useEffect(() => {
    if (threadId) void load.messages(threadId);
  }, [threadId]);

  const person = connection?.person ?? pin?.person;
  const name = person ? personName(person) : 'Person';
  const firstName = name.split(' ')[0];
  const mutate = async (fn: () => Promise<unknown>) => {
    await act(fn);
    await Promise.all([load.connections(), load.map()]);
  };
  const leave = (href: string) => {
    onClose();
    go(href);
  };
  const send = () => {
    if (!threadId || !text.trim()) return;
    void sendMessage(threadId, text.trim());
    setText('');
  };
  const report = () =>
    Alert.alert(`Report ${firstName}`, 'What happened?', [
      ...REPORT.map(([reason, text]) => ({
        text,
        onPress: () => void mutate(() => api.report({ userId: userId!, reason, threadId })),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  const block = () =>
    Alert.alert(`Block ${firstName}?`, 'They will no longer see you or message you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          await act(() => api.block(userId!));
          await refreshAll();
          onClose();
        },
      },
    ]);

  const loc = connection?.location;
  return (
    <Sheet visible={!!userId} title={name} onClose={onClose}>
      {!person || !userId ? (
        <Empty title="Person not found" message="They may no longer be on your map." />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14 }}
        >
          <View style={{ alignItems: 'center' }}>
            <PersonAvatar person={person} size={72} />
          </View>
          <InterestChips interests={connection?.sharedInterests ?? pin?.sharedInterests ?? []} />

          {(messages ?? []).slice(-3).map((m) => {
            const own = m.sender.userId === myId;
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
          {threadId && (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
              <Input
                multiline
                maxLength={maxChars}
                accessibilityLabel={`Message ${firstName}`}
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
          )}

          {threadId && (
            <>
              <Button
                title="Meet up"
                icon="calendar"
                onPress={async () => {
                  if (await act(() => api.planMeetup(threadId)))
                    leave('/common-ground/chat/' + threadId);
                }}
              />
              <Button
                title="Open in Messenger"
                secondary
                onPress={() => leave('/common-ground/chat/' + threadId)}
              />
            </>
          )}

          {loc && (
            <>
              <Label style={{ fontWeight: '600' }}>Share my location</Label>
              {/* Chips pads 16 itself; cancel the sheet padding so pills line up. */}
              <View style={{ marginHorizontal: -16, marginBottom: -12 }}>
                <Chips
                  items={['Off', 'Neighborhood', 'Exact']}
                  value={label(loc.iShare)}
                  onChange={(v) =>
                    void mutate(() => api.setLocationShare(userId, SHARE[v as keyof typeof SHARE]))
                  }
                />
              </View>
              <Label style={{ fontWeight: '600' }}>How I see them</Label>
              <View style={{ marginHorizontal: -16, marginBottom: -12 }}>
                <Chips
                  items={loc.theyShare === 'exact' ? ['Neighborhood', 'Exact'] : ['Neighborhood']}
                  value={label(loc.viewing)}
                  onChange={(v) =>
                    void mutate(() =>
                      api.setLocationView(userId, v === 'Exact' ? 'exact' : 'neighborhood'),
                    )
                  }
                />
              </View>
              {loc.theyShare !== 'exact' && <Muted>They share their neighborhood only</Muted>}
            </>
          )}

          {connection?.canViewProfile && (
            <Button
              title="View profile"
              secondary
              onPress={() => leave('/common-ground/person/' + userId)}
            />
          )}
          <Divider />
          <Button title="Report" secondary onPress={report} />
          <Button title="Block" secondary onPress={block} />
        </ScrollView>
      )}
    </Sheet>
  );
}
