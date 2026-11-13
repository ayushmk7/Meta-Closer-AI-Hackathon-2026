// Logged-out Welcome, after Facebook's logged-out pages: wordmark bar with Log in, a pitch,
// a read-only gallery, and a sticky Log in / Create new account banner. Both enter the demo.
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Label, Muted, useColors } from '../../ui/native';
import { MuseAvatar } from './MuseBar';
import ShareCard from './ShareCard';
import { load, useCg } from './store';

const GREEN = '#42B72A'; // Facebook's "Create new account" green
const enter = () => router.replace('/common-ground');

export default function WelcomeScreen() {
  const c = useColors();
  const shares = useCg((s) => s.shares);
  useEffect(() => void load.shares(), []);
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          minHeight: 56,
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.divider,
        }}
      >
        <Label
          accessibilityRole="header"
          style={{ flex: 1, color: c.blue, fontSize: 30, fontWeight: '800', letterSpacing: -1 }}
        >
          facebook
        </Label>
        <Button title="Log in" secondary onPress={enter} />
      </View>
      <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 160 }}>
        <Card style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MuseAvatar size={40} />
            <Label style={{ flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800' }}>
              Do more of what you love, with people who love it too.
            </Label>
          </View>
          <Label>
            Tell Muse what you want to do. It finds the plan, finds the people, and handles the
            rest. You just show up.
          </Label>
          <Muted>People only see what you have in common, and only after a group forms.</Muted>
        </Card>
        <Label style={{ fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingTop: 8 }}>
          What people did this week
        </Label>
        {shares.slice(0, 6).map((s) => (
          <ShareCard key={s.shareId} share={s} readOnly />
        ))}
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          gap: 8,
          backgroundColor: c.card,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        <Label style={{ fontWeight: '700', textAlign: 'center' }}>See more plans on Facebook</Label>
        <Button title="Log in" onPress={enter} />
        <Button
          title="Create new account"
          onPress={enter}
          style={{ backgroundColor: GREEN, alignSelf: 'center', paddingHorizontal: 24 }}
        />
      </View>
    </View>
  );
}
