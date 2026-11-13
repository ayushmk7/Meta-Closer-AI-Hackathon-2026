// Daily quests and streak (client-only, CONTRACTS Decisions). Pure: days are America/Los_Angeles dates.
import { TZ, type Join, type Message } from './types';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
// "2026-11-12" for the LA calendar day containing t.
export function laDay(t: number | string | Date): string {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const prevDay = (day: string) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// Persisted under QUESTS_KEY. Manual flags are for `day` only; the streak spans days.
export interface QuestLog {
  day: string;
  talked: boolean;
  surprise: boolean;
  streak: number;
  lastDone: string | null; // last LA day with at least one quest done
  verified?: string[]; // meetupIds whose in-person verify already ticked a day
}
export const emptyLog = (day: string): QuestLog => ({
  day,
  talked: false,
  surprise: false,
  streak: 0,
  lastDone: null,
});

// A meetup I'm newly verified at ticks "Verify in person" today, once per meetup.
export function noteVerifies(log: QuestLog, meetupIds: string[]): QuestLog {
  const seen = log.verified ?? [];
  const fresh = meetupIds.filter((id) => !seen.includes(id));
  return fresh.length ? { ...log, talked: true, verified: [...seen, ...fresh] } : log;
}

// New LA day: clear today's ticks, keep the streak.
export const rollover = (log: QuestLog, today: string): QuestLog =>
  log.day === today ? log : { ...log, day: today, talked: false, surprise: false };

export interface Quest {
  id: 'join' | 'message' | 'surprise' | 'talk';
  label: string;
  done: boolean;
}
export function quests(
  log: QuestLog,
  joins: Pick<Join, 'createdAt'>[],
  messages: Record<string, Message[]>,
  myUserId: string | undefined,
  today: string,
): Quest[] {
  const mine = Object.values(messages)
    .flat()
    .some((m) => m.sender.userId === myUserId && !!myUserId && laDay(m.createdAt) === today);
  return [
    { id: 'join', label: 'Join a plan', done: joins.some((j) => laDay(j.createdAt) === today) },
    { id: 'message', label: 'Say hi in a group chat', done: mine },
    { id: 'surprise', label: 'Try Surprise me', done: log.surprise },
    { id: 'talk', label: 'Verify in person', done: log.talked },
  ];
}

// Any quest done today extends the streak once per day; a missed day restarts it.
export function credit(log: QuestLog, anyDone: boolean): QuestLog {
  if (!anyDone || log.lastDone === log.day) return log;
  const streak = log.lastDone === prevDay(log.day) ? log.streak + 1 : 1;
  return { ...log, streak, lastDone: log.day };
}
// Shown streak: 0 once a whole day was missed.
export const liveStreak = (log: QuestLog): number =>
  log.lastDone === log.day || log.lastDone === prevDay(log.day) ? log.streak : 0;
