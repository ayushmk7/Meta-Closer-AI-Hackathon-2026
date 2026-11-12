// Today's people, Waiting for you, group requests and the Say hi composer (PRD-1 §7.2).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Card,
  Divider,
  Empty,
  Icon,
  Input,
  Label,
  Muted,
  Sheet,
  go,
  useColors,
} from '../../ui/native';
import { api } from './api';
import { act, decide, load, setState, useCg } from './store';
import type { DropCard as CardData, GroupRequest, GroupSize, HiItem, PersonCard } from './types';
import {
  distanceWords,
  fromNow,
  GroupSizePicker,
  InterestChips,
  PersonAvatar,
  personName,
  usePoll,
} from './ui';

const chat = (threadId: string) => go(`/common-ground/chat/${threadId}`);
const heading = { fontSize: 19, fontWeight: '700' } as const;

export function DropCard({
  card,
  selecting = false,
  selected = false,
  onSelect,
  onHi,
}: {
  card: CardData;
  selecting?: boolean;
  selected?: boolean;
  onSelect?(): void;
  onHi?(): void;
}) {
  const c = useColors();
  const limits = useCg((s) => s.config?.limits);
  const sayHi = useCg((s) => s.config?.features.sayHi !== false);
  if (card.state !== 'open' && card.state !== 'connect_sent') return null; // C5
  const name = personName(card.person);
  return (
    <Card style={{ padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PersonAvatar person={card.person} size={54} />
        <View style={{ flex: 1 }}>
          <Label style={{ fontSize: 17, fontWeight: '700' }}>{name}</Label>
          <Muted>{distanceWords(card.distanceBand)}</Muted>
        </View>
      </View>
      <InterestChips interests={card.sharedInterests.slice(0, limits?.sharedCoarseMax ?? 3)} />
      <Label>{card.reason}</Label>
      {card.state === 'connect_sent' ? (
        <Muted>Connect sent</Muted>
      ) : selecting ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Invite ${name} to a group`}
          accessibilityState={{ checked: selected }}
          onPress={onSelect}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
        >
          <Icon
            name={selected ? 'checkbox' : 'square-outline'}
            color={selected ? c.blue : c.secondary}
          />
          <Label style={{ fontWeight: '600' }}>Invite to a group</Label>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Connect"
            accessibilityLabel={`Connect with ${name}`}
            onPress={() => void decide(card.suggestionId, 'connect')}
            style={{ flex: 1 }}
          />
          <Button
            title="Pass"
            accessibilityLabel={`Pass on ${name}`}
            secondary
            onPress={() => void decide(card.suggestionId, 'pass')}
            style={{ flex: 1 }}
          />
          {card.hiAvailable && sayHi && (
            <Button
              title="Say hi"
              accessibilityLabel={`Say hi to ${name}`}
              secondary
              onPress={() => onHi?.()}
              style={{ flex: 1 }}
            />
          )}
        </View>
      )}
    </Card>
  );
}

type Compose = { card: CardData } | { hi: HiItem };

export default function People() {
  const me = useCg((s) => s.me);
  const config = useCg((s) => s.config);
  const drop = useCg((s) => s.drop);
  const hi = useCg((s) => s.hi);
  const invites = useCg((s) => s.invites);
  const celebrate = useCg((s) => s.celebrate);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [size, setSize] = useState<GroupSize>(me?.groupSize ?? { min: 2, max: 4 });
  const [group, setGroup] = useState<GroupRequest | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [text, setText] = useState('');
  const [rejected, setRejected] = useState(false);

  const buzzed = useRef<string | null>(null);
  useEffect(() => {
    if (!celebrate || buzzed.current === celebrate.connectionId) return;
    buzzed.current = celebrate.connectionId;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [celebrate]);

  // Timed mock changes only show on the next request, so poll while a group is forming.
  usePoll(() => {
    if (group?.status !== 'inviting') return;
    void act(() => api.getGroupRequest(group.groupRequestId)).then((g) => {
      if (!g) return;
      setGroup(g);
      if (g.threadId) void load.threads();
    });
  });

  const features = config?.features ?? {};
  const limits = config?.limits;
  const cards = (drop?.cards ?? [])
    .filter((x) => x.state === 'open' || x.state === 'connect_sent')
    .slice(0, limits?.dropMax ?? 5);
  const pending = features.groups === false ? [] : invites.filter((i) => i.status === 'pending');
  const openers = features.sayHi === false ? [] : hi;

  const openCompose = (next: Compose) => {
    setText('');
    setRejected(false);
    setCompose(next);
  };
  const send = async () => {
    const sent = text.trim();
    if (!sent || !compose) return;
    if ('card' in compose) {
      const r = await act(() => api.sayHi(compose.card.suggestionId, sent));
      if (!r) return;
      if (r.status !== 'delivered') return setRejected(true); // keep the text
      setCompose(null);
      return;
    }
    const conn = await act(() => api.replyHi(compose.hi.hiId, sent));
    if (!conn) return;
    setCompose(null);
    await Promise.all([load.hi(), load.connections(), load.threads()]);
    chat(conn.threadId);
  };
  const decideInvite = async (inviteId: string, decision: 'accept' | 'decline') => {
    const i = await act(() => api.decideInvite(inviteId, decision));
    if (!i) return;
    await Promise.all([load.invites(), load.threads()]);
    if (i.status === 'accepted' && i.threadId) chat(i.threadId);
  };
  const askGroup = async () => {
    const g = await act(() => api.requestGroup(picked, size));
    if (!g) return;
    setGroup(g);
    setSelecting(false);
    setPicked([]);
  };

  const mine: PersonCard | null = me && {
    userId: me.userId,
    displayName: me.displayName,
    initials: me.displayName.slice(0, 1),
    avatarUrl: me.avatarUrl,
    profileVisibility: me.profileVisibility,
  };
  return (
    <>
      {celebrate && (
        <Card style={{ padding: 16, gap: 12, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {mine && <PersonAvatar person={mine} size={54} />}
            <PersonAvatar person={celebrate.person} size={54} />
          </View>
          <Label style={{ fontSize: 21, lineHeight: 27, fontWeight: '700', textAlign: 'center' }}>
            You and {personName(celebrate.person).split(' ')[0]} both said yes
          </Label>
          <InterestChips interests={celebrate.sharedInterests} />
          <Button
            title="Say hello"
            style={{ alignSelf: 'stretch' }}
            onPress={() => {
              setState({ celebrate: null });
              chat(celebrate.threadId);
            }}
          />
        </Card>
      )}

      {(openers.length > 0 || pending.length > 0) && (
        <Card>
          <View style={{ padding: 16 }}>
            <Label accessibilityRole="header" style={heading}>
              Waiting for you
            </Label>
          </View>
          {openers.map((h) => (
            <Row key={h.hiId} person={h.from} title={`${personName(h.from)} said hi`}>
              <Label>{h.text}</Label>
              <InterestChips interests={h.sharedInterests} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                <Button title="Reply" onPress={() => openCompose({ hi: h })} style={{ flex: 1 }} />
                <Button
                  title="Ignore"
                  secondary
                  onPress={() => void act(() => api.dismissHi(h.hiId)).then(() => load.hi())}
                  style={{ flex: 1 }}
                />
              </View>
            </Row>
          ))}
          {pending.map((i) => (
            <Row
              key={i.inviteId}
              person={i.from}
              title={`${personName(i.from)} invited you to a group`}
            >
              <Muted>
                {i.size.min} to {i.size.max} people
              </Muted>
              <InterestChips interests={i.sharedInterests} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                <Button
                  title="Accept"
                  onPress={() => void decideInvite(i.inviteId, 'accept')}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Decline"
                  secondary
                  onPress={() => void decideInvite(i.inviteId, 'decline')}
                  style={{ flex: 1 }}
                />
              </View>
            </Row>
          ))}
        </Card>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 4,
          paddingHorizontal: 16,
        }}
      >
        <Label accessibilityRole="header" style={[heading, { flex: 1 }]}>
          Today's people
        </Label>
        {features.groups !== false && cards.length > 0 && (
          <Button
            title={selecting ? 'Cancel' : 'Plan a group'}
            secondary
            onPress={() => {
              setSelecting(!selecting);
              setPicked([]);
            }}
          />
        )}
      </View>

      {group && (
        <Card style={{ padding: 16, gap: 8 }}>
          {group.status === 'formed' && group.threadId ? (
            <>
              <Label style={{ fontWeight: '700', fontSize: 16 }}>Your group is ready</Label>
              <Button title="Open group chat" onPress={() => chat(group.threadId as string)} />
            </>
          ) : group.status === 'inviting' ? (
            <Muted>Muse is inviting them. I'll let you know.</Muted>
          ) : (
            <Muted>I couldn't get that group together this time.</Muted>
          )}
        </Card>
      )}

      {selecting && (
        <Card style={{ padding: 16, gap: 8 }}>
          <Muted>Pick at least two people to invite.</Muted>
          <GroupSizePicker
            value={size}
            min={limits?.groupSizeMin ?? 2}
            max={limits?.groupSizeMax ?? 8}
            onChange={setSize}
          />
          <Button
            title="Ask Muse to invite them"
            disabled={picked.length < 2}
            onPress={() => void askGroup()}
          />
        </Card>
      )}

      {cards.map((card) => (
        <DropCard
          key={card.suggestionId}
          card={card}
          selecting={selecting}
          selected={picked.includes(card.suggestionId)}
          onSelect={() =>
            setPicked(
              picked.includes(card.suggestionId)
                ? picked.filter((id) => id !== card.suggestionId)
                : [...picked, card.suggestionId],
            )
          }
          onHi={() => openCompose({ card })}
        />
      ))}
      {!cards.length && (
        <Card>
          <Empty
            title="That's everyone for today"
            message={`New people arrive ${drop ? fromNow(drop.nextDropAt) : 'soon'}.`}
          />
        </Card>
      )}

      <Sheet
        visible={!!compose}
        title={compose && 'hi' in compose ? 'Reply' : 'Say hi'}
        onClose={() => setCompose(null)}
      >
        <View style={{ padding: 16, gap: 10 }}>
          <Input
            multiline
            autoFocus
            maxLength={limits?.openerMaxChars ?? 280}
            accessibilityLabel={compose && 'hi' in compose ? 'Reply' : 'Say hi'}
            value={text}
            onChangeText={(t) => {
              setText(t);
              setRejected(false);
            }}
            placeholder="Say something about what you share"
            style={{ minHeight: 120, borderRadius: 10, textAlignVertical: 'top' }}
          />
          <Muted style={{ textAlign: 'right' }}>
            {text.length}/{limits?.openerMaxChars ?? 280}
          </Muted>
          {rejected && (
            <Muted>Muse couldn't send that one. Try something friendly about what you share.</Muted>
          )}
          <Button title="Send" disabled={!text.trim()} onPress={() => void send()} />
        </View>
      </Sheet>
    </>
  );
}

// Messenger chat-list row layout with room for actions under the text.
function Row({
  person,
  title,
  children,
}: {
  person: PersonCard;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <Divider />
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 13, gap: 12 }}>
        <PersonAvatar person={person} size={54} />
        <View style={{ flex: 1, gap: 5 }}>
          <Label style={{ fontWeight: '700', fontSize: 16 }}>{title}</Label>
          {children}
        </View>
      </View>
    </>
  );
}
