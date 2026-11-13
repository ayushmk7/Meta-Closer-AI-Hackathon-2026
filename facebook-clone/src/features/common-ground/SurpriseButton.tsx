// "Surprise me" (I'm Feeling Lucky): open a random plan from the viewer's own feed. Client-only (CONTRACTS Decisions).
import { useRef, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Muted, go } from '../../ui/native';
import { noteSurprise } from './Quests';
import { getState, load } from './store';
import { Pill } from './ui';
import type { Join, PlanCard } from './types';

const EMPTY = 'Nothing new right now. Try the Muse bar.';

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
  const [note, setNote] = useState(false);
  const busy = useRef(false); // one pick, one push per tap burst
  const onPress = async () => {
    if (busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setNote(false);
    if (!getState().feed) await load.feed(); // never throws; on failure feed stays null and the banner explains
    const s = getState();
    const p = s.feed && pickSurprise(s.feed.plans, s.joins);
    if (p) {
      go(`/common-ground/plan/${p.planId}`);
      void noteSurprise(); // Quests: "Try Surprise me"
    } else if (s.feed) setNote(true);
    // ponytail: after a push, hold the guard 600ms while the route animates in; a focus listener if that misfires.
    setTimeout(() => (busy.current = false), p ? 600 : 0);
  };
  return (
    <View style={{ paddingHorizontal: 16, gap: 6, alignItems: 'flex-start' }}>
      <Pill label="Surprise me" icon="dice-outline" onCanvas onPress={() => void onPress()} />
      {note && <Muted accessibilityLiveRegion="polite">{EMPTY}</Muted>}
    </View>
  );
}
