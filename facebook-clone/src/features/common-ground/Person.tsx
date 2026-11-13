// Public profile (PRD-1 §8.7). Only reachable when the connection has canViewProfile.
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, IconButton, Label, Muted, Page } from '../../ui/native';
import { api } from './api';
import { act, load, useCg } from './store';
import { Banners, InterestChips, NotFound, PersonAvatar, personName } from './ui';

export default function PersonScreen() {
  const { userId = '' } = useLocalSearchParams<{ userId: string }>();
  const profile = useCg((s) => s.people[userId]);
  const connection = useCg((s) => s.connections.find((c) => c.person.userId === userId));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void load.person(userId).then(() => setLoaded(true));
  }, [userId]);

  if (!profile)
    return (
      <Page>
        <Banners />
        {loaded && <NotFound title="This profile isn't available" />}
      </Page>
    );
  const name = personName(profile.person);
  const first = name.split(' ')[0];
  const more = () =>
    Alert.alert(name, undefined, [
      {
        text: 'Report',
        onPress: () => void act(() => api.report({ userId, reason: 'other' })),
      },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          if (await act(() => api.block(userId).then(() => true))) {
            void load.connections();
            router.back();
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const together = profile.meetupsTogether ?? connection?.meetupsTogether ?? 0;
  return (
    <Page>
      <Banners />
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PersonAvatar person={profile.person} size={72} />
          <View style={{ flex: 1 }}>
            <Label
              accessibilityRole="header"
              style={{ fontSize: 25, lineHeight: 31, fontWeight: '800' }}
            >
              {name}
            </Label>
            {!!profile.neighborhood && <Muted>{profile.neighborhood}</Muted>}
          </View>
          <IconButton
            name="ellipsis-horizontal"
            label={`More options for ${name}`}
            onPress={more}
          />
        </View>
        {!!profile.bio && <Label>{profile.bio}</Label>}
        <Muted>
          {together
            ? `${together} ${together === 1 ? 'meetup' : 'meetups'} together`
            : 'You met through Meetups'}
        </Muted>
        {profile.sharedInterests.length > 0 && (
          <>
            <Label style={{ fontWeight: '700' }}>You both like</Label>
            <InterestChips interests={profile.sharedInterests} />
          </>
        )}
        {connection?.canPlanAgain && (
          <Button
            title="Meet up again"
            accessibilityLabel={`Meet up again with ${first}`}
            onPress={() => router.navigate(`/common-ground?with=${encodeURIComponent(userId)}`)}
          />
        )}
      </Card>
    </Page>
  );
}
