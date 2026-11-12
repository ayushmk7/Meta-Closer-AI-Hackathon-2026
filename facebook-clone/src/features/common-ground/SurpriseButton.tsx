// "Surprise me" (I'm Feeling Lucky): open a random plan from the viewer's own feed. Client-only (CONTRACTS Decisions).
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon, Label, Muted, go, useColors } from '../../ui/native';
import { getState, load } from './store';
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
  const c = useColors();
  const [note, setNote] = useState(false);
  const onPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setNote(false);
    if (!getState().feed) await load.feed();
    const s = getState();
    const p = pickSurprise(s.feed?.plans ?? [], s.joins);
    if (p) go(`/common-ground/plan/${p.planId}`);
    else setNote(true);
  };
  return (
    <View style={{ paddingHorizontal: 16, gap: 6, alignItems: 'flex-start' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Surprise me"
        accessibilityHint="Opens a random plan picked for you"
        onPress={() => void onPress()}
        style={{
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 15,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: c.divider,
          backgroundColor: c.input,
        }}
      >
        <Icon name="dice-outline" size={18} color={c.blue} />
        <Label style={{ fontWeight: '600', fontSize: 14 }}>Surprise me</Label>
      </Pressable>
      {note && <Muted accessibilityLiveRegion="polite">{EMPTY}</Muted>}
    </View>
  );
}
