// Connected apps (PRD-1 §8.5 page 2, §8.6). Shared by Setup and Settings.
import { useEffect } from 'react';
import { Switch, View } from 'react-native';
import { Label, Muted, useColors } from '../../ui/native';
import { connect, disconnect, load, useCg } from './store';

export default function Connectors() {
  const c = useColors();
  const connectors = useCg((s) => s.connectors);
  useEffect(() => void load.connectors(), []);
  // NEEDS(ioscore): device_calendar should go through calendar.ts (permission, Common Ground
  // calendar) per §5.1; until it lands the toggle only calls connectConnector.
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
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Label style={{ fontWeight: '600' }}>{x.label}</Label>
                {x.simulated && (
                  <View style={{ backgroundColor: c.input, borderRadius: 6, paddingHorizontal: 6 }}>
                    <Muted style={{ fontSize: 11 }}>Demo data</Muted>
                  </View>
                )}
              </View>
              <Muted>{soon ? 'Coming soon' : x.reads}</Muted>
            </View>
            <Switch
              accessibilityLabel={`${x.label}, ${on ? 'connected' : 'not connected'}`}
              value={on}
              disabled={soon}
              onValueChange={(v) => void (v ? connect(x.provider) : disconnect(x.provider))}
            />
          </View>
        );
      })}
    </View>
  );
}
