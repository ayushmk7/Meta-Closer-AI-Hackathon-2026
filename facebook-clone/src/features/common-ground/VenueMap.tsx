// Static venue map. Venue location only; never reads the device location (C2).
import MapView, { Marker } from 'react-native-maps';
import type { StyleProp, ViewStyle } from 'react-native';
import { useColors } from '../../ui/native';
import { themes } from '../../ui/tokens';
import type { Venue } from './types';

export default function VenueMap({ venue, style }: { venue: Venue; style?: StyleProp<ViewStyle> }) {
  const coordinate = { latitude: venue.location.lat, longitude: venue.location.lng };
  // Follow the app theme, not the system one (a dark map in a light page otherwise).
  const dark = useColors() === themes.dark;
  return (
    <MapView
      accessibilityLabel={`Map of ${venue.name}`}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      pointerEvents="none" // ponytail: preview only; directions open the real Maps app
      initialRegion={{ ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      style={[{ height: 160 }, style]}
    >
      <Marker coordinate={coordinate} title={venue.name} />
    </MapView>
  );
}
