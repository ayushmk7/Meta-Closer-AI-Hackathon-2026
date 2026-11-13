// "Surprise me": asks Muse, which makes a new meetup and adds a few random picks from the feed.
// pickSurprise stays for the plan page's "Try another" (a random plan from the viewer's feed).
import { useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { noteSurprise } from './Quests';
import { askMuse, getState } from './store';
import { Pill } from './ui';
import type { Join, PlanCard } from './types';

// Uniform pick among open, not-full plans the viewer hasn't joined. rng injectable for tests.
export function pickSurprise(
  plans: PlanCard[],
  joins: Pick<Join, 'planId' | 'status'>[] = [],
  rng: () => number = Math.random,
): PlanCard | undefined {
  const joined = new Set(joins.filter((j) => j.status !== 'withdrawn').map((j) => j.planId));
  const pool = plans.filter(
    (p) =>
      p.status === 'open' &&
      p.crowd.spotsLeft > 0 &&
      !joined.has(p.planId) &&
      (!p.myJoin || p.myJoin.status === 'withdrawn'),
  );
  return pool[Math.floor(rng() * pool.length)];
}

export default function SurpriseButton() {
  const busy = useRef(false); // one ask per tap burst
  const onPress = async () => {
    if (busy.current || getState().muse.asking) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void noteSurprise(); // Quests: "Try Surprise me"
    // Muse answers in the bar: a meetup it makes for you plus a few picks from your feed.
    await askMuse('Surprise me');
    busy.current = false;
  };
  return (
    // A Muse bar chip (same in-card Pill as the prompts); Plans places it first in that row.
    <Pill label="Surprise me" icon="dice-outline" onPress={() => void onPress()} />
  );
}
