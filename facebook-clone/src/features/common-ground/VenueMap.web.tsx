// react-native-maps has no web build. ponytail: one venue row (pin + address) instead of a map;
// add a static map image if web needs a real map.
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Label, useColors } from '../../ui/native';
import type { Venue } from './types';

export default function VenueMap({ venue, style }: { venue: Venue; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const where = venue.address ?? venue.neighborhood ?? venue.name;
  return (
    <View
      accessible
      accessibilityLabel={`Location: ${where}`}
      // A row, not a tile: drop any height the caller sized for the native map.
      style={[
        style,
        { height: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
      ]}
    >
      <Icon name="location-outline" size={20} color={c.secondary} />
      <Label style={{ flex: 1 }}>{where}</Label>
    </View>
  );
}
