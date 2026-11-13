// Connected apps (PRD-1 §8.5 page 2, §8.6). Shared by Setup and Settings.
import { useEffect } from 'react';
import { Switch, View } from 'react-native';
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
        const soon = x.status === 'coming_soon';
        const on = x.status === 'connected';
        return (
          <View
            key={x.provider}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Label style={{ fontWeight: '600' }}>{x.label}</Label>
                {x.simulated && (
                  <View style={{ backgroundColor: c.input, borderRadius: 6, paddingHorizontal: 6 }}>
                    <Muted style={{ fontSize: 12, fontWeight: '600' }}>Demo data</Muted>
                  </View>
                )}
              </View>
              <Muted>{soon ? 'Coming soon' : x.reads}</Muted>
            </View>
            <Switch
              accessibilityLabel={`${x.label}, ${on ? 'connected' : 'not connected'}`}
              value={on}
              disabled={soon}
              onValueChange={(v) => void (v ? turnOn(x.provider) : disconnect(x.provider))}
              trackColor={{ false: c.divider, true: c.blue }}
              thumbColor="#fff"
            />
          </View>
        );
      })}
    </View>
  );
}
