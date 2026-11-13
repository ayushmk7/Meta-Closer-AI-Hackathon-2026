import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Label, Muted, go, useColors } from '../../ui/native';
import { MuseAvatar } from './MuseBar';
import { dismissNudge, nudgesFor, setState, start, useCg } from './store';

// Visual reference: the request card in src/features/friends/Screen.tsx.
export default function HomeCard() {
  const c = useColors();
  // Web Home has no tab badge hook to start the store, so the card starts it (idempotent).
  useEffect(() => {
    void start();
  }, []);
  const setup = useCg((s) => s.ready && !!s.me && !s.me.optedIn && !s.homeCardDismissed);
  // Newest first by createdAt; nudgesFor returns [] when not opted in or nudges are off.
  const nudge = useCg(
    (s) => [...nudgesFor(s, 'home')].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  );
  if (setup)
    return (
      <Card style={{ padding: 16, gap: 8 }}>
        <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
          Plans
        </Label>
        <Muted>Muse can find things to do with people who are into what you&apos;re into.</Muted>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
          <Button
            title="Get started"
            onPress={() => go('/common-ground/setup')}
            style={{ flex: 1 }}
          />
          <Button
            title="Not now"
            secondary
            onPress={() => setState({ homeCardDismissed: true })}
            style={{ flex: 1 }}
          />
        </View>
      </Card>
    );
  if (!nudge) return null;
  const because = nudge.because[0];
  return (
    <Card style={{ padding: 16, gap: 8 }}>
      {/* Facebook feed-unit header: who it's from, then why you see it. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MuseAvatar size={40} />
        <View>
          <Label style={{ fontWeight: '600' }}>Plans</Label>
          <Muted>Suggested for you</Muted>
        </View>
      </View>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        {nudge.title}
      </Label>
      <Label>{nudge.text}</Label>
      {/* Skip the Because line when the body already says it (it usually does). */}
      {because && !nudge.text.includes(because.label) && <Muted>Because: {because.label}</Muted>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
        <Button
          title="See plan"
          onPress={() => go(`/common-ground/plan/${nudge.planId}`)}
          style={{ flex: 1 }}
        />
        <Button
          title="Not now"
          secondary
          onPress={() => void dismissNudge(nudge.nudgeId)}
          style={{ flex: 1 }}
        />
      </View>
      {because?.signalId && (
        // Tertiary link (guide 2.6): lighter than the See plan / Not now pair above.
        <Pressable
          accessibilityRole="button"
          onPress={() => void dismissNudge(nudge.nudgeId, 'signal')}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <Label style={{ color: c.blue, fontWeight: '600', fontSize: 15 }}>
            Not interested in this place
          </Label>
        </Pressable>
      )}
    </Card>
  );
}
