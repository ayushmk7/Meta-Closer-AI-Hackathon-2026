import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Busy, Button, Card, Label, Page, Title } from '../../ui/native';
import { setIdentity, useCg } from './store';
import { Banners, NotFound } from './ui';

export default function Demo() {
  const { as } = useLocalSearchParams<{ as?: string }>();
  const ready = useCg((s) => s.ready);
  const enabled = useCg((s) => !!s.config?.demo?.enabled);
  const name = useCg((s) => s.me?.displayName);
  const switched = useRef<string | null>(null);
  useEffect(() => {
    // setIdentity resets ready/config, so guard with a ref or this effect re-fires mid-switch.
    if (!ready || !enabled || !as || switched.current === as) return;
    switched.current = as;
    void setIdentity(as).then(() => router.replace('/common-ground'));
  }, [ready, enabled, as]);

  if (!ready || (enabled && as)) return <Busy />;
  if (!enabled)
    return (
      <Page>
        <NotFound title="This page isn't available" />
      </Page>
    );
  return (
    <Page>
      <Banners />
      <Card style={{ borderRadius: 0 }}>
        <Title>Demo</Title>
        <View style={{ padding: 16, paddingTop: 0, gap: 14 }}>
          <Label>Signed in as {name ?? 'someone'}</Label>
          <Button title="Back to Maya" secondary onPress={() => void setIdentity(null)} />
        </View>
      </Card>
    </Page>
  );
}
