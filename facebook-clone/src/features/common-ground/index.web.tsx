import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IconButton, Label, useColors } from '../../ui/native';
import { useCg, type CgState } from './store';
import Plans from './Plans';
import Plan from './Plan';
import Setup from './Setup';
import Meetup from './Meetup';
import Chat from './Chat';
import Person from './Person';
import Settings from './Settings';
import Demo from './Demo';
import Welcome from './Welcome';
import Explore from './Explore';
import Passport from './Passport';
import Scan from './Scan';

// Web reuses the native screens inside the clone's narrow column. Fixed height because the
// screens are flex:1 with their own scroll; the web layout has no SafeAreaProvider of its own.
// Pushed routes get one Facebook header row (back arrow + the screen's title), which the web
// shell doesn't draw; the tab root and logged-out Welcome don't. Detail titles come from the
// store and fall back to "Plans" while loading.
type Titler = (s: CgState, p: Record<string, string | undefined>) => string | undefined;
function BackRow({ title }: { title: Titler }) {
  const c = useColors();
  const params = useLocalSearchParams<Record<string, string>>();
  const text = useCg((s) => title(s, params)) ?? 'Plans';
  return (
    <View
      style={{
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        backgroundColor: c.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
      }}
    >
      <IconButton
        name="arrow-back"
        label="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/common-ground'))}
      />
      <Label numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', flex: 1 }}>
        {text}
      </Label>
    </View>
  );
}
const page = (Screen: ComponentType, title: Titler | null) =>
  function CommonGroundPage() {
    return (
      <div className="narrow-page cg-page">
        <SafeAreaProvider style={{ flex: 1 }}>
          {title && <BackRow title={title} />}
          <Screen />
        </SafeAreaProvider>
      </div>
    );
  };
const named =
  (name: string): Titler =>
  () =>
    name;
export const PlansScreen = page(Plans, null);
// Plan and meetup show their title as a hero, so the row says Plans (no doubled title).
export const PlanScreen = page(Plan, named('Plans'));
export const SetupScreen = page(Setup, named('Plans'));
export const MeetupScreen = page(Meetup, named('Plans'));
// Chat draws its own Messenger header (back, avatars, title, See plan): no BackRow here.
export const ChatScreen = page(Chat, null);
export const PersonScreen = page(Person, named('Profile'));
export const SettingsScreen = page(Settings, named('Settings'));
export const DemoScreen = page(Demo, named('Demo'));
export const WelcomeScreen = page(Welcome, null);
export const ExploreScreen = page(Explore, named('Explore'));
export const PassportScreen = page(Passport, named('Your passport'));
export const ScanScreen = page(Scan, named('Verify in person'));
