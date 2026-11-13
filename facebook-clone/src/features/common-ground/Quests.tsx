// Today's quests on Plans home (Duolingo-style daily goals, private to the user).
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, Icon, Label, Muted, useColors } from '../../ui/native';
import {
  credit,
  emptyLog,
  laDay,
  liveStreak,
  quests,
  rollover,
  type Quest,
  type QuestLog,
} from './questLog';
import { QUESTS_KEY, useCg } from './store';

function box() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- AsyncStorage; absent in Node tests.
  return require('../../platform/scopedStorage').createScopedStorage(QUESTS_KEY);
}
async function readLog(today: string): Promise<QuestLog> {
  try {
    const x = JSON.parse((await box().read()) ?? 'null');
    if (typeof x?.day === 'string' && typeof x.streak === 'number') return rollover(x, today);
  } catch {
    // unreadable: start fresh
  }
  return emptyLog(today);
}
const writeLog = (log: QuestLog) =>
  void box()
    .write(JSON.stringify(log))
    .catch(() => {});

let push: ((log: QuestLog) => void) | null = null; // the mounted card, if any
// SurpriseButton calls this when it opens a plan.
export async function noteSurprise(): Promise<void> {
  const log = { ...(await readLog(laDay(Date.now()))), surprise: true };
  writeLog(log);
  push?.(log);
}

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
        size={24}
        color={q.done ? c.blue : c.secondary}
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
  const [log, setLog] = useState<QuestLog | null>(null);
  // ponytail: day re-read per render; a card left open past midnight rolls on its next store update.
  const today = laDay(Date.now());
  const save = (next: QuestLog) => {
    setLog(next);
    writeLog(next);
  };
  useEffect(() => {
    let live = true;
    void readLog(today).then((l) => live && setLog(l));
    push = setLog;
    return () => {
      live = false;
      push = null;
    };
  }, [today]);
  const list = log ? quests(log, joins, messages, myId, today) : [];
  const anyDone = list.some((q) => q.done);
  useEffect(() => {
    if (!log) return;
    const next = credit(rollover(log, today), anyDone);
    if (next !== log) save(next);
  }, [log, anyDone, today]);
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
    </Card>
  );
}
