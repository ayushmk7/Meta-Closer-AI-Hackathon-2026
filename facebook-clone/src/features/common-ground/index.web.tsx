import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IconButton, Label, useColors } from '../../ui/native';
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
// Pushed routes get the native Shell's header row (back arrow + "Plans"), which the web
// shell doesn't draw; the tab root and logged-out Welcome don't.
function BackRow() {
  const c = useColors();
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
        Plans
      </Label>
    </View>
  );
}
const page = (Screen: ComponentType, back = true) =>
  function CommonGroundPage() {
    return (
      <div className="narrow-page cg-page">
        <SafeAreaProvider style={{ flex: 1 }}>
          {back && <BackRow />}
          <Screen />
        </SafeAreaProvider>
      </div>
    );
  };
export const PlansScreen = page(Plans, false);
export const PlanScreen = page(Plan);
export const SetupScreen = page(Setup);
export const MeetupScreen = page(Meetup);
export const ChatScreen = page(Chat);
export const PersonScreen = page(Person);
export const SettingsScreen = page(Settings);
export const DemoScreen = page(Demo);
export const WelcomeScreen = page(Welcome, false);
export const ExploreScreen = page(Explore);
export const PassportScreen = page(Passport);
export const ScanScreen = page(Scan);
