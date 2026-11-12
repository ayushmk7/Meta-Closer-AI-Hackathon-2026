import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../../ui/native';

// ponytail: web map is a plain box with children projected linearly against the region.
// No tiles, no pan/zoom, no network; swap in a tile library if web ever needs a real map.
type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
const RegionContext = createContext<Region>({
  latitude: 0,
  longitude: 0,
  latitudeDelta: 1,
  longitudeDelta: 1,
});
const x = (r: Region, lng: number) => (lng - r.longitude) / r.longitudeDelta + 0.5;
const y = (r: Region, lat: number) => (r.latitude - lat) / r.latitudeDelta + 0.5;
const clamp = (n: number) => Math.min(0.95, Math.max(0.05, n));
const pct = (n: number) => `${n * 100}%` as const;

const MapView = forwardRef<
  { animateToRegion: (r: Region) => void },
  {
    initialRegion?: Region;
    style?: StyleProp<ViewStyle>;
    pointerEvents?: 'none';
    scrollEnabled?: boolean;
    children?: ReactNode;
  }
>(function MapView({ initialRegion, style, pointerEvents, children }, ref) {
  const c = useColors();
  const [region, setRegion] = useState(initialRegion);
  useImperativeHandle(ref, () => ({ animateToRegion: setRegion }), []);
  return (
    <View
      pointerEvents={pointerEvents}
      style={[{ backgroundColor: c.card, overflow: 'hidden' }, style]}
    >
      {region && <RegionContext.Provider value={region}>{children}</RegionContext.Provider>}
    </View>
  );
});
type MapView = { animateToRegion: (r: Region) => void };
export default MapView;

export function Marker({
  coordinate,
  title,
  onPress,
  children,
  accessibilityLabel,
}: {
  coordinate: LatLng;
  title?: string;
  onPress?: () => void;
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
}) {
  const r = useContext(RegionContext);
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      style={{
        position: 'absolute',
        // ponytail: clamp so off-region pins (e.g. a far venue) stay visible at the edge
        left: pct(clamp(x(r, coordinate.longitude))),
        top: pct(clamp(y(r, coordinate.latitude))),
        transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
      }}
    >
      {children ?? (
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            borderWidth: 3,
            borderColor: c.card,
            backgroundColor: c.blue,
          }}
        />
      )}
    </Pressable>
  );
}

export function Circle({
  center,
  radius,
  fillColor,
  strokeColor,
}: {
  center: LatLng;
  radius: number;
  fillColor?: string;
  strokeColor?: string;
}) {
  const r = useContext(RegionContext);
  const d = radius / 111320; // metres to degrees, close enough for a demo box
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: pct(x(r, center.longitude - d)),
        top: pct(y(r, center.latitude + d)),
        width: pct((2 * d) / r.longitudeDelta),
        height: pct((2 * d) / r.latitudeDelta),
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: strokeColor,
        backgroundColor: fillColor,
      }}
    />
  );
}

export function Polygon({
  coordinates,
  fillColor,
}: {
  coordinates: LatLng[];
  fillColor?: string;
  strokeWidth?: number;
}) {
  const r = useContext(RegionContext);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <polygon
        fill={fillColor}
        points={coordinates
          .map((p) => `${x(r, p.longitude) * 100},${y(r, p.latitude) * 100}`)
          .join(' ')}
      />
    </svg>
  );
}
