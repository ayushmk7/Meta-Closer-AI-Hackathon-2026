import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Busy, Button, Card, go, Label, Muted, Page } from '../../ui/native';
import { api } from './api';
import { useCg } from './store';
import type { PublicProfile } from './types';
import { Banners, InterestChips, NotFound, PersonAvatar, personName } from './ui';

export default function Person() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  // undefined = loading, null = 403/404 or any error
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const threadId = useCg((s) => s.connections.find((c) => c.person.userId === userId)?.threadId);
  useEffect(() => {
    let live = true;
    setProfile(undefined);
    if (!userId) return setProfile(null);
    api.getPerson(userId).then(
      (p) => live && setProfile(p),
      () => live && setProfile(null),
    );
    return () => {
      live = false;
    };
  }, [userId]);

  if (profile === undefined) return <Busy />;
  return (
    <Page>
      <Banners />
      {!profile ? (
        <NotFound title="Profile not available" />
      ) : (
        <Card style={{ borderRadius: 0 }}>
          <View style={{ padding: 16, gap: 10 }}>
            <PersonAvatar person={profile.person} size={96} />
            <View>
              <Label
                accessibilityRole="header"
                style={{ fontSize: 25, lineHeight: 31, fontWeight: '800' }}
              >
                {personName(profile.person)}
              </Label>
              {!!profile.neighborhood && <Muted>{profile.neighborhood}</Muted>}
            </View>
            {!!profile.bio && <Label>{profile.bio}</Label>}
            {profile.sharedInterests.length > 0 && (
              <View style={{ gap: 8, paddingTop: 6 }}>
                <Label accessibilityRole="header" style={{ fontSize: 19, fontWeight: '700' }}>
                  You both like
                </Label>
                <InterestChips interests={profile.sharedInterests} />
              </View>
            )}
            {!!profile.meetupsTogether && (
              <Muted>
                {profile.meetupsTogether} meetup{profile.meetupsTogether === 1 ? '' : 's'} together
              </Muted>
            )}
            {threadId && (
              <Button
                title="Message"
                icon="chatbubble-ellipses-outline"
                onPress={() => go(`/common-ground/chat/${threadId}`)}
              />
            )}
          </View>
        </Card>
      )}
    </Page>
  );
}
