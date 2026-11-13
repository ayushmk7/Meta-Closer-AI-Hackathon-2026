// Setup step 3, after Google Calendar is connected: a Google Calendar-style week with the busy
// blocks Muse read and the free windows it will plan around.
// ponytail: fake data for the demo (no events are read); swap BUSY for the connector's busy blocks if it ever returns them.
import { StyleSheet, View } from 'react-native';
import { Icon, Label, Muted, useColors } from '../../ui/native';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PARTS = ['Morning', 'Afternoon', 'Evening'];
// [day][part]: busy or free. Only busy/free, never event names (the connector's promise).
const BUSY: boolean[][] = [
  [true, true, true],
  [true, true, false],
  [true, true, true],
  [true, true, false],
  [true, true, true],
  [false, true, false],
  [true, false, false],
];
const BLUE = '#039be5'; // Google Calendar's default event color
const GREEN = '#188038';

export default function CalendarPreview() {
  const c = useColors();
  const free = BUSY.flat().filter((b) => !b).length;
  return (
    <View
      accessible
      accessibilityLabel={`Google Calendar this week: ${free} free windows Muse will plan around.`}
      style={{ gap: 8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="calendar-clear-outline" size={20} />
        <Label style={{ fontWeight: '600', flex: 1 }}>Google Calendar · this week</Label>
        <Muted>Synced</Muted>
      </View>
      <View
        style={{
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.divider,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: 28 }} />
          {DAYS.map((d) => (
            <Muted
              key={d}
              style={{ flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: 4 }}
            >
              {d}
            </Muted>
          ))}
        </View>
        {PARTS.map((part, pi) => (
          <View key={part} style={{ flexDirection: 'row', minHeight: 40 }}>
            <Muted style={{ width: 28, fontSize: 10, textAlign: 'center', alignSelf: 'center' }}>
              {part[0]}
            </Muted>
            {DAYS.map((d, di) => {
              const busy = BUSY[di]![pi];
              return (
                <View
                  key={d}
                  style={{
                    flex: 1,
                    margin: 1.5,
                    borderRadius: 4,
                    padding: 2,
                    justifyContent: 'center',
                    backgroundColor: busy ? BLUE : 'transparent',
                    borderWidth: busy ? 0 : 1,
                    borderStyle: 'dashed',
                    borderColor: GREEN,
                  }}
                >
                  <Label
                    numberOfLines={1}
                    style={{
                      fontSize: 9,
                      textAlign: 'center',
                      color: busy ? '#fff' : GREEN,
                      fontWeight: '600',
                    }}
                  >
                    {busy ? 'Busy' : 'Free'}
                  </Label>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Muted>
        Muse found {free} free windows. It only suggests meetups when you&apos;re free, and never
        shows your events to anyone.
      </Muted>
    </View>
  );
}
