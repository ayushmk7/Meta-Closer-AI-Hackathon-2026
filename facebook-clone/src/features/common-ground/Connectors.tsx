// Connected apps (PRD-1 §8.5 page 2, §8.6). Shared by Setup and Settings.
import { useEffect } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { Icon, Label, Muted, useColors } from '../../ui/native';
import { connectDeviceCalendar } from './calendar';
import { connect, disconnect, load, useCg } from './store';

// Facebook Settings row: outline icon, bold title, secondary line, control on the right.
const ICONS: Record<string, Parameters<typeof Icon>[0]['name']> = {
  device_calendar: 'calendar-outline',
  google_calendar: 'calendar-clear-outline',
  google_maps: 'map-outline',
  strava: 'bicycle-outline',
  eventbrite: 'ticket-outline',
  luma: 'calendar-number-outline',
  beli: 'restaurant-outline',
};

export default function Connectors() {
  const c = useColors();
  const connectors = useCg((s) => s.connectors);
  useEffect(() => void load.connectors(), []);
  // The calendar row asks permission and creates our calendar first (PRD-1 §5.1).
  const turnOn = (provider: string) =>
    provider === 'device_calendar' ? connectDeviceCalendar() : connect(provider);
  return (
    <View style={{ gap: 4 }}>
      {connectors.map((x) => {
        // Web has no "this iPhone"; keep the fixture text for native.
        const label =
          Platform.OS === 'web' && x.provider === 'device_calendar' ? 'Calendar' : x.label;
        const soon = x.status === 'coming_soon';
        const on = x.status === 'connected';
        const flip = (v: boolean) => void (v ? turnOn(x.provider) : disconnect(x.provider));
        // The whole row toggles (44pt+ target); the Switch stays the accessible control.
        return (
          <Pressable
            key={x.provider}
            accessible={false}
            disabled={soon}
            onPress={() => flip(!on)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 8,
              minHeight: 56,
              opacity: soon ? 0.5 : 1,
            }}
          >
            <Icon name={ICONS[x.provider] ?? 'apps-outline'} size={25} />
            <View style={{ flex: 1, gap: 2 }}>
              <Label style={{ fontWeight: '600' }}>{label}</Label>
              <Muted>{soon ? 'Coming soon' : x.reads}</Muted>
            </View>
            <Switch
              accessibilityLabel={`${label}, ${on ? 'connected' : 'not connected'}`}
              value={on}
              disabled={soon}
              onValueChange={flip}
              trackColor={{ false: c.secondary, true: c.blue }}
              ios_backgroundColor={c.secondary} // iOS ignores trackColor.false
              thumbColor="#fff"
              {...{ activeThumbColor: '#fff' }} // RN-web ignores thumbColor when on (default teal)
            />
          </Pressable>
        );
      })}
    </View>
  );
}
