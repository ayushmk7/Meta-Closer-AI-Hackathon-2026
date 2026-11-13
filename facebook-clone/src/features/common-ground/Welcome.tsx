// Logged-out Welcome, after facebook.com logged out. Rendered in a full-screen Modal so the
// logged-in Shell chrome (header, tabs) is covered on native and web without a Shell change.
// Phone: wordmark bar with Log in, pitch, read-only gallery, sticky Log in / Create new account.
// Desktop (>= 900pt): wordmark + pitch left, login card right, gallery below.
import { useEffect } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Divider, Label, Muted, useColors } from '../../ui/native';
import { themes } from '../../ui/tokens';
import { MuseAvatar } from './MuseBar';
import ShareCard from './ShareCard';
import { load, useCg } from './store';
import { enter as rise } from './ui';

const GREEN = '#42B72A'; // Facebook's "Create new account" green
const enter = () => router.replace('/common-ground');
const PITCH =
  'Tell Muse what you want to do. It finds the meetup and the people and handles the rest. You just show up.';
const PROMISE = 'People only see what you have in common, and only after a group forms.';

function Wordmark({ size }: { size: number }) {
  const c = useColors();
  return (
    <Label
      accessibilityRole="header"
      style={{
        color: c.blue,
        fontSize: size,
        lineHeight: size * 1.15,
        fontWeight: '800',
        letterSpacing: -size / 30,
      }}
    >
      facebook
    </Label>
  );
}

// `?share=<id>` (a gallery share link) moves that card to the top when it is in the gallery.
export function Gallery({ max = 6 }: { max?: number }) {
  const { share } = useLocalSearchParams<{ share?: string }>();
  const all = useCg((s) => s.publicShares); // anonymous slot, never the signed-in gallery
  const pinned = all.filter((s) => s.shareId === share);
  const shares = [...pinned, ...all.filter((s) => s.shareId !== share)];
  return (
    <>
      <Label
        accessibilityRole="header"
        style={{ fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingTop: 8 }}
      >
        What people did this week
      </Label>
      {shares.slice(0, max).map((s, i) => (
        <Animated.View key={s.shareId} entering={rise(i)}>
          <ShareCard share={s} readOnly />
        </Animated.View>
      ))}
    </>
  );
}

function Desktop() {
  const c = useColors();
  return (
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 72, gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 64,
          maxWidth: 980,
          paddingHorizontal: 24,
          paddingBottom: 56,
        }}
      >
        <View style={{ flex: 1, gap: 12, maxWidth: 520 }}>
          <Wordmark size={60} />
          <Label style={{ fontSize: 28, lineHeight: 34 }}>
            Do more of what you love, with people who love it too.
          </Label>
          <Label style={{ fontSize: 17, lineHeight: 24 }}>{PITCH}</Label>
          <Muted>{PROMISE}</Muted>
        </View>
        <Card
          style={{
            width: 396,
            padding: 16,
            gap: 12,
            // Dark: no shadow (invisible on the dark canvas); the card fill already separates it.
            boxShadow:
              c === themes.dark ? undefined : '0 2px 4px rgba(0,0,0,.1), 0 8px 16px rgba(0,0,0,.1)',
          }}
        >
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <MuseAvatar size={48} />
            <Label accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700' }}>
              Meetups
            </Label>
          </View>
          <Button title="Log in" onPress={enter} style={{ minHeight: 48 }} />
          <Divider />
          <Button
            title="Create new account"
            onPress={enter}
            style={{ backgroundColor: GREEN, minHeight: 48, alignSelf: 'center' }}
          />
        </Card>
      </View>
      <View style={{ width: '100%', maxWidth: 680, gap: 8 }}>
        <Gallery />
      </View>
    </ScrollView>
  );
}

// Wordmark bar with Log in: the logged-out header (Welcome, public plan page).
export function TopBar() {
  const c = useColors();
  return (
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
      <View style={{ flex: 1 }}>
        <Wordmark size={30} />
      </View>
      <Button title="Log in" secondary onPress={enter} />
    </View>
  );
}

function Phone() {
  const c = useColors();
  return (
    <>
      <TopBar />
      <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 170 }}>
        <Card style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MuseAvatar size={40} />
            <Label style={{ flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800' }}>
              Do more of what you love, with people who love it too.
            </Label>
          </View>
          <Label>{PITCH}</Label>
          <Muted>{PROMISE}</Muted>
        </Card>
        <Gallery />
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          paddingBottom: 28,
          gap: 8,
          backgroundColor: c.card,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        <Label style={{ fontWeight: '700', textAlign: 'center' }}>
          See more meetups on Facebook
        </Label>
        <Button title="Log in" onPress={enter} />
        <Button
          title="Create new account"
          onPress={enter}
          style={{ backgroundColor: GREEN, alignSelf: 'center', paddingHorizontal: 24 }}
        />
      </View>
    </>
  );
}

export default function WelcomeScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  // Logged out: no X-CG-User on the only call this screen makes.
  useEffect(() => void load.shares({}, { anonymous: true }), []);
  const reduce = useReducedMotion();
  return (
    <Modal
      visible
      animationType={reduce ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={enter}
    >
      {/* A Modal is its own native root: without a provider here the insets are 0 on iOS. */}
      <SafeAreaProvider>
        {/* Web: the Modal's focus trap focuses its first focusable descendant on open. A
          non-tabbable root takes it, so no button shows a focus ring on load. */}
        <View tabIndex={-1} style={{ flex: 1 }}>
          <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
            {width >= 900 ? <Desktop /> : <Phone />}
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
