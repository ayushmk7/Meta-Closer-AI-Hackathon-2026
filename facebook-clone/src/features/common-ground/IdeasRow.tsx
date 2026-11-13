// Plans home: a short row of what people nearby went to, linking to Explore.
import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Label, Muted, go, useColors } from '../../ui/native';
import { SharePhoto, activityLabel, planFromShare } from './ShareCard';
import { load, useCg } from './store';

export default function IdeasRow() {
  const c = useColors();
  const shares = useCg((s) => s.shares);
  useEffect(() => {
    if (!shares.length) void load.shares();
  }, [shares.length]);
  if (!shares.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 44 }}
      >
        <Label accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', flex: 1 }}>
          Ideas from people nearby
        </Label>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="See all ideas in Explore"
          onPress={() => go('/common-ground/explore')}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Label style={{ color: c.blue }}>See all</Label>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {shares.slice(0, 6).map((s) => (
          <Pressable
            key={s.shareId}
            accessibilityRole="button"
            accessibilityLabel={`Plan something like this: ${s.promptText}`}
            onPress={() => void planFromShare(s)}
            style={({ pressed }) => ({
              width: 200,
              borderRadius: 10,
              overflow: 'hidden',
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.divider,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <SharePhoto share={s} height={100} />
            <View style={{ padding: 10, gap: 2 }}>
              <Label style={{ fontWeight: '700' }} numberOfLines={1}>
                {activityLabel(s.activityType)}
              </Label>
              <Muted numberOfLines={1}>{s.venue.name}</Muted>
              <Label style={{ fontSize: 14 }} numberOfLines={2}>
                {s.caption}
              </Label>
              <Label style={{ color: c.blue, fontWeight: '600', fontSize: 13, marginTop: 4 }}>
                Plan something like this
              </Label>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
