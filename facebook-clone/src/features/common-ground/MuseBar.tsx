// Muse bar (PRD-1 §8.1 item 1). Errors keep the typed text: it is only ever cleared by the user.
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Card, Icon, IconButton, Input, Label, Muted, go, useColors } from '../../ui/native';
import { PlanCarousel } from './PlanCard';
import { askMuse, clearMuse, createPlan, useCg } from './store';
import SurpriseButton from './SurpriseButton';
import { Pill } from './ui';

const NONE: string[] = []; // stable fallback outside useCg (useSyncExternalStore)

export function MuseAvatar({ size = 36 }: { size?: number }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel="Muse"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.blue,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="sparkles" size={Math.round(size * 0.5)} color="#fff" />
    </View>
  );
}

export function PromptChips({
  prompts,
  onPick,
  lead,
}: {
  prompts: string[];
  onPick(p: string): void;
  lead?: React.ReactNode; // first chip (Surprise me)
}) {
  if (!prompts.length && !lead) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {lead}
      {prompts.map((p) => (
        <Pill key={p} label={p} accessibilityLabel={`Ask Muse: ${p}`} onPress={() => onPick(p)} />
      ))}
    </ScrollView>
  );
}

export default function MuseBar({
  prefill,
  inviteUserIds,
  onEndInvite,
}: {
  prefill?: string;
  // "Plan something again": the next send creates an invite plan instead of asking.
  inviteUserIds?: string[];
  onEndInvite?: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState(prefill ?? '');
  const [creating, setCreating] = useState(false);
  const max = useCg((s) => s.config?.limits.museAskMaxChars);
  const muse = useCg((s) => s.muse);
  const feedPrompts = useCg((s) => s.feed?.prompts) ?? NONE;
  const status = useCg((s) => s.feed?.museStatus);
  const working = useCg((s) => Object.values(s.meetups).some((m) => m.status === 'setting_up'));
  const busy = muse.asking || creating;

  const send = async (value: string) => {
    const q = value.trim();
    if (!q || busy) return;
    setText(value);
    if (inviteUserIds?.length) {
      setCreating(true);
      const p = await createPlan(q, inviteUserIds);
      setCreating(false);
      if (!p) return; // failed: stay in invite mode with the text kept
      onEndInvite?.();
      go(`/common-ground/plan/${p.planId}`);
      return;
    }
    await askMuse(q);
  };
  const onChange = (v: string) => {
    setText(v);
    if (!v && muse.reply) clearMuse(); // clearing the bar returns to For you
  };
  const reply = muse.reply;

  // On a white card like the clone's composer: the canvas and c.input are the same gray.
  return (
    <Card style={{ paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
        <MuseAvatar />
        <Input
          accessibilityLabel="What do you want to do?"
          placeholder="What do you want to do?"
          value={text}
          onChangeText={onChange}
          maxLength={max}
          returnKeyType="send"
          onSubmitEditing={() => void send(text)}
          editable={!busy}
          style={{ flex: 1 }}
        />
        <IconButton
          name="send"
          label="Send to Muse"
          color={text.trim() ? c.blue : c.secondary}
          onPress={() => void send(text)}
        />
      </View>
      {!!inviteUserIds?.length && (
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Muted style={{ flex: 1 }}>Muse will make a new plan and invite them.</Muted>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask Muse instead"
            onPress={() => onEndInvite?.()}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Label style={{ color: c.blue, fontWeight: '600' }}>Ask Muse instead</Label>
          </Pressable>
        </View>
      )}
      <PromptChips
        prompts={reply?.prompts ?? feedPrompts}
        onPick={(p) => void send(p)}
        lead={!inviteUserIds?.length && <SurpriseButton />}
      />
      {!!status && (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}
        >
          {working && <ActivityIndicator size="small" color={c.blue} />}
          <Muted>{status}</Muted>
        </View>
      )}
      {busy && (
        <Muted accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16 }}>
          Muse is looking…
        </Muted>
      )}
      {reply && !busy && (
        <View style={{ gap: 10 }}>
          <View
            accessibilityLabel={`Muse says: ${reply.reply.text}`}
            style={{
              marginHorizontal: 16,
              padding: 12,
              borderRadius: 18,
              backgroundColor: c.input,
            }}
          >
            <Label>{reply.reply.text}</Label>
          </View>
          <PlanCarousel
            plans={reply.plans}
            badgeFor={(p) =>
              p.planId === reply.createdPlanId ? 'New · Muse made this plan' : undefined
            }
            onOpen={(p) => go(`/common-ground/plan/${p.planId}`)}
          />
        </View>
      )}
    </Card>
  );
}
