import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Map from './Map';
import Chat from './Chat';
import Meetup from './Meetup';
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
export const MapScreen = page(Map);
export const ChatScreen = page(Chat);
export const MeetupScreen = page(Meetup);
export const PersonScreen = page(Person);
export const SettingsScreen = page(Settings);
export const DemoScreen = page(Demo);
