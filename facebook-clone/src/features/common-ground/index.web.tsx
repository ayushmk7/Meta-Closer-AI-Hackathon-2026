import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Plans from './Plans';
import Plan from './Plan';
import Setup from './Setup';
import Meetup from './Meetup';
import Chat from './Chat';
import Person from './Person';
import Settings from './Settings';
import Demo from './Demo';

// Web reuses the native screens inside the clone's narrow column. Fixed height because the
// screens are flex:1 with their own scroll; the web layout has no SafeAreaProvider of its own.
const page = (Screen: ComponentType) =>
  function CommonGroundPage() {
    return (
      <div className="narrow-page cg-page">
        <SafeAreaProvider style={{ flex: 1 }}>
          <Screen />
        </SafeAreaProvider>
      </div>
    );
  };
export const PlansScreen = page(Plans);
export const PlanScreen = page(Plan);
export const SetupScreen = page(Setup);
export const MeetupScreen = page(Meetup);
export const ChatScreen = page(Chat);
export const PersonScreen = page(Person);
export const SettingsScreen = page(Settings);
export const DemoScreen = page(Demo);
