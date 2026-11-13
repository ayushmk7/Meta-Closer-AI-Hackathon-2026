// Today's quests on Plans home (Duolingo-style daily goals, private to the user).
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, Icon, Label, Muted, useColors } from '../../ui/native';
import {
  credit,
  emptyLog,
  laDay,
  liveStreak,
  noteVerifies,
  quests,
  rollover,
  type Quest,
  type QuestLog,
} from './questLog';
import { RewardRow } from './Rewards';
import { QUESTS_KEY, getState, useCg } from './store';

function box() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- AsyncStorage; absent in Node tests.
  return require('../../platform/scopedStorage').createScopedStorage(QUESTS_KEY);
}
// One device can switch users (demo ?as=), so the stored value is { [userId]: QuestLog }.
// (Scoped storage key names can't carry the id.)
async function readAll(): Promise<Record<string, QuestLog>> {
  try {
    const x = JSON.parse((await box().read()) ?? 'null');
    return x && typeof x === 'object' && !('day' in x) ? x : {};
  } catch {
    return {}; // unreadable: start fresh
  }
}
// Demo: the staged meetup jumps the clock days ahead, so the quest day stays at the Reset demo
// day instead of rolling over (Reset demo clears the log). today = null means "don't roll".
const demoDay = () => !!getState().config?.demo?.enabled;
async function readLog(userId: string, today: string | null): Promise<QuestLog> {
  const x = (await readAll())[userId];
  if (typeof x?.day !== 'string' || typeof x.streak !== 'number')
    return emptyLog(today ?? laDay(Date.now()));
  return today ? rollover(x, today) : x;
}
const writeLog = async (userId: string, log: QuestLog) => {
  try {
    await box().write(JSON.stringify({ ...(await readAll()), [userId]: log }));
  } catch {
    // ponytail: best effort; the card still shows the in-memory log
  }
};

let push: ((log: QuestLog) => void) | null = null; // the mounted card, if any
async function note(patch: Partial<QuestLog>): Promise<void> {
  const userId = getState().me?.userId;
  if (!userId) return;
  const log = { ...(await readLog(userId, demoDay() ? null : laDay(Date.now()))), ...patch };
  await writeLog(userId, log);
  push?.(log);
}
// SurpriseButton calls this when it opens a plan.
export const noteSurprise = () => note({ surprise: true });

function Row({ q, onPress }: { q: Quest; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'checkbox' : undefined}
      accessibilityState={onPress ? { checked: q.done } : undefined}
      accessibilityLabel={onPress ? q.label : `${q.label}, ${q.done ? 'done' : 'not done'}`}
      accessible
      disabled={!onPress}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
    >
      <Icon
        name={q.done ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={q.done ? c.online : c.secondary}
      />
      <Label style={{ flex: 1, fontWeight: '600' }}>{q.label}</Label>
    </Pressable>
  );
}

export default function Quests() {
  const c = useColors();
  const myId = useCg((st) => st.me?.userId);
  const joins = useCg((st) => st.joins);
  const messages = useCg((st) => st.messages);
  const meetups = useCg((st) => st.meetups);
  const [stored, setLog] = useState<QuestLog | null>(null);
  // Re-render each minute so a card left open rolls over at LA midnight.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const demo = useCg((st) => !!st.config?.demo?.enabled);
  const wallToday = laDay(Date.now());
  const today = demo && stored ? stored.day : wallToday;
  const verifiedAt = Object.values(meetups)
    .filter((m) => m.attendees.some((a) => a.isMe && a.verified))
    .map((m) => m.meetupId);
  // Roll first: never derive today's list from yesterday's ticks. Then a new verify ticks today.
  const log = stored && noteVerifies(rollover(stored, today), verifiedAt);
  const save = (next: QuestLog) => {
    setLog(next);
    if (myId) void writeLog(myId, next);
  };
  useEffect(() => {
    if (!myId) return;
    let live = true;
    setLog(null);
    void readLog(myId, demo ? null : wallToday).then((l) => live && setLog(l));
    push = setLog;
    return () => {
      live = false;
      push = null;
    };
  }, [myId, wallToday, demo]);
  const list = log ? quests(log, joins, messages, myId, today) : [];
  const anyDone = list.some((q) => q.done);
  useEffect(() => {
    if (!log) return;
    const next = credit(log, anyDone);
    if (next !== stored) save(next);
  }, [stored, today, anyDone]);
  if (!log) return null;
  const done = list.filter((q) => q.done).length;
  const streak = liveStreak(log);
  return (
    <Card style={{ marginHorizontal: 16, padding: 16, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', flex: 1 }}>
          {"Today's quests"}
        </Label>
        {streak > 0 && (
          <View
            accessible
            accessibilityLabel={`${streak}-day streak`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Icon name="calendar-outline" size={17} color={c.secondary} />
            <Label style={{ fontWeight: '600' }}>{`${streak}-day streak`}</Label>
          </View>
        )}
      </View>
      <Muted>
        {`${done} of ${list.length} done`}
        {streak > 0 && !done ? ' · Do one today to keep your streak' : ''}
      </Muted>
      {list.map((q) => (
        <Row
          key={q.id}
          q={q}
          onPress={q.id === 'talk' ? () => save({ ...log, talked: !log.talked }) : undefined}
        />
      ))}
      <RewardRow />
    </Card>
  );
}
