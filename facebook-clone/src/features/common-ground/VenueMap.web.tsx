// react-native-maps has no web build. ponytail: tile-less pin card; add a tile library if web needs a real map.
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import type { Venue } from './types';

export default function VenueMap({ venue, style }: { venue: Venue; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`Map of ${venue.name}`}
      style={[
        { height: 160, backgroundColor: c.input, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Icon name="location" size={34} color={c.blue} />
      <Label style={{ fontWeight: '600' }}>{venue.name}</Label>
      {!!(venue.address ?? venue.neighborhood) && (
        <Muted>{venue.address ?? venue.neighborhood}</Muted>
      )}
    </View>
  );
}
