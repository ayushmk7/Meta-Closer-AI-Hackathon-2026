import { useEffect } from 'react';
import { View } from 'react-native';
import { Button, Card, Label, Muted, go } from '../../ui/native';
import { setState, start, useCg } from './store';

// Visual reference: the request card in src/features/friends/Screen.tsx.
export default function HomeCard() {
  // Web Home has no tab badge hook to start the store, so the card starts it (idempotent).
  useEffect(() => {
    void start();
  }, []);
  const show = useCg((s) => s.ready && !!s.me && !s.me.optedIn && !s.homeCardDismissed);
  if (!show) return null;
  return (
    <Card style={{ padding: 16, gap: 8 }}>
      <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
        Find your people
      </Label>
      <Muted>Muse can introduce you to people nearby who are into what you&apos;re into.</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
        <Button
          title="Get started"
          onPress={() => go('/common-ground?find=1')}
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
}
